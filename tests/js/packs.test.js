// Pakke-laget (spec 2026-08-05-sprak-pakker-deling §2): katalog, landmal,
// resolusjon m/cache, locale→pakke. Node-seam: makePacks(storage, fetch, profiles).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makePacks, compose, filterCatalog } = require('../../js/packs.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const INDEX = {
  v: 1,
  packs: [
    { id: 'norway', name: 'Norway', description: 'Norwegian sources first', file: 'norway.md', country: 'NO' },
    { id: 'finland', name: 'Finland', description: 'Finnish sources first', file: 'finland.md', country: 'FI' },
  ],
};
const COUNTRIES = {
  v: 1,
  countries: {
    NO: { name: 'Norway', agency: 'Statistics Norway (SSB)', note: 'ssb/fhi adapters.' },
    FI: { name: 'Finland', agency: 'Statistics Finland', note: 'statfin adapter.' },
    SE: { name: 'Sweden', agency: 'Statistics Sweden (SCB)', note: 'scb adapter.' },
    DE: { name: 'Germany', agency: 'Destatis', note: 'No Destatis adapter — use eurostat or dbnomics.' },
    BR: { name: 'Brazil', agency: 'IBGE', note: 'Use worldbank/dbnomics.' },
    US: { name: 'United States', agency: 'U.S. Census Bureau, BLS and FRED', note: 'fred registered.' },
    JP: { name: 'Japan', agency: 'Statistics Bureau of Japan (e-Stat)', note: 'Use worldbank/oecd/dbnomics.' },
  },
};

function fakeFetch(files) {
  return async (url) => {
    const u = String(url);
    for (const [suffix, body] of Object.entries(files)) {
      if (u.endsWith(suffix)) {
        return {
          ok: true,
          json: async () => JSON.parse(typeof body === 'string' ? body : JSON.stringify(body)),
          text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

function fakeProfiles(state) {
  return { packsState: () => state, setAutoPack: () => {}, onChange: () => {} };
}

const FILES = {
  'data/packs/index.json': INDEX,
  'data/packs/countries.json': COUNTRIES,
  'data/packs/norway.md': '# Norway pack\nUse ssb first.',
  'data/packs/finland.md': '# Finland pack\nUse statfin first.',
};

// Budsjett og detaljnivåer (kontekstrunden fase 2 §4): compose() er en ren
// funksjon — testes direkte, uten storage/fetch.
test('compose: alt får full innenfor budsjettet; nivå og rekkefølge bevares', () => {
  const out = compose([{ id: 'a', name: 'A', text: 'x'.repeat(100) },
                       { id: 'b', name: 'B', text: 'y'.repeat(100) }]);
  assert.deepEqual(out.map(p => p.level), ['full', 'full']);
  assert.deepEqual(out.map(p => p.id), ['a', 'b']);
});
// MERK (avvik fra brief-utkastet, se task-5-report.md): brief-utkastets
// versjon av denne testen brukte KUN to pakker og ventet at 'gammel' skulle
// degradere til 'manifest'. Det er matematisk umulig med disse to pakkene:
// TOTAL_BUDGET (80000) er EKSAKT 2×L3_CAP (40000), så de to
// høyest-prioriterte fullstore pakkene rommes ALLTID begge fullt ut
// (40000 <= 40000) — degradering krever en TREDJE pakke (jf. test 3 pekere:
// «80000 rommer to L3-kutt»). Testen er derfor utvidet med en tredje,
// budsjett-fyllende pakke ('fyll') slik at 'gammel' faktisk går tom for
// budsjett og må degradere — mekanismen (sist-valgt-prioritet,
// yaml-manifest-fallback) er UENDRET fra brief-utkastet.
test('compose: sist valgt prioriteres; overskytende degraderes manifest→summary', () => {
  const stor = 'z'.repeat(50000);  // > L3_CAP kuttes til 40000
  const fyll = 'w'.repeat(39900);  // fyller nesten resten av budsjettet
  const medYaml = 'intro\n```yaml\nid: x\n```\nprosa'.padEnd(60000, 'q');
  const out = compose([
    { id: 'gammel', name: 'G', text: medYaml, summary: 'kort om G' },
    { id: 'fyll', name: 'F', text: fyll },
    { id: 'ny', name: 'N', text: stor },
  ]);
  assert.equal(out[2].level, 'full');           // sist valgt vinner budsjettet
  assert.equal(out[2].text.length, 40000);      // L3-cap
  assert.equal(out[1].level, 'full');           // nest sist valgt får òg fullt (rommes ennå)
  assert.equal(out[0].level, 'manifest');       // budsjettet tomt — yaml-blokka plukkes
  assert(out[0].text.includes('id: x'));
});
// Kildedokumenter-runden Task 4 fix (review-funn 2026-08-10): den testen
// over dekker KUN den gamle fenced ```yaml-formen. `node tools/source_docs.mjs
// convert-packs` skriver community-pakker om til front matter
// (`---\n...\n---`) i stedet — uten en front-matter-bevisst yamlManifest()
// ville L2-nivået vært stille dødt for alle 78 konverterte pakker (falt
// rett fra 'full' til 'summary'). Fixturen er LEST verbatim fra en ekte
// konvertert pakke (src-bls-api.md, spot-sjekket i task-4-report.md) i
// stedet for håndskrevet, slik at testen automatisk følger den virkelige
// filen og ikke kan tegne feil bilde av front matter-formen.
test('compose: front matter-pakke (konvertert, ikke ```yaml) degraderer til manifest med front matter-blokka intakt', () => {
  const blsApiPack = fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'packs', 'community', 'src-bls-api.md'), 'utf8');
  assert.ok(blsApiPack.startsWith('---\n'), 'fixture-sjekk: src-bls-api.md er ikke lenger front matter-formet');
  // Forventet manifest-tekst avledes fra FIXTUREN selv (indexOf, ikke en
  // duplisert kopi av packs.js sin FRONT_MATTER_RE) — testen skal bevise at
  // compose() plukker EKTE front matter fra en EKTE fil, ikke bare speile
  // implementasjonens egen regex tilbake til seg selv.
  const closeIdx = blsApiPack.indexOf('\n---', 4); // 4 = lengden av åpnings-'---\n'
  const expectedManifest = blsApiPack.slice(0, closeIdx + 4);
  const stor = 'z'.repeat(50000);       // > L3_CAP kuttes til 40000
  const fyll = 'w'.repeat(35000);       // fyller mesteparten av resten av budsjettet
  const medFrontMatter = blsApiPack.padEnd(60000, 'q'); // > L3_CAP, kuttes til 40000 av compose()
  const out = compose([
    { id: 'gammel', name: 'G', text: medFrontMatter, summary: 'kort om BLS' },
    { id: 'fyll', name: 'F', text: fyll },
    { id: 'ny', name: 'N', text: stor },
  ]);
  assert.equal(out[2].level, 'full');             // sist valgt vinner budsjettet
  assert.equal(out[1].level, 'full');             // nest sist valgt får òg fullt (rommes ennå)
  assert.equal(out[0].level, 'manifest');         // budsjettet for lite for full — MEN ikke stille til summary
  assert.equal(out[0].text, expectedManifest);    // hele front matter-blokka, ordrett — ikke bare et fragment
});
test('compose: uten yaml → summary; summary-cap 1500; alle får ALLTID minst L1', () => {
  const out = compose([
    { id: 'a', name: 'A', text: 'p'.repeat(41000) },
    { id: 'b', name: 'B', text: 'q'.repeat(41000) },
    { id: 'c', name: 'C', text: 'r'.repeat(41000), summary: 's'.repeat(2000) },
  ]);
  assert.equal(out[2].level, 'full');
  assert.equal(out[1].level, 'full');           // 80000 rommer to L3-kutt
  assert.equal(out[0].level, 'summary');
  assert(out[0].text.length <= 1500);
});

// Søkefilter for landvelgeren (spec menyopprydding §5–6): PURE, deles av
// Explore-søket (Task 6) og «Legg til land …» (denne oppgaven).
test('filterCatalog: navn+beskrivelse, case-insensitiv, tom query = alt', () => {
  const entries = [
    { name: 'Norway', description: 'SSB core' },
    { name: 'Sweden', description: 'SCB' },
    { name: 'Helse', description: 'FHI og NPR' },
  ];
  assert.equal(filterCatalog(entries, '').length, 3);
  assert.deepEqual(filterCatalog(entries, 'ssb').map((e) => e.name), ['Norway']);
  assert.deepEqual(filterCatalog(entries, 'FHI').map((e) => e.name), ['Helse']);
  assert.equal(filterCatalog(entries, 'zzz').length, 0);
});

test('autoFrom: region vinner, entydige språk mappes, tvetydige → null', async () => {
  const P = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: [], auto: false }));
  await P.load();
  assert.equal(P.autoFrom('sv-FI'), 'finland');       // region slår språk
  assert.equal(P.autoFrom('nb-NO'), 'norway');        // kuratert pakke for regionen
  assert.equal(P.autoFrom('pt-BR'), 'country:BR');    // landmal for regionen
  assert.equal(P.autoFrom('sv'), 'country:SE');       // entydig språk uten region
  assert.equal(P.autoFrom('ja'), 'country:JP');
  assert.equal(P.autoFrom('de'), null);               // tvetydig språk
  assert.equal(P.autoFrom('en'), null);
  assert.equal(P.autoFrom('en-US'), 'country:US');    // region i tabellen vinner over tvetydig språk
  assert.equal(P.autoFrom('en-AU'), null);            // ukjent region → språkregel → null
  assert.equal(P.autoFrom(''), null);
});

test('resolve: kuratert md hentes og caches; landmal renderes fra countries.json', async () => {
  const s = fakeStorage();
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ ids: ['norway'], auto: false }));
  await P.load();
  const no = await P.resolve('norway');
  assert.equal(no.name, 'Norway');
  assert.ok(no.text.includes('ssb'));
  assert.ok(s.getItem('md_pack_text:norway'));        // cachet for synkron payload
  const de = await P.resolve('country:DE');
  assert.equal(de.name, 'Germany');
  assert.ok(de.text.includes('Destatis'));
  assert.ok(de.text.includes('eurostat'));
  assert.ok(de.text.includes('Germany'));
});

test('payload: synkron fra cache etter ensureSelected; array for flere valgte; undefined når tomt', async () => {
  const s = fakeStorage();
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ ids: ['finland'], auto: true }));
  await P.load();
  assert.equal(P.payload(), undefined);               // ikke resolvet ennå
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [
    { id: 'finland', name: 'Finland', text: '# Finland pack\nUse statfin first.', level: 'full', kind: 'overview', tags: [] },
  ]);
  const P2 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: ['norway', 'finland'], auto: false }));
  await P2.load();
  await P2.ensureSelected();
  assert.deepEqual(P2.payload(), [
    { id: 'norway', name: 'Norway', text: '# Norway pack\nUse ssb first.', level: 'full', kind: 'overview', tags: [] },
    { id: 'finland', name: 'Finland', text: '# Finland pack\nUse statfin first.', level: 'full', kind: 'overview', tags: [] },
  ]);
  const P3 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: [], auto: false }));
  await P3.load();
  await P3.ensureSelected();
  assert.equal(P3.payload(), undefined);              // ingen pakke valgt
});

test('composeInfo: {total, shortForm} følger budsjettert nivå; tomt sett → 0/0', async () => {
  const s = fakeStorage();
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ ids: ['norway', 'finland'], auto: false }));
  await P.load();
  assert.deepEqual(P.composeInfo(), { total: 0, shortForm: 0 });   // ikke resolvet ennå
  await P.ensureSelected();
  assert.deepEqual(P.composeInfo(), { total: 2, shortForm: 0 });   // begge får full innenfor budsjettet
});

test('fullTextFor: resolvet tekst kappet til L3_CAP; ukjent id → tom streng', async () => {
  const s = fakeStorage();
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ ids: ['norway'], auto: false }));
  await P.load();
  await P.ensureSelected();
  const text = await P.fullTextFor('norway');
  assert.ok(text.includes('ssb'));
  assert.equal(await P.fullTextFor('ukjent-id'), '');
});

test('resolve: kappen er hevet til 40000 (L3_CAP), ikke 8000', async () => {
  const bigFiles = Object.assign({}, FILES, { 'data/packs/norway.md': 'x'.repeat(50000) });
  const P = makePacks(fakeStorage(), fakeFetch(bigFiles), fakeProfiles({ ids: [], auto: false }));
  await P.load();
  const got = await P.resolve('norway');
  assert.equal(got.text.length, 40000);
});

// Kildevelger-runde 2 (§Designavgjørelser, Task 2): builtin- og
// country-grenene er FJERNET fra list() — landvalget eies av landvelgeren
// (countryPackId/countryOptions) og de innebygde kildene av registry-
// togglene (listRegistry). list() er nå KUN egne kilder, gruppert etter
// opprinnelse: 'mine' for frittstående, 'overview'/'src' for community-
// importer (speiler origin.kind, satt av importPack).
test('list(): kun egne kilder, gruppert etter opprinnelse (mine/overview/src)', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  const ownId = prof.create('Egen kilde', 'tekst', 'source');
  const ovId = prof.create('Importert oversikt', 'tekst', 'source',
    { source: 'community', id: 'ov1', updated: '', kind: 'overview' });
  const srcId = prof.create('Importert enkeltkilde', 'tekst', 'source',
    { source: 'community', id: 'src1', updated: '', kind: 'source' });
  const groups = {};
  P.list().forEach((e) => { groups[e.id] = e.group; });
  assert.equal(groups['user:' + ownId], 'mine');
  assert.equal(groups['user:' + ovId], 'overview');
  assert.equal(groups['user:' + srcId], 'src');
  assert.equal(P.list().length, 3);                    // ingen builtin-/country-rader lenger
});

// Kilder-profil-output (Task 1 §Interfaces): list() får kind/tags/imported —
// kind fra origin.kind, default 'source' for oppføringer uten origin (også
// legacy-data fra før denne runden); imported = origin.source==='community'.
test('list(): kind/tags/imported — default kind "source" uten origin.kind', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  const ownId = prof.create('Egen kilde', 'tekst', 'source', undefined, ['a', 'b']);
  const ovId = prof.create('Importert oversikt', 'tekst', 'source',
    { source: 'community', id: 'ov1', updated: '', kind: 'overview' });
  const srcId = prof.create('Importert enkeltkilde', 'tekst', 'source',
    { source: 'community', id: 'src1', updated: '', kind: 'source' });
  const byId = {};
  P.list().forEach((e) => { byId[e.id] = e; });
  assert.equal(byId['user:' + ownId].kind, 'source');          // ingen origin → default 'source'
  assert.deepEqual(byId['user:' + ownId].tags, ['a', 'b']);
  assert.equal(byId['user:' + ownId].imported, false);
  assert.equal(byId['user:' + ovId].kind, 'overview');
  assert.deepEqual(byId['user:' + ovId].tags, []);
  assert.equal(byId['user:' + ovId].imported, true);
  assert.equal(byId['user:' + srcId].kind, 'source');
  assert.equal(byId['user:' + srcId].imported, true);
});

// Task 2: load() henter OGSÅ data/data-sources.json (registry) — samme
// nett-først/storage-fallback-mønster som index/countries. list() surfacer
// ikke lenger builtins (§over), så beviset for at index-cachen overlevde
// flyttes til autoFrom()/countryOptions() (kuratert 'norway'); registrets
// cache-fallback bevises via listRegistry().
test('load tåler nett-feil: faller tilbake til storage-cache (index/countries/registry)', async () => {
  const s = fakeStorage();
  const REG = [{ id: 'ssb', navn: 'SSB', beskrivelse: 'Statistics Norway' }];
  const filesWithReg = Object.assign({}, FILES, { 'data/data-sources.json': REG });
  const P1 = makePacks(s, fakeFetch(filesWithReg), fakeProfiles({ ids: [] }));
  await P1.load();                                    // primer storage-cachen
  const P2 = makePacks(s, fakeFetch({}), fakeProfiles({ ids: [] }));
  await P2.load();                                    // alt 404 → cache
  assert.equal(P2.autoFrom('sv-FI'), 'finland');       // index-cache overlevde
  assert.ok(P2.countryOptions().some((o) => o.name === 'Norway' && o.packId === 'norway')); // countries-cache overlevde
  assert.deepEqual(P2.listRegistry(), [
    { id: 'ssb', name: 'SSB', description: 'Statistics Norway', tags: [], off: false },
  ]);                                                  // registry-cache overlevde
});

// Task 11: locale→auto-pakke ved boot/språkbytte — mot EKTE profillager.
const { makeProfiles } = require('../../js/profiles.js');

// Kildevelger-runde 2 (Task 2): boot/onLangChange vedlikeholder FORTSATT
// md_pack_auto (device-lokalt), men det er ikke lenger synlig i
// prof.packsState() — packsState() er nå et rent manuelt sett (Task 1).
// Auto-resultatet leses via P.countryPackId() (mode 'auto', profilens
// default) og telles inn i P.effectiveIds() sammen med det manuelle valget.
// MERK: prof og P deler NÅ samme storage — countryPackId() leser
// md_pack_auto fra PACKS sin storage-parameter, som i produksjon er samme
// localStorage-instans som Profiles skriver til via setAutoPack.
test('boot: auto-forslag havner i md_pack_auto (ikke packsState); manuelt valg urørt', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-05T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.boot(['sv-FI', 'en-US']);
  assert.deepEqual(prof.packsState(), { ids: [] });
  assert.equal(s.getItem('md_pack_auto'), 'finland');
  assert.equal(P.countryPackId(), 'finland');          // mode default 'auto'
  await P.boot(['fi', 'nb-NO']);                       // lagret UI-språk vinner over navigator
  assert.equal(s.getItem('md_pack_auto'), 'finland');
  prof.setPacks(['norway']);                           // manuelt valg
  await P.boot(['sv-FI', '']);
  assert.deepEqual(prof.packsState(), { ids: ['norway'] }); // manuelt valg urørt av auto
  assert.equal(s.getItem('md_pack_auto'), 'finland');
  assert.deepEqual(P.effectiveIds(), ['finland', 'norway']); // landpakke FØRST, manuelt deretter
});

test('onLangChange: setter md_pack_auto uten å røre packsState; alle-null rydder stale auto', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-05T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  await P.onLangChange(['ja']);
  assert.deepEqual(prof.packsState(), { ids: [] });    // uendret — auto bor ikke her lenger
  assert.equal(s.getItem('md_pack_auto'), 'country:JP');
  assert.equal(P.countryPackId(), 'country:JP');
  await P.onLangChange(['de', '']);                    // tvetydig + tom → rydd
  assert.equal(s.getItem('md_pack_auto'), null);
  assert.equal(P.countryPackId(), null);
});

test('community-pakker: ute av velgerlista, i listCommunity, import gir kopi', async () => {
  const IDX2 = { v: 1, packs: INDEX.packs.concat([{
    id: 'us-health-surveys', name: 'US health surveys', description: 'NHIS/MEPS',
    file: 'community/us-health-surveys.md', community: true, author: 'hans', updated: '2026-08-05',
  }]) };
  const files = Object.assign({}, FILES, {
    'data/packs/index.json': IDX2,
    'data/packs/community/us-health-surveys.md': '# US health\nUse ipums.',
  });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  assert.ok(!P.list().some((e) => e.id === 'us-health-surveys'));      // les-før-aktiver
  const comm = P.listCommunity();
  assert.equal(comm.length, 1);
  assert.equal(comm[0].author, 'hans');
  const preview = await P.resolve('us-health-surveys');                // preview-vei
  assert.ok(preview.text.includes('ipums'));
  const newId = P.importPack(comm[0], preview.text);                   // kontekstrunden fase 3: lagres som kind:source
  assert.equal(newId.indexOf('user:'), 0);
  assert.ok(P.list().some((e) => e.id === newId));
  const got = await P.resolve(newId);
  assert.equal(got.text, '# US health\nUse ipums.');                   // kopi, uten re-fetch
  assert.equal(prof.get(newId.slice(5)).kind, 'source');
  // origin.kind (Task 2 §Gruppering): fixture-posten mangler eksplisitt kind
  // → default 'overview' (samme fallback som listCommunity()).
  assert.deepEqual(prof.get(newId.slice(5)).origin,
    { source: 'community', id: 'us-health-surveys', updated: '2026-08-05', kind: 'overview' });
});

// Pakkesplitting (spec 2026-08-07 §3): Explore skal kunne gruppere på
// kind — listCommunity må derfor sende feltet videre (default 'overview'
// for community-poster som mangler det eksplisitt).
test('listCommunity: kind følger med (default overview)', async () => {
  const IDX4 = { v: 1, packs: INDEX.packs.concat([
    { id: 'ov', name: 'Ov', description: 'oversikt', file: 'community/ov.md', community: true, kind: 'overview' },
    { id: 'src-x', name: 'X', description: 'enkeltkilde', file: 'community/src-x.md', community: true, kind: 'source' },
  ]) };
  const files = Object.assign({}, FILES, {
    'data/packs/index.json': IDX4,
    'data/packs/community/ov.md': '# Ov',
    'data/packs/community/src-x.md': '# X',
  });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  const rows = P.listCommunity();
  assert.equal(rows.find((r) => r.id === 'ov').kind, 'overview');
  assert.equal(rows.find((r) => r.id === 'src-x').kind, 'source');
});

// Review-funn 2026-08-06 #4: hele importstien (resolve → importPack →
// Profiles.create kind:'source') skal bevare tekst opp til L3_CAP (40000),
// ikke klippe ved den gamle 8000-grensen. Ekte .md-filer ligger fortsatt
// under 8000 av redaksjonelle grunner (packs-lint.test.js sin egen, urelaterte
// grense på KILDEFILEN) — denne testen bruker en SYNTETISK stor fil for å
// bevise selve MEKANISMEN uavhengig av dagens faktiske innhold.
test('import: en community-pakke over 8000 tegn overlever HELE veien til Profiles (40000-kappen, ikke 8000)', async () => {
  const bigText = '# Big pack\n' + 'x'.repeat(9000) + '\nUse ipums.';
  assert.ok(bigText.length > 8000); // fixture-sjekk: faktisk over den gamle grensen
  const IDX3 = { v: 1, packs: INDEX.packs.concat([{
    id: 'big-community', name: 'Big community pack', description: 'stor pakke',
    file: 'community/big.md', community: true, author: 'hans', updated: '2026-08-06',
  }]) };
  const files = Object.assign({}, FILES, {
    'data/packs/index.json': IDX3,
    'data/packs/community/big.md': bigText,
  });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  const entry = P.listCommunity().filter((c) => c.id === 'big-community')[0];
  const preview = await P.resolve('big-community');
  assert.equal(preview.text.length, bigText.length);   // resolve() klipper ikke ved 8000
  const newId = P.importPack(entry, preview.text);
  const stored = prof.get(newId.slice(5));
  assert.equal(stored.text.length, bigText.length);    // og OGSÅ hele veien inn i Profiles-lageret
  assert.equal(stored.text, bigText);
});

// Kontekstrunden fase 3 (§Unifisert lager): egne kilder bor i Profiles, ikke
// lenger i en egen md_packs_imported-blob eller 'imported:'-idnavnerom.
test('user:-pakker resolves fra Profiles-lageret, aldri fetch', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const sid = prof.create('ESS-kilde', 'yaml her', 'source');
  let calls = 0;
  const countingFetch = async (url) => { calls++; return fakeFetch(FILES)(url); };
  const P = makePacks(s, countingFetch, prof);
  await P.load();
  const before = calls;
  assert.equal(P.displayName('user:' + sid), 'ESS-kilde');
  const got = await P.resolve('user:' + sid);
  assert.deepEqual(got, { name: 'ESS-kilde', text: 'yaml her' });
  assert.equal(calls, before);                                         // resolve() gjorde ALDRI et fetch-kall
  prof.setPacks(['user:' + sid]);
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [{ id: 'user:' + sid, name: 'ESS-kilde', text: 'yaml her', level: 'full', kind: 'source', tags: [] }]);
});

test('migrering: md_packs_imported flyttes til kind:source og velges om valgt', async () => {
  const s = fakeStorage();
  s.setItem('md_packs_imported', JSON.stringify({
    x: { name: 'US health', text: '# US health\nUse ipums.',
      origin: { source: 'community', id: 'us-health-surveys', updated: '2026-08-05' } },
  }));
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  prof.setPacks(['imported:x', 'norway']);                             // manuelt valg som refererer den gamle importen
  const P = makePacks(s, fakeFetch(FILES), prof);
  P.migrateImported(prof);
  const sources = prof.list('source');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, 'US health');
  assert.deepEqual(sources[0].origin, { source: 'community', id: 'us-health-surveys', updated: '2026-08-05' });
  const st = prof.packsState();
  assert.ok(st.ids.indexOf('user:' + sources[0].id) >= 0);
  assert.ok(st.ids.indexOf('norway') >= 0);                            // andre ider urørt
  assert.equal(st.ids.indexOf('imported:x'), -1);                      // gammel-iden borte
  assert.equal(s.getItem('md_packs_imported'), null);                  // nøkkelen fjernet
});

test('migrering: uten manuelt doc.packs skapes intet sett (auto bevares)', async () => {
  const s = fakeStorage();
  s.setItem('md_packs_imported', JSON.stringify({
    x: { name: 'US health', text: 't',
      origin: { source: 'community', id: 'us-health-surveys', updated: '' } },
  }));
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  prof.setAutoPack('norway');                                          // KUN auto-forslag, intet manuelt sett
  const P = makePacks(s, fakeFetch(FILES), prof);
  P.migrateImported(prof);
  assert.equal(prof.list('source').length, 1);                        // kilden opprettes uansett
  assert.deepEqual(prof.packsState(), { ids: [] });                   // intet manuelt sett skapt
  assert.equal(s.getItem('md_pack_auto'), 'norway');                  // auto-cachen uendret
  assert.equal(s.getItem('md_packs_imported'), null);
});

test('migrering: ingen md_packs_imported → no-op', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  P.migrateImported(prof);
  assert.equal(prof.list('source').length, 0);
});

// Biblioteksmanageren (spec 2026-08-06-menyopprydding §4): describe(id) er
// infopanelets tekstkilde — katalogbeskrivelse for builtins, note/mal for
// land, og egen tekst (m/origin-prefiks ved community-import) for user:.
test('describe: katalogbeskrivelse, landnote, egen kilde m/origin-prefiks, reg:-registeroppslag', async () => {
  const prof = fakeProfiles({ ids: [], auto: false });
  prof.get = (id) => (id === 'egen1'
    ? { id: 'egen1', name: 'Min', text: 'Første linje.\nMer.', kind: 'source',
        origin: { source: 'community', id: 'x' } }
    : null);
  const REG = [{ id: 'ssb', navn: 'SSB', beskrivelse: 'Statistics Norway' }];
  const files = Object.assign({}, FILES, { 'data/data-sources.json': REG });
  const P = makePacks(fakeStorage(), fakeFetch(files), prof);
  await P.load();
  assert.ok(P.describe('norway').length > 0);            // description fra index.json
  assert.ok(P.describe('country:SE').length > 0);        // note/mal fra countries.json
  assert.match(P.describe('user:egen1'), /Første linje/);
  assert.equal(P.describe('reg:ssb'), 'Statistics Norway'); // Task 2 §5-6: registerets beskrivelse
  assert.equal(P.describe('reg:ukjent'), '');             // ukjent registry-id → tom streng
  assert.equal(P.describe('finnes:ikke'), '');
});

// Review-funn 2 (2026-08-06): migreringen skjer i praksis via boot(), ikke
// ved et direkte migrateImported()-kall — de øvrige migrerings-testene over
// kaller kun migrateImported() direkte og beskytter derfor ikke boot()s
// load → migrateImported → applyAuto → ensureSelected-rekkefølge. Denne
// testen går gjennom P.boot([...]) selv, slik at en fremtidig omrokkering
// (f.eks. migrateImported() flyttet til etter ensureSelected, eller fjernet
// fra boot() helt) feiler her.
test('boot(): migrerer md_packs_imported (rekkefølgen inni boot er beskyttet)', async () => {
  const s = fakeStorage();
  s.setItem('md_packs_imported', JSON.stringify({
    x: { name: 'US health', text: '# US health\nUse ipums.',
      origin: { source: 'community', id: 'us-health-surveys', updated: '2026-08-05' } },
  }));
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  prof.setPacks(['imported:x', 'norway']);                             // manuelt valg som refererer den gamle importen
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.boot(['en-US']);
  const sources = prof.list('source');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, 'US health');
  const st = prof.packsState();
  assert.ok(st.ids.indexOf('user:' + sources[0].id) >= 0);             // remappet
  assert.ok(st.ids.indexOf('norway') >= 0);                            // andre ider urørt
  assert.equal(st.ids.indexOf('imported:x'), -1);                      // gammel-iden borte
  assert.equal(s.getItem('md_packs_imported'), null);                 // nøkkelen fjernet
});

// ---- Kildevelger-runde 2 (Task 2): countryPackId/effectiveIds/countryOptions
// /listRegistry — packs-kjernen på den nye tilstandsmodellen fra Task 1
// (profiles.js: countryState/setCountry/sourcesOff/toggleSourceOff).

test('countryPackId: none→null; cc kuratert→pakke-id; cc generisk→country:CC; ukjent cc→null; auto→md_pack_auto', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  prof.setCountry('none');
  assert.equal(P.countryPackId(), null);
  prof.setCountry('cc', 'NO');                           // kuratert pakke finnes for NO
  assert.equal(P.countryPackId(), 'norway');
  prof.setCountry('cc', 'SE');                           // generisk — ingen kuratert pakke for SE
  assert.equal(P.countryPackId(), 'country:SE');
  prof.setCountry('cc', 'ZZ');                            // gyldig format, ukjent land → null
  assert.equal(P.countryPackId(), null);
  prof.setCountry('auto');                                // profilens default
  assert.equal(P.countryPackId(), null);                  // ingen md_pack_auto satt ennå
  s.setItem('md_pack_auto', 'finland');
  assert.equal(P.countryPackId(), 'finland');
});

test('effectiveIds: landpakke FØRST, manuelt valg deretter, dedup mot allerede-valgt landpakke', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  prof.setPacks(['finland']);
  prof.setCountry('cc', 'NO');                           // landpakke: 'norway'
  assert.deepEqual(P.effectiveIds(), ['norway', 'finland']);
  prof.setPacks(['norway', 'finland']);                  // landpakken ligger OGSÅ manuelt valgt
  assert.deepEqual(P.effectiveIds(), ['norway', 'finland']); // ingen duplikat, fortsatt land FØRST
  prof.setCountry('none');
  assert.deepEqual(P.effectiveIds(), ['norway', 'finland']); // ingen landpakke å legge til — manuelt sett uendret
});

test('countryOptions: kuraterte + generiske land, sortert på navn; NO→norway (kuratert), SE→country:SE (generisk)', async () => {
  const P = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: [] }));
  await P.load();
  const opts = P.countryOptions();
  const byCc = {};
  opts.forEach((o) => { byCc[o.cc] = o; });
  assert.deepEqual(byCc.NO, { cc: 'NO', name: 'Norway', packId: 'norway' });
  assert.deepEqual(byCc.SE, { cc: 'SE', name: 'Sweden', packId: 'country:SE' });
  const names = opts.map((o) => o.name);
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b))); // sortert på navn
});

test('listRegistry: navn/beskrivelse + av-status fra Profiles.sourcesOff(); tåler manglende beskrivelse', async () => {
  const REG = [
    { id: 'ssb', navn: 'SSB', beskrivelse: 'Statistics Norway' },
    { id: 'dbnomics', navn: 'DBnomics' },                // beskrivelse kommer i Task 3 — tåles i mellomtiden
  ];
  const files = Object.assign({}, FILES, { 'data/data-sources.json': REG });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  prof.toggleSourceOff('dbnomics');
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  assert.deepEqual(P.listRegistry(), [
    { id: 'ssb', name: 'SSB', description: 'Statistics Norway', tags: [], off: false },
    { id: 'dbnomics', name: 'DBnomics', description: '', tags: [], off: true },
  ]);
});

test('listRegistry: tags følger med fra data-sources.json når feltet finnes', async () => {
  const REG = [
    { id: 'ssb', navn: 'SSB', beskrivelse: 'Statistics Norway', tags: ['official', 'nordic'] },
    { id: 'dbnomics', navn: 'DBnomics' },
  ];
  const files = Object.assign({}, FILES, { 'data/data-sources.json': REG });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  assert.deepEqual(P.listRegistry(), [
    { id: 'ssb', name: 'SSB', description: 'Statistics Norway', tags: ['official', 'nordic'], off: false },
    { id: 'dbnomics', name: 'DBnomics', description: '', tags: [], off: false },
  ]);
});

test('importPack: origin.kind følger entry.kind (source) — ikke bare default overview', async () => {
  const IDX = { v: 1, packs: INDEX.packs.concat([
    { id: 'src-y', name: 'Y', description: 'enkeltkilde', file: 'community/src-y.md',
      community: true, kind: 'source', author: 'hans', updated: '2026-08-08' },
  ]) };
  const files = Object.assign({}, FILES, {
    'data/packs/index.json': IDX,
    'data/packs/community/src-y.md': '# Y',
  });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  const entry = P.listCommunity().find((c) => c.id === 'src-y');
  const preview = await P.resolve('src-y');
  const newId = P.importPack(entry, preview.text);
  assert.equal(prof.get(newId.slice(5)).origin.kind, 'source');
});

test('payload: inkluderer landpakketekst FØRST når et landvalg er satt', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  prof.setPacks(['finland']);
  prof.setCountry('cc', 'NO');
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [
    { id: 'norway', name: 'Norway', text: '# Norway pack\nUse ssb first.', level: 'full', kind: 'overview', tags: [] },
    { id: 'finland', name: 'Finland', text: '# Finland pack\nUse statfin first.', level: 'full', kind: 'overview', tags: [] },
  ]);
});

// Kilder-profil-output (2026-08-08, Task 1 §Interfaces): compose() bærer
// kind/tags gjennom UENDRET (verdiene kommer fra input-objektene, ikke
// beregnet i compose selv — det er rawSelected()s jobb å slå dem opp).
test('compose: kind/tags følger med gjennom, uendret fra input', () => {
  const out = compose([
    { id: 'a', name: 'A', text: 'x'.repeat(100), kind: 'source', tags: ['t1', 't2'] },
    { id: 'b', name: 'B', text: 'y'.repeat(100), kind: 'overview', tags: [] },
  ]);
  assert.deepEqual(out.map((p) => ({ id: p.id, kind: p.kind, tags: p.tags })), [
    { id: 'a', kind: 'source', tags: ['t1', 't2'] },
    { id: 'b', kind: 'overview', tags: [] },
  ]);
});

// Kilder-profil-output (Task 1 §Interfaces): rawSelected()/payload() slår
// opp kind/tags per gren — kuratert (fra entry.kind/entry.tags i index.json).
test('rawSelected/payload: kuratert pakke med kind=source og tags i index.json', async () => {
  const IDX = { v: 1, packs: INDEX.packs.concat([
    { id: 'ess', name: 'ESS', description: 'European Social Survey', file: 'ess.md',
      kind: 'source', tags: ['survey', 'europe'] },
  ]) };
  const files = Object.assign({}, FILES, {
    'data/packs/index.json': IDX,
    'data/packs/ess.md': '# ESS\nUse ESS rounds.',
  });
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(files), prof);
  await P.load();
  prof.setPacks(['ess']);
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [
    { id: 'ess', name: 'ESS', text: '# ESS\nUse ESS rounds.', level: 'full', kind: 'source', tags: ['survey', 'europe'] },
  ]);
});

// country: gren — kind='overview', tags=[] alltid (landmalen har ingen
// katalogpost å hente tags/kind fra).
test('rawSelected/payload: country:-gren gir kind=overview, tags=[]', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  prof.setCountry('cc', 'SE');                          // generisk landmal, ingen kuratert pakke
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [
    { id: 'country:SE', name: 'Sweden', text: P.payload()[0].text, level: 'full', kind: 'overview', tags: [] },
  ]);
});

// user: gren — kind fra origin.kind (default 'source' uten origin), tags fra
// profiloppføringens tags-felt.
test('rawSelected/payload: user:-gren henter kind fra origin.kind og tags fra profiloppføringen', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-08T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  await P.load();
  const ovId = prof.create('Oversikt', 'yaml', 'source',
    { source: 'community', id: 'ov1', updated: '', kind: 'overview' }, ['x']);
  prof.setPacks(['user:' + ovId]);
  await P.ensureSelected();
  assert.deepEqual(P.payload(), [
    { id: 'user:' + ovId, name: 'Oversikt', text: 'yaml', level: 'full', kind: 'overview', tags: ['x'] },
  ]);
});

// §8 kildeforbedring (spec 2026-08-13, Task 9): egne kopier av innebygde
// kilder — lagBuiltinKopi/oppdaterKopiFraOriginal/builtinOverstyringer.
test('lagBuiltinKopi henter data/sources/<id>.md og lager builtin-copy-kilde', async () => {
  const opprettet = [];
  const profiles = {
    create: (name, text, kind, origin, tags) => { opprettet.push({ name, text, kind, origin, tags }); return 'nyid'; },
    get: () => null, list: () => [], packsState: () => ({ ids: [] }), countryState: () => ({ mode: 'none' }),
  };
  const fetchStub = async (url) => {
    if (String(url).indexOf('data/sources/ssb.md') >= 0) return { ok: true, text: async () => '# SSB-doc' };
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
  const P = makePacks(fakeStorage(), fetchStub, profiles);
  const id = await P.lagBuiltinKopi('ssb');
  assert.equal(id, 'user:nyid');
  assert.equal(opprettet[0].text, '# SSB-doc');
  assert.equal(opprettet[0].kind, 'source');
  assert.deepEqual(opprettet[0].origin, { source: 'builtin-copy', of: 'ssb' });
  assert.ok(/min kopi|my copy/i.test(opprettet[0].name) || opprettet[0].name.indexOf('ssb') >= 0);
});

test('oppdaterKopiFraOriginal re-henter og overskriver teksten', async () => {
  const oppdatert = [];
  const profiles = {
    get: (id) => (id === 'p1' ? { name: 'K', text: 'GML', origin: { source: 'builtin-copy', of: 'ssb' } } : null),
    update: (id, f) => oppdatert.push({ id, f }),
    create: () => 'x', list: () => [], packsState: () => ({ ids: [] }), countryState: () => ({ mode: 'none' }),
  };
  const fetchStub = async () => ({ ok: true, text: async () => 'FERSK' });
  const P = makePacks(fakeStorage(), fetchStub, profiles);
  assert.equal(await P.oppdaterKopiFraOriginal('p1'), true);
  assert.deepEqual(oppdatert, [{ id: 'p1', f: { text: 'FERSK' } }]);
  assert.equal(await P.oppdaterKopiFraOriginal('finnes-ikke'), false);
});

test('builtinOverstyringer: of→guide-tekst for aktive kopier, klippet 8000, dedupet', () => {
  require('../../js/source-doc.js');
  const langGuide = '## Kort\n\nk\n\n## Guide\n\n' + 'g'.repeat(9000);
  const profiles = {
    get: (id) => ({
      k1: { name: 'A', text: langGuide, origin: { source: 'builtin-copy', of: 'ssb' } },
      k2: { name: 'B', text: 'x', origin: { source: 'community', id: 'x' } },
    })[id] || null,
    packsState: () => ({ ids: ['user:k1', 'user:k2'] }),
    countryState: () => ({ mode: 'none' }),
    list: () => [], create: () => 'x',
  };
  const P = makePacks(fakeStorage(), async () => ({ ok: false }), profiles);
  const o = P.builtinOverstyringer();
  assert.deepEqual(Object.keys(o), ['ssb']);
  assert.ok(o.ssb.indexOf('## Guide') >= 0);
  assert.ok(o.ssb.length <= 8000);
  assert.equal(typeof P.builtinOverstyrte, 'undefined');   // gammelt navn borte
});

// Deferred Task 3-funn: fallback-til-hele-teksten-grenen (guide tom/mangler
// → hele pr.text brukes, se js/packs.js builtinOverstyringer).
test('builtinOverstyringer: tom guide → hele teksten som fallback', () => {
  require('../../js/source-doc.js');
  const profiles = {
    get: () => ({ name: 'A', text: '## Kort\n\nBare kort her.', origin: { source: 'builtin-copy', of: 'ssb' } }),
    packsState: () => ({ ids: ['user:k1'] }), countryState: () => ({ mode: 'none' }),
    list: () => [], create: () => 'x',
  };
  const P = makePacks(fakeStorage(), async () => ({ ok: false }), profiles);
  assert.ok(P.builtinOverstyringer().ssb.indexOf('Bare kort her.') >= 0);
});

// Kort/lang-splitt (spec 2026-08-13 §3): store EGNE kilder sender prefix+hode+Kort
// som summary-nivå med get_pack-hint.
test('compose: stor egen kilde → summary-nivå med prefix+hode+Kort, ikke full tekst', () => {
  require('../../js/source-doc.js');   // setter globalThis.SourceDoc
  const stor = '---\nid: x\n---\n# T\n\n## Kort\n\nVelg meg for priser.\n\n## Guide\n\n' + 'g'.repeat(5000);
  const ut = compose([{ id: 'user:a', name: 'A', text: stor, kind: 'source', tags: [] }]);
  assert.equal(ut[0].level, 'summary');
  assert.ok(ut[0].text.indexOf('Velg meg for priser.') >= 0);
  assert.ok(ut[0].text.indexOf('ggggg') === -1);              // Guide er IKKE med
  assert.ok(ut[0].text.length <= 2500);
});

test('compose: liten egen kilde (≤1500) flyter full', () => {
  const ut = compose([{ id: 'user:b', name: 'B', text: '## Kort\n\nkort tekst', kind: 'source', tags: [] }]);
  assert.equal(ut[0].level, 'full');
});

test('compose: overview og kuraterte pakker er uendret', () => {
  const stor = 'x'.repeat(5000);
  const ut = compose([
    { id: 'user:c', name: 'C', text: stor, kind: 'overview', tags: [] },
    { id: 'norway', name: 'N', text: stor, kind: 'source', tags: [] },
  ]);
  assert.equal(ut[0].level, 'full');
  assert.equal(ut[1].level, 'full');
});

// ── pakka drar kildene sine på (målt Oslo-runde 10: Norgespakka + avskrudd SSB) ──
const { kilderForPakke } = require('../../js/packs.js');

test('kilderForPakke: sources-felt for temapakker, src-konvensjonen for kind:source', () => {
  assert.deepEqual(kilderForPakke({ id: 'norway', sources: ['ssb', 'fhi', 'norgesbank'] }),
    ['ssb', 'fhi', 'norgesbank']);
  assert.deepEqual(kilderForPakke({ id: 'src-brfss', kind: 'source' }), ['brfss']);
  assert.deepEqual(kilderForPakke({ id: 'us-health-surveys', kind: 'overview' }), []);
  assert.deepEqual(kilderForPakke(null), []);
});

test('kilderForPakke: index.json-fasit — norway/finland deklarerer kildene sine', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'packs', 'index.json'), 'utf8'));
  const norway = idx.packs.find((p) => p.id === 'norway');
  const finland = idx.packs.find((p) => p.id === 'finland');
  assert.deepEqual(kilderForPakke(norway), ['ssb', 'fhi', 'norgesbank']);
  assert.deepEqual(kilderForPakke(finland), ['statfin']);
});
