'use strict';

// Ren del av js/sources-modal.js (kilder-profil-output-runden, Task 5):
// filterEntries er dialogens ENESTE listelogikk — fane (kind), fritekstsøk
// på navn, OG-semantikk på tag-chips og «valgte først»-sortering. DOM-delen
// bak document-guard er ikke lastet her (samme idiom som packs.js/profiles.js).
const test = require('node:test');
const assert = require('node:assert');
const { filterEntries, topTags, filterByTags } = require('../../js/sources-modal.js');

// Blandet sett: to temaer, tre enkeltkilder (én uten kind-felt = legacy).
const ENTRIES = [
  { id: 'user:o1', name: 'Health topics', kind: 'overview', tags: ['makro', 'norge'] },
  { id: 'user:o2', name: 'Analysis pack', kind: 'overview', tags: ['mikro'] },
  { id: 'user:s1', name: 'SSB', kind: 'source', tags: ['makro', 'norge'] },
  { id: 'reg:ess', name: 'ESS', kind: 'source', tags: ['mikro'] },
  { id: 'user:s2', name: 'Alt uten kind' },
];

function names(list) { return list.map((e) => e.name); }

test('filterEntries: fanen filtrerer på kind; manglende kind teller som enkeltkilde', () => {
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'overview', q: '', tags: [] }, [])),
    ['Analysis pack', 'Health topics'],
  );
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: [] }, [])),
    ['Alt uten kind', 'ESS', 'SSB'],
  );
});

test('filterEntries: søk = case-insensitivt delstrengtreff på NAVN', () => {
  assert.deepEqual(names(filterEntries(ENTRIES, { tab: 'source', q: 'ss', tags: [] }, [])), ['ESS', 'SSB']);
  assert.deepEqual(names(filterEntries(ENTRIES, { tab: 'source', q: '  sSb ', tags: [] }, [])), ['SSB']);
  assert.deepEqual(filterEntries(ENTRIES, { tab: 'source', q: 'zzz', tags: [] }, []), []);
  // taggen «mikro» er IKKE en navnetreffkilde — søket gjelder kun navnet
  assert.deepEqual(names(filterEntries(ENTRIES, { tab: 'source', q: 'mikro', tags: [] }, [])), []);
});

test('filterEntries: flere tags = OG (alle må finnes), ikke ELLER', () => {
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: ['makro'] }, [])),
    ['SSB'],
  );
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: ['makro', 'norge'] }, [])),
    ['SSB'],
  );
  // mikro OG norge finnes ikke sammen på noen enkeltkilde
  assert.deepEqual(filterEntries(ENTRIES, { tab: 'source', q: '', tags: ['mikro', 'norge'] }, []), []);
  // entry uten tags-felt overlever kun uten tag-filter
  assert.deepEqual(filterEntries(ENTRIES, { tab: 'source', q: 'Alt', tags: ['makro'] }, []), []);
});

test('filterEntries: valgte sorteres først, navnesortering innen hver gruppe', () => {
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: [] }, ['reg:ess'])),
    ['ESS', 'Alt uten kind', 'SSB'],
  );
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: [] }, ['user:s1', 'reg:ess'])),
    ['ESS', 'SSB', 'Alt uten kind'],
  );
  // ukjente ider i checked-lista påvirker ingenting
  assert.deepEqual(
    names(filterEntries(ENTRIES, { tab: 'source', q: '', tags: [] }, ['finnes:ikke'])),
    ['Alt uten kind', 'ESS', 'SSB'],
  );
});

test('filterEntries: tåler tomme/manglende felt og lar input-lista være urørt', () => {
  const before = ENTRIES.slice();
  filterEntries(ENTRIES, { tab: 'source' }, null);
  assert.deepEqual(ENTRIES, before, 'input-rekkefølgen skal ikke muteres av sorteringen');
  assert.deepEqual(filterEntries([], { tab: 'overview', q: 'x', tags: ['mikro'] }, []), []);
  // state uten q/tags oppfører seg som «ingen filtre»
  assert.equal(filterEntries(ENTRIES, { tab: 'source' }, []).length, 3);
});

// filterByTags er tag-halvdelen av filterEntries, delt med Import-utforskeren
// (fikserunde 1): der beholdes filterCatalog for fritekst (navn+beskrivelse) og
// katalogens egen rekkefølge, så bare tag-filteret gjenbrukes.
test('filterByTags: OG-semantikk, tom tagliste = alt, rekkefølge bevart', () => {
  const cat = [
    { id: 'a', name: 'Nordic', tags: ['makro', 'norge'] },
    { id: 'b', name: 'Survey', tags: ['mikro'] },
    { id: 'c', name: 'Uten tags' },
  ];
  assert.deepEqual(filterByTags(cat, []).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(filterByTags(cat, null).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(filterByTags(cat, ['makro']).map((e) => e.id), ['a']);
  assert.deepEqual(filterByTags(cat, ['makro', 'norge']).map((e) => e.id), ['a']);
  assert.deepEqual(filterByTags(cat, ['makro', 'mikro']), []);
  assert.deepEqual(filterByTags(cat, ['mikro']).map((e) => e.id), ['b']);
  // ingen sortering: katalogens rekkefølge er bevart (motsatt av filterEntries)
  assert.deepEqual(
    filterByTags([{ id: 'z', tags: ['x'] }, { id: 'y', tags: ['x'] }], ['x']).map((e) => e.id),
    ['z', 'y'],
  );
});

// Tag-chipsene over lista: hyppigst først, tak på antall.
test('topTags: unike tags, hyppigst først, alfabetisk ved likhet, kappet på max', () => {
  const entries = [
    { id: 'a', tags: ['makro', 'norge'] },
    { id: 'b', tags: ['makro', 'sverige'] },
    { id: 'c', tags: ['makro'] },
    { id: 'd', tags: ['norge'] },
    { id: 'e' },
  ];
  assert.deepEqual(topTags(entries, 12), ['makro', 'norge', 'sverige']);
  assert.deepEqual(topTags(entries, 2), ['makro', 'norge']);
  assert.deepEqual(topTags([], 12), []);
  // likhet i antall → alfabetisk (deterministisk rekkefølge mellom rendringer)
  assert.deepEqual(topTags([{ id: 'x', tags: ['b', 'a'] }], 12), ['a', 'b']);
});
