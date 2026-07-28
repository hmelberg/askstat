// tests/js/ask-view.test.js — rene funksjoner i ask-visningen (ruter-JSON +
// proveniens-kommentar). js/ask-view.js er en nettleser-IIFE med samme
// module.exports-seam og document-stubb-mønster som ai-chat-validators.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: function () {},
  getElementById: function () { return null; },
  documentElement: { classList: { contains: function () { return false; } } },
};

const askView = require(path.join(__dirname, '..', '..', 'js', 'ask-view.js'));

test('parseAskRoute: ren JSON', () => {
  const r = askView.parseAskRoute('{"rute":"beregning","tolkning":"antall r i ordet","begrunnelse":"alt i spørsmålet"}');
  assert.strictEqual(r.rute, 'beregning');
  assert.strictEqual(r.tolkning, 'antall r i ordet');
});

test('parseAskRoute: JSON pakket i tekst og kodeblokk', () => {
  const r = askView.parseAskRoute('Her er svaret:\n```json\n{"rute":"språk","tolkning":"x","svar":"Direkte svar."}\n```');
  assert.strictEqual(r.rute, 'språk');
  assert.strictEqual(r.svar, 'Direkte svar.');
});

test('parseAskRoute: ugyldig rute og søppel faller tilbake til data', () => {
  assert.strictEqual(askView.parseAskRoute('{"rute":"kausal","tolkning":"x"}').rute, 'data');
  assert.strictEqual(askView.parseAskRoute('ikke json i det hele tatt').rute, 'data');
  assert.strictEqual(askView.parseAskRoute('').tolkning, '');
});

test('buildAskProvenance: python — engelske etiketter, echo-av-direktiv, alle felt', () => {
  const s = askView.buildAskProvenance(
    { question: 'Does Norway spend more on health?', tolkning: 'health spending as % of GDP, 2024', rute: 'data' },
    'python');
  assert.ok(s.startsWith('# ══ ask ══'));
  assert.ok(s.includes('# Question: Does Norway spend more on health?'));
  assert.ok(s.includes('# Interpretation: health spending as % of GDP, 2024'));
  assert.ok(s.includes('# Route: data'));
  assert.ok(s.includes('#options.show_commands=False'));
  assert.ok(s.endsWith('\n\n'));
});

test('buildAskProvenance: r får også echo-av-direktivet', () => {
  const s = askView.buildAskProvenance({ question: 'q', tolkning: 't', rute: 'data' }, 'r');
  assert.ok(s.includes('#options.show_commands=False'));
});

test('buildAskProvenance: duckdb bruker --, ikke echo-direktiv, flerlinje flates ut', () => {
  const s = askView.buildAskProvenance({ question: 'a\nb', tolkning: 't', rute: 'data' }, 'duckdb');
  assert.ok(s.startsWith('-- ══ ask ══'));
  assert.ok(s.includes('-- Question: a b'));
  assert.ok(!s.includes('show_commands'));
});
