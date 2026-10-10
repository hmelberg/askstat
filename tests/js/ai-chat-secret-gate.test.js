// tests/js/ai-chat-secret-gate.test.js — AI-sidepanelets run_code-vei skal
// ha samme S3-port som Ask: kode som når nettleserlagring/JS-broen krever
// ALLTID eksplisitt ja, også når md_ai_autorun='1' eller brukeren allerede
// har sagt ja én gang. Mønstrene bor KUN i js/ask-view.js (scanSecretAccess,
// eksponert som window.mdScanSecretAccess) — ai-chat.js gjenbruker dem.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelectorAll: function () { return []; },
  documentElement: { classList: { contains: function () { return false; } } },
};

const aiChat = require(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'));
const askView = require(path.join(__dirname, '..', '..', 'js', 'ask-view.js'));

test('ask-view eksponerer scanSecretAccess på window for ai-chat.js', () => {
  assert.strictEqual(window.mdScanSecretAccess, askView.scanSecretAccess);
});

test('panelRunDecision: vanlig kode, første kjøring → vanlig bekreftelse', () => {
  const d = aiChat.panelRunDecision('print(1)', { confirmed: false, autorun: false });
  assert.deepStrictEqual(d, { prompt: true, hits: [] });
});

test('panelRunDecision: vanlig kode etter ja / med autorun → ingen prompt', () => {
  assert.deepStrictEqual(aiChat.panelRunDecision('print(1)', { confirmed: true, autorun: false }), { prompt: false, hits: [] });
  assert.deepStrictEqual(aiChat.panelRunDecision('print(1)', { confirmed: false, autorun: true }), { prompt: false, hits: [] });
});

test('panelRunDecision: hemmelighets-treff krever ALLTID prompt', () => {
  const d1 = aiChat.panelRunDecision('import js\nprint(js.localStorage.getItem("k"))', { confirmed: true, autorun: true });
  assert.strictEqual(d1.prompt, true);
  assert.ok(d1.hits.indexOf('localStorage') >= 0);
  assert.ok(d1.hits.indexOf('import js') >= 0);
  const d2 = aiChat.panelRunDecision('x <- document.cookie', { confirmed: false, autorun: true });
  assert.strictEqual(d2.prompt, true);
  assert.deepStrictEqual(d2.hits, ['document.cookie']);
});

test('panelRunDecision: uten scanner (ask-view ikke lastet) → fail-closed til prompt', () => {
  const saved = window.mdScanSecretAccess;
  delete window.mdScanSecretAccess;
  try {
    const d = aiChat.panelRunDecision('print(1)', { confirmed: true, autorun: true });
    assert.strictEqual(d.prompt, true);
  } finally {
    window.mdScanSecretAccess = saved;
  }
});
