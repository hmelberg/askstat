// js/packs.js — kildepakker (spec 2026-08-05-sprak-pakker-deling §2, flervalg
// kontekstrunden fase 2 §2): kuraterte pakker (data/packs/*.md), generisk
// landmal (countries.json) og importerte kopier. Pakketekstene resolves
// KLIENTSIDE og sendes som packs-felt ([{name,text}]) til /api/svar
// (ai-chat.js) — serveren rendrer blokka.
// Valg-tilstanden bor i Profiles (packsState/setPacks/togglePack/setAutoPack);
// denne fila eier innhold, katalog og cache. All kilde-UI bor i
// js/sources-modal.js; DOM-delen her er redusert til boot + locale-kandidater.
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
  // Front matter-bevisst manifest (kildedokumenter-runden Task 4 fix,
  // review-funn 2026-08-10): community-pakker konvertert av
  // `node tools/source_docs.mjs convert-packs` bytter sin gamle fenced
  // ```yaml-feltblokk ut med en front matter-blokk (`---\n...\n---`) —
  // yamlManifest MÅ kjenne igjen BEGGE former, ellers dør L2-nivået stille
  // for enhver konvertert pakke (den faller rett fra 'full' til 'summary'
  // under budsjettpress, uten det tette L2-mellomsteget). ```yaml-fencer
  // sjekkes FØRST (uendret prioritet/oppførsel for eldre/brukerskapte
  // pakker som ennå kan bruke den formen); front matter er fallback — de to
  // formene er gjensidig utelukkende per dokument i praksis (samme
  // presedens som js/source-doc.js sin egen extractFields()), så
  // rekkefølgen har ingen praktisk konsekvens utover å bevare eksisterende
  // atferd byte-for-byte for ```yaml-tilfellet.
  var FRONT_MATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
  function yamlManifest(text) {
    var s = String(text);
    var m = s.match(/```yaml\n[\s\S]*?```/g);
    if (m) return m.join('\n\n');
    var fm = FRONT_MATTER_RE.exec(s);
    return fm ? fm[0] : '';
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
      // Kort/lang-splitt (spec 2026-08-13 §3): store EGNE enkeltkilder
      // sender KUN maskindel+hode+Kort ivrig — resten hentes lat med
      // get_pack (serverens kortform-merke rendres for 'summary'-nivået).
      // Løpetids-vakt på SourceDoc: mangler den (isolerte tester), faller
      // vi til dagens oppførsel.
      var SD = (typeof global !== 'undefined' && global.SourceDoc) || null;
      if (String(p.id).indexOf('user:') === 0 && p.kind !== 'overview' &&
          full.length > 1500 && SD && SD.splitKortGuide) {
        var deler = SD.splitKortGuide(full);
        var ivrig = (deler.prefix + deler.hode + '\n' + deler.kort).slice(0, 2500);
        var pickKort = { level: 'summary', text: ivrig };
        budget -= pickKort.text.length;
        byId[p.id] = pickKort;
        continue;
      }
      if (full.length <= budget) pick = { level: 'full', text: full };
      else if (man && man.length <= budget) pick = { level: 'manifest', text: man };
      else pick = { level: 'summary', text: summaryOf(p) };
      budget -= pick.text.length;
      byId[p.id] = pick;
    }
    return list.map(function (p) {
      return { id: p.id, name: p.name, text: byId[p.id].text, level: byId[p.id].level,
        kind: p.kind, tags: p.tags };
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
          // kind/tags/imported (kilder-profil-output-runden §Interfaces):
          // kind fra origin.kind, default 'source' (spec §3, legacy uten
          // origin — også oppføringer skrevet FØR denne runden).
          out.push({
            id: 'user:' + pr.id, name: pr.name, description: '', group: group,
            kind: (pr.origin && pr.origin.kind) || 'source',
            tags: pr.tags || [],
            imported: !!(pr.origin && pr.origin.source === 'community'),
          });
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
        return { id: r.id, name: r.navn, description: r.beskrivelse || '',
          tags: r.tags || [], off: off.indexOf(r.id) >= 0 };
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
        var got = null, summary, kind, tags;
        if (id.indexOf('user:') === 0) {
          var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
          if (pr) {
            got = { name: pr.name, text: pr.text };
            // kind fra origin.kind, default 'source' — samme regel som list().
            kind = (pr.origin && pr.origin.kind) || 'source';
            tags = pr.tags || [];
          }
        } else {
          got = mem[id] || readJson(TXT_CACHE + id);
          if (got) {
            if (id.indexOf('country:') === 0) {
              summary = 'Prefer national sources for ' + got.name + '.';
              kind = 'overview';
              tags = [];
            } else {
              var entry = curated().filter(function (p) { return p.id === id; })[0];
              if (entry && entry.summary) summary = entry.summary;
              // NB (sluttreview-fiksebølge #8): default HER (manglende/
              // ukjent entry.kind → 'overview') er det MOTSATTE av serverens
              // default i coercePacks (svar-prompt.ts: manglende felt →
              // 'source'). Det er trygt fordi denne funksjonen ALLTID sender
              // et eksplisitt kind-felt til serveren (out.push under) — de to
              // defaultene treffer aldri samme kall. IKKE «rydd» den ene til
              // å matche den andre uten å sjekke begge kallstedene.
              kind = entry && entry.kind === 'source' ? 'source' : 'overview';
              tags = (entry && entry.tags) || [];
            }
          }
        }
        if (got) out.push({ id: id, name: got.name, text: got.text, summary: summary, kind: kind, tags: tags });
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
            kind: p.kind === 'source' ? 'source' : 'overview',
            tags: p.tags || [] };
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
          kind: entry.kind === 'source' ? 'source' : 'overview' },
        entry.tags);
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

    // §8 kildeforbedring (spec 2026-08-13): egen kopi av en innebygd kilde.
    // Kopien er en ORDINÆR egen kilde (Profiles-lageret) med origin.of som
    // peker tilbake — guide-fortrengningen (guides_off) og «Oppdater fra
    // original» leser den. Fasiten er data/sources/<id>.md; 404 → fall
    // tilbake til registerbeskrivelsen (bedre enn ingenting, aldri kast).
    async function lagBuiltinKopi(regId) {
      if (!profiles || !profiles.create) return null;
      // listRegistry() normaliserer de norske registerfeltene (navn →
      // name, tags m/[]-default) — bruk den, IKKE rå `registry`.
      var reg = listRegistry().filter(function (r) { return r.id === regId; })[0];
      var text = '';
      try {
        var res = await fetchImpl('data/sources/' + regId + '.md');
        if (res.ok) text = (await res.text()).slice(0, 40000);
      } catch (e) {}
      if (!text) text = describe('reg:' + regId) || ('# ' + regId);
      var navn = ((reg && reg.name) || regId) + ' (min kopi)';
      var id = profiles.create(navn, text, 'source',
        { source: 'builtin-copy', of: regId }, (reg && reg.tags) || []);
      return 'user:' + id;
    }
    async function oppdaterKopiFraOriginal(profileId) {
      var pr = profiles && profiles.get ? profiles.get(profileId) : null;
      var of = pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of;
      if (!of || !profiles.update) return false;
      try {
        var res = await fetchImpl('data/sources/' + of + '.md');
        if (!res.ok) return false;
        profiles.update(profileId, { text: (await res.text()).slice(0, 40000) });
        return true;
      } catch (e) { return false; }
    }
    // Aktive builtin-kopier → of-ider (payload-feltet guides_off, Task 10).
    function builtinOverstyrte() {
      var ut = [];
      effectiveIds().forEach(function (id) {
        if (String(id).indexOf('user:') !== 0) return;
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        var of = pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of;
        if (of && ut.indexOf(of) < 0) ut.push(of);
      });
      return ut;
    }

    return {
      load: load, list: list, listCommunity: listCommunity, autoFrom: autoFrom,
      resolve: resolve, payload: payload, ensureSelected: ensureSelected,
      composeInfo: composeInfo, fullTextFor: fullTextFor,
      boot: boot, onLangChange: onLangChange, importPack: importPack,
      displayName: displayName, describe: describe, migrateImported: migrateImported,
      effectiveIds: effectiveIds, countryPackId: countryPackId,
      countryOptions: countryOptions, listRegistry: listRegistry,
      // filterCatalog eksponeres på instansen fordi Import-utforskeren bor i
      // js/sources-modal.js (Task 5) og ikke har tilgang til modul-scopet her.
      filterCatalog: filterCatalog,
      lagBuiltinKopi: lagBuiltinKopi,
      oppdaterKopiFraOriginal: oppdaterKopiFraOriginal,
      builtinOverstyrte: builtinOverstyrte,
    };
  }

  if (global.localStorage && typeof fetch !== 'undefined') {
    global.Packs = makePacks(global.localStorage, fetch.bind(global), global.Profiles);
  }

  // ---- DOM: kun boot + locale-kandidatene. HELE kilde-UI-en (popover,
  // biblioteksmanager, landmodal, Import-utforsker) er flyttet til
  // js/sources-modal.js (kilder-profil-output-runden, Task 5) — denne fila
  // eier igjen bare data: katalog, registry, payload og oppstart.
  if (typeof document !== 'undefined' && document.getElementById) {
    var initPacksBoot = function () {
      var P = global.Packs;
      var Prof = global.Profiles;
      if (!P || !Prof) return;

      // Boot-lokalisering (spec 2026-08-05 §4): lagret UI-språk → navigator-
      // locale. Eksponeres som P.localeCandidates() fordi land-dropdownen i
      // js/sources-modal.js må sende NØYAKTIG samme kandidatliste inn i
      // P.onLangChange() når brukeren velger «Automatic» igjen.
      var storedLang = null;
      try { storedLang = global.localStorage.getItem('microdata_ui_lang'); } catch (e) {}
      var localeCandidates = [storedLang || '', (typeof navigator !== 'undefined' && navigator.language) || ''];
      P.localeCandidates = function () { return localeCandidates.slice(); };

      // Boot: last katalog, auto-forslag, preload gjeldende tekst. Kilde-
      // dialogen re-rendres etterpå — den trenger katalogen for landnavn og
      // pakketitler, og kan stå åpen alt (brukeren rekker å klikke).
      function refreshUi() {
        if (global.SourcesModal) global.SourcesModal.refresh();
      }
      P.boot(localeCandidates)
        .then(refreshUi)
        .catch(refreshUi);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPacksBoot);
    else initPacksBoot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makePacks: makePacks, compose: compose, filterCatalog: filterCatalog };
  }
})(typeof window !== 'undefined' ? window : globalThis);
