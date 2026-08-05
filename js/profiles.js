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
      if (!opts || !opts.keepUpdated) doc.updated = now();
      try { storage.setItem(LS, JSON.stringify(doc)); } catch (e) {}
      if (!opts || !opts.silent) fire();
    }
    function clampName(s) { return String(s || 'Untitled').trim().slice(0, NAME_MAX) || 'Untitled'; }
    function clampText(s) { return String(s == null ? '' : s).slice(0, TEXT_MAX); }
    function live(doc, id) {
      var p = doc.profiles[id];
      return (p && !p.deleted) ? p : null;
    }
    return {
      NAME_MAX: NAME_MAX,
      TEXT_MAX: TEXT_MAX,
      list: function () {
        var doc = readDoc();
        return Object.keys(doc.profiles).filter(function (id) { return live(doc, id); })
          .map(function (id) {
            return Object.assign({ id: id }, doc.profiles[id]);
          }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      get: function (id) {
        var doc = readDoc();
        return live(doc, id) ? Object.assign({ id: id }, doc.profiles[id]) : null;
      },
      create: function (name, text) {
        var doc = readDoc();
        var id = newId();
        doc.profiles[id] = { name: clampName(name), text: clampText(text), updated: now() };
        writeDoc(doc);
        return id;
      },
      update: function (id, fields) {
        var doc = readDoc();
        if (!doc.profiles[id]) return;
        if (fields && 'name' in fields) doc.profiles[id].name = clampName(fields.name);
        if (fields && 'text' in fields) doc.profiles[id].text = clampText(fields.text);
        doc.profiles[id].updated = now();
        writeDoc(doc);
      },
      remove: function (id) {
        var doc = readDoc();
        if (!doc.profiles[id]) return;
        doc.profiles[id] = { deleted: true, updated: now() };
        if (doc.active === id) doc.active = null;
        writeDoc(doc);
      },
      setActive: function (id) {
        var doc = readDoc();
        if (id !== null && !live(doc, id)) return;
        doc.active = id;
        writeDoc(doc);
      },
      active: function () {
        var doc = readDoc();
        if (!doc.active || !live(doc, doc.active)) return null;
        return Object.assign({ id: doc.active }, doc.profiles[doc.active]);
      },
      activeText: function () {
        var doc = readDoc();
        var p = doc.active && live(doc, doc.active);
        var t = p && String(p.text || '').trim();
        return t ? t : undefined;
      },
      // Pack-slot (spec 2026-08-05-sprak-pakker-deling §2): kildepakke ved
      // siden av personlig profil. MANUELT valg bor i doc.pack (synkes);
      // auto-forslag (fra locale) bor KUN i md_pack_auto (per enhet).
      // doc.pack = {id:null} betyr manuelt «International» — forskjellig fra
      // fraværende felt (aldri valgt), som lar auto-forslaget gjelde.
      packState: function () {
        var doc = readDoc();
        if (doc.pack && typeof doc.pack === 'object') {
          return { id: doc.pack.id == null ? null : String(doc.pack.id), auto: false };
        }
        var a = null;
        try { a = storage.getItem(PACK_AUTO); } catch (e) {}
        return a ? { id: String(a), auto: true } : { id: null, auto: false };
      },
      setPack: function (id) {
        var doc = readDoc();
        doc.pack = { id: id == null ? null : String(id), updated: now() };
        try { storage.removeItem(PACK_AUTO); } catch (e) {}
        writeDoc(doc);
      },
      setAutoPack: function (id) {
        var doc = readDoc();
        if (doc.pack && typeof doc.pack === 'object') return; // manuelt valg vinner
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
        var rp = remoteDoc.pack;
        if (rp && typeof rp === 'object') {
          var lp = doc.pack;
          var rU = String(rp.updated || '');
          if ((!lp || rU > String(lp.updated || '')) &&
              (!lp || lp.id !== rp.id || String(lp.updated || '') !== rU)) {
            doc.pack = { id: rp.id == null ? null : String(rp.id), updated: rU };
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
    var initProfilesUi = function () {
      var P = global.Profiles;
      var backdrop = document.getElementById('profilesBackdrop');
      if (!P || !backdrop) return;
      var listEl = document.getElementById('profilesList');
      var editEl = document.getElementById('profilesEdit');
      var nameEl = document.getElementById('profileName');
      var textEl = document.getElementById('profileText');
      var countEl = document.getElementById('profileCount');
      var newBtn = document.getElementById('profileNewBtn');
      var saveBtn = document.getElementById('profileSaveBtn');
      var delBtn = document.getElementById('profileDeleteBtn');
      var editingId = null; // null = ingen redigering; 'NY' = ny profil

      function renderList() {
        var act = P.active();
        listEl.innerHTML = '';
        var none = document.createElement('label');
        none.className = 'profiles-row';
        none.innerHTML = '<input type="radio" name="profileActive"' + (act ? '' : ' checked') + '> <span>No profile</span>';
        none.querySelector('input').addEventListener('change', function () { P.setActive(null); });
        listEl.appendChild(none);
        P.list().forEach(function (pr) {
          var row = document.createElement('label');
          row.className = 'profiles-row';
          var r = document.createElement('input');
          r.type = 'radio';
          r.name = 'profileActive';
          r.checked = !!(act && act.id === pr.id);
          r.addEventListener('change', function () { P.setActive(pr.id); });
          var nm = document.createElement('span');
          nm.textContent = pr.name;
          var edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'ai-codeblock-btn';
          edit.textContent = 'Edit';
          edit.addEventListener('click', function (ev) {
            ev.preventDefault();
            openEdit(pr.id);
          });
          row.appendChild(r);
          row.appendChild(nm);
          row.appendChild(edit);
          listEl.appendChild(row);
        });
      }
      function openEdit(id) {
        editingId = id;
        var pr = id === 'NY' ? { name: '', text: '' } : (P.get(id) || { name: '', text: '' });
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
      newBtn.addEventListener('click', function () { openEdit('NY'); });
      saveBtn.addEventListener('click', function () {
        if (editingId === 'NY') {
          var id = P.create(nameEl.value, textEl.value);
          if (!P.active()) P.setActive(id); // første profil aktiveres direkte
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
      P.openModal = function () {
        closeEdit();
        renderList();
        backdrop.classList.add('open');
      };
      // Profilvelger i input-kortet (layout-runden 2026-08-05): plassert og
      // formet som Claudes modellvelger — viser aktiv profil, åpner meny med
      // alle profiler + «Manage profiles…» (modalen). Erstatter chipen; den
      // synlige etiketten dekker fortsatt aldri-usynlig-kravet i spec §Fase 1b.
      var pickBtn = document.getElementById('askProfileBtn');
      var pickLabel = document.getElementById('askProfileLabel');
      var pickMenu = document.getElementById('askProfileMenu');
      function renderPicker() {
        if (!pickLabel) return;
        var a = P.active();
        pickLabel.textContent = a ? a.name : 'No profile';
      }
      function pickItem(text, checked, onPick) {
        var b = document.createElement('button');
        b.type = 'button';
        var check = document.createElement('span');
        check.className = 'ask-pop-check';
        check.textContent = checked ? '✓' : '';
        var nm = document.createElement('span');
        nm.textContent = text;
        b.appendChild(check);
        b.appendChild(nm);
        b.addEventListener('click', function () {
          pickMenu.hidden = true;
          onPick();
        });
        pickMenu.appendChild(b);
      }
      function renderPickMenu() {
        if (!pickMenu) return;
        pickMenu.innerHTML = '';
        var a = P.active();
        pickItem('No profile', !a, function () { P.setActive(null); });
        P.list().forEach(function (pr) {
          pickItem(pr.name, !!(a && a.id === pr.id), function () { P.setActive(pr.id); });
        });
        var sep = document.createElement('div');
        sep.className = 'ask-pop-sep';
        pickMenu.appendChild(sep);
        pickItem('Manage profiles…', false, function () { P.openModal(); });
      }
      if (pickBtn && pickMenu) {
        pickBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (pickMenu.hidden) renderPickMenu();
          pickMenu.hidden = !pickMenu.hidden;
        });
        document.addEventListener('click', function (e) {
          if (!pickMenu.hidden && !pickMenu.contains(e.target)) pickMenu.hidden = true;
        });
      }
      P.onChange(function () { renderPicker(); renderList(); });
      renderPicker();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfilesUi);
    else initProfilesUi();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeProfiles: makeProfiles };
  }
})(typeof window !== 'undefined' ? window : globalThis);
