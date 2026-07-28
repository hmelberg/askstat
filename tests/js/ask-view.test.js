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

test('buildAskProvenance: python-kommentarer med alle felt', () => {
  const s = askView.buildAskProvenance(
    { question: 'Hvor mye bruker Norge på helse?', tolkning: 'helseutgifter i % av BNP, 2024', rute: 'data' },
    'python');
  assert.ok(s.startsWith('# ══ ask ══'));
  assert.ok(s.includes('# Spørsmål: Hvor mye bruker Norge på helse?'));
  assert.ok(s.includes('# Tolkning: helseutgifter i % av BNP, 2024'));
  assert.ok(s.includes('# Rute: data'));
  assert.ok(s.endsWith('\n\n'));
});

test('buildAskProvenance: duckdb bruker -- og flerlinjespørsmål brekkes til én linje', () => {
  const s = askView.buildAskProvenance({ question: 'a\nb', tolkning: 't', rute: 'data' }, 'duckdb');
  assert.ok(s.startsWith('-- ══ ask ══'));
  assert.ok(s.includes('-- Spørsmål: a b'));
});
