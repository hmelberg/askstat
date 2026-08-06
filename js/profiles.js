// js/profiles.js — profiler: navngitte prompt-tekster som automatisk legges
// til hvert spørsmål (spec 2026-08-05-konto-runden §Fase 1b). Lagringsdel +
// modal/chip-UI (DOM-delen bak document-guard). ERSTATTER md_ask_prefs —
// eksisterende verdi seedes som første profil ved oppstart. Aktiv profils
// tekst leses av ai-chat.js via Profiles.activeText() → preferences-feltet.
(function (global) {
  'use strict';
  var LS = 'md_profiles';
  var LEGACY = 'md_ask_prefs';
  var NAME_MAX = 60;
  var TEXT_MAX = 8000;
  // Kontekstrunden fase 3 (§Unifisert lager): kind:'source'-oppføringer er
  // egne kilder (opprettet fritt eller importert fra community-pakker) og
  // får et romsligere tegnbudsjett enn profiler.
  var SOURCE_TEXT_MAX = 40000;

  var PACK_AUTO = 'md_pack_auto';

  function makeProfiles(storage, opts) {
    var now = (opts && opts.now) || function () { return new Date().toISOString(); };
    var newId = (opts && opts.newId) || function () {
      return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };
    var listeners = [];
    function fire() {
      listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
    }
    function readDoc() {
      try {
        var doc = JSON.parse(storage.getItem(LS) || 'null');
        if (doc && doc.v === 1 && doc.profiles && typeof doc.profiles === 'object') return doc;
      } catch (e) {}
      return { v: 1, active: null, updated: '', profiles: {} };
    }
    // Tombstones (fase 2-synk): slettede profiler blir {deleted:true, updated}
    // så sletting vinner på tvers av enheter; prunes etter 90 dager.
    function pruneTombstones(doc) {
      var cutoff;
      try { cutoff = new Date(new Date(now()).getTime() - 90 * 86400000).toISOString(); }
      catch (e) { return; } // prune er husarbeid — aldri i veien for lagring
      Object.keys(doc.profiles).forEach(function (id) {
        var p = doc.profiles[id];
        if (p && p.deleted && String(p.updated || '') < cutoff) delete doc.profiles[id];
      });
    }
    function writeDoc(doc, opts) {
      pruneTombstones(doc);
      delete doc.pack; // kontekstrunden fase 2: gammelt én-pakke-valg droppes
      if (!opts || !opts.keepUpdated) doc.updated = now();
      try { storage.setItem(LS, JSON.stringify(doc)); } catch (e) {}
      if (!opts || !opts.silent) fire();
    }
    function clampName(s) { return String(s || 'Untitled').trim().slice(0, NAME_MAX) || 'Untitled'; }
    function clampText(s, kind) {
      var max = kind === 'source' ? SOURCE_TEXT_MAX : TEXT_MAX;
      return String(s == null ? '' : s).slice(0, max);
    }
    function live(doc, id) {
      var p = doc.profiles[id];
      return (p && !p.deleted) ? p : null;
    }
    // kind bor KUN på oppføringen når den er 'source' (sparer bytes — fravær
    // betyr 'profile', langt det vanlige tilfellet, inkl. alle legacy-data).
    function kindOf(p) { return (p && p.kind) || 'profile'; }
    return {
      NAME_MAX: NAME_MAX,
      TEXT_MAX: TEXT_MAX,
      SOURCE_TEXT_MAX: SOURCE_TEXT_MAX,
      // list(kind): uten argument = alle levende oppføringer (profiler OG
      // kilder); med kind = kun den typen. Kilder kan aldri være aktiv profil
      // (håndheves i setActive/active/activeText, ikke her).
      list: function (kind) {
        var doc = readDoc();
        return Object.keys(doc.profiles).filter(function (id) {
          var p = live(doc, id);
          return p && (kind === undefined || kindOf(p) === kind);
        }).map(function (id) {
          return Object.assign({ id: id }, doc.profiles[id]);
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      get: function (id) {
        var doc = readDoc();
        return live(doc, id) ? Object.assign({ id: id }, doc.profiles[id]) : null;
      },
      // create(name, text, kind, origin): kind 'profile'|'source' (default
      // 'profile'); origin er valgfri og lagres uendret (brukes av
      // community-import, se packs.js importPack/migrateImported).
      create: function (name, text, kind, origin) {
        var doc = readDoc();
        var id = newId();
        var k = kind === 'source' ? 'source' : 'profile';
        var entry = { name: clampName(name), text: clampText(text, k), updated: now() };
        if (k === 'source') entry.kind = 'source';
        if (origin !== undefined) entry.origin = origin;
        doc.profiles[id] = entry;
        writeDoc(doc);
        return id;
      },
      update: function (id, fields) {
        var doc = readDoc();
        if (!doc.profiles[id]) return;
        var k = kindOf(doc.profiles[id]);
        if (fields && 'name' in fields) doc.profiles[id].name = clampName(fields.name);
        if (fields && 'text' in fields) doc.profiles[id].text = clampText(fields.text, k);
        doc.profiles[id].updated = now();
        writeDoc(doc);
      },
      remove: function (id) {
        var doc = readDoc();
        if (!doc.profiles[id]) return;
        doc.profiles[id] = { deleted: true, updated: now() };
        if (doc.active === id) doc.active = null;
        // Kontekstrunden fase 3 (§Unifisert lager, review-funn 1): en slettet
        // kind:source-oppføring kan stå valgt i doc.packs.ids som 'user:'+id
        // — fjern den også, ellers henger iden igjen for alltid (synkes til
        // andre enheter; payload()/list() hopper den stille over, men
        // packsState().ids.length ville fortsatt telle den med).
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) {
          var uid = 'user:' + id;
          if (doc.packs.ids.indexOf(uid) >= 0) {
            doc.packs = { ids: doc.packs.ids.filter(function (x) { return x !== uid; }), updated: now() };
          }
        }
        writeDoc(doc);
      },
      // setActive: avviser kilder (kind==='source') — de kan aldri være aktiv
      // profil. active()/activeText() speiler samme vakt i tilfelle doc.active
      // peker på en oppføring som ble til en kilde (bør ikke skje, men billig).
      setActive: function (id) {
        var doc = readDoc();
        if (id !== null) {
          var p = live(doc, id);
          if (!p || kindOf(p) !== 'profile') return;
        }
        doc.active = id;
        writeDoc(doc);
      },
      active: function () {
        var doc = readDoc();
        if (!doc.active) return null;
        var p = live(doc, doc.active);
        if (!p || kindOf(p) !== 'profile') return null;
        return Object.assign({ id: doc.active }, doc.profiles[doc.active]);
      },
      activeText: function () {
        var doc = readDoc();
        if (!doc.active) return undefined;
        var p = live(doc, doc.active);
        if (!p || kindOf(p) !== 'profile') return undefined;
        var t = String(p.text || '').trim();
        return t ? t : undefined;
      },
      // Pakkevalg (kontekstrunden 2026-08-06 §2): FLERVALG. Manuelt sett bor
      // i doc.packs = {ids, updated} (synkes, hele settet = én verdi); auto-
      // forslag (fra locale) bor KUN i md_pack_auto (per enhet). Fraværende
      // doc.packs = aldri berørt → auto-forslaget gjelder; {ids:[]} = manuelt
      // tomt (internasjonal). Gammelt doc.pack skrubbes i writeDoc.
      packsState: function () {
        var doc = readDoc();
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) {
          return { ids: doc.packs.ids.map(String), auto: false, manual: true };
        }
        var a = null;
        try { a = storage.getItem(PACK_AUTO); } catch (e) {}
        return a ? { ids: [String(a)], auto: true, manual: false }
                 : { ids: [], auto: false, manual: false };
      },
      setPacks: function (ids) {
        var doc = readDoc();
        var seen = {};
        var clean = [];
        (Array.isArray(ids) ? ids : []).forEach(function (id) {
          var s = String(id);
          if (!seen[s]) { seen[s] = true; clean.push(s); }
        });
        doc.packs = { ids: clean, updated: now() };
        try { storage.removeItem(PACK_AUTO); } catch (e) {}
        writeDoc(doc);
      },
      // «Standard (automatisk)» (spec 2026-08-06-menyopprydding §2): auto
      // gjenopprettes som EKSPLISITT verdi {auto:true} — å slette doc.packs
      // ville blitt resurrektert av mergeRemote (remote manuelt sett med
      // timestamp vinner alltid over et fraværende lokalt felt).
      setPacksAuto: function () {
        var doc = readDoc();
        doc.packs = { auto: true, updated: now() };
        writeDoc(doc);
      },
      togglePack: function (id) {
        var st = this.packsState();
        var s = String(id);
        var ids = st.ids.indexOf(s) >= 0
          ? st.ids.filter(function (x) { return x !== s; })
          : st.ids.concat([s]);
        this.setPacks(ids);
      },
      setAutoPack: function (id) {
        var doc = readDoc();
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) return; // manuelt valg vinner
        try {
          if (id == null) storage.removeItem(PACK_AUTO);
          else storage.setItem(PACK_AUTO, String(id));
        } catch (e) {}
        fire();
      },
      onChange: function (cb) { listeners.push(cb); },
      // Fase 2-synk: exportDoc/mergeRemote brukes av konto-sync.js.
      // Merge = union per id, nyeste `updated` vinner, likhet → lokal;
      // `active` følger dokumentet med nyest doc.updated. Skriver STILLE
      // (ingen onChange — synken pusher selv resultatet).
      exportDoc: function () { return readDoc(); },
      mergeRemote: function (remoteDoc) {
        if (!remoteDoc || remoteDoc.v !== 1 || typeof remoteDoc.profiles !== 'object') return false;
        var doc = readDoc();
        var changed = false;
        Object.keys(remoteDoc.profiles || {}).forEach(function (id) {
          var r = remoteDoc.profiles[id];
          var l = doc.profiles[id];
          if (!r) return;
          if (!l || String(r.updated || '') > String(l.updated || '')) {
            doc.profiles[id] = r;
            changed = true;
          }
        });
        var rp = remoteDoc.packs;
        if (rp && typeof rp === 'object' && (Array.isArray(rp.ids) || rp.auto === true)) {
          var normPacks = function (p) {
            return p.auto === true
              ? { auto: true, updated: String(p.updated || '') }
              : { ids: (p.ids || []).map(String), updated: String(p.updated || '') };
          };
          var lp = doc.packs;
          var rN = normPacks(rp);
          if ((!lp || rN.updated > String(lp.updated || '')) &&
              JSON.stringify(lp ? normPacks(lp) : null) !== JSON.stringify(rN)) {
            doc.packs = rN;
            changed = true;
          }
        }
        if (String(remoteDoc.updated || '') > String(doc.updated || '')) {
          var remoteActive = remoteDoc.active || null;
          if (doc.active !== remoteActive) { doc.active = remoteActive; changed = true; }
          doc.updated = remoteDoc.updated;
        }
        if (doc.active && !live(doc, doc.active)) { doc.active = null; changed = true; }
        if (changed) writeDoc(doc, { silent: true, keepUpdated: true });
        return changed;
      },
      seedFromLegacy: function () {
        try {
          var raw = storage.getItem(LEGACY);
          if (raw == null) return;
          storage.removeItem(LEGACY);
          if (!String(raw).trim()) return;
          var doc = readDoc();
          if (Object.keys(doc.profiles).length) return; // aldri overskriv
          var id = newId();
          doc.profiles[id] = { name: 'My preferences', text: clampText(raw), updated: now() };
          doc.active = id;
          writeDoc(doc);
        } catch (e) {}
      },
    };
  }

  if (global.localStorage) {
    global.Profiles = makeProfiles(global.localStorage);
    global.Profiles.seedFromLegacy();
  }

  // ---- DOM: modal + chip (kun browser; ask-visningen, engelske strenger).
  if (typeof document !== 'undefined' && document.getElementById) {
    var T = function (k, p) { return global.t ? global.t(k, p) : k; };
    var initProfilesUi = function () {
      var P = global.Profiles;
      var backdrop = document.getElementById('profilesBackdrop');
      if (!P || !backdrop) return;
      var listEl = document.getElementById('profilesList');
      var editEl = document.getElementById('profilesEdit');
      var titleEl = document.getElementById('profilesTitle');
      var nameEl = document.getElementById('profileName');
      var textEl = document.getElementById('profileText');
      var countEl = document.getElementById('profileCount');
      var maxEl = document.getElementById('profileTextMax');
      var newBtn = document.getElementById('profileNewBtn');
      var saveBtn = document.getElementById('profileSaveBtn');
      var delBtn = document.getElementById('profileDeleteBtn');
      var editingId = null; // null = ingen redigering; 'NY' = ny profil
      // Hvilken kind modalen viser (kontekstrunden fase 3): 'profile' er
      // standard (Profiles-knappen); 'source' settes av openModal({kind:
      // 'source'}) — samme modal dobler som kildeeditor (§Unifisert lager).
      var modalKind = 'profile';

      function renderList() {
        if (modalKind === 'source' && global.SourcesUi) {
          global.SourcesUi.renderLibrary(listEl, { onEdit: openEdit });
          return;
        }
        // Review-funn 2026-08-06 (Task 4-fiks): SourcesUi.renderLibrary legger
        // .sources-scroll på listEl (samme DOM-node som profil-grenen bruker,
        // hentet ÉN gang ved modul-init) og fjerner den aldri selv — uten
        // dette lekker 300px-taket/scrollbaren inn i Profiles-modalen for
        // resten av økten så snart «Administrer kilder …» har vært åpnet.
        listEl.classList.remove('sources-scroll');
        var act = P.active();
        listEl.innerHTML = '';
        if (modalKind === 'profile') {
          var none = document.createElement('label');
          none.className = 'profiles-row';
          none.innerHTML = '<input type="radio" name="profileActive"' + (act ? '' : ' checked') + '> <span>' + T('No profile') + '</span>';
          none.querySelector('input').addEventListener('change', function () { P.setActive(null); });
          listEl.appendChild(none);
        }
        P.list(modalKind).forEach(function (pr) {
          var row = document.createElement('label');
          row.className = 'profiles-row';
          if (modalKind === 'profile') {
            var r = document.createElement('input');
            r.type = 'radio';
            r.name = 'profileActive';
            r.checked = !!(act && act.id === pr.id);
            r.addEventListener('change', function () { P.setActive(pr.id); });
            row.appendChild(r);
          }
          var nm = document.createElement('span');
          nm.textContent = pr.name;
          var edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'ai-codeblock-btn';
          edit.textContent = T('Edit');
          edit.addEventListener('click', function (ev) {
            ev.preventDefault();
            openEdit(pr.id);
          });
          row.appendChild(nm);
          row.appendChild(edit);
          listEl.appendChild(row);
        });
      }
      function openEdit(id) {
        editingId = id;
        var pr = id === 'NY' ? { name: '', text: '' } : (P.get(id) || { name: '', text: '' });
        // Tegnbudsjett: NY følger modalens gjeldende kind; en eksisterende
        // oppføring følger sin EGEN lagrede kind (den endres aldri ved edit).
        var kind = id === 'NY' ? modalKind : (pr.kind || 'profile');
        var max = kind === 'source' ? P.SOURCE_TEXT_MAX : P.TEXT_MAX;
        textEl.maxLength = max;
        if (maxEl) maxEl.textContent = String(max);
        nameEl.value = pr.name;
        textEl.value = pr.text;
        countEl.textContent = String(textEl.value.length);
        editEl.hidden = false;
        saveBtn.hidden = false;
        delBtn.hidden = id === 'NY';
        nameEl.focus();
      }
      function closeEdit() {
        editingId = null;
        editEl.hidden = true;
        saveBtn.hidden = true;
        delBtn.hidden = true;
      }
      textEl.addEventListener('input', function () { countEl.textContent = String(textEl.value.length); });
      // Markdown-preview (spec 2026-08-05 §2): rendres ved åpning av folden —
      // ask-viewens delte rendrer; tom hvis den (mot formodning) mangler.
      var prevWrap = document.getElementById('profilePreviewWrap');
      var prevEl = document.getElementById('profilePreview');
      if (prevWrap && prevEl) {
        var renderPreview = function () {
          if (!prevWrap.open) return;
          prevEl.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(textEl.value) : '';
        };
        prevWrap.addEventListener('toggle', renderPreview);
        textEl.addEventListener('input', renderPreview);
      }
      newBtn.addEventListener('click', function () { openEdit('NY'); });
      saveBtn.addEventListener('click', function () {
        if (editingId === 'NY') {
          var id = P.create(nameEl.value, textEl.value, modalKind);
          // Kilder kan aldri være aktiv profil — kun relevant i profile-modus.
          if (modalKind === 'profile' && !P.active()) P.setActive(id); // første profil aktiveres direkte
        } else if (editingId) {
          P.update(editingId, { name: nameEl.value, text: textEl.value });
        }
        closeEdit();
        renderList();
      });
      delBtn.addEventListener('click', function () {
        if (editingId && editingId !== 'NY') P.remove(editingId);
        closeEdit();
        renderList();
      });
      document.getElementById('profilesCloseBtn').addEventListener('click', function () {
        closeEdit();
        backdrop.classList.remove('open');
      });
      // Menyopprydding (spec 2026-08-06-menyopprydning §3): profilinngangen
      // bor i sidemenyen og åpner modalen direkte — radioene der ER velgeren.
      var sideBtn = document.getElementById('askProfileBtn');
      var sideLabel = document.getElementById('askProfileLabel');
      function renderSideLabel() {
        if (!sideLabel) return;
        var a = P.active();
        sideLabel.textContent = a ? T('Profile: {name}', { name: a.name }) : T('Profile');
      }
      if (sideBtn) sideBtn.addEventListener('click', function () { P.openModal(); });
      renderSideLabel();
      // openModal(opts): {kind:'profile'|'source', prefillName, prefillText}.
      // kind velger tittel/liste/knapp-tekst (§Unifisert lager); prefill*
      // åpner editEl direkte med gitte verdier (brukes av «lagre som kilde»-
      // flyter, task 6) i stedet for å vise lista først.
      P.openModal = function (opts) {
        opts = opts || {};
        modalKind = opts.kind === 'source' ? 'source' : 'profile';
        if (titleEl) titleEl.textContent = modalKind === 'source' ? T('Sources') : T('Profiles');
        if (newBtn) newBtn.textContent = modalKind === 'source' ? T('New source') : T('New profile');
        var impBtn = document.getElementById('sourcesImportBtn');
        var ctyBtn = document.getElementById('sourcesCountryBtn');
        if (impBtn) impBtn.hidden = modalKind !== 'source';
        if (ctyBtn) ctyBtn.hidden = modalKind !== 'source';
        // sourcesInfo lever utenfor listEl (SourcesUi styrer den KUN i
        // source-modus) — skjul den eksplisitt her, ellers lekker en
        // tidligere valgt kildes infopanel inn i profil-modalen.
        if (modalKind !== 'source') {
          var infoEl = document.getElementById('sourcesInfo');
          if (infoEl) infoEl.hidden = true;
        }
        if ('prefillName' in opts || 'prefillText' in opts) {
          renderList();
          openEdit('NY');
          nameEl.value = opts.prefillName || '';
          textEl.value = opts.prefillText || '';
          countEl.textContent = String(textEl.value.length);
        } else {
          closeEdit();
          renderList();
        }
        backdrop.classList.add('open');
      };
      P.onChange(function () { renderList(); renderSideLabel(); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfilesUi);
    else initProfilesUi();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeProfiles: makeProfiles };
  }
})(typeof window !== 'undefined' ? window : globalThis);
