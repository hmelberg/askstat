// tests/js/sidebar-typemeta.test.js — SidebarTypemeta (js/sidebar-typemeta.js):
// typemeta (ost_typemeta-formen) -> panel-rad-HTML og utvidbar nivåliste-HTML.
// Spec: docs/superpowers/specs/2026-07-28-metadata-runden-design.md §1.
// Mønster fra meta-info-testene (samme escaping-regler, modellen OG HTML).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/sidebar-typemeta.js');
const SidebarTypemeta = globalThis.SidebarTypemeta;

const tm = {
  dims: { Region: { label: 'region', labels: { '0301': 'Oslo', '1103': 'Stavanger' } } },
  units: { verdi: { base: 'antall' } },
  time: ['Tid'],
  metric: []
};

test('varRow: navn — etikett · dtype, toggle når labels finnes', () => {
  const html = SidebarTypemeta.varRow('Region', 'category', tm);
  for (const n of ['Region', 'region', 'category', '▸']) assert.ok(html.includes(n), n);
  assert.ok(!SidebarTypemeta.varRow('Tid', 'int64', tm).includes('▸'));  // ingen labels → ingen toggle
});

test('varRow: unit hektes på når units bærer en oppføring for kolonnen', () => {
  const html = SidebarTypemeta.varRow('verdi', 'float64', tm);
  assert.ok(html.includes('antall'));
  assert.ok(html.includes('float64'));
});

test('varRow: kolonne uten dims-oppføring -> kun navn · dtype, ingen toggle/label', () => {
  const html = SidebarTypemeta.varRow('ukjent', 'object', tm);
  assert.ok(html.includes('ukjent'));
  assert.ok(html.includes('object'));
  assert.ok(!html.includes('▸'));
  assert.ok(!html.includes(' — '));
});

test('varRow: escaper navn/etikett/dtype (XSS-vern, samme regler som meta-info)', () => {
  const evilTm = { dims: { X: { label: '<b>lbl</b>', labels: {} } } };
  const html = SidebarTypemeta.varRow('<script>', 'ty<pe', evilTm);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('levelList: første 20 + «+N flere», escaping', () => {
  const many = { dims: { X: { labels: Object.fromEntries(
    Array.from({length: 25}, (_, i) => ['k' + i, '<b>' + i]) ) } } };
  const html = SidebarTypemeta.levelList(many, 'X');
  assert.ok(html.includes('+5 flere'));
  assert.ok(html.includes('&lt;b&gt;'));   // aldri rå HTML fra etiketter
  assert.ok(!html.includes('<b>0'));
});

test('levelList: koden vises rå i <code>, teksten (etiketten) escapes separat', () => {
  const html = SidebarTypemeta.levelList(tm, 'Region');
  assert.ok(html.includes('<code>0301</code>'));
  assert.ok(html.includes('Oslo'));
  assert.ok(html.includes('<code>1103</code>'));
  assert.ok(html.includes('Stavanger'));
  assert.ok(!html.includes('+'));  // under 20 nivåer -> ingen "+N flere"
});

test('levelList: ingen dims-oppføring/ingen labels -> tom streng', () => {
  assert.strictEqual(SidebarTypemeta.levelList(tm, 'ukjent'), '');
  assert.strictEqual(SidebarTypemeta.levelList({}, 'Region'), '');
  assert.strictEqual(SidebarTypemeta.levelList(null, 'Region'), '');
});

test('levelList: data-tm-levels bærer (escapet) kolonnenavn for toggle-kobling', () => {
  const html = SidebarTypemeta.levelList(tm, 'Region');
  assert.ok(html.includes('data-tm-levels="Region"'));
});

// Fiks (spec-avvik målt live 2026-07-28): Object.keys(labels) reordrer
// heltallslignende strengnøkler («1103» foran «0301») — kildens orden bor i
// categories-ARRAYEN, som er hele poenget med den i kontrakten.
test('levelList: kildens orden fra categories-arrayen, ikke Object.keys(labels)', () => {
  const t = { dims: { Region: {
    categories: ['0301', '1103'],
    // labels satt inn i MOTSATT rekkefølge — og «1103» er en heltallslignende
    // nøkkel JS uansett ville reordret foran «0301» i Object.keys.
    labels: { '1103': 'Halden', '0301': 'Oslo' }
  } } };
  const html = SidebarTypemeta.levelList(t, 'Region');
  const posOslo = html.indexOf('<code>0301</code> Oslo');
  const posHalden = html.indexOf('<code>1103</code> Halden');
  assert.ok(posOslo >= 0 && posHalden >= 0);
  assert.ok(posOslo < posHalden, '0301 Oslo skal vises FØR 1103 Halden');
});

test('levelList: kode i categories uten label vises som kode alene; fallback til labels-nøkler når categories mangler', () => {
  const t = { dims: { X: { categories: ['a', 'b'], labels: { a: 'Alfa' } } } };
  const html = SidebarTypemeta.levelList(t, 'X');
  assert.ok(html.includes('<code>a</code> Alfa'));
  assert.ok(html.includes('<code>b</code>'));
  // Uten categories: Object.keys(labels)-fallbacken (dagens vei) beholdes.
  const noCats = { dims: { Y: { labels: { k1: 'En', k2: 'To' } } } };
  const html2 = SidebarTypemeta.levelList(noCats, 'Y');
  assert.ok(html2.includes('<code>k1</code> En'));
  assert.ok(html2.includes('<code>k2</code> To'));
});

test('levelList: «+N flere» regnes over categories-lengden når categories finnes', () => {
  const codes = Array.from({length: 25}, (_, i) => 'c' + String(i).padStart(2, '0'));
  const labels = Object.fromEntries(codes.map((c) => [c, 'L' + c]));
  const t = { dims: { X: { categories: codes, labels: labels } } };
  const html = SidebarTypemeta.levelList(t, 'X');
  assert.ok(html.includes('+5 flere'));
  assert.ok(html.includes('<code>c00</code> Lc00'));
  assert.ok(!html.includes('<code>c20</code>'));  // kuttes ved 20
});

// Fiks (spec-avvik målt live 2026-07-28): tm.units er keyet på metric-KODE
// («Personer»), kolonnen heter bokstavelig «value» — direkte oppslag treffer
// aldri mot ekte registerdata. Regel uten gjetting: value-kolonnen får unit
// KUN når units har nøyaktig ÉN oppføring; flertydig → ingenting.
test('varRow: value-kolonnen får unit ved NØYAKTIG ÉN units-oppføring (metric-kode-nøkkel)', () => {
  const t = { dims: {}, units: { Personer: { base: 'antall' } }, time: [], metric: [] };
  const html = SidebarTypemeta.varRow('value', 'int64', t);
  assert.ok(html.includes('· antall'));
});

test('varRow: value-kolonnen får INGEN unit når units er flertydig (flere oppføringer)', () => {
  const t = { dims: {}, units: { Personer: { base: 'antall' }, Prosent: { base: 'prosent' } }, time: [], metric: [] };
  const html = SidebarTypemeta.varRow('value', 'int64', t);
  assert.ok(!html.includes('antall'));
  assert.ok(!html.includes('prosent'));
});

test('varRow: direkte units-nøkkel for kolonnenavnet vinner fortsatt (dagens vei beholdt)', () => {
  const t = { dims: {}, units: { verdi: { base: 'kroner' }, Personer: { base: 'antall' } }, time: [], metric: [] };
  const html = SidebarTypemeta.varRow('verdi', 'float64', t);
  assert.ok(html.includes('· kroner'));
  assert.ok(!html.includes('antall'));
});
