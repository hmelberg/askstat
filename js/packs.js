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
  // Kildevelger-runde 2 (§Designavgjørelser, Task 2): cache for
  // data/data-sources.json — samme nett-først/storage-fallback-mønster som
  // IDX_CACHE/CTY_CACHE.
  var REG_CACHE = 'md_sources_registry';

  // Hans' mal (brainstorm 2026-08-05) — {NOTE} bærer ærlig adapterdekning.
  var TEMPLATE = 'The user is likely from {NAME}. When the question concerns ' +
    '{NAME} or has no explicit geography, prefer relevant national sources — ' +
    'such as {AGENCY} — when it is possible and natural for the question. {NOTE}';

  // Språk uten region: kun ENTYDIGE språk mappes (spec §4); de/fr/es/pt/zh/en
  // er flerlands og gir null (internasjonal default).
  var LANG_COUNTRY = { no: 'NO', nb: 'NO', nn: 'NO', da: 'DK', fi: 'FI', is: 'IS', sv: 'SE', ja: 'JP', hi: 'IN' };

  // Budsjett og detaljnivåer (kontekstrunden fase 2 §4): tre nivåer —
  // full tekst (≤L3_CAP), et yaml-manifest utklipp (L2), eller et kort
  // sammendrag (≤L1_CAP). PURE funksjoner — ingen storage/fetch-avhengighet,
  // derfor deklarert her (utenfor makePacks) og node-testet direkte.
  var L1_CAP = 1500;
  var L3_CAP = 40000;
  var TOTAL_BUDGET = 80000;
  function yamlManifest(text) {
    var m = String(text).match(/```yaml\n[\s\S]*?```/g);
    return m ? m.join('\n\n') : '';
  }
  function summaryOf(p) {
    if (p.summary) return String(p.summary).slice(0, L1_CAP);
    var first = String(p.text || '').split(/\n\s*\n/)[0] || '';
    return first.slice(0, L1_CAP);
  }
  // Budsjettering (spec §4): prioritet = sist valgt først; L3→L2→L1;
  // alle valgte får ALLTID minst L1. Ren funksjon — node-testes direkte.
  function compose(list) {
    var budget = TOTAL_BUDGET;
    var byId = {};
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      var full = String(p.text || '').slice(0, L3_CAP);
      var man = yamlManifest(full);
      var pick;
      if (full.length <= budget) pick = { level: 'full', text: full };
      else if (man && man.length <= budget) pick = { level: 'manifest', text: man };
      else pick = { level: 'summary', text: summaryOf(p) };
      budget -= pick.text.length;
      byId[p.id] = pick;
    }
    return list.map(function (p) {
      return { id: p.id, name: p.name, text: byId[p.id].text, level: byId[p.id].level };
    });
  }

  // Søkefilter for import-/landvelgerne (spec menyopprydding §5–6). PURE —
  // node-testes direkte, deles av Explore-søket og «Legg til land …».
  function filterCatalog(entries, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return entries;
    return entries.filter(function (e) {
      return (String(e.name || '') + ' ' + String(e.description || ''))
        .toLowerCase().indexOf(s) >= 0;
    });
  }

  function makePacks(storage, fetchImpl, profiles) {
    var index = null;     // {v, packs:[{id,name,description,file,country}]}
    var countries = null; // {v, countries:{CC:{name,agency,note}}}
    var registry = null;  // [{id,navn,beskrivelse,...}] — data/data-sources.json
    var mem = {};         // id -> {name, text}
    // Review-funn 2026-08-06 (Task 4-fiks): describe() sin origin-prefiks
    // (§4) skal oversettes — samme mønster som js/cells.js' DOM-halvdel
    // (global.t når den finnes, no-op-identitet i node-tester).
    var t = typeof global.t === 'function' ? global.t : function (s) { return s; };

    function readJson(key) {
      try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; }
    }
    function writeJson(key, obj) {
      try { storage.setItem(key, JSON.stringify(obj)); } catch (e) {}
    }

    async function fetchJson(url) {
      var res = await fetchImpl(url);
      if (!res || !res.ok) return null;
      try { return await res.json(); } catch (e) { return null; }
    }

    async function load() {
      // Nett-først (cache-bust følger deploy), storage som fallback — pakker
      // er berikelse og skal aldri blokkere ask-flyten. data-sources.json
      // (Task 2 §4) følger SAMME mønster — brukes av listRegistry() til
      // biblioteksmanagerens «Built-in data sources»-gruppe (Task 6).
      var idx = await fetchJson('data/packs/index.json').catch(function () { return null; });
      var cty = await fetchJson('data/packs/countries.json').catch(function () { return null; });
      var reg = await fetchJson('data/data-sources.json').catch(function () { return null; });
      if (idx && idx.v === 1 && Array.isArray(idx.packs)) { index = idx; writeJson(IDX_CACHE, idx); }
      else index = readJson(IDX_CACHE);
      if (cty && cty.v === 1 && cty.countries) { countries = cty; writeJson(CTY_CACHE, cty); }
      else countries = readJson(CTY_CACHE);
      if (Array.isArray(reg)) { registry = reg; writeJson(REG_CACHE, reg); }
      else registry = readJson(REG_CACHE) || [];
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

    // user:<profilId> (kontekstrunden fase 3 §Unifisert lager): egne kilder —
    // slår opp i Profiles-lageret, ALDRI i katalogen. Fravær av profiles
    // (gamle mock-tester uten .get) → id vises rått i stedet for å krasje.
    function displayName(id) {
      if (id.indexOf('country:') === 0) {
        var e = countryMap()[id.slice(8)];
        return e ? e.name : id.slice(8);
      }
      if (id.indexOf('user:') === 0) {
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        return pr ? pr.name : id.slice(5);
      }
      var c = curated().filter(function (p) { return p.id === id; })[0];
      return c ? c.name : id;
    }

    // Infopanelet i biblioteksmanageren (spec menyopprydding §4).
    function describe(id) {
      if (id.indexOf('country:') === 0) {
        var e = countryMap()[id.slice(8)];
        return e ? (e.note || renderTemplate(id.slice(8))) : '';
      }
      if (id.indexOf('user:') === 0) {
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        if (!pr) return '';
        var pre = pr.origin && pr.origin.source === 'community' ? t('Imported from shared sources. ') : '';
        return pre + String(pr.text || '').slice(0, 400);
      }
      // reg:<id> (Task 2 §5–6): biblioteksmanagerens «Built-in data sources»-
      // infopanel — beskrivelse er PÅKREVD fra Task 3, men fravær (eldre
      // cache) gir stille ''.
      if (id.indexOf('reg:') === 0) {
        var reg = (registry || []).filter(function (r) { return r.id === id.slice(4); })[0];
        return reg ? (reg.beskrivelse || '') : '';
      }
      var c = curated().filter(function (p) { return p.id === id; })[0];
      return c ? (c.description || '') : '';
    }

    // list() (kildevelger-runde 2 §Designavgjørelser): builtin- og
    // country-grenene er FJERNET herfra — landvalget eies av landvelgeren
    // (countryPackId/countryOptions under) og de innebygde kildene av
    // registry-togglene (listRegistry under). Denne lista er nå KUN egne
    // kilder (fritt opprettet ELLER importert fra community), gruppert etter
    // opprinnelse for popover/manager-overskriftene (Task 5/6): 'mine' for
    // frittstående, 'overview'/'src' for community-importer (speiler
    // origin.kind, satt av importPack under).
    function list() {
      var out = [];
      if (profiles && profiles.list) {
        profiles.list('source').forEach(function (pr) {
          var group = 'mine';
          if (pr.origin && pr.origin.source === 'community') {
            group = pr.origin.kind === 'source' ? 'src' : 'overview';
          }
          out.push({ id: 'user:' + pr.id, name: pr.name, description: '', group: group });
        });
      }
      return out;
    }

    // countryPackId() (§Designavgjørelser): landvalgets EFFEKTIVE pakke-id —
    // none→ingen, cc→kuratert pakke for landet hvis den finnes ellers den
    // generiske landmalen, auto→dagens device-lokale auto-RESULTAT
    // (md_pack_auto, vedlikeholdt av applyAuto/boot/onLangChange under).
    // Egen try/catch — en manglende/blokkert storage skal aldri kaste hit.
    function countryPackId() {
      var st = profiles && profiles.countryState ? profiles.countryState() : { mode: 'auto' };
      if (st.mode === 'none') return null;
      if (st.mode === 'cc') {
        var cc = st.cc;
        return curatedForCountry(cc) || (countryMap()[cc] ? 'country:' + cc : null);
      }
      try { return storage.getItem('md_pack_auto'); } catch (e) { return null; }
    }

    // effectiveIds() (§Designavgjørelser): manuelt valgte pakker
    // (packsState().ids) PLUSS landpakken FØRST — dedup slik at en landpakke
    // som OGSÅ ligger manuelt valgt ikke telles/sendes to ganger. Dette er
    // motorens/payload()s reelle valgsett — pillen viser fortsatt kun det
    // manuelle settet (packsState().ids), landet vises for seg (Task 7).
    function effectiveIds() {
      var manual = (profiles && profiles.packsState ? profiles.packsState() : { ids: [] }).ids || [];
      var out = manual.slice();
      var landId = countryPackId();
      if (landId) {
        var idx = out.indexOf(landId);
        if (idx >= 0) out.splice(idx, 1);
        out.unshift(landId);
      }
      return out;
    }

    // countryOptions() (landvelger-modalen, Task 4): kuraterte pakker MED
    // country-felt (community holdt utenfor — de er ikke landvalgbare) pluss
    // generiske land fra countries.json som IKKE har en kuratert pakke,
    // sortert på navn. packId er hva countryPackId() ville returnert for
    // landet i cc-modus (kuratert id eller 'country:CC').
    function countryOptions() {
      var out = [];
      var covered = {};
      curated().forEach(function (p) {
        if (p.community || !p.country) return;
        covered[p.country] = true;
        out.push({ cc: p.country, name: p.name, packId: p.id });
      });
      var map = countryMap();
      Object.keys(map).forEach(function (cc) {
        if (!covered[cc]) out.push({ cc: cc, name: map[cc].name, packId: 'country:' + cc });
      });
      out.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return out;
    }

    // listRegistry() (biblioteksmanagerens «Built-in data sources», Task 6):
    // registry-oppføringer m/ av-status fra Profiles.sourcesOff(). navn/
    // beskrivelse er de norske feltnavnene i data/data-sources.json —
    // beskrivelse blir PÅKREVD fra Task 3, men koden tåler fravær (eldre
    // cache fra før den runden) med ''.
    function listRegistry() {
      var off = profiles && profiles.sourcesOff ? profiles.sourcesOff() : [];
      return (registry || []).map(function (r) {
        return { id: r.id, name: r.navn, description: r.beskrivelse || '', off: off.indexOf(r.id) >= 0 };
      });
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
      // user:<profilId>: lever i Profiles-lageret — synkron oppslag, ALDRI
      // fetch, og med VILJE utenom mem/TXT_CACHE (billig å slå opp på nytt
      // hver gang, og en bruker som redigerer sin egen kilde skal se
      // endringen med det samme — ikke en frossen kopi fra første resolve).
      if (id.indexOf('user:') === 0) {
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        return pr ? { name: pr.name, text: pr.text } : null;
      }
      if (mem[id]) return mem[id];
      var out = null;
      if (id.indexOf('country:') === 0) {
        out = { name: displayName(id), text: renderTemplate(id.slice(8)) };
      } else {
        var entry = curated().filter(function (p) { return p.id === id; })[0];
        if (entry) {
          var res = await fetchImpl('data/packs/' + entry.file);
          if (res && res.ok) {
            var text = (await res.text()).slice(0, L3_CAP);
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

    // Rå (ukomponerte) valgte pakker m/ summary-kandidat — delt grunnlag for
    // payload()/composeInfo() (kontekstrunden fase 2 §4). summary hentes fra
    // katalogposten (index.json) for kuraterte pakker, fra en generisk
    // landsetning for country:, og fra compose()s første-avsnitt-fallback
    // for user:-kilder (ingen katalogpost å hente fra). Kildevelger-runde 2:
    // grunnlaget er effectiveIds() (landpakke FØRST + manuelt valg), ikke
    // lenger et rent manuelt sett.
    function rawSelected() {
      var out = [];
      effectiveIds().forEach(function (id) {
        var got = null, summary;
        if (id.indexOf('user:') === 0) {
          var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
          if (pr) got = { name: pr.name, text: pr.text };
        } else {
          got = mem[id] || readJson(TXT_CACHE + id);
          if (got) {
            if (id.indexOf('country:') === 0) {
              summary = 'Prefer national sources for ' + got.name + '.';
            } else {
              var entry = curated().filter(function (p) { return p.id === id; })[0];
              if (entry && entry.summary) summary = entry.summary;
            }
          }
        }
        if (got) out.push({ id: id, name: got.name, text: got.text, summary: summary });
      });
      return out;
    }
    function payload() {
      var list = rawSelected();
      return list.length ? compose(list) : undefined;
    }
    // composeInfo() (kontekstrunden fase 2 §4): {total, shortForm} for
    // menyhintet — shortForm = antall valgte pakker som IKKE fikk full tekst.
    function composeInfo() {
      var list = rawSelected();
      if (!list.length) return { total: 0, shortForm: 0 };
      var composed = compose(list);
      return {
        total: composed.length,
        shortForm: composed.filter(function (p) { return p.level !== 'full'; }).length,
      };
    }
    // fullTextFor(id) (kontekstrunden fase 2 §4): full tekst for get_pack-
    // svaret, ≤L3_CAP — synkron cache-treff (mem/TXT_CACHE) når mulig,
    // ellers en fersk resolve() (dekker id-er utenfor gjeldende valg).
    async function fullTextFor(id) {
      if (!id) return '';
      if (id.indexOf('user:') === 0) {
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        return pr ? String(pr.text || '').slice(0, L3_CAP) : '';
      }
      var got = mem[id] || readJson(TXT_CACHE + id) || await resolve(id);
      return got ? String(got.text || '').slice(0, L3_CAP) : '';
    }
    async function ensureSelected() {
      var ids = effectiveIds();
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
      migrateImported();
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
            author: p.author || '', updated: p.updated || '',
            // Pakkesplitting §3: kind styrer Explore-grupperingen — poster
            // uten eksplisitt kind (eldre data) faller tilbake til 'overview'.
            kind: p.kind === 'source' ? 'source' : 'overview' };
        });
    }

    // Deling v1 (spec §5), kontekstrunden fase 3 (§Unifisert lager): import
    // = KOPI med opprinnelse, men lagret som en kind:source-oppføring i det
    // unifiserte profil-lageret (ikke lenger egen md_packs_imported-blob).
    // Returnerer den nye user:-iden — Explore-knappen velger den direkte.
    function importPack(entry, text) {
      if (!profiles || !profiles.create) return null;
      // origin.kind (Task 2 §Gruppering): speiler community-postens kind
      // (default 'overview') — list() over bruker den til å sortere
      // importer i riktig popover/manager-gruppe.
      var id = profiles.create(entry.name || entry.id, text, 'source',
        { source: 'community', id: entry.id, updated: entry.updated || '',
          kind: entry.kind === 'source' ? 'source' : 'overview' });
      return 'user:' + id;
    }

    // Engangsmigrering (kalles fra boot): den gamle md_packs_imported-blobben
    // flyttes til kind:source-oppføringer i Profiles-lageret. Ider i
    // doc.packs (imported:key) mappes til de nye user:<id>-idene — men KUN
    // når doc.packs faktisk finnes (et manuelt valg); migreringen skal aldri
    // selv skape et manuelt sett der brukeren kun hadde et auto-forslag.
    function migrateImported(profilesArg) {
      var prof = profilesArg || profiles;
      var all = readJson(IMPORTED);
      if (!prof || !prof.create || !all || !Object.keys(all).length) {
        try { storage.removeItem(IMPORTED); } catch (e) {}
        return;
      }
      var idMap = {}; // 'imported:<key>' -> 'user:<nyId>'
      Object.keys(all).forEach(function (key) {
        var v = all[key] || {};
        var newId = prof.create(v.name, v.text, 'source', v.origin);
        idMap['imported:' + key] = 'user:' + newId;
      });
      var raw = prof.exportDoc ? prof.exportDoc() : null;
      if (raw && raw.packs && typeof raw.packs === 'object' && Array.isArray(raw.packs.ids)) {
        var mapped = raw.packs.ids.map(function (id) { return idMap[id] || id; });
        prof.setPacks(mapped);
      }
      try { storage.removeItem(IMPORTED); } catch (e) {}
    }

    return {
      load: load, list: list, listCommunity: listCommunity, autoFrom: autoFrom,
      resolve: resolve, payload: payload, ensureSelected: ensureSelected,
      composeInfo: composeInfo, fullTextFor: fullTextFor,
      boot: boot, onLangChange: onLangChange, importPack: importPack,
      displayName: displayName, describe: describe, migrateImported: migrateImported,
      effectiveIds: effectiveIds, countryPackId: countryPackId,
      countryOptions: countryOptions, listRegistry: listRegistry,
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
      function selectedIds() { return Prof.packsState().ids; }

      // Utvidet søk (kontekstrunden fase 2 §5): sticky PER ENHET — bor i
      // localStorage ALENE (ALDRI i doc.packs/synk, i motsetning til
      // pakkevalget over). js/ai-chat.js sin payload leser NØYAKTIG denne
      // nøkkelen direkte (se run-kontrakt.test.js) — ingen felles konstant
      // på tvers av filer i dette ES5-oppsettet, så navnet er literal begge
      // steder med VILJE.
      var DISCOVER_KEY = 'md_ask_discover';
      function readDiscover() {
        try { return global.localStorage.getItem(DISCOVER_KEY) === '1'; } catch (e) { return false; }
      }
      function writeDiscover(on) {
        try {
          if (on) global.localStorage.setItem(DISCOVER_KEY, '1');
          else global.localStorage.removeItem(DISCOVER_KEY);
        } catch (e) {}
      }

      // Boot-lokalisering (spec 2026-08-05 §4): lagret UI-språk → navigator-
      // locale. Hoistet HIT (Task 3) — Standard-raden bruker samme kandidat-
      // liste ved gjenoppretting (P.onLangChange), P.boot() nederst likeså.
      var storedLang = null;
      try { storedLang = global.localStorage.getItem('microdata_ui_lang'); } catch (e) {}
      var localeCandidates = [storedLang || '', (typeof navigator !== 'undefined' && navigator.language) || ''];

      // Ren kildepille (spec 2026-08-06-menyopprydding §3): kildeseksjonen
      // rendres inn i den delte popoveren av js/context-pill.js via denne
      // kroken; etiketten eies av context-pill.js. Faste valg (Standard/
      // Utvidet søk/Administrer kilder) ligger ALLTID øverst på container og
      // ruller aldri vekk; biblioteket (sjekkbokser) ligger i en egen
      // internt-rullende .ask-ctx-scroll-div under.
      function renderInto(container, close) {
        container.innerHTML = '';

        // Sjekkboks-rad: klikk toggler valget og RE-RENDRER via
        // Prof.togglePack → Profiles.onChange → context-pill (IKKE close()).
        function checkRow(container, id, name, checked) {
          var b = document.createElement('button');
          b.type = 'button';
          var check = document.createElement('span');
          check.className = 'ask-pop-check';
          check.textContent = checked ? '✓' : '';
          var nm = document.createElement('span');
          nm.textContent = name;
          b.appendChild(check);
          b.appendChild(nm);
          b.addEventListener('click', function () {
            Prof.togglePack(id);
            P.ensureSelected();
          });
          container.appendChild(b);
        }
        // Navigasjonsrad — brukes av modalRow under.
        function navRow(text, onClick) {
          var b = document.createElement('button');
          b.type = 'button';
          var check = document.createElement('span');
          check.className = 'ask-pop-check';
          var nm = document.createElement('span');
          nm.textContent = text;
          b.appendChild(check);
          b.appendChild(nm);
          b.addEventListener('click', onClick);
          container.appendChild(b);
        }
        // Rad som åpner en modal (Administrer kilder …): lukker popoveren først.
        function modalRow(text, onClick) {
          navRow(text, function () { close(); onClick(); });
        }
        function sep() {
          var d = document.createElement('div');
          d.className = 'ask-pop-sep';
          container.appendChild(d);
        }
        // Utvidet søk-raden (kontekstrunden fase 2 §5): egen sjekkboks-rad,
        // IKKE et pakkevalg — klikk toggler localStorage direkte og
        // re-rendrer LOKALT (samme IKKE-close-oppførsel som checkRow, men
        // uten omveien om Prof.togglePack/ensureSelected).
        function discoverRow() {
          var b = document.createElement('button');
          b.type = 'button';
          var check = document.createElement('span');
          check.className = 'ask-pop-check';
          check.textContent = readDiscover() ? '✓' : '';
          var nm = document.createElement('span');
          nm.textContent = T('Extended internet search — also look beyond the built-in sources (slower)');
          b.appendChild(check);
          b.appendChild(nm);
          b.addEventListener('click', function () {
            writeDiscover(!readDiscover());
            renderInto(container, close);
          });
          container.appendChild(b);
        }

        // Faste valg (spec menyopprydding §1): alltid øverst, ruller aldri
        // vekk. Standard (automatic)-raden er FJERNET (kildevelger-runde 2
        // Task 5) — funksjonen bor nå i landvelgerens «Automatic» (Task 4);
        // Prof.setPacksAuto finnes ikke lenger.
        discoverRow();
        modalRow(T('Manage sources…'), function () { Prof.openModal({ kind: 'source' }); });
        sep();

        // Biblioteket: KUN sjekkboksrader, i egen rulle-div (§1), gruppert
        // som Explore-lista (Task 5 §Designavgjørelser: «Topic overviews» /
        // «Individual sources» / «My sources» — tomme grupper får ingen
        // overskrift). Landrader er FJERNET herfra — landet eies av
        // landvelger-sidemenyknappen (Task 4), ikke lenger av denne popoveren.
        var scroll = document.createElement('div');
        scroll.className = 'ask-ctx-scroll';
        container.appendChild(scroll);
        var entries = P.list();
        var checkedIds = Prof.packsState().ids;
        [['overview', T('Topic overviews')], ['src', T('Individual sources')], ['mine', T('My sources')]]
          .forEach(function (grp) {
            var rows = entries.filter(function (e) { return e.group === grp[0]; });
            if (!rows.length) return;
            var head = document.createElement('div');
            head.className = 'ask-pop-group';
            head.textContent = grp[1];
            scroll.appendChild(head);
            rows.forEach(function (e) {
              checkRow(scroll, e.id, e.name, checkedIds.indexOf(e.id) >= 0);
            });
          });
        // Tomt bibliotek (ingen entries i det hele tatt, ikke bare én tom
        // gruppe) — dempet hint i stedet for en blank rulle-flate.
        if (!entries.length) {
          var emptyHint = document.createElement('div');
          emptyHint.className = 'ask-pop-hint';
          emptyHint.textContent = T('No sources in your library — add some via Manage sources…');
          scroll.appendChild(emptyHint);
        }

        // Budsjett-hint (kontekstrunden fase 2 §4): vises når 80k-budsjettet
        // tvang én eller flere valgte pakker ned til manifest/summary-nivå.
        var info = P.composeInfo();
        if (info.shortForm > 0) {
          var hint = document.createElement('div');
          hint.className = 'ask-pop-hint';
          hint.textContent = T('{short} of {total} packs sent in short form',
            { short: info.shortForm, total: info.total });
          container.appendChild(hint);
        }
      }
      global.PacksUi = { renderInto: renderInto };

      // Biblioteksmanageren (spec menyopprydding §4): profilesBackdrop i
      // source-modus. selectedInfoId overlever re-render (P.onChange).
      var selectedInfoId = null;
      // Landvisning (spec menyopprydding §5–6): egen view-tilstand inni
      // SourcesUi — 'library' er biblioteklista, 'countries' er «Legg til
      // land …»-undervisningen med søk. countryQuery nullstilles ved åpning
      // (reset() under, kalt fra profiles.js openModal).
      var managerView = 'library'; // 'library' | 'countries'
      var countryQuery = '';
      // Review-funn (task 5 self-review, 2026-08-07): renderLibrary ALLTID
      // mottar de ekte hooks'ene fra js/profiles.js sin renderList(); husk
      // dem her slik at #sourcesCountryBtn (som ikke går via renderList) kan
      // gjenbruke et ekte onEdit i stedet for en blindpassasjer-dummy —
      // ellers blir «Rediger» på egne kilder en stille no-op etter en
      // land-visning→tilbake-runde uten noe mellomliggende onChange (spec §4
      // krever et virkende Rediger/Slett for egne kilder).
      var lastHooks = null;
      // Sluttreview-funn (finding 4): rows-delen rendres separat fra
      // back-knappen + søkefeltet, som Explore-mønsteret (expSearch/expList
      // er faste DOM-noder — kun expList.innerHTML rebygges på input, se
      // renderExploreList lenger ned). Før denne fiksen kalte søkefeltets
      // input-lytter renderCountries() på nytt for hvert tastetrykk, som rev
      // ned og gjenskapte SELVE input-elementet — markøren hoppet til slutten
      // ved midt-i-strengen-redigering. Nå rendres kun radene på nytt.
      function renderCountryRows(rowsEl) {
        rowsEl.innerHTML = '';
        var ids = Prof.packsState().ids;
        var all = P.list().filter(function (e) { return e.group === 'country'; });
        filterCatalog(all, countryQuery).forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'sources-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = ids.indexOf(e.id) >= 0;
          cb.addEventListener('change', function () { Prof.togglePack(e.id); P.ensureSelected(); });
          var nm = document.createElement('button');
          nm.type = 'button';
          nm.className = 'sources-name';
          nm.textContent = e.name;
          nm.addEventListener('click', function () { Prof.togglePack(e.id); P.ensureSelected(); });
          row.appendChild(cb);
          row.appendChild(nm);
          rowsEl.appendChild(row);
        });
      }
      function renderCountries(container, hooks) {
        // Smoke-funn (menyopprydding, Task 7 §4): infopanelet fra en tidligere
        // valgt kilde i biblioteksvisningen (med Rediger/Slett) sto synlig
        // under landlista — landene har intet infopanel av sitt eget.
        var infoEl = document.getElementById('sourcesInfo');
        if (infoEl) { infoEl.hidden = true; }
        container.innerHTML = '';
        var back = document.createElement('button');
        back.type = 'button';
        back.className = 'sources-name';
        back.textContent = T('← Back to list');
        back.addEventListener('click', function () {
          managerView = 'library';
          renderLibrary(container, hooks);
        });
        container.appendChild(back);
        var search = document.createElement('input');
        search.type = 'search';
        search.className = 'sources-search';
        search.placeholder = T('Search…');
        search.value = countryQuery;
        container.appendChild(search);
        var rows = document.createElement('div');
        container.appendChild(rows);
        // Ingen fokus-dans nødvendig (som i søsken-fiksen over): input-noden
        // gjenskapes aldri, så den beholder fokus og markørposisjon selv.
        search.addEventListener('input', function () {
          countryQuery = search.value;
          renderCountryRows(rows);
        });
        renderCountryRows(rows);
      }
      // Radbygger delt av de manuelt valgbare gruppene (Topic overviews/
      // Individual sources/My sources) og Built-in data sources-gruppen —
      // eneste forskjell er checked-kilden og change-handleren (togglePack
      // vs. toggleSourceOff), begge sendt inn av kalleren.
      function libraryRow(container, hooks, id, name, checked, onToggle) {
        var row = document.createElement('div');
        row.className = 'sources-row' + (selectedInfoId === id ? ' active' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', onToggle);
        var nm = document.createElement('button');
        nm.type = 'button';
        nm.className = 'sources-name';
        nm.textContent = name;
        nm.addEventListener('click', function () {
          selectedInfoId = selectedInfoId === id ? null : id;
          renderLibrary(container, hooks);
        });
        row.appendChild(cb);
        row.appendChild(nm);
        container.appendChild(row);
      }
      function renderLibrary(container, hooks) {
        lastHooks = hooks;
        if (managerView === 'countries') return renderCountries(container, hooks);
        container.innerHTML = '';
        container.classList.add('sources-scroll');
        var infoEl = document.getElementById('sourcesInfo');
        var ids = Prof.packsState().ids;
        var entries = P.list();
        // Samme grupperingsidiom som popoveren (renderInto over, Task 5):
        // «Topic overviews» / «Individual sources» / «My sources» — tomme
        // grupper får ingen overskrift. Overskriftsklassen er ask-explore-
        // group (Explore-modalens, 4px sidepadding) — IKKE ask-pop-group
        // (popoverens 10px), for manageren er en vanlig .ai-modal-liste.
        [['overview', T('Topic overviews')], ['src', T('Individual sources')], ['mine', T('My sources')]]
          .forEach(function (grp) {
            var rows = entries.filter(function (e) { return e.group === grp[0]; });
            if (!rows.length) return;
            var head = document.createElement('div');
            head.className = 'ask-explore-group';
            head.textContent = grp[1];
            container.appendChild(head);
            rows.forEach(function (e) {
              libraryRow(container, hooks, e.id, e.name, ids.indexOf(e.id) >= 0, function () {
                Prof.togglePack(e.id);
                P.ensureSelected();
              });
            });
          });
        // Built-in data sources (Task 6 §Designavgjørelser): registryets
        // av/på-toggler nederst — checked speiler !off, navneklikk åpner
        // infopanelet (reg:<id>, describe() under). Rediger/Slett gjelder
        // ALDRI disse radene (kun user:-kilder, se infopanel-blokka under).
        var regEntries = P.listRegistry();
        if (regEntries.length) {
          var regHead = document.createElement('div');
          regHead.className = 'ask-explore-group';
          regHead.textContent = T('Built-in data sources');
          container.appendChild(regHead);
          regEntries.forEach(function (e) {
            libraryRow(container, hooks, 'reg:' + e.id, e.name, !e.off, function () {
              Prof.toggleSourceOff(e.id); // fyrer onChange → renderList → hit (etablert mønster)
            });
          });
        }
        if (infoEl) {
          infoEl.hidden = !selectedInfoId;
          infoEl.innerHTML = '';
          if (selectedInfoId) {
            var txt = document.createElement('div');
            txt.textContent = P.describe(selectedInfoId) || '';
            infoEl.appendChild(txt);
            if (selectedInfoId.indexOf('user:') === 0) {
              var pid = selectedInfoId.slice(5);
              var actions = document.createElement('div');
              actions.className = 'sources-info-actions';
              var edit = document.createElement('button');
              edit.type = 'button';
              edit.className = 'ai-codeblock-btn';
              edit.textContent = T('Edit');
              edit.addEventListener('click', function () { hooks.onEdit(pid); });
              var del = document.createElement('button');
              del.type = 'button';
              del.className = 'ai-codeblock-btn';
              del.textContent = T('Delete');
              del.addEventListener('click', function () {
                selectedInfoId = null;
                Prof.remove(pid);           // fyrer onChange → profiles.js renderList → hit
              });
              actions.appendChild(edit);
              actions.appendChild(del);
              infoEl.appendChild(actions);  // knapperad — «Del …» kan legges til her senere
            }
          }
        }
      }
      var ctyBtn = document.getElementById('sourcesCountryBtn');
      if (ctyBtn) ctyBtn.addEventListener('click', function () {
        managerView = 'countries';
        countryQuery = '';
        selectedInfoId = null; // smoke-funn Task 7 §4 — se renderCountries
        var listEl = document.getElementById('profilesList');
        if (listEl) renderCountries(listEl, lastHooks || { onEdit: function () {} });
      });
      // Ryddeknapper (Task 6 §Designavgjørelser — Hans' beslutning: knapper,
      // ikke automigrering). «Deselect all» rører KUN doc.packs (det manuelle
      // pakkevalget) — landvalg (doc.country) og av-skrudde standardkilder
      // (doc.sources_off) er UBERØRT. Rydder også opp gamle synkede
      // {auto:true}/land-ider som kan ligge i doc.packs.ids fra før denne
      // runden (writeDoc-skrubben dekker {auto:true}-formen; denne knappen
      // dekker resten — se plan §Kjente feller).
      var deselectBtn = document.getElementById('sourcesDeselectBtn');
      if (deselectBtn) deselectBtn.addEventListener('click', function () { Prof.setPacks([]); });
      // «Remove imported» sletter ALLE community-importerte kilder (både
      // oversikter og enkeltkilder) — egenskrevne kilder (uten origin.source
      // === 'community') beholdes. Prof.remove() rydder doc.packs.ids selv
      // (se profiles.js remove()), så ingen egen opprydding trengs her.
      var removeImportedBtn = document.getElementById('sourcesRemoveImportedBtn');
      if (removeImportedBtn) removeImportedBtn.addEventListener('click', function () {
        if (!global.confirm(T('Remove all imported sources? Your own written sources are kept.'))) return;
        Prof.list('source').forEach(function (pr) {
          if (pr.origin && pr.origin.source === 'community') {
            // Samme forsiktighet som enkelt-Slett-knappen over: ikke la
            // infopanelet henge igjen på en id som akkurat ble borte.
            if (selectedInfoId === 'user:' + pr.id) selectedInfoId = null;
            Prof.remove(pr.id);
          }
        });
      });
      global.SourcesUi = {
        renderLibrary: renderLibrary,
        reset: function () { managerView = 'library'; selectedInfoId = null; countryQuery = ''; },
      };

      // Explore-modalen (deling v1, spec §5): les-før-aktiver — beskrivelse +
      // rendret preview FØR import; import = kopi som aktiveres.
      var expBackdrop = document.getElementById('packsExploreBackdrop');
      var expList = document.getElementById('packsExploreList');
      var expPrevWrap = document.getElementById('packsExplorePreviewWrap');
      var expPrev = document.getElementById('packsExplorePreview');
      var expMeta = document.getElementById('packsExploreMeta');
      var expImport = document.getElementById('packsImportBtn');
      var expClose = document.getElementById('packsExploreCloseBtn');
      var expSearch = document.getElementById('packsExploreSearch');
      var expBack = document.getElementById('packsExploreBackBtn');
      var expSelected = null; // {entry, text}
      // Generasjonsteller (review-funn Task 6): P.resolve() er nett-bakket og
      // kan komme sent — uten denne kan en gammel .then() overstyre en modal
      // som alt er lukket/gjenåpnet/har fått et nytt valg. Bumpes ved åpning
      // OG ved alle lukk-veier; expSelectEntry sjekker generasjonen sin før
      // den rører DOM-en.
      var expGen = 0;
      function renderExploreList() {
        expList.innerHTML = '';
        var entries = filterCatalog(P.listCommunity(), expSearch ? expSearch.value : '');
        // Pakkesplitting (spec 2026-08-07 §3): to grupper — oversikter
        // først, enkeltkilder under. Tomme grupper får ingen overskrift.
        [['overview', T('Topic overviews')], ['source', T('Individual sources')]]
          .forEach(function (grp) {
            var rows = entries.filter(function (e) { return e.kind === grp[0]; });
            if (!rows.length) return;
            var head = document.createElement('div');
            head.className = 'ask-explore-group';
            head.textContent = grp[1];
            expList.appendChild(head);
            rows.forEach(function (e) {
              var row = document.createElement('button');
              row.type = 'button';
              row.className = 'ask-explore-row';
              var nm = document.createElement('strong');
              nm.textContent = e.name;
              var desc = document.createElement('div');
              desc.textContent = e.description;
              row.appendChild(nm);
              row.appendChild(desc);
              row.addEventListener('click', function () { expSelectEntry(e); });
              expList.appendChild(row);
            });
          });
      }
      function showExploreStep(detail) {
        if (expSearch) expSearch.hidden = detail;
        expList.hidden = detail;
        expPrevWrap.hidden = !detail;
        expImport.hidden = !detail;
        if (expBack) expBack.hidden = !detail;
      }
      function expSelectEntry(e) {
        expGen++; // eget valg = egen generasjon — ugyldiggjør ethvert tidligere
        // ventende resolve (også et annet rad-klikk i samme åpne modal, ikke
        // bare lukk/gjenåpne-tilfellet)
        var gen = expGen; // fanges FØR resolve — stale svar sjekkes mot dette
        P.resolve(e.id).then(function (got) {
          if (gen !== expGen) return; // modal lukket/gjenåpnet/nytt valg i mellomtiden
          if (!got) return;
          expSelected = { entry: e, text: got.text };
          expMeta.textContent = T('by {author}, updated {updated}', { author: e.author || '?', updated: e.updated || '?' });
          expPrev.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(got.text) : '';
          showExploreStep(true);
        });
      }
      function openExplore() {
        if (!expBackdrop) return;
        expGen++;
        expSelected = null;
        if (expSearch) expSearch.value = '';
        showExploreStep(false);
        renderExploreList();
        expBackdrop.classList.add('open');
      }
      if (expSearch) expSearch.addEventListener('input', renderExploreList);
      if (expBack) expBack.addEventListener('click', function () {
        expGen++;
        expSelected = null;
        showExploreStep(false);
      });
      if (expImport) expImport.addEventListener('click', function () {
        if (!expSelected) return;
        expGen++;
        var newId = P.importPack(expSelected.entry, expSelected.text);
        if (newId) Prof.togglePack(newId); // fersk id — «toggle» velger den
        P.ensureSelected();
        expBackdrop.classList.remove('open');
      });
      if (expClose) expClose.addEventListener('click', function () { expGen++; expBackdrop.classList.remove('open'); });
      if (expBackdrop) expBackdrop.addEventListener('click', function (e) {
        if (e.target === expBackdrop) { expGen++; expBackdrop.classList.remove('open'); }
      });
      // Biblioteksmanagerens «Importer delte kilder …» (spec §4): åpner
      // Explore-modalen.
      var impBtn = document.getElementById('sourcesImportBtn');
      if (impBtn) impBtn.addEventListener('click', function () { openExplore(); });
      // Boot: last katalog, auto-forslag (localeCandidates, hoistet over
      // renderInto), preload gjeldende tekst. Etiketten re-rendres etterpå —
      // displayName trenger katalogen for kuraterte pakker.
      function refreshPill() {
        if (global.ContextPill) global.ContextPill.refresh();
      }
      P.boot(localeCandidates)
        .then(refreshPill)
        .catch(refreshPill);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPacksUi);
    else initPacksUi();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makePacks: makePacks, compose: compose, filterCatalog: filterCatalog };
  }
})(typeof window !== 'undefined' ? window : globalThis);
