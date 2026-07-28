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
