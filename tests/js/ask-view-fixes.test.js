// tests/js/ask-view-fixes.test.js — B15 (sseAccumulate flusher siste
// hendelse ved strømslutt) og F3 (proveniens-/ferskhetslinje per svar).
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

function sse(text) { return new Response(text, { status: 200 }); }

test('B15 sseAccumulate: siste hendelse uten avsluttende blank linje tas med', async () => {
  const out = await askView.sseAccumulate(sse('data: {"type":"text","text":"a"}\n\ndata: {"type":"text","text":"b"}'));
  assert.equal(out, 'ab');
});

test('B15 sseAccumulate: siste error-hendelse uten blank linje avviser', async () => {
  await assert.rejects(askView.sseAccumulate(sse('data: {"type":"text","text":"a"}\n\ndata: {"type":"error","message":"x"}')), /x/);
});

test('B15 sseAccumulate: vanlig avsluttet strøm er uendret', async () => {
  assert.equal(await askView.sseAccumulate(sse('data: {"type":"text","text":"a"}\n\n')), 'a');
});

test('F3 formatProvenance: hentetid + oppdatert-dato der kilden oppgir den', () => {
  const at = new Date(2026, 9, 10, 14, 3).getTime();
  const line = askView.formatProvenance([
    { url: 'https://data.ssb.no/api/pxwebapi/v2/tables/05839', fetchedAt: at, updated: '2026-02-12T07:00:00Z' },
    { url: 'https://x.example/d.csv', fetchedAt: at - 60000, updated: null },
  ]);
  assert.match(line, /2026-10-10 14:02/);   // eldste hentetid
  assert.match(line, /data\.ssb\.no.*05839.*2026-02-12/);
  assert.doesNotMatch(line, /x\.example.*updated/);
});

test('F3 formatProvenance: tom liste gir null; mange kilder kappes', () => {
  assert.equal(askView.formatProvenance([]), null);
  const many = Array.from({ length: 9 }, (_, i) => ({ url: 'https://h/' + i, fetchedAt: 1, updated: '2026-01-0' + (i % 9 + 1) }));
  const line = askView.formatProvenance(many);
  assert.ok((line.match(/updated/g) || []).length <= 3);
  assert.match(line, /\+6/);
});
