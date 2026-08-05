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
  return { packState: () => state, setAutoPack: () => {}, onChange: () => {} };
}

const FILES = {
  'data/packs/index.json': INDEX,
  'data/packs/countries.json': COUNTRIES,
  'data/packs/norway.md': '# Norway pack\nUse ssb first.',
  'data/packs/finland.md': '# Finland pack\nUse statfin first.',
};

test('autoFrom: region vinner, entydige språk mappes, tvetydige → null', async () => {
  const P = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ id: null, auto: false }));
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
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ id: 'norway', auto: false }));
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

test('payload: synkron fra cache etter ensureCurrent; undefined uten pakke', async () => {
  const s = fakeStorage();
  const P = makePacks(s, fakeFetch(FILES), fakeProfiles({ id: 'finland', auto: true }));
  await P.load();
  assert.equal(P.payload(), undefined);               // ikke resolvet ennå
  await P.ensureCurrent();
  assert.deepEqual(P.payload(), { name: 'Finland', text: '# Finland pack\nUse statfin first.' });
  const P2 = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ id: null, auto: false }));
  await P2.load();
  await P2.ensureCurrent();
  assert.equal(P2.payload(), undefined);              // ingen pakke valgt
});

test('list: builtins først, deretter land uten kuratert pakke', async () => {
  const P = makePacks(fakeStorage(), fakeFetch(FILES), fakeProfiles({ id: null, auto: false }));
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
  const P1 = makePacks(s, fakeFetch(FILES), fakeProfiles({ id: null, auto: false }));
  await P1.load();                                    // primer storage-cachen
  const P2 = makePacks(s, fakeFetch({}), fakeProfiles({ id: null, auto: false }));
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
  assert.deepEqual(prof.packState(), { id: 'finland', auto: true });
  await P.boot(['fi', 'nb-NO']);                       // lagret UI-språk vinner over navigator
  assert.deepEqual(prof.packState(), { id: 'finland', auto: true });
  prof.setPack('norway');                              // manuelt valg
  await P.boot(['sv-FI', '']);
  assert.deepEqual(prof.packState(), { id: 'norway', auto: false });
});

test('onLangChange: setter auto uten manuelt valg; alle-null rydder stale auto', async () => {
  const prof = makeProfiles(fakeStorage(), { now: () => '2026-08-05T10:00:00.000Z' });
  const P = makePacks(fakeStorage(), fakeFetch(FILES), prof);
  await P.load();
  await P.onLangChange(['ja']);
  assert.deepEqual(prof.packState(), { id: 'country:JP', auto: true });
  await P.onLangChange(['de', '']);                    // tvetydig + tom → rydd
  assert.deepEqual(prof.packState(), { id: null, auto: false });
});
