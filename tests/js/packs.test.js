// Pakke-laget (spec 2026-08-05-sprak-pakker-deling §2): katalog, landmal,
// resolusjon m/cache, locale→pakke. Node-seam: makePacks(storage, fetch, profiles).
const test = require('node:test');
const assert = require('node:assert');
const { makePacks } = require('../../js/packs.js');

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
  assert.deepEqual(P.payload(), [{ name: 'Finland', text: '# Finland pack\nUse statfin first.' }]);
  const P2 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: ['norway', 'finland'], auto: false }));
  await P2.load();
  await P2.ensureSelected();
  assert.deepEqual(P2.payload(), [
    { name: 'Norway', text: '# Norway pack\nUse ssb first.' },
    { name: 'Finland', text: '# Finland pack\nUse statfin first.' },
  ]);
  const P3 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ ids: [], auto: false }));
  await P3.load();
  await P3.ensureSelected();
  assert.equal(P3.payload(), undefined);              // ingen pakke valgt
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
  assert.deepEqual(P.payload(), [{ name: 'ESS-kilde', text: 'yaml her' }]);
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
