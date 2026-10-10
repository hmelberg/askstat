// tests/js/sw-cache.test.js — service-workeren skal BARE legge uforanderlige,
// versjonspinnede bibliotek-URL-er i Cache Storage. Brukerdata
// (cdn.jsdelivr.net/gh/…, også @<sha>) og muterbare oppslag (@main,
// pypi.org-JSON, webR-indeksen) skal aldri havne der (portet fra microdata
// 2e05f06, review 2026-10-10). Lokale .py-filer går network-first så en
// deploy aldri gir versjonsskjev Python-kjerne.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSw(fetchImpl) {
  const listeners = {};
  const store = new Map();
  const ctx = {
    URL, Request: class { constructor(u) { this.url = u; } }, Set, RegExp, String, Promise,
    self: { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://app.example' } },
    caches: {
      open: async () => ({
        match: async (r) => store.get(typeof r === 'string' ? r : r.url) || null,
        put: async (r, res) => { store.set(typeof r === 'string' ? r : r.url, res); },
      }),
      keys: async () => [],
    },
    fetch: fetchImpl || (async () => ({ ok: true, clone() { return this; } })),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8'), ctx);
  return { ctx, listeners, store };
}

function dispatch(listeners, url) {
  let p = null;
  listeners.fetch({ request: { method: 'GET', url }, respondWith: (x) => { p = Promise.resolve(x); p.catch(() => {}); } });
  return p;
}

test('sw: pinnede bibliotek-URL-er caches (cache-first)', () => {
  const { listeners } = loadSw();
  for (const u of [
    'https://cdn.jsdelivr.net/pyodide/v314.0.2/full/pyodide.js',
    'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js',
    'https://cdn.plot.ly/plotly-2.32.0.min.js',
    'https://files.pythonhosted.org/packages/ab/cd/pkg-1.0-py3-none-any.whl',
    'https://webr.r-wasm.org/v0.4.2/webr.mjs',
    'https://repo.r-wasm.org/bin/emscripten/contrib/4.4/jmv_2.5.6.tgz',
    'https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.4/require.min.js',
  ]) assert.ok(dispatch(listeners, u), u);
});

test('sw: brukerdata og muterbare refs fanges aldri opp eller caches', () => {
  const { listeners } = loadSw();
  for (const u of [
    'https://cdn.jsdelivr.net/gh/someone/data@main/people.csv',
    'https://cdn.jsdelivr.net/gh/someone/data@0123abc/people.csv',
    'https://cdn.jsdelivr.net/gh/someone/data@1.2.3/people.csv',
    'https://cdn.jsdelivr.net/npm/foo@latest/x.js',
    'https://cdn.jsdelivr.net/npm/foo@1/x.js',
    'https://pypi.org/pypi/polars/json',
    'https://webr.r-wasm.org/latest/webr.mjs',
    'https://repo.r-wasm.org/bin/emscripten/contrib/4.4/PACKAGES',
    'https://raw.githubusercontent.com/someone/data/main/x.csv',
  ]) assert.equal(dispatch(listeners, u), null, u);
});

test('sw: ingen network-first runtime-cache for CDN igjen', () => {
  const { ctx } = loadSw();
  assert.equal(typeof ctx.networkFirst, 'undefined');
});

test('sw: lokal .py går network-first — ferskt svar vinner over cachet kopi', async () => {
  let n = 0;
  const { listeners, store } = loadSw(async () => ({ ok: true, body: 'ny' + (++n), clone() { return this; } }));
  const u = 'https://app.example/openstat.py?v=1';
  store.set(u, { ok: true, body: 'gammel' });
  const res = await dispatch(listeners, u);
  assert.equal(res.body, 'ny1');
});

test('sw: lokal .py faller tilbake til cachet kopi når nettet feiler', async () => {
  const { listeners, store } = loadSw(async () => { throw new Error('offline'); });
  const u = 'https://app.example/openstat.py?v=1';
  store.set(u, { ok: true, body: 'gammel' });
  const res = await dispatch(listeners, u);
  assert.equal(res.body, 'gammel');
});
