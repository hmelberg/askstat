// tests/js/source-doc.test.js — SourceDoc-parseren (spec
// 2026-08-09-kildedokumenter-v1a §2, Task 1): kildedokumenter (data/packs/*.md
// og fremtidige registeroppføringer) leses inn raust (front matter/fenced
// yaml/nakne felter) og skrives ut kanonisk (alltid front matter). Ren
// modul — ingen storage/fetch/DOM. Samme require-idiom som packs.test.js.
const test = require('node:test');
const assert = require('node:assert');
const SourceDoc = require('../../js/source-doc.js');

// ---- Round-trip-fixture i KANONISK form (avgjørelse: normalize må være
// idempotent — skriv round-trip-testene i kanonisk form slik at
// serialize(parse(x)) === x holder). Bygget med explicit '\n'-join for å
// unngå at template-literal-innrykk sniker seg inn i forventet output.
const ROUND_TRIP = [
  '---',
  'name: SSB',
  'cors: true',
  'priority: 1',
  'tags: [makro, norge]',
  'note: "Field: with colon"',
  'auth:',
  '  type: apikey',
  '  env: SSB_KEY',
  '  plassering: header',
  '---',
  '',
  '# SSB',
  '',
  '## Kort',
  '',
  'Statistics Norway sin API.',
  '',
  '## Guide',
  '',
  'Bruk PxWebApi for tabelluttrekk.',
  '',
  '## Variables',
  '',
  'Se metadata-endepunktet for kodelister.',
  '',
  '## Om kilden',
  '',
  'Offentlig, ingen nøkkel kreves for lesing.',
  '',
  '## Egne notater',
  '',
  'Dette er fri prosa uten kjent nøkkel.',
  '',
  '',
].join('\n');

test('round-trip: front matter-dokument -> parse -> serialize === input (kanonisk form)', () => {
  const doc = SourceDoc.parse(ROUND_TRIP);
  assert.deepEqual(doc.fieldOrder, ['name', 'cors', 'priority', 'tags', 'note', 'auth']);
  assert.equal(doc.fields.name, 'SSB');
  assert.equal(doc.fields.cors, true);
  assert.equal(doc.fields.priority, 1);
  assert.deepEqual(doc.fields.tags, ['makro', 'norge']);
  assert.equal(doc.fields.note, 'Field: with colon');
  assert.deepEqual(doc.fields.auth, { type: 'apikey', env: 'SSB_KEY', plassering: 'header' });
  assert.equal(doc.title, 'SSB');
  assert.deepEqual(doc.sections, [
    { key: 'kort', heading: 'Kort', text: 'Statistics Norway sin API.' },
    { key: 'guide', heading: 'Guide', text: 'Bruk PxWebApi for tabelluttrekk.' },
    { key: 'variabler', heading: 'Variables', text: 'Se metadata-endepunktet for kodelister.' },
    { key: 'om', heading: 'Om kilden', text: 'Offentlig, ingen nøkkel kreves for lesing.' },
    { key: null, heading: 'Egne notater', text: 'Dette er fri prosa uten kjent nøkkel.' },
  ]);
  assert.deepEqual(doc.warnings, []);
  assert.equal(SourceDoc.serialize(doc), ROUND_TRIP);
  // normalize er idempotent
  assert.equal(SourceDoc.normalize(ROUND_TRIP), ROUND_TRIP);
  assert.equal(SourceDoc.normalize(SourceDoc.normalize(ROUND_TRIP)), SourceDoc.normalize(ROUND_TRIP));
});

// ---- Fenced yaml (dagens src-pakke-form, listeform som i src-socrata.md):
// samme innhold, kopiert rått inn i testen.
const SOCRATA_FENCED = [
  '# Socrata',
  '',
  'The catalog software family behind SODA/Socrata open-data portals — the',
  '`cdc` registry source in this app is a Socrata domain, and the same query',
  'shape works on any other Socrata portal found via the discovery API.',
  'Open, no key required (a free X-App-Token header avoids throttling).',
  '',
  '```yaml',
  '- id: src-socrata',
  '  kind: catalog software family (built-in example: the cdc source)',
  '  discovery_api: "GET https://api.us.socrata.com/api/catalog/v1?q=<terms>&limit=10"',
  '  data_api: "GET https://{domain}/resource/{4x4_id}.json?$where=…   # SoQL"',
  '  auth: "none required; free X-App-Token header avoids throttling"',
  '  built_in_example: "cdc (search_catalog source=\'cdc\') is a Socrata/SODA domain — same query shape works on any other Socrata portal you find via the discovery API"',
  '  flow: "two steps — Discovery API tells you the hosting domain and 4x4 resource id, then query that domain\'s own SODA endpoint directly"',
  '```',
  '',
  'Two-step flow: the Discovery API tells you which domain and 4x4 resource',
  'id hold the data, then you query that domain\'s own SODA endpoint directly',
  'with a `$where` SoQL filter directly.',
  '',
].join('\n');

const SOCRATA_FRONT_MATTER = [
  '---',
  'id: src-socrata',
  'kind: "catalog software family (built-in example: the cdc source)"',
  'discovery_api: GET https://api.us.socrata.com/api/catalog/v1?q=<terms>&limit=10',
  'data_api: GET https://{domain}/resource/{4x4_id}.json?$where=…   # SoQL',
  'auth: none required; free X-App-Token header avoids throttling',
  'built_in_example: cdc (search_catalog source=\'cdc\') is a Socrata/SODA domain — same query shape works on any other Socrata portal you find via the discovery API',
  'flow: two steps — Discovery API tells you the hosting domain and 4x4 resource id, then query that domain\'s own SODA endpoint directly',
  '---',
  '',
  '# Socrata',
  '',
].join('\n');

test('fenced yaml (src-socrata.md-formen): parse gir samme fields som front matter-varianten', () => {
  const fenced = SourceDoc.parse(SOCRATA_FENCED);
  const fm = SourceDoc.parse(SOCRATA_FRONT_MATTER);
  assert.deepEqual(fenced.fields, fm.fields);
  assert.deepEqual(fenced.fieldOrder, fm.fieldOrder);
  assert.equal(fenced.fields.id, 'src-socrata');
  assert.equal(fenced.title, 'Socrata');
});

test('fenced yaml: normalize gir front matter-form', () => {
  const normalized = SourceDoc.normalize(SOCRATA_FENCED);
  assert.equal(normalized.indexOf('---\n'), 0);
  assert.ok(normalized.indexOf('id: src-socrata') >= 0);
  assert.ok(normalized.indexOf('```yaml') < 0); // fenced-blokka er borte, erstattet av front matter
  assert.equal(SourceDoc.normalize(normalized), normalized); // idempotent
});

// ---- Fenced yaml, flat mapping-form (som i src-bls-api.md — ikke listeform).
const BLS_FENCED = [
  '# BLS Public Data API v2',
  '',
  'Kort intro.',
  '',
  '```yaml',
  'id: src-bls-api',
  'name: BLS Public Data API v2',
  'base: https://api.bls.gov/publicAPI/v2/timeseries/data/',
  'auth: "registrationkey in the POST body (free)"',
  'limits: "500 queries/day, 50 series/request, 20 years of history"',
  '```',
  '',
  'Mer prosa etterpå.',
  '',
].join('\n');

test('fenced yaml (flat mapping, src-bls-api.md-formen): fields typet riktig', () => {
  const doc = SourceDoc.parse(BLS_FENCED);
  assert.deepEqual(doc.fieldOrder, ['id', 'name', 'base', 'auth', 'limits']);
  assert.equal(doc.fields.id, 'src-bls-api');
  assert.equal(doc.fields.auth, 'registrationkey in the POST body (free)');
  assert.equal(doc.fields.limits, '500 queries/day, 50 series/request, 20 years of history');
  assert.equal(doc.title, 'BLS Public Data API v2');
});

// ---- Nakne key: value-linjer fra toppen (§2 format 3).
test('nakne linjer: fields fra toppen, prosaen bevart, normalize idempotent', () => {
  const text = 'name: X\ndata_url: https://a/b.csv\n\nProsa.';
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fieldOrder, ['name', 'data_url']);
  assert.deepEqual(doc.fields, { name: 'X', data_url: 'https://a/b.csv' });
  assert.deepEqual(doc.sections, [{ key: null, heading: '', text: 'Prosa.' }]);
  const normalized = SourceDoc.normalize(text);
  assert.equal(SourceDoc.normalize(normalized), normalized);
});

// ---- Typing (§2 mini-YAML): boolean/number/array/quoted streng med ': '.
test('typing: cors true -> boolean; tags -> array; quoted streng med ": " round-trips', () => {
  const text = [
    '---',
    'cors: true',
    'off: false',
    'count: 3',
    'empty_list: []',
    'tags: [makro, norge]',
    'note: "Field: with colon"',
    '---',
    '',
    'Prosa.',
    '',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.equal(doc.fields.cors, true);
  assert.equal(doc.fields.off, false);
  assert.equal(doc.fields.count, 3);
  assert.deepEqual(doc.fields.empty_list, []);
  assert.deepEqual(doc.fields.tags, ['makro', 'norge']);
  assert.equal(doc.fields.note, 'Field: with colon');
  assert.equal(SourceDoc.serialize(doc), text); // round trip inkl. quoting-regel
});

// ---- Nesting (§2 mini-YAML): auth-blokk (type/env/plassering) -> objekt og tilbake.
test('nesting: auth-blokk (type/env/plassering) blir objekt og serialiseres tilbake', () => {
  const text = [
    '---',
    'auth:',
    '  type: apikey',
    '  env: SSB_KEY',
    '  plassering: header',
    '---',
    '',
    'Prosa.',
    '',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fields.auth, { type: 'apikey', env: 'SSB_KEY', plassering: 'header' });
  assert.equal(SourceDoc.serialize(doc), text);
});

// ---- Seksjoner + sectionKey (§Interfaces): aliasmatch case-insensitivt.
test('seksjoner: Kort/Variables/Om kilden/Egne notater -> kort/variabler/om/null', () => {
  const text = [
    '# T',
    '',
    '## Kort',
    '',
    'a',
    '',
    '## Variables',
    '',
    'b',
    '',
    '## Om kilden',
    '',
    'c',
    '',
    '## Egne notater',
    '',
    'd',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.sections.map((s) => s.key), ['kort', 'variabler', 'om', null]);
});

test('sectionKey: case-insensitiv aliasmatch', () => {
  assert.equal(SourceDoc.sectionKey('Short'), 'kort');
  assert.equal(SourceDoc.sectionKey('SUMMARY'), 'kort');
  assert.equal(SourceDoc.sectionKey('guide'), 'guide');
  assert.equal(SourceDoc.sectionKey('Variables'), 'variabler');
  assert.equal(SourceDoc.sectionKey('About'), 'om');
  assert.equal(SourceDoc.sectionKey('About the source'), 'om');
  assert.equal(SourceDoc.sectionKey('Egne notater'), null);
  assert.equal(SourceDoc.sectionKey(''), null);
});

// ---- Dokument uten key-linjer øverst -> fields {}, alt er prosa/seksjoner.
test('dokument uten key-linjer øverst: fields {}, alt er prosa/seksjoner', () => {
  const text = '# En tittel\n\nBare prosa her, ingen felter.\n\n## Kort\n\nEt kort avsnitt.\n';
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fields, {});
  assert.deepEqual(doc.fieldOrder, []);
  assert.equal(doc.title, 'En tittel');
  assert.deepEqual(doc.sections, [
    { key: null, heading: '', text: 'Bare prosa her, ingen felter.' },
    { key: 'kort', heading: 'Kort', text: 'Et kort avsnitt.' },
  ]);
});

// ---- Konstanter (§Interfaces): eksporteres NØYAKTIG som spesifisert.
test('TAG_ALIASES og SECTION_ALIASES eksponeres som spesifisert', () => {
  assert.deepEqual(SourceDoc.TAG_ALIASES, {
    micro: 'mikro', macro: 'makro', norway: 'norge', sweden: 'sverige', denmark: 'danmark', us: 'usa',
  });
  assert.deepEqual(SourceDoc.SECTION_ALIASES, {
    kort: ['kort', 'short', 'summary'],
    guide: ['guide'],
    variabler: ['variabler', 'variables'],
    om: ['om kilden', 'about', 'about the source'],
  });
});

// ---- parse kaster ALDRI på innholdsproblemer; kun på ikke-streng-input.
test('parse: kaster kun på ikke-streng input, aldri på rare innholdslinjer', () => {
  assert.throws(() => SourceDoc.parse(null), TypeError);
  assert.throws(() => SourceDoc.parse(undefined), TypeError);
  assert.throws(() => SourceDoc.parse(42), TypeError);
  const doc = SourceDoc.parse('---\n???rar linje uten kolon\nname: X\n---\n\nProsa.\n');
  assert.deepEqual(doc.fields, { name: 'X' });
  assert.ok(doc.warnings.length >= 1);
  assert.equal(typeof doc.warnings[0], 'string');
});

test('parse: front matter uten avsluttende "---" -> hele dokumentet tolkes som prosa, ingen kast', () => {
  const doc = SourceDoc.parse('---\nname: X\n\nDette har ingen lukkende linje.\n');
  assert.deepEqual(doc.fields, {});
  assert.ok(doc.warnings.length >= 1);
});

// ---- Edge cases (selvsjekk): tomt dokument, kun front matter, kun prosa.
test('edge case: tomt dokument gir tomme felter/seksjoner uten å kaste', () => {
  const doc = SourceDoc.parse('');
  assert.deepEqual(doc, { fields: {}, fieldOrder: [], title: '', sections: [], warnings: [] });
});

test('edge case: kun front matter (ingen tittel/seksjoner)', () => {
  const text = '---\nname: X\n---\n\n';
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fields, { name: 'X' });
  assert.equal(doc.title, '');
  assert.deepEqual(doc.sections, []);
  assert.equal(SourceDoc.serialize(doc), text);
});

test('edge case: dokument med kun prosa (ingen felter, ingen tittel, ingen seksjoner)', () => {
  const text = 'Bare en enkelt setning uten noe annet innhold.\n';
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fields, {});
  assert.equal(doc.title, '');
  assert.deepEqual(doc.sections, [
    { key: null, heading: '', text: 'Bare en enkelt setning uten noe annet innhold.' },
  ]);
});
