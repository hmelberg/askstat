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

// ==== Reviewfunn (task-1-review, 2026-08-09) — to Important-funn m/covering
// tester. Se "Fix report" nederst i task-1-report.md for rotårsak/fiks.

// ---- Funn 1: tittelsøket skal ALDRI plukke opp en '# '-linje som ligger
// inni en senere seksjon eller kodeblokk (f.eks. en Python-kommentar i et
// eksempel). Reviewerens konkrete eksempel: ingen ekte tittel, men en
// '## Guide'-seksjon med et fenced kode-eksempel som inneholder en bar '# '-
// linje ('# Hent data'). Før fiksen ble denne linja stjålet som doc.title OG
// fjernet fra kode-eksempelet (datatap).
test('funn 1: bar "# "-linje inni et senere kode-eksempel blir IKKE tittel, og bevares i seksjonsteksten', () => {
  const text = [
    '## Guide',
    '',
    'Kjør:',
    '',
    '```python',
    '# Hent data',
    'import requests',
    '```',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.equal(doc.title, ''); // IKKE 'Hent data'
  assert.equal(doc.sections.length, 1);
  assert.equal(doc.sections[0].key, 'guide');
  assert.ok(doc.sections[0].text.indexOf('# Hent data') >= 0); // linja er ikke fjernet
  assert.ok(doc.sections[0].text.indexOf('import requests') >= 0);
  // normalize skal fortsatt være idempotent på et dokument uten ekte tittel.
  assert.equal(SourceDoc.normalize(SourceDoc.normalize(text)), SourceDoc.normalize(text));
});

// Samme funn, men med en EKTE tittel til stede: den ekte tittelen skal
// vinne, og den senere kodeblokkas '# '-linje skal fortsatt bevares urørt.
test('funn 1: ekte tittel identifiseres korrekt selv når en senere seksjon har en bar "# "-linje', () => {
  const text = [
    '# Ekte tittel',
    '',
    'Intro.',
    '',
    '## Guide',
    '',
    'Kjør:',
    '',
    '```python',
    '# Hent data',
    'import requests',
    '```',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.equal(doc.title, 'Ekte tittel');
  const guide = doc.sections.filter((s) => s.key === 'guide')[0];
  assert.ok(guide.text.indexOf('# Hent data') >= 0);
});

// Fenced-blokka stopper tittelsøket OGSÅ når den ligger i den ledende
// prosaen, FØR noen '## '-overskrift i det hele tatt.
test('funn 1: fenced kodeblokk i ledende prosa (før noen "## ") stopper tittelsøket', () => {
  const text = [
    'Intro uten tittel.',
    '',
    '```python',
    '# Ikke en tittel',
    '```',
    '',
    'Mer prosa.',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.equal(doc.title, '');
});

// ---- Funn 2: fenced-yaml-gjenkjenning skal ALDRI plukke opp en ```yaml-
// blokk som ligger inni en senere '## '-seksjon — kun en blokk FØR første
// '## '-overskrift teller som feltkilde. Reviewerens konkrete eksempel:
// nakne felter øverst (name/data_url), etterfulgt av en '## Guide'-seksjon
// som selv inneholder et ```yaml-eksempel. Før fiksen ble eksempel-blokka
// silently brukt som feltkilde og de ekte nakne feltene ble forkastet.
test('funn 2: yaml-fence inni en senere "## "-seksjon overstyrer IKKE ekte nakne felter øverst', () => {
  const text = [
    'name: MittKilde',
    'data_url: https://a/b.csv',
    '',
    '## Guide',
    '',
    'Eksempel:',
    '',
    '```yaml',
    'id: example-only',
    'note: should not leak into fields',
    '```',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fieldOrder, ['name', 'data_url']);
  assert.deepEqual(doc.fields, { name: 'MittKilde', data_url: 'https://a/b.csv' });
  const guide = doc.sections.filter((s) => s.key === 'guide')[0];
  assert.ok(guide.text.indexOf('```yaml') >= 0); // eksempel-blokka er urørt, ikke konsumert
  assert.ok(guide.text.indexOf('id: example-only') >= 0);
  assert.equal(SourceDoc.normalize(SourceDoc.normalize(text)), SourceDoc.normalize(text));
});

// Sikrer at fiksen for funn 2 ikke regredigerte den ekte fenced-yaml-veien:
// en blokk FØR første '## '-overskrift (som i src-socrata.md/src-bls-api.md,
// som ikke har noen '## '-seksjoner) skal fortsatt bli plukket opp.
test('funn 2: yaml-fence FØR første "## " blir fortsatt gjenkjent som feltkilde', () => {
  const text = [
    '# T',
    '',
    'Intro.',
    '',
    '```yaml',
    'id: ok-source',
    'name: OK',
    '```',
    '',
    '## Guide',
    '',
    'Prosa.',
    '',
  ].join('\n');
  const doc = SourceDoc.parse(text);
  assert.deepEqual(doc.fields, { id: 'ok-source', name: 'OK' });
  assert.equal(doc.title, 'T');
  // 'Intro.' står FØR fencen som sin egen frie prosa-seksjon (key null),
  // deretter 'guide' — fencen selv er borte (konsumert som feltkilde).
  assert.deepEqual(doc.sections.map((s) => s.key), [null, 'guide']);
  assert.equal(doc.sections[0].text, 'Intro.');
});

// ==== splitKortGuide — rå to-lags-splitt (spec 2026-08-13-kort-lang-splitt §1) ====

test('splitKortGuide: front matter + Kort + Guide splittes rått og tapsfritt', () => {
  const doc = '---\nid: oecd\ncors: true\n---\n\n# OECD\n\nIntro-linje.\n\n## Kort\n\nMakrodata for OECD-land.\n\n## Guide\n\nBruk sdmx-adapteret.\n\n## Variabler\n\n- a\n';
  const r = SourceDoc.splitKortGuide(doc);
  assert.ok(r.prefix.startsWith('---\nid: oecd'));
  assert.ok(r.hode.indexOf('# OECD') >= 0);
  assert.ok(r.hode.indexOf('Intro-linje.') >= 0);
  assert.ok(r.kort.indexOf('## Kort') === 0 || r.kort.indexOf('## Kort') > 0);
  assert.ok(r.kort.indexOf('Makrodata') >= 0);
  assert.ok(r.guide.indexOf('sdmx-adapteret') >= 0);
  assert.ok(r.guide.indexOf('## Variabler') >= 0);        // alt ikke-Kort → guide
  assert.ok(r.kort.indexOf('sdmx') === -1);
  // Innholdsbevarende: hver LINJE havner i nøyaktig én del (join taper kun
  // mellomgruppe-linjeskift — derfor linje-sett, ikke tegnlengde).
  var alle = (r.prefix + '\n' + r.hode + '\n' + r.kort + '\n' + r.guide).split('\n').filter(Boolean).sort();
  assert.deepEqual(alle, doc.split('\n').filter(Boolean).sort());
});

test('splitKortGuide: Postel — uten overskrifter blir første avsnitt kort', () => {
  const r = SourceDoc.splitKortGuide('Min kilde om priser.\n\nLang forklaring\nover flere linjer.\n');
  assert.ok(r.kort.indexOf('Min kilde om priser.') >= 0);
  assert.ok(r.guide.indexOf('Lang forklaring') >= 0);
  assert.equal(r.prefix, '');
});

test('splitKortGuide: Postel med tittel — tittel og før-avsnitt blir i hode', () => {
  const r = SourceDoc.splitKortGuide('# Tittel\n\nFørste avsnitt.\n\nResten her.\n');
  assert.ok(r.hode.indexOf('# Tittel') >= 0);
  assert.ok(r.kort.indexOf('Første avsnitt.') >= 0);
  assert.ok(r.guide.indexOf('Resten her.') >= 0);
  assert.ok(r.guide.indexOf('# Tittel') === -1);  // tittel skal IKKE være i guide
});

// Sluttreview-funn (kort-lang-splitt, Important): Postel-fallback (ingen
// '## Kort' funnet) skal IKKE overskrive en '## '-seksjons-guide som allerede
// ligger lenger nede i dokumentet — resten av hode-prosaen kommer FØR den.
test('splitKortGuide: Postel MED seksjoner — seksjons-guiden overlever', () => {
  const r = SourceDoc.splitKortGuide('# T\n\nIntro.\n\nAndre avsnitt.\n\n## Guide\n\nVIKTIG bruksanvisning.\n');
  assert.ok(r.kort.indexOf('Intro.') >= 0);
  assert.ok(r.guide.indexOf('Andre avsnitt.') >= 0);
  assert.ok(r.guide.indexOf('VIKTIG bruksanvisning.') >= 0);   // ble kastet før fiksen
});

test('splitKortGuide: kun Kort, ingen Guide — guide er tom', () => {
  const r = SourceDoc.splitKortGuide('## Kort\n\nAlt her.\n');
  assert.ok(r.kort.indexOf('Alt her.') >= 0);
  assert.equal(r.guide.trim(), '');
});

test('splitKortGuide: tom/ikke-streng tåles', () => {
  assert.deepEqual(SourceDoc.splitKortGuide(''), { prefix: '', hode: '', kort: '', guide: '' });
  assert.deepEqual(SourceDoc.splitKortGuide(null), { prefix: '', hode: '', kort: '', guide: '' });
});

// ==== flettDeler — invers av splitKortGuide (spec 2026-08-14-seksjonsvise-forslag §2) ====

test('flettDeler: erstatter enkeltdeler, ignorerer ukjente, normaliserer skjøter', () => {
  const doc = '---\nid: x\n---\n\n# T\n\nIntro.\n\n## Kort\n\nGammel kort.\n\n## Guide\n\nGammel guide.\n';
  const ny = SourceDoc.flettDeler(doc, [
    { del: 'kort', ny_tekst: '## Kort\n\nNY kort.' },
    { del: 'tull', ny_tekst: 'ignoreres' },
  ]);
  assert.ok(ny.indexOf('NY kort.') >= 0);
  assert.ok(ny.indexOf('Gammel kort.') === -1);
  assert.ok(ny.indexOf('Gammel guide.') >= 0);          // urørt del består
  assert.ok(ny.indexOf('---\nid: x') === 0);            // prefix rått
  assert.ok(ny.indexOf('# T') >= 0);
});

test('flettDeler: round-trip — ingen deler gir normalisert original (linje-sett bevart)', () => {
  const doc = '---\nid: y\n---\n\n# T\n\n## Kort\n\nK.\n\n## Guide\n\nG.\n';
  const ut = SourceDoc.flettDeler(doc, []);
  assert.deepEqual(ut.split('\n').filter(Boolean).sort(), doc.split('\n').filter(Boolean).sort());
  assert.equal(SourceDoc.flettDeler(doc, null), ut);     // null tåles
});

test('flettDeler: guide-erstatning bevarer halen ETTER et klipp-scenario', () => {
  // Poenget med runden: flettingen skjer mot UKLIPPET original — en ny
  // kort-del skal aldri røre en lang guide-hale.
  const doc = '## Kort\n\nK.\n\n## Guide\n\n' + 'hale'.repeat(3000) + '\n';
  const ut = SourceDoc.flettDeler(doc, [{ del: 'kort', ny_tekst: '## Kort\n\nNY.' }]);
  assert.ok(ut.indexOf('NY.') >= 0);
  assert.ok(ut.indexOf('hale'.repeat(3000)) >= 0);
});
