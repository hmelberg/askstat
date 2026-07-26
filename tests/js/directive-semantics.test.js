// tests/js/directive-semantics.test.js — parse() på ny grammatikk
// (spec 2026-07-26-pythonsk-direktivsyntaks-design §4.1).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

test('parse: connect + read med kind og kanonisk vokabular', () => {
  const p = DD.parse([
    '# ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")',
    '# bef = ssb.read("05839", years="2000:2009", indicators="Personer")',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.connects, [{
    target: 'https://data.ssb.no/api/pxwebapi/v2/tables',
    alias: 'ssb', options: { kind: 'pxweb' },
  }]);
  assert.equal(p.loads.length, 1);
  assert.equal(p.loads[0].target, 'ssb/05839');
  assert.equal(p.loads[0].alias, 'bef');
  assert.equal(p.loads[0].verb, 'read');
  assert.deepEqual(p.loads[0].options.canonical,
    { years: { from: '2000', to: '2009' }, indicators: ['Personer'] });
});

test('parse: bar URL uten connect', () => {
  const p = DD.parse('# co2 = ost.read("https://ourworldindata.org/grapher/co2.csv")');
  assert.equal(p.loads[0].target, 'https://ourworldindata.org/grapher/co2.csv');
  assert.deepEqual(p.connects, []);
});

test('parse: read() uten argument gir hele rammen', () => {
  const p = DD.parse([
    '# h = ost.connect("helse2025", secret_key="ask")',
    '# df = h.read()',
  ].join('\n'));
  assert.equal(p.connects[0].options.key, 'ask');
  assert.equal(p.loads[0].target, 'h');
});

test('parse: years med åpen ende, countries som liste, all og filters', () => {
  const p = DD.parse([
    '# eu = ost.connect("https://x/", kind="eurostat")',
    '# b = eu.read("nama_10_gdp", years="2020:", countries=["NO","SE"], all=True,',
    '#              filters={"na_item": "B1GQ"})',
  ].join('\n'));
  // flerlinjede kall støttes IKKE — linje 3 skal gi feil, ikke stille dropp
  assert.ok(p.errors.length >= 1);
});

test('parse: enlinjet variant av samme', () => {
  const p = DD.parse([
    '# eu = ost.connect("https://x/", kind="eurostat")',
    '# b = eu.read("nama_10_gdp", years="2020:", countries=["NO","SE"], all=True, filters={"na_item":"B1GQ"})',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const c = p.loads[0].options.canonical;
  assert.deepEqual(c.years, { from: '2020', to: null });
  assert.deepEqual(c.countries, ['NO', 'SE']);
  assert.equal(c.all, true);
  assert.deepEqual(c.filters, { na_item: 'B1GQ' });
});

test('parse: ukjent kwarg gir did-you-mean', () => {
  const p = DD.parse('# b = ost.read("https://x/d.csv", yers="2020")');
  assert.match(p.errors[0], /linje 1.*ukjent argument «yers».*years/);
});

test('parse: gammel syntaks gir feil, ikke stille dropp', () => {
  const p = DD.parse('# read ssb/05839 as bef');
  assert.equal(p.loads.length, 0);
  assert.match(p.errors[0], /gammel syntaks/);
});

test('scrubKeys: maskerer secret_key, beholder "ask"', () => {
  assert.equal(DD.scrubKeys('# d = ost.read("u", secret_key="hemmelig")'),
                            '# d = ost.read("u", secret_key="***")');
  assert.equal(DD.scrubKeys('# d = ost.read("u", secret_key="ask")'),
                            '# d = ost.read("u", secret_key="ask")');
  assert.equal(DD.scrubKeys("# d = ost.read('u', secret_key='ask')"),
                            "# d = ost.read('u', secret_key='ask')");
});

// Hver av disse slapp gjennom en tidligere versjon av maskeringen.
test('scrubKeys: ingen hemmelighet overlever, uansett form', () => {
  [
    '# d = ost.read("u", secret_key="it\'s-a-secret")',
    '# d = ost.read("u", secret_key=\'pass"word\')',
    '# h = ost.connect("x", secret_key="sk_live_A\\\\")',   // hale-backslash
    '# h = ost.connect("x", secret_key="sk_live_B',           // glemt sluttfnutt
    '# s = ost.connect("x", secret_key="oops, x=1, secret_key="s3cr3t")',
    '# d = ost.read("u", secret_key=sk_live_C)',              // usitert
    '# d = ost.read("u", secret_key=["sk_live_D"])',          // liste
    '-- d = ost.read("u", secret_key="hemmelig")',
    '// d = ost.read("u", secret_key="hemmelig")',
  ].forEach((line) => {
    assert.doesNotMatch(DD.scrubKeys(line).replace(/secret_key/g, ''),
                        /hemmelig|s3cr3t|sk_live|pass"word/, line);
  });
});

// Omdøpingens hele poeng: `key` betyr nå KUN kolonnenavn, så maskeringen kan
// ikke lenger røre vanlig kode. Tidligere versjoner gjorde
// «sorted(rows, key=lambda r: r[0])» om til «sorted(rows, key="***"» og
// maskerte ost.create(key="pid") — som github-storage så lagret ødelagt.
test('scrubKeys: kode, prosa og create(key=) er urørt', () => {
  ['sorted(rows, key=lambda r: r[0])', 'max(items, key=lambda i: i.value)',
   "df.sort_values('col', key=abs)", 'key = c(1,2)', 'PRIMARY KEY = id',
   'api_key="ikke-vaar"', '#%% python key=1', '# the key = value mapping',
   '# panel = ost.create(key="pid")',
   '# d = ost.create(key=["kommune_nr", "year"])',
  ].forEach((line) => assert.equal(DD.scrubKeys(line), line, line));
});

test('scrubKeys: idempotent', () => {
  const once = DD.scrubKeys('# d = ost.read("u", secret_key="hemmelig")');
  assert.equal(DD.scrubKeys(once), once);
});

test('meta: note, title og ukjent nøkkel som felt', () => {
  const p = DD.parse([
    '#meta.bef.title = "Folkemengde"',
    '#meta.bef.note = "Etter alder og kjønn 2000-2009"',
    '#meta.bef.publisher = "SSB"',
    '#meta.bef.metode = "Registerdata"',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.metas.map((m) => m.kind), ['title', 'text', 'field', 'field']);
  assert.equal(p.metas[2].field, 'publisher');
  assert.equal(p.metas[3].field, 'metode');
});

test('meta: lenke som streng, tuppel og liste', () => {
  const p = DD.parse([
    '#meta.a.link = "https://x/1"',
    '#meta.b.link = "https://x/2", "To"',
    '#meta.c.link = [("https://x/3", "Tre"), ("https://x/4", "Fire")]',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const links = p.metas.filter((m) => m.kind === 'link');
  assert.equal(links.length, 4);
  assert.equal(links[0].url, 'https://x/1');
  assert.equal(links[0].label, undefined);
  assert.equal(links[1].label, 'To');
  assert.equal(links[3].url, 'https://x/4');
});

test('meta: variabelnivå og bulk labels', () => {
  const p = DD.parse([
    '#meta.bef.alder.label = "Alder i hele år"',
    '#meta.bef.labels = {"kjonn": "Kjønn", "region": "Region"}',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const labs = p.metas.filter((m) => m.kind === 'label');
  assert.deepEqual(labs.map((m) => [m.variable, m.text]),
    [['alder', 'Alder i hele år'], ['kjonn', 'Kjønn'], ['region', 'Region']]);
});

test('meta: kjent datasettnøkkel med ekstra ledd gir feil', () => {
  const p = DD.parse('#meta.bef.note.x = "y"');
  assert.match(p.errors[0], /linje 1.*«note» tar en verdi, ikke en sti/);
});

test('metaByTarget: felter, tittel og variabler', () => {
  const out = DD.metaByTarget([
    '#meta.bef.title = "Folkemengde"',
    '#meta.bef.note = "Notat"',
    '#meta.bef.publisher = "SSB"',
    '#meta.bef.link = "https://ssb.no", "Om SSB"',
    '#meta.bef.alder.label = "Alder"',
  ].join('\n'));
  assert.equal(out.bef.title, 'Folkemengde');
  assert.deepEqual(out.bef.text, ['Notat']);
  assert.deepEqual(out.bef.fields, [{ label: 'publisher', verdi: 'SSB' }]);
  assert.deepEqual(out.bef.links, [{ url: 'https://ssb.no', label: 'Om SSB' }]);
  assert.equal(out.bef.variables.alder.label, 'Alder');
});
