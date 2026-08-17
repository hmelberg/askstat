// tests/js/motor-output.test.js — kodesak A (eval-r12,
// docs/eval/2026-08-18-harness.md §5): motor-side stdout-fangst for
// run_code. Målt: DOM-innerText er synlighetsavhengig — i svarvisningen
// (checkVisibility()=false) forsvant selv print() fra run_code-resultatet,
// og figurdata-blokken var usynlig for både modell og vern tross bevist
// riktig motor. Kuren: mdAskExecuteScript leser motorens rå stdout
// (lastOutput via window.mdSisteKjoringStdout) i stedet for DOM-tekst.
// Rå stdout inneholder embed-payloads på flere hundre KB (r12 målte en
// figur på 636 KB JSON) — motorOutputTilModelltekst beholder tekstdeler
// ordrett og erstatter embeds med en kompakt markør. Samme
// markørkonvensjon som parseOutput i index.html
// (__micro_transform_start_<type>__ … __micro_transform_end__).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const AI_CHAT_PATH = path.join(__dirname, '..', '..', 'js', 'ai-chat.js');

global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelectorAll: function () { return []; },
};

const aiChat = require(AI_CHAT_PATH);
const f = aiChat.motorOutputTilModelltekst;

const S = '__micro_transform_start_';
const E = '__micro_transform_end__';

test('ren tekst passerer uendret', () => {
  assert.strictEqual(f('Folketall 2024: 724290\n'), 'Folketall 2024: 724290\n');
});

test('tom/null gir tom streng', () => {
  assert.strictEqual(f(''), '');
  assert.strictEqual(f(null), '');
  assert.strictEqual(f(undefined), '');
});

test('figur-embed erstattes med markør, teksten rundt beholdes', () => {
  // Akkurat r12-blindhetens form: figurdata-blokken printet FØR embedden
  const raw = 'Figurdata (auto-utskrift av figurens datapunkter):\n' +
    'Nord  42\nSør  17\n' +
    S + 'figure__\n{"data":[{"x":["Nord","Sør"],"y":[42,17]}]}\n' + E +
    '\nferdig-markør\n';
  const ut = f(raw);
  assert.ok(ut.includes('Figurdata'), 'figurdata-blokken må overleve');
  assert.ok(ut.includes('Nord  42'), 'datapunktlinjene må overleve');
  assert.ok(ut.includes('ferdig-markør'), 'tekst etter embedden må overleve');
  assert.ok(!ut.includes('"data":['), 'payload-JSON skal ALDRI med');
  assert.ok(ut.includes('[figure-embed vist i output]'), 'kompakt markør i stedet');
});

test('markdown-embed ER lesbar tekst og beholdes som tekst', () => {
  const raw = S + 'markdown__\n## Overskrift\nBrødtekst her.\n' + E;
  const ut = f(raw);
  assert.ok(ut.includes('## Overskrift'));
  assert.ok(ut.includes('Brødtekst her.'));
  assert.ok(!ut.includes(S));
});

test('flere embeds i samme output håndteres alle', () => {
  const raw = 'a\n' + S + 'figure__\n{"x":1}\n' + E +
    'b\n' + S + 'png__\nAAAA\n' + E + 'c\n';
  const ut = f(raw);
  assert.ok(ut.includes('a\n') && ut.includes('b\n') && ut.includes('c\n'));
  assert.ok(ut.includes('[figure-embed vist i output]'));
  assert.ok(ut.includes('[png-embed vist i output]'));
  assert.ok(!ut.includes('AAAA'));
});

test('avkuttet embed (mangler sluttmarkør) gir ærlig markør og stopper', () => {
  // Samme klasse som parseOutput håndterer: kjøring avbrutt midt i
  // embed-printen — ingen sluttmarkør, resten av strømmen er payload
  const raw = 'tekst før\n' + S + 'figure__\n{"data":[1,2,';
  const ut = f(raw);
  assert.ok(ut.includes('tekst før'));
  assert.ok(ut.includes('[figure-embed avkuttet]'));
  assert.ok(!ut.includes('{"data"'));
});
