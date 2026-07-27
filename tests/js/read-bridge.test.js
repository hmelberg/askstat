// tests/js/read-bridge.test.js — pandas-URL-broen (plan 2026-07-27).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/data-loader.js');
require('../../js/read-bridge.js');
const RB = globalThis.ReadBridge;
const DL = globalThis.DataLoader;

test('scanUrls: finner literaler i read_csv/read_json/read_parquet', () => {
  const s = [
    'import pandas as pd',
    'iris = pd.read_csv("https://x.example/iris.csv")',
    "j = pd.read_json('https://x.example/d.json')",
    'p = pd.read_parquet("/api/hent?url=https%3A%2F%2Fy%2Fd.parquet")',
    'lokal = pd.read_csv("data/lokal.csv")',        // ikke URL — ignoreres
    'dyn = pd.read_csv(url)',                        // variabel — ignoreres (hint-prinsippet)
  ].join('\n');
  assert.deepEqual(RB.scanUrls(s), [
    'https://x.example/iris.csv',
    'https://x.example/d.json',
    '/api/hent?url=https%3A%2F%2Fy%2Fd.parquet',
  ]);
});

test('scanUrls: duplikater én gang, tom skript tom liste', () => {
  const s = 'a = pd.read_csv("https://x/a.csv")\nb = pd.read_csv("https://x/a.csv")';
  assert.deepEqual(RB.scanUrls(s), ['https://x/a.csv']);
  assert.deepEqual(RB.scanUrls(''), []);
});

test('ensure: cacher bytes; andre kall henter ikke på nytt', async () => {
  RB._reset();
  let calls = 0;
  RB._setFetcher(async (url) => { calls++; return { bytes: new Uint8Array([97]), contentType: 'text/csv' }; });
  const e1 = await RB.ensure('https://x/a.csv');
  const e2 = await RB.ensure('https://x/a.csv');
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(e1.bytes), [97]);
  assert.equal(e2, RB.getCached('https://x/a.csv'));
});

test('ensure: feil caches som {error} — aldri et kast som forsvinner', async () => {
  RB._reset();
  RB._setFetcher(async () => { throw new Error('HTTP 404 for https://x/borte.csv'); });
  const e = await RB.ensure('https://x/borte.csv');
  assert.match(e.error, /HTTP 404/);
  assert.equal(RB.getCached('https://x/borte.csv').error, e.error);
});

test('forPyodideSync: cache-treff gir bytes; feil-entry gir error', async () => {
  RB._reset();
  RB._setFetcher(async () => ({ bytes: new Uint8Array([98]), contentType: 'text/csv' }));
  await RB.ensure('https://x/b.csv');
  assert.deepEqual(Array.from(RB.forPyodideSync('https://x/b.csv').bytes), [98]);
  RB._setFetcher(async () => { throw new Error('HTTP 500 for x'); });
  await RB.ensure('https://x/feil.csv');
  assert.match(RB.forPyodideSync('https://x/feil.csv').error, /HTTP 500/);
});

test('pyPatchSource: wrapper alle tre leserne og feiler høylytt', () => {
  const src = RB.pyPatchSource();
  ['read_csv', 'read_json', 'read_parquet'].forEach((n) => assert.ok(src.includes(n), n));
  assert.ok(src.includes('ValueError'));
  assert.ok(src.includes('/api/hent?'));
});
