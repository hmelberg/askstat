// tests/js/svar-loop.test.js — runSvarLoop (js/ai-chat.js): B3 (svaret må
// avsluttes med «done», ellers er det avkortet), B15 (siste SSE-hendelse
// uten avsluttende blank linje), B8 (opptatt kjøremiljø er venting, ikke
// FEIL til modellen) og F1 (direktiv-lint før kjøring).
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
};
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const aiChat = require(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'));

function sseBody(events, opts) {
  const text = events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') +
    ((opts && opts.noTrailing) ? '' : '\n\n');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
function withFetch(responses, fn) {
  const orig = global.fetch;
  const bodies = [];
  let i = 0;
  global.fetch = async (_u, init) => { bodies.push(JSON.parse(init.body)); return responses[i++](); };
  return Promise.resolve(fn(bodies)).finally(() => { global.fetch = orig; });
}

test('B3: svar med done er komplett', async () => {
  await withFetch([() => sseBody([{ type: 'delta', text: 'Hei' }, { type: 'done' }])], async () => {
    const r = await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {} });
    assert.equal(r.markdown, 'Hei');
    assert.ok(!r.truncated);
  });
});

test('B3: strøm som ender uten done er avkortet — synlig merknad, ikke ok', async () => {
  await withFetch([() => sseBody([{ type: 'delta', text: 'Halvt svar' }])], async () => {
    const r = await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {} });
    assert.equal(r.truncated, true);
    assert.match(r.markdown, /^Halvt svar/);
    assert.match(r.markdown, /avkortet|cut off/i);
  });
});

test('B3: error med code AVKORTET gir avkortet svar med tydelig melding (ikke kast)', async () => {
  await withFetch([() => sseBody([{ type: 'delta', text: 'Del' },
                                  { type: 'error', code: 'AVKORTET', message: 'max_tokens nådd' }])], async () => {
    const r = await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {} });
    assert.equal(r.truncated, true);
    assert.equal(r.truncatedCode, 'AVKORTET');
    assert.match(r.markdown, /max_tokens nådd/);
  });
});

test('B3: andre error-hendelser kaster fortsatt', async () => {
  await withFetch([() => sseBody([{ type: 'error', message: 'boom' }])], async () => {
    await assert.rejects(aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {} }), /boom/);
  });
});

test('B15: siste hendelse uten avsluttende blank linje leses (done)', async () => {
  await withFetch([() => sseBody([{ type: 'delta', text: 'X' }, { type: 'done' }], { noTrailing: true })], async () => {
    const r = await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {} });
    assert.equal(r.markdown, 'X');
    assert.ok(!r.truncated);
  });
});

test('F1: direktivfeil gir strukturert FEIL til modellen, scriptet kjøres ikke', async () => {
  let ran = false;
  await withFetch([
    () => sseBody([{ type: 'run_code', script: 'import pandas as pd\n# df = ost.read(42)\nprint(df)' },
                   { type: 'continue', state: 's1' }]),
    () => sseBody([{ type: 'delta', text: 'ok' }, { type: 'done' }]),
  ], async (bodies) => {
    const r = await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {
      onRunCode: async () => { ran = true; return 'OK'; },
    } });
    assert.equal(ran, false);
    const rr = bodies[1].run_result;
    assert.match(String(rr), /^FEIL:/);
    assert.match(String(rr), /[Dd]irektivfeil/);
    assert.match(String(rr), /linje 2/);
    assert.equal(r.markdown, 'ok');
  });
});

test('F1: gyldige direktiver og vanlige kommentarer slipper gjennom', async () => {
  let ran = false;
  await withFetch([
    () => sseBody([{ type: 'run_code', script: '# seen.add(x)\n# df = ost.read("https://x/y.csv")' },
                   { type: 'continue', state: 's1' }]),
    () => sseBody([{ type: 'done' }]),
  ], async () => {
    await aiChat.runSvarLoop({ question: 'q', mode: 'python', handlers: {
      onRunCode: async () => { ran = true; return 'OK'; },
    } });
    assert.equal(ran, true);
  });
});

test('directiveLintFeil: ren funksjon', () => {
  assert.equal(aiChat.directiveLintFeil('print(1)'), null);
  assert.match(aiChat.directiveLintFeil('# x = ost.bogus("a")'), /linje 1: ukjent verb/);
});

test('B8: opptatt kjøremiljø ventes ut før run_code (ingen FEIL til modellen)', async () => {
  let busy = 3;
  global.mdIsScriptRunning = () => busy-- > 0;
  const progress = [];
  try {
    await withFetch([
      () => sseBody([{ type: 'run_code', script: 'print(1)' }, { type: 'continue', state: 's' }]),
      () => sseBody([{ type: 'done' }]),
    ], async (bodies) => {
      await aiChat.runSvarLoop({ question: 'q', mode: 'python', _pollMs: 1, handlers: {
        onRunCode: async () => 'OK. OUTPUT:\n1',
        onProgress: (ev) => progress.push(ev.text),
      } });
      assert.equal(bodies[1].run_result, 'OK. OUTPUT:\n1');
    });
  } finally { delete global.mdIsScriptRunning; }
});
