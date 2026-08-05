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

// Matte-maskering (2026-08-01): markdown-it spiste `}_{`-underscorene i en
// \underbrace-ligning som emphasis før KaTeX fikk se teksten.
test('maskMathSegments: $$-blokk maskeres helt — ingen _ igjen for markdown-it', () => {
  const eq = '$$\\text{Fortell} \\iff \\underbrace{S \\cdot \\text{nytte}}_{\\text{gevinst}} > \\underbrace{K}_{\\text{skade}}$$';
  const m = askView.maskMathSegments('Før\n\n' + eq + '\n\nEtter');
  assert.strictEqual(m.segs.length, 1);
  assert.strictEqual(m.segs[0], eq);
  assert.ok(m.masked.indexOf('_') < 0);
  assert.ok(m.masked.indexOf('$') < 0);
});

test('restoreMathSegments: segmentet gjeninnsettes uskadd selv om rendereren tuklet rundt', () => {
  const eq = '$$\\underbrace{a}_{b} > \\underbrace{c}_{d}$$';
  const m = askView.maskMathSegments(eq);
  const html = '<p><em>' + m.masked + '</em></p>';   // renderer pakket plassholderen inn
  const out = askView.restoreMathSegments(html, m.segs);
  assert.ok(out.indexOf('}_{b}') >= 0 && out.indexOf('}_{d}') >= 0);
});

test('restoreMathSegments: HTML-escaper LaTeX med < og &', () => {
  const m = askView.maskMathSegments('$a < b \\& c$');
  assert.strictEqual(askView.restoreMathSegments(m.masked, m.segs), '$a &lt; b \\&amp; c$');
});

test('maskMathSegments: flere segmenter, inline krysser ikke linjer, tall i prosa urørt', () => {
  const m = askView.maskMathSegments('Pris 100 kr. $x_1$ og\n$$y_2$$ men $ikke\nover linjer$.');
  assert.strictEqual(m.segs.length, 2);
  assert.ok(m.masked.indexOf('100 kr') >= 0);
  const out = askView.restoreMathSegments(m.masked, m.segs);
  assert.ok(out.indexOf('$x_1$') >= 0 && out.indexOf('$$y_2$$') >= 0);
  assert.ok(out.indexOf('100 kr') >= 0);
});

test('parseAskRoute: utforsk er gyldig rute', () => {
  assert.strictEqual(askView.parseAskRoute('{"rute":"utforsk","tolkning":"x"}').rute, 'utforsk');
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

test('coerceAskDepth: deep er default, kun eksplisitt standard er standard', () => {
  assert.equal(askView.coerceAskDepth('deep'), 'deep');
  assert.equal(askView.coerceAskDepth('standard'), 'standard');
  assert.equal(askView.coerceAskDepth('fast'), 'deep');
  assert.equal(askView.coerceAskDepth(null), 'deep');
});

test('assignRefs: nummerering per klasse i dokumentrekkefølge', () => {
  const refs = askView.assignRefs([
    { kind: 'plotly' }, { kind: 'table' }, { kind: 'png' },
    { kind: 'tabulator' }, { kind: 'controls' }]);
  assert.deepStrictEqual(refs.map(r => r.ref),
    ['fig:1', 'table:1', 'fig:2', 'table:2', 'controls:1']);
  assert.deepStrictEqual(refs.map(r => r.idx), [0, 1, 2, 3, 4]);
});

test('assignRefs: anker opptar nummeret sitt', () => {
  // fig:1 er flyttet ut (anker står igjen) → neste fig blir fig:2
  const refs = askView.assignRefs([{ anchor: 'fig:1' }, { kind: 'plotly' }]);
  assert.deepStrictEqual(refs.map(r => r.ref), ['fig:2']);
  assert.strictEqual(refs[0].idx, 1);
});

test('assignRefs: anker med høyt nummer + ukjent kind hoppes over', () => {
  const refs = askView.assignRefs([
    { kind: 'plotly' }, { anchor: 'fig:2' }, { kind: 'png' }, {}, { anchor: 'tull' }]);
  assert.deepStrictEqual(refs.map(r => r.ref), ['fig:1', 'fig:3']);
});

test('formatOutputsManifest: parentes kun når kind ≠ klasse', () => {
  assert.strictEqual(askView.formatOutputsManifest([]), '');
  assert.strictEqual(
    askView.formatOutputsManifest(askView.assignRefs([
      { kind: 'plotly' }, { kind: 'table' }, { kind: 'tabulator' }])),
    'OUTPUTS: fig:1 (plotly), table:1, table:2 (tabulator)');
});

test('stripRefs: plassholder-alene-linjer → klammetekst', () => {
  assert.strictEqual(askView.stripRefs('a\n{{fig:1}}\n tekst {{fig:2}} inni\n{{table:3}} \nb'),
    'a\n[fig 1]\n tekst {{fig:2}} inni\n[table 3]\nb');
  assert.strictEqual(askView.stripRefs(null), '');
});

test('planRefResolution: først-vinner, ukjent droppes', () => {
  assert.deepStrictEqual(
    askView.planRefResolution(['fig:1', 'table:1'], ['fig:1', 'fig:1', 'fig:9', 'table:1']),
    [{ ref: 'fig:1', action: 'resolve' },
     { ref: 'fig:1', action: 'drop-dup' },
     { ref: 'fig:9', action: 'drop-unknown' },
     { ref: 'table:1', action: 'resolve' }]);
});

test('badgeFor: tre tilstander', () => {
  assert.equal(askView.badgeFor([true]), 'ok');
  assert.equal(askView.badgeFor([false, true]), 'ok');
  assert.equal(askView.badgeFor([true, false]), 'feilet-etter-suksess');
  assert.equal(askView.badgeFor([true, true, false, false]), 'feilet-etter-suksess');
  assert.equal(askView.badgeFor([false]), 'feilet');
  assert.equal(askView.badgeFor([false, false]), 'feilet');
  assert.equal(askView.badgeFor([]), 'ok');   // konvensjon; kalleren når aldri hit (ranAny-gate)
});
