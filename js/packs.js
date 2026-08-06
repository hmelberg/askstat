// js/packs.js — kildepakker (spec 2026-08-05-sprak-pakker-deling §2, flervalg
// kontekstrunden fase 2 §2): kuraterte pakker (data/packs/*.md), generisk
// landmal (countries.json) og importerte kopier. Pakketekstene resolves
// KLIENTSIDE og sendes som packs-felt ([{name,text}]) til /api/svar
// (ai-chat.js) — serveren rendrer blokka.
// Valg-tilstanden bor i Profiles (packsState/setPacks/togglePack/setAutoPack);
// denne fila eier innhold, katalog og cache. DOM-delen (velger-pille) bak
// document-guard.
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
      // Community-pakker er IKKE direkte velgbare (les-før-aktiver, spec §5):
      // de vises i Explore-modalen og kommer inn i lista som 'imported'-kopier.
      curated().forEach(function (p) {
        if (p.community) return;
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

    function selectedIds() {
      var st = profiles && profiles.packsState ? profiles.packsState() : null;
      return st ? st.ids : [];
    }
    function payload() {
      var out = [];
      selectedIds().forEach(function (id) {
        var got = mem[id] || readJson(TXT_CACHE + id);
        if (got) out.push({ name: got.name, text: got.text });
      });
      return out.length ? out : undefined;
    }
    async function ensureSelected() {
      var ids = selectedIds();
      for (var i = 0; i < ids.length; i++) {
        if (!mem[ids[i]]) await resolve(ids[i]);
      }
    }

    // Boot + språkbytte (spec §4): auto-forslag fra locale-KANDIDATER —
    // lagret UI-språk først (eksplisitt brukersignal), så navigator-locale
    // (bærer region: sv-FI!). setAutoPack no-op'er ved manuelt valg, og
    // null RYDDER stale auto når ingen kandidat matcher.
    function applyAuto(locales) {
      var arr = Array.isArray(locales) ? locales : [locales];
      var auto = null;
      for (var i = 0; i < arr.length && !auto; i++) auto = autoFrom(arr[i]);
      if (profiles && profiles.setAutoPack) profiles.setAutoPack(auto);
    }
    async function boot(locales) {
      await load();
      applyAuto(locales);
      await ensureSelected();
    }
    async function onLangChange(locales) {
      applyAuto(locales);
      await ensureSelected();
    }

    function listCommunity() {
      return curated().filter(function (p) { return p.community; })
        .map(function (p) {
          return { id: p.id, name: p.name, description: p.description || '',
            author: p.author || '', updated: p.updated || '' };
        });
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
      load: load, list: list, listCommunity: listCommunity, autoFrom: autoFrom,
      resolve: resolve, payload: payload, ensureSelected: ensureSelected,
      boot: boot, onLangChange: onLangChange, importPack: importPack,
      displayName: displayName,
    };
  }

  if (global.localStorage && typeof fetch !== 'undefined') {
    global.Packs = makePacks(global.localStorage, fetch.bind(global), global.Profiles);
  }

  // ---- DOM: velger-pille i input-kortet (samme anatomi som profilvelgeren).
  if (typeof document !== 'undefined' && document.getElementById) {
    var T = function (k, p) { return global.t ? global.t(k, p) : k; };
    var initPacksUi = function () {
      var P = global.Packs;
      var Prof = global.Profiles;
      if (!P || !Prof) return;

      // Flervalg (kontekstrunden fase 2 §2): DOM-delens egen speiling av
      // Profiles.packsState().ids — brukt både i renderInto og import.
      // Midlertidig sjekkboks-fri liste (Task 3 bygger om menyen helt).
      function selectedIds() { return Prof.packsState().ids; }

      // Kontekst-pillen (kontekstrunden 2026-08-06 §1): kildeseksjonen
      // rendres inn i den delte popoveren av js/context-pill.js via denne
      // kroken; etiketten (m/auto-merke) eies også av context-pill.js.
      function renderInto(container, close) {
        container.innerHTML = '';
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
            close();
            onPick();
          });
          container.appendChild(b);
        }
        function sep() {
          var d = document.createElement('div');
          d.className = 'ask-pop-sep';
          container.appendChild(d);
        }
        var ids = selectedIds();
        pickItem(T('International default'), !ids.length, function () { Prof.setPacks([]); });
        var entries = P.list();
        var groups = ['builtin', 'imported', 'country'];
        groups.forEach(function (g) {
          var inGroup = entries.filter(function (e) { return e.group === g; });
          if (!inGroup.length) return;
          sep();
          inGroup.forEach(function (e) {
            pickItem(e.name, ids.indexOf(e.id) >= 0, function () {
              Prof.togglePack(e.id);
              P.ensureSelected();
            });
          });
        });
        if (P.listCommunity().length) {
          sep();
          pickItem(T('View/Import shared packs…'), false, openExplore);
        }
      }
      global.PacksUi = { renderInto: renderInto };

      // Explore-modalen (deling v1, spec §5): les-før-aktiver — beskrivelse +
      // rendret preview FØR import; import = kopi som aktiveres.
      var expBackdrop = document.getElementById('packsExploreBackdrop');
      var expList = document.getElementById('packsExploreList');
      var expPrevWrap = document.getElementById('packsExplorePreviewWrap');
      var expPrev = document.getElementById('packsExplorePreview');
      var expMeta = document.getElementById('packsExploreMeta');
      var expImport = document.getElementById('packsImportBtn');
      var expClose = document.getElementById('packsExploreCloseBtn');
      var expSelected = null; // {entry, text}
      function openExplore() {
        if (!expBackdrop) return;
        expSelected = null;
        expPrevWrap.hidden = true;
        expImport.hidden = true;
        expList.innerHTML = '';
        P.listCommunity().forEach(function (e) {
          var row = document.createElement('button');
          row.type = 'button';
          row.className = 'ask-explore-row';
          var nm = document.createElement('strong');
          nm.textContent = e.name;
          var desc = document.createElement('div');
          desc.textContent = e.description;
          row.appendChild(nm);
          row.appendChild(desc);
          row.addEventListener('click', function () {
            P.resolve(e.id).then(function (got) {
              if (!got) return;
              expSelected = { entry: e, text: got.text };
              expMeta.textContent = T('by {author}, updated {updated}', { author: e.author || '?', updated: e.updated || '?' });
              expPrev.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(got.text) : '';
              expPrevWrap.hidden = false;
              expImport.hidden = false;
            });
          });
          expList.appendChild(row);
        });
        expBackdrop.classList.add('open');
      }
      if (expImport) expImport.addEventListener('click', function () {
        if (!expSelected) return;
        P.importPack(expSelected.entry, expSelected.text);
        Prof.setPacks(selectedIds().concat(['imported:' + expSelected.entry.id]));
        P.ensureSelected();
        expBackdrop.classList.remove('open');
      });
      if (expClose) expClose.addEventListener('click', function () { expBackdrop.classList.remove('open'); });
      if (expBackdrop) expBackdrop.addEventListener('click', function (e) {
        if (e.target === expBackdrop) expBackdrop.classList.remove('open');
      });
      // Boot: last katalog, auto-forslag (lagret UI-språk → navigator-locale),
      // preload gjeldende tekst. Etiketten re-rendres etterpå — displayName
      // trenger katalogen for kuraterte pakker.
      function refreshPill() {
        if (global.ContextPill) global.ContextPill.refresh();
      }
      var storedLang = null;
      try { storedLang = global.localStorage.getItem('microdata_ui_lang'); } catch (e) {}
      P.boot([storedLang || '', (typeof navigator !== 'undefined' && navigator.language) || ''])
        .then(refreshPill)
        .catch(refreshPill);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPacksUi);
    else initPacksUi();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makePacks: makePacks };
  }
})(typeof window !== 'undefined' ? window : globalThis);
