// tests/js/data-layer-fixes.test.js — B6 (bro-cachens permanente feil +
// tomt-vakt i sync-veien), B7 (strømmet størrelsesvakt), B14 (cache-TTL i
// minne-cachen) og F2 (ikke-ASCII i URL-er prosentkodes i broen).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
require('../../js/data-loader.js');
require('../../js/read-bridge.js');
const DL = globalThis.DataLoader;
const RB = globalThis.ReadBridge;

function csvResp(body, extra) {
  return new Response(body, { status: 200, headers: Object.assign({ 'content-type': 'text/csv' }, extra || {}) });
}

// ── B7 ──────────────────────────────────────────────────────────────────────
function endlessResp(counter, chunk) {
  const stream = new ReadableStream({
    pull(ctrl) { counter.n++; ctrl.enqueue(chunk); },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/csv' } });
}

test('B7 fetchRawUrl: kropp uten content-length avbrytes MENS den strømmes', async () => {
  DL._setMaksUttrekkBytes(1000);
  const counter = { n: 0 };
  const chunk = new TextEncoder().encode('a,b\n'.repeat(25));   // 100 B
  try {
    await assert.rejects(
      DL.fetchRawUrl('https://x.example/endeløs.csv', { fetchImpl: async () => endlessResp(counter, chunk), registry: [] }),
      /OOM/);
    assert.ok(counter.n < 30, 'leste ' + counter.n + ' biter — skulle stoppet ved taket');
  } finally { DL._setMaksUttrekkBytes(null); }
});

test('B7 fetchResolvedItems: direktiv-veien strømmer også med tak', async () => {
  DL._setMaksUttrekkBytes(1000);
  DL._resetCacheForTests();
  const counter = { n: 0 };
  const chunk = new TextEncoder().encode('a,b\n'.repeat(25));
  try {
    await assert.rejects(
      DL.fetchResolvedItems([{ alias: 'x', url: 'https://x.example/endeløs2.csv' }],
        { fetchImpl: async () => endlessResp(counter, chunk), registry: [] }),
      /OOM/);
    assert.ok(counter.n < 30);
  } finally { DL._setMaksUttrekkBytes(null); }
});

test('B7 fetchRawUrl: strømmet kropp under taket gir alle bytes', async () => {
  const out = await DL.fetchRawUrl('https://x.example/ok.csv',
    { fetchImpl: async () => csvResp('a,b\n1,2\n3,4'), registry: [] });
  assert.equal(new TextDecoder().decode(out.bytes), 'a,b\n1,2\n3,4');
});

// ── B14 ─────────────────────────────────────────────────────────────────────
test('B14 fetchResolvedItems: cache("1s") i minne-cachen utløper etter TTL', async () => {
  DL._resetCacheForTests();
  let calls = 0;
  const fetchImpl = async () => { calls++; return csvResp('a\n' + calls); };
  const item = () => ({ alias: 'x', url: 'https://x.example/ttl.csv', cache: '1s' });
  const realNow = Date.now;
  let now = 1e12;
  Date.now = () => now;
  try {
    await DL.fetchResolvedItems([item()], { fetchImpl, registry: [] });
    await DL.fetchResolvedItems([item()], { fetchImpl, registry: [] });
    assert.equal(calls, 1, 'innenfor TTL: cache-treff');
    now += 1500;
    const out = await DL.fetchResolvedItems([item()], { fetchImpl, registry: [] });
    assert.equal(calls, 2, 'etter TTL: ny henting');
    assert.equal(new TextDecoder().decode(out[0].bytes), 'a\n2');
  } finally { Date.now = realNow; }
});

test('B14 fetchResolvedItems: uten cache-opsjon gjelder minne-cachen hele økten (uendret)', async () => {
  DL._resetCacheForTests();
  let calls = 0;
  const fetchImpl = async () => { calls++; return csvResp('a\n1'); };
  const realNow = Date.now;
  let now = 1e12;
  Date.now = () => now;
  try {
    await DL.fetchResolvedItems([{ alias: 'x', url: 'https://x.example/nottl.csv' }], { fetchImpl, registry: [] });
    now += 864e5;
    await DL.fetchResolvedItems([{ alias: 'x', url: 'https://x.example/nottl.csv' }], { fetchImpl, registry: [] });
    assert.equal(calls, 1);
  } finally { Date.now = realNow; }
});

// ── B6 ──────────────────────────────────────────────────────────────────────
test('B6 forPyodideSync: cachet TOMT-feil fra prefetch respekteres — ingen ny XHR', async () => {
  RB._reset();
  RB._setFetcher((url) => DL.fetchRawUrl(url, { fetchImpl: async () => csvResp('a,b\n'), registry: [] }));
  await RB.ensure('https://x.example/tom.csv');
  let xhrCalls = 0;
  RB._setXhr(() => { xhrCalls++; return { status: 200, bytes: new Uint8Array([97, 10]) }; });
  const r = RB.forPyodideSync('https://x.example/tom.csv');
  assert.match(r.error, /TOMT/);
  assert.equal(xhrCalls, 0);
});

test('B6 forPyodideSync: cachet for-stor-feil respekteres — ingen dobbel nedlasting', async () => {
  RB._reset();
  DL._setMaksUttrekkBytes(10);
  try {
    RB._setFetcher((url) => DL.fetchRawUrl(url, { fetchImpl: async () => csvResp('a,b\n1,2\n3,4\n5,6'), registry: [] }));
    await RB.ensure('https://x.example/stor.csv');
    let xhrCalls = 0;
    RB._setXhr(() => { xhrCalls++; return { status: 200, bytes: new Uint8Array([97]) }; });
    const r = RB.forPyodideSync('https://x.example/stor.csv');
    assert.match(r.error, /OOM/);
    assert.equal(xhrCalls, 0);
  } finally { DL._setMaksUttrekkBytes(null); }
});

test('B6 forPyodideSync: transiente feil er fortsatt retrybare (regresjon)', async () => {
  RB._reset();
  RB._setFetcher(async () => { throw new Error('HTTP 503 for x (transient)'); });
  await RB.ensure('https://x.example/transient2.csv');
  RB._setXhr(() => ({ status: 200, bytes: new Uint8Array([97, 10, 49]) }));
  assert.equal(RB.forPyodideSync('https://x.example/transient2.csv').error, null);
});

test('B6 forPyodideSync: header-only CSV fra sync-XHR gir TOMT-feil, ikke tom ramme', () => {
  RB._reset();
  RB._setXhr(() => ({ status: 200, bytes: new TextEncoder().encode('a,b\n'), contentType: 'text/csv' }));
  const r = RB.forPyodideSync('https://x.example/tom2.csv');
  assert.equal(r.bytes, null);
  assert.match(r.error, /TOMT/);
  assert.equal(RB.getCached('https://x.example/tom2.csv'), null);
});

test('B6 forPyodideSync: json med én linje er IKKE tom (bare csv vaktes)', () => {
  RB._reset();
  RB._setXhr(() => ({ status: 200, bytes: new TextEncoder().encode('{"a":1}'), contentType: 'application/json' }));
  assert.equal(RB.forPyodideSync('https://x.example/d.json').error, null);
});

// ── F2: ikke-ASCII i URL-er (DST UnicodeEncodeError) ────────────────────────
test('F2 forPyodideSync: ikke-ASCII i URL-en prosentkodes før XHR', () => {
  RB._reset();
  const urls = [];
  RB._setXhr((u) => { urls.push(u); return { status: 200, bytes: new Uint8Array([97, 10, 49]) }; });
  RB.forPyodideSync('https://api.statbank.dk/v1/data/FOLK1A/CSV?OMRÅDE=101&Tid=*');
  assert.equal(urls[0], 'https://api.statbank.dk/v1/data/FOLK1A/CSV?OMR%C3%85DE=101&Tid=*');
});

test('F2 forPyodideSync: allerede kodet URL røres ikke (ingen dobbelkoding)', () => {
  RB._reset();
  const urls = [];
  RB._setXhr((u) => { urls.push(u); return { status: 200, bytes: new Uint8Array([97, 10, 49]) }; });
  RB.forPyodideSync('https://x.example/a?q=%C3%85&b=c d');
  assert.equal(urls[0], 'https://x.example/a?q=%C3%85&b=c%20d');
});

test('F2 encodeNonAscii er eksportert og idempotent', () => {
  assert.equal(RB.encodeNonAscii('https://x/ø'), 'https://x/%C3%B8');
  assert.equal(RB.encodeNonAscii(RB.encodeNonAscii('https://x/ø')), 'https://x/%C3%B8');
});
