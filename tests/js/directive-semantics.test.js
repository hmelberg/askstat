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
    '# h = ost.connect("helse2025", key="ask")',
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

test('scrubKeys: maskerer key="literal", beholder key="ask"', () => {
  assert.equal(DD.scrubKeys('# d = ost.read("u", key="hemmelig")'),
                            '# d = ost.read("u", key="***")');
  assert.equal(DD.scrubKeys('# d = ost.read("u", key="ask")'),
                            '# d = ost.read("u", key="ask")');
});
