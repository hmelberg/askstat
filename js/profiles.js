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
  // Kildevelger-runde 2 (§Designavgjørelser): landvalg og av-skrudde
  // standardkilder er nye synkede hel-verdi-felt på profiles-dokumentet.
  var COUNTRY_CC_RE = /^[A-Z]{2}$/;
  var SOURCES_OFF_ID_RE = /^[a-z0-9_-]{1,32}$/;
  var SOURCES_OFF_MAX = 40;
  // Kilder-profil-output (2026-08-08, Task 1): tag-clamp — delt ren funksjon
  // (ingen storage-avhengighet, derfor på modulnivå som packs.js sin
  // compose()). Aksepterer array ELLER kommaseparert streng.
  var TAG_RE = /^[a-zæøåa-z0-9_-]{1,24}$/;
  var TAG_MAX = 8;
  function cleanTags(input) {
    var arr = Array.isArray(input) ? input : String(input == null ? '' : input).split(',');
    // Object.create(null), IKKE {}: "__proto__" er en nedarvet ACCESSOR på
    // Object.prototype (Annex B) — dens setter ignorerer non-objekt-verdier
    // stille, så `seen['__proto__'] = true` på et vanlig {} ville vært en
    // no-op og ALDRI faktisk registrert '__proto__' som sett (to forekomster
    // av tagen "__proto__" ville da IKKE blitt deduplisert — funnet ved
    // review, se regresjonstest under). Et prototype-løst objekt har ingen
    // slik accessor, så vanlig bracket-tildeling fungerer normalt.
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < arr.length && out.length < TAG_MAX; i++) {
      var t = String(arr[i] == null ? '' : arr[i]).trim().toLowerCase();
      // hasOwnProperty.call (ikke seen.hasOwnProperty, som ikke finnes på et
      // Object.create(null)-objekt): en tag som "constructor" ville ellers
      // lest en arvet Object.prototype-verdi via seen[t] direkte.
      if (!t || !TAG_RE.test(t) || Object.prototype.hasOwnProperty.call(seen, t)) continue;
      seen[t] = true;
      out.push(t);
    }
    return out;
  }

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
      // Kildevelger-runde 2: gammel {auto:true}-variant av doc.packs skrubbes
      // — auto-landvalget bor nå i doc.country (synket) + md_pack_auto
      // (device-lokalt resultat); doc.packs er heretter rent manuelt flervalg.
      if (doc.packs && doc.packs.auto === true) delete doc.packs;
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
    // Hel-verdi-felt (packs/country/sources_off, kildevelger-runde 2): HELE
    // feltet er én enhet — ikke felt-vis merge. Nyeste `updated` vinner; ved
    // likhet beholdes lokal verdi URØRT (ellers ville changed=true blitt
    // markert for en no-op skriving). isPresent avviser fraværende/
    // feilformede remote-verdier stille — dekker bl.a. gamle {auto:true}-
    // pakkedokumenter fra før denne runden (bevisst ingen automigrering).
    function mergeWholeField(doc, remoteVal, field, normalize, isPresent) {
      if (!isPresent(remoteVal)) return false;
      var lVal = doc[field];
      var rN = normalize(remoteVal);
      if ((!lVal || rN.updated > String(lVal.updated || '')) &&
          JSON.stringify(lVal ? normalize(lVal) : null) !== JSON.stringify(rN)) {
        doc[field] = rN;
        return true;
      }
      return false;
    }
    function normalizePacks(p) { return { ids: (p.ids || []).map(String), updated: String(p.updated || '') }; }
    function isPacksValue(p) { return !!p && typeof p === 'object' && Array.isArray(p.ids); }
    function normalizeCountry(c) {
      var m = (c.mode === 'none' || c.mode === 'cc') ? c.mode : 'auto';
      var out = { mode: m, updated: String(c.updated || '') };
      if (m === 'cc' && c.cc) out.cc = String(c.cc).toUpperCase();
      return out;
    }
    function isCountryValue(c) {
      return !!c && typeof c === 'object' && (c.mode === 'auto' || c.mode === 'none' || c.mode === 'cc');
    }
    function normalizeSourcesOff(s) { return { ids: (s.ids || []).map(String), updated: String(s.updated || '') }; }
    function isSourcesOffValue(s) { return !!s && typeof s === 'object' && Array.isArray(s.ids); }
    return {
      NAME_MAX: NAME_MAX,
      TEXT_MAX: TEXT_MAX,
      SOURCE_TEXT_MAX: SOURCE_TEXT_MAX,
      cleanTags: cleanTags,
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
      // create(name, text, kind, origin, tags): kind 'profile'|'source'
      // (default 'profile'); origin er valgfri og lagres uendret (brukes av
      // community-import, se packs.js importPack/migrateImported). tags
      // (kildevelger-runde, kilder-profil-output-runden) clampes via
      // cleanTags og lagres KUN når resultatet ikke er tomt.
      create: function (name, text, kind, origin, tags) {
        var doc = readDoc();
        var id = newId();
        var k = kind === 'source' ? 'source' : 'profile';
        var entry = { name: clampName(name), text: clampText(text, k), updated: now() };
        if (k === 'source') entry.kind = 'source';
        if (origin !== undefined) entry.origin = origin;
        var ct = cleanTags(tags);
        if (ct.length) entry.tags = ct;
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
        // tags ERSTATTES (ikke merges) når feltet er med — tomt resultat
        // fjerner feltet helt (samme «kun ikke-tom»-konvensjon som create).
        if (fields && 'tags' in fields) {
          var ct = cleanTags(fields.tags);
          if (ct.length) doc.profiles[id].tags = ct;
          else delete doc.profiles[id].tags;
        }
        // originKind (kilder-profil-output-runden, Task 5): kilde-dialogen lar
        // brukeren flytte en egen kilde mellom fanene tema/enkeltkilde uten å
        // slette og lage den på nytt. Kun origin.kind skrives — resten av
        // origin (source/id/updated, satt ved import) er URØRT, og et helt
        // manglende origin fylles med {source:'own'} slik egenskrevne kilder
        // ellers får det av create-kallet i dialogen.
        if (fields && 'originKind' in fields) {
          var ok = fields.originKind === 'overview' ? 'overview' : 'source';
          var org = doc.profiles[id].origin;
          if (!org || typeof org !== 'object') org = doc.profiles[id].origin = { source: 'own' };
          org.kind = ok;
        }
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
      // Pakkevalg (kildevelger-runde 2: forenklet til RENT manuelt flervalg).
      // doc.packs = {ids, updated} (synkes, hele settet = én verdi). Landets
      // auto-forslag hører IKKE lenger hjemme her — VALGET (auto/none/cc)
      // synkes via doc.country (§under), og auto-RESULTATET (hvilken pakke-
      // id locale pekte på) bor device-lokalt i md_pack_auto, lest av
      // packs.js kun når countryState().mode==='auto'. Fraværende doc.packs
      // = tomt manuelt sett. Gammelt doc.pack OG gammel {auto:true}-variant
      // av doc.packs skrubbes i writeDoc.
      packsState: function () {
        var doc = readDoc();
        return isPacksValue(doc.packs) ? { ids: doc.packs.ids.map(String) } : { ids: [] };
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
      // setAutoPack: device-lokalt cache av landets auto-RESULTAT (§over) —
      // vedlikeholdes ALLTID, uansett hva doc.packs/doc.country inneholder
      // (den forrige manuelt-valg-vakten hørte til {auto:true}-varianten av
      // doc.packs, som er borte). Det er packs.js (kun når
      // countryState().mode==='auto') som avgjør om verdien faktisk brukes.
      setAutoPack: function (id) {
        try {
          if (id == null) storage.removeItem(PACK_AUTO);
          else storage.setItem(PACK_AUTO, String(id));
        } catch (e) {}
        fire();
      },
      // Landvalg (kildevelger-runde 2, §Designavgjørelser): doc.country =
      // {mode:'auto'|'none'|'cc', cc?, updated}. Fraværende felt tolkes som
      // {mode:'auto'}. Alltid EKSPLISITT skrevet (aldri delete) — ellers
      // ville et fraværende felt bli resurrektert til en tilfeldig eldre
      // remote-verdi ved neste merge (samme resurreksjonsvern som packs/
      // {auto:true} løste tidligere med setPacksAuto, nå droppet).
      countryState: function () {
        var doc = readDoc();
        return isCountryValue(doc.country) ? Object.assign({}, doc.country) : { mode: 'auto' };
      },
      setCountry: function (mode, cc) {
        var m = (mode === 'none' || mode === 'cc') ? mode : 'auto';
        var entry = { mode: m, updated: now() };
        if (m === 'cc') {
          var up = String(cc || '').toUpperCase();
          if (!COUNTRY_CC_RE.test(up)) return; // ugyldig landkode — ignoreres stille
          entry.cc = up;
        }
        var doc = readDoc();
        doc.country = entry;
        writeDoc(doc);
      },
      // Av-skrudde standardkilder (kildevelger-runde 2, §Designavgjørelser):
      // doc.sources_off = {ids, updated} — synkes; id-ene er registry-nøkler
      // (f.eks. 'dbnomics'), klient-clampet mot samme regex/tak som serveren
      // håndhever i registry.ts (Task 3). Fraværende felt = ingen kilder
      // avskrudd.
      sourcesOff: function () {
        var doc = readDoc();
        return isSourcesOffValue(doc.sources_off) ? doc.sources_off.ids.map(String) : [];
      },
      toggleSourceOff: function (id) {
        var s = String(id);
        if (!SOURCES_OFF_ID_RE.test(s)) return; // ugyldig id — ignoreres stille
        var doc = readDoc();
        var cur = isSourcesOffValue(doc.sources_off) ? doc.sources_off.ids.map(String) : [];
        var idx = cur.indexOf(s);
        var next;
        if (idx >= 0) {
          next = cur.filter(function (x) { return x !== s; });
        } else {
          if (cur.length >= SOURCES_OFF_MAX) return; // tak nådd — nye av-skruinger ignoreres stille
          next = cur.concat([s]);
        }
        doc.sources_off = { ids: next, updated: now() };
        writeDoc(doc);
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
        // Hel-verdi-armer (§mergeWholeField over): packs/country/sources_off.
        // rp med gammel {auto:true}-form (uten .ids) blir avvist av
        // isPacksValue → arm no-op'er (bevisst ingen automigrering).
        if (mergeWholeField(doc, remoteDoc.packs, 'packs', normalizePacks, isPacksValue)) changed = true;
        if (mergeWholeField(doc, remoteDoc.country, 'country', normalizeCountry, isCountryValue)) changed = true;
        if (mergeWholeField(doc, remoteDoc.sources_off, 'sources_off', normalizeSourcesOff, isSourcesOffValue)) changed = true;
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
        // Kilde-elementene (#sourcesImportBtn/#sourcesInfo/ryddeknappene/
        // hjelpeteksten) styres IKKE herfra lenger: kildebiblioteket flyttet
        // til sin egen dialog i js/sources-modal.js (kilder-profil-output-
        // runden, Task 5). Denne modalen eier kun profiler — modalKind selv
        // ryddes bort i Task 7.
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
