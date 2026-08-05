// js/packs.js — kildepakker (spec 2026-08-05-sprak-pakker-deling §2):
// kuraterte pakker (data/packs/*.md), generisk landmal (countries.json) og
// importerte kopier. Pakketeksten resolves KLIENTSIDE og sendes som
// pack-felt til /api/svar (ai-chat.js) — serveren rendrer blokka.
// Valg-tilstanden bor i Profiles (packState/setPack/setAutoPack); denne fila
// eier innhold, katalog og cache. DOM-delen (velger-pille) bak document-guard.
(function (global) {
  'use strict';
  var IDX_CACHE = 'md_packs_index';
  var CTY_CACHE = 'md_packs_countries';
  var TXT_CACHE = 'md_pack_text:'; // + id
  var IMPORTED = 'md_packs_imported';

  // Hans' mal (brainstorm 2026-08-05) — {NOTE} bærer ærlig adapterdekning.
  var TEMPLATE = 'The user is likely from {NAME}. When the question concerns ' +
    '{NAME} or has no explicit geography, prefer relevant national sources — ' +
    'such as {AGENCY} — when it is possible and natural for the question. {NOTE}';

  // Språk uten region: kun ENTYDIGE språk mappes (spec §4); de/fr/es/pt/zh/en
  // er flerlands og gir null (internasjonal default).
  var LANG_COUNTRY = { no: 'NO', nb: 'NO', nn: 'NO', da: 'DK', fi: 'FI', is: 'IS', sv: 'SE', ja: 'JP', hi: 'IN' };

  function makePacks(storage, fetchImpl, profiles) {
    var index = null;     // {v, packs:[{id,name,description,file,country}]}
    var countries = null; // {v, countries:{CC:{name,agency,note}}}
    var mem = {};         // id -> {name, text}

    function readJson(key) {
      try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; }
    }
    function writeJson(key, obj) {
      try { storage.setItem(key, JSON.stringify(obj)); } catch (e) {}
    }
    function imported() { return readJson(IMPORTED) || {}; }

    async function fetchJson(url) {
      var res = await fetchImpl(url);
      if (!res || !res.ok) return null;
      try { return await res.json(); } catch (e) { return null; }
    }

    async function load() {
      // Nett-først (cache-bust følger deploy), storage som fallback — pakker
      // er berikelse og skal aldri blokkere ask-flyten.
      var idx = await fetchJson('data/packs/index.json').catch(function () { return null; });
      var cty = await fetchJson('data/packs/countries.json').catch(function () { return null; });
      if (idx && idx.v === 1 && Array.isArray(idx.packs)) { index = idx; writeJson(IDX_CACHE, idx); }
      else index = readJson(IDX_CACHE);
      if (cty && cty.v === 1 && cty.countries) { countries = cty; writeJson(CTY_CACHE, cty); }
      else countries = readJson(CTY_CACHE);
    }

    function curated() { return (index && index.packs) || []; }
    function countryMap() { return (countries && countries.countries) || {}; }
    function curatedForCountry(cc) {
      var hit = curated().filter(function (p) { return p.country === cc; })[0];
      return hit ? hit.id : null;
    }

    function autoFrom(locale) {
      var s = String(locale || '').trim();
      if (!s) return null;
      var parts = s.split(/[-_]/);
      var lang = (parts[0] || '').toLowerCase();
      var region = (parts[1] || '').toUpperCase();
      if (region && /^[A-Z]{2}$/.test(region)) {
        if (curatedForCountry(region)) return curatedForCountry(region);
        if (countryMap()[region]) return 'country:' + region;
      }
      var cc = LANG_COUNTRY[lang];
      if (!cc) return null;
      return curatedForCountry(cc) || (countryMap()[cc] ? 'country:' + cc : null);
    }

    function displayName(id) {
      if (id.indexOf('country:') === 0) {
        var e = countryMap()[id.slice(8)];
        return e ? e.name : id.slice(8);
      }
      if (id.indexOf('imported:') === 0) {
        var imp = imported()[id.slice(9)];
        return imp ? imp.name : id.slice(9);
      }
      var c = curated().filter(function (p) { return p.id === id; })[0];
      return c ? c.name : id;
    }

    function list() {
      var out = [];
      curated().forEach(function (p) {
        out.push({ id: p.id, name: p.name, description: p.description || '', group: 'builtin' });
      });
      var covered = {};
      curated().forEach(function (p) { if (p.country) covered[p.country] = true; });
      var map = countryMap();
      Object.keys(map).sort(function (a, b) {
        return map[a].name.localeCompare(map[b].name);
      }).forEach(function (cc) {
        if (!covered[cc]) out.push({ id: 'country:' + cc, name: map[cc].name, description: '', group: 'country' });
      });
      Object.keys(imported()).forEach(function (key) {
        out.push({ id: 'imported:' + key, name: imported()[key].name, description: '', group: 'imported' });
      });
      return out;
    }

    function renderTemplate(cc) {
      var e = countryMap()[cc];
      var name = e ? e.name : cc;
      var agency = e && e.agency ? e.agency : 'the national statistical agency of ' + name;
      var note = (e && e.note) || '';
      return TEMPLATE.replace(/\{NAME\}/g, name).replace('{AGENCY}', agency)
        .replace('{NOTE}', note).trim();
    }

    async function resolve(id) {
      if (!id) return null;
      if (mem[id]) return mem[id];
      var out = null;
      if (id.indexOf('country:') === 0) {
        out = { name: displayName(id), text: renderTemplate(id.slice(8)) };
      } else if (id.indexOf('imported:') === 0) {
        var imp = imported()[id.slice(9)];
        if (imp) out = { name: imp.name, text: imp.text }; // kopi — ALDRI re-fetch
      } else {
        var entry = curated().filter(function (p) { return p.id === id; })[0];
        if (entry) {
          var res = await fetchImpl('data/packs/' + entry.file);
          if (res && res.ok) {
            var text = (await res.text()).slice(0, 8000);
            if (text.trim()) out = { name: entry.name, text: text };
          }
        }
        if (!out) {
          var cached = readJson(TXT_CACHE + id);
          if (cached) out = cached;
        }
      }
      if (out) { mem[id] = out; writeJson(TXT_CACHE + id, out); }
      return out;
    }

    function currentId() {
      var st = profiles && profiles.packState ? profiles.packState() : null;
      return st && st.id ? st.id : null;
    }

    function payload() {
      var id = currentId();
      if (!id) return undefined;
      var got = mem[id] || readJson(TXT_CACHE + id);
      return got ? { name: got.name, text: got.text } : undefined;
    }

    async function ensureCurrent() {
      var id = currentId();
      if (id && !mem[id]) await resolve(id);
    }

    // Boot + språkbytte (spec §4): auto-forslag fra locale — setAutoPack
    // no-op'er selv når et manuelt valg finnes, så dette er alltid trygt.
    async function boot(locale) {
      await load();
      var auto = autoFrom(locale);
      if (auto && profiles && profiles.setAutoPack) profiles.setAutoPack(auto);
      await ensureCurrent();
    }
    async function onLangChange(locale) {
      var auto = autoFrom(locale);
      if (profiles && profiles.setAutoPack) profiles.setAutoPack(auto);
      await ensureCurrent();
    }

    // Deling v1 (spec §5): import = KOPI med opprinnelse; resolves lokalt.
    function importPack(entry, text) {
      var all = imported();
      all[entry.id] = {
        name: String(entry.name || entry.id).slice(0, 60),
        text: String(text || '').slice(0, 8000),
        origin: { source: 'community', id: entry.id, updated: entry.updated || '' },
      };
      writeJson(IMPORTED, all);
      delete mem['imported:' + entry.id];
    }

    return {
      load: load, list: list, autoFrom: autoFrom, resolve: resolve,
      payload: payload, ensureCurrent: ensureCurrent, boot: boot,
      onLangChange: onLangChange, importPack: importPack, displayName: displayName,
    };
  }

  if (global.localStorage && typeof fetch !== 'undefined') {
    global.Packs = makePacks(global.localStorage, fetch.bind(global), global.Profiles);
  }

  // ---- DOM: velger-pille i input-kortet (samme anatomi som profilvelgeren).
  if (typeof document !== 'undefined' && document.getElementById) {
    var initPacksUi = function () {
      var P = global.Packs;
      var Prof = global.Profiles;
      var pickBtn = document.getElementById('askPackBtn');
      var pickLabel = document.getElementById('askPackLabel');
      var pickMenu = document.getElementById('askPackMenu');
      if (!P || !Prof || !pickBtn || !pickMenu) return;

      function renderPicker() {
        if (!pickLabel) return;
        var st = Prof.packState();
        // Aldri-usynlig-kravet: auto-valg merkes eksplisitt i pilla.
        pickLabel.textContent = st.id
          ? P.displayName(st.id) + (st.auto ? ' (auto)' : '')
          : 'International';
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
      function sep() {
        var d = document.createElement('div');
        d.className = 'ask-pop-sep';
        pickMenu.appendChild(d);
      }
      function renderMenu() {
        pickMenu.innerHTML = '';
        var st = Prof.packState();
        pickItem('International default', !st.id, function () { Prof.setPack(null); });
        var entries = P.list();
        var groups = ['builtin', 'imported', 'country'];
        groups.forEach(function (g) {
          var inGroup = entries.filter(function (e) { return e.group === g; });
          if (!inGroup.length) return;
          sep();
          inGroup.forEach(function (e) {
            pickItem(e.name, st.id === e.id, function () {
              Prof.setPack(e.id);
              P.ensureCurrent();
            });
          });
        });
      }
      pickBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (pickMenu.hidden) renderMenu();
        pickMenu.hidden = !pickMenu.hidden;
      });
      document.addEventListener('click', function (e) {
        if (!pickMenu.hidden && !pickMenu.contains(e.target)) pickMenu.hidden = true;
      });
      Prof.onChange(function () { renderPicker(); });
      // Boot: last katalog, auto-forslag fra locale, preload gjeldende tekst.
      P.boot((typeof navigator !== 'undefined' && navigator.language) || '')
        .then(renderPicker)
        .catch(function () { renderPicker(); });
      renderPicker();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPacksUi);
    else initPacksUi();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makePacks: makePacks };
  }
})(typeof window !== 'undefined' ? window : globalThis);
