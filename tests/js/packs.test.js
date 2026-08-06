// Pakke-laget (spec 2026-08-05-sprak-pakker-deling §2): katalog, landmal,
// resolusjon m/cache, locale→pakke. Node-seam: makePacks(storage, fetch, profiles).
const test = require('node:test');
const assert = require('node:assert');
const { makePacks, compose } = require('../../js/packs.js');

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
    { id: 'finland', name: 'Finland', text: '# Finland pack\nUse statfin first.', level: 'full' },
  ]);
  const P2 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: ['norway', 'finland'], auto: false }));
  await P2.load();
  await P2.ensureSelected();
  assert.deepEqual(P2.payload(), [
    { id: 'norway', name: 'Norway', text: '# Norway pack\nUse ssb first.', level: 'full' },
    { id: 'finland', name: 'Finland', text: '# Finland pack\nUse statfin first.', level: 'full' },
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

test('list: builtins først, deretter land uten kuratert pakke', async () => {
  const P = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: [], auto: false }));
  await P.load();
  const ids = P.list().map((e) => e.id);
  assert.ok(ids.indexOf('norway') >= 0 && ids.indexOf('finland') >= 0);
  assert.ok(ids.indexOf('country:DE') >= 0);
  assert.equal(ids.indexOf('country:NO'), -1);        // NO dekkes av kuratert norway
  const groups = new Set(P.list().map((e) => e.group));
  assert.deepEqual([...groups].sort(), ['builtin', 'country']);
});

test('load tåler nett-feil: faller tilbake til storage-cache', async () => {
  const s = fakeStorage();
  const P1 = makePacks(s, fakeFetch(FILES), fakeProfiles({ ids: [], auto: false }));
  await P1.load();                                    // primer storage-cachen
  const P2 = makePacks(s, fakeFetch({}), fakeProfiles({ ids: [], auto: false }));
  await P2.load();                                    // alt 404 → cache
  assert.ok(P2.list().some((e) => e.id === 'norway'));
  assert.equal(P2.autoFrom('sv-FI'), 'finland');
});

// Task 11: locale→auto-pakke ved boot/språkbytte — mot EKTE profillager.
const { makeProfiles } = require('../../js/profiles.js');

test('boot: auto fra første matchende locale-kandidat; manuelt valg urørt', async () => {
  const prof = makeProfiles(fakeStorage(), { now: () => '2026-08-05T10:00:00.000Z' });
  const P = makePacks(fakeStorage(), fakeFetch(FILES), prof);
  await P.boot(['sv-FI', 'en-US']);
  assert.deepEqual(prof.packsState(), { ids: ['finland'], auto: true });
  await P.boot(['fi', 'nb-NO']);                       // lagret UI-språk vinner over navigator
  assert.deepEqual(prof.packsState(), { ids: ['finland'], auto: true });
  prof.setPacks(['norway']);                           // manuelt valg
  await P.boot(['sv-FI', '']);
  assert.deepEqual(prof.packsState(), { ids: ['norway'], auto: false });
});

test('onLangChange: setter auto uten manuelt valg; alle-null rydder stale auto', async () => {
  const prof = makeProfiles(fakeStorage(), { now: () => '2026-08-05T10:00:00.000Z' });
  const P = makePacks(fakeStorage(), fakeFetch(FILES), prof);
  await P.load();
  await P.onLangChange(['ja']);
  assert.deepEqual(prof.packsState(), { ids: ['country:JP'], auto: true });
  await P.onLangChange(['de', '']);                    // tvetydig + tom → rydd
  assert.deepEqual(prof.packsState(), { ids: [], auto: false });
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
  assert.deepEqual(prof.get(newId.slice(5)).origin, { source: 'community', id: 'us-health-surveys', updated: '2026-08-05' });
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
  assert.deepEqual(P.payload(), [{ id: 'user:' + sid, name: 'ESS-kilde', text: 'yaml her', level: 'full' }]);
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
  assert.deepEqual(prof.packsState(), { ids: ['norway'], auto: true }); // uendret — auto overlever
  assert.equal(s.getItem('md_packs_imported'), null);
});

test('migrering: ingen md_packs_imported → no-op', async () => {
  const s = fakeStorage();
  const prof = makeProfiles(s, { now: () => '2026-08-06T10:00:00.000Z' });
  const P = makePacks(s, fakeFetch(FILES), prof);
  P.migrateImported(prof);
  assert.equal(prof.list('source').length, 0);
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
