// Kontosynk (konto-runden fase 2): tre dokumenter mot /userdoc/:name.
// Bruker EKTE lagerfabrikker (profiles/ask-history) og ekte krypto —
// fetch/auth/storage er fakes injisert via _configure.
const test = require('node:test');
const assert = require('node:assert');
const KontoSync = require('../../js/konto-sync.js');
const { makeProfiles } = require('../../js/profiles.js');
const { makeStore } = require('../../js/ask-history.js');
const { makeKeysCrypto } = require('../../js/keys-crypto.js');

const KC = makeKeysCrypto(globalThis.crypto);
const KEK = 'ab'.repeat(32); // 64 hex — ferdig avledet KEK (derive testes i keys-crypto)

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
function fakeKeys(updated) {
  let doc = {};
  let upd = updated || '';
  const listeners = [];
  return {
    getAll: () => doc,
    replaceAll: (o, u) => { doc = o || {}; if (u) upd = u; },
    updatedAt: () => upd,
    onChange: (cb) => listeners.push(cb),
    _set: (k, v) => { doc[k] = v; upd = '2026-08-05T10:00:00.000Z'; listeners.forEach((f) => f()); },
  };
}
function fakeFetch(responses) {
  const posts = {};
  const impl = async (url, opts) => {
    const name = url.split('/userdoc/')[1];
    if (opts && opts.method === 'POST') {
      (posts[name] = posts[name] || []).push(JSON.parse(JSON.parse(opts.body).doc));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (responses[name] === 401) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (responses[name] || { doc: null, updated: null }) };
  };
  return { impl, posts };
}
function makeDeps(overrides) {
  const now = (() => { let i = 0; return () => `2026-08-05T09:00:${String(i++).padStart(2, '0')}.000Z`; })();
  return Object.assign({
    auth: { isLoggedIn: true, token: 'tok', user: { email: 'h@x.no' }, apiBase: () => 'https://api.test' },
    keys: fakeKeys(''),
    profiles: makeProfiles(fakeStorage(), { now }),
    history: makeStore(fakeStorage(), { now }),
    crypto: KC,
    kekPrompt: null,
    storage: fakeStorage({ md_kek: KEK, md_kek_id: 'deadbeef' }),
    onUnauthorized: () => {},
  }, overrides || {});
}

test('off når utlogget', async () => {
  KontoSync._configure(makeDeps({ auth: { isLoggedIn: false } }), 1);
  assert.equal(await KontoSync.syncNow(), 'off');
});

test('tom server + tomme lagre → ingen push; lokalt innhold → push uten markdown', async () => {
  const f = fakeFetch({});
  const d = makeDeps({ fetchImpl: f.impl });
  KontoSync._configure(d, 1);
  await KontoSync.syncNow();
  assert.equal(f.posts.profiles, undefined);          // tomt → ikke pushet
  assert.equal(f.posts.history, undefined);
  d.profiles.create('OECD only', 'Use only OECD.');
  d.history.save({ question: 'q', markdown: 'HEMMELIG SVARTEKST', script: 's' });
  await KontoSync.syncNow();
  assert.equal(f.posts.profiles.length, 1);
  assert.equal(f.posts.history.length, 1);
  const pushedHist = JSON.stringify(f.posts.history[0]);
  assert.ok(!pushedHist.includes('HEMMELIG'));        // markdown ALDRI til server
  assert.ok(pushedHist.includes('"script":"s"'));
});

test('merge ved login: remote profiler kommer inn, union pushes', async () => {
  const remoteProfiles = makeProfiles(fakeStorage(), {
    now: (() => { let i = 0; return () => `2026-08-04T00:00:${String(i++).padStart(2, '0')}.000Z`; })(),
  });
  remoteProfiles.create('Fra server', 'r');
  const f = fakeFetch({
    profiles: { doc: JSON.stringify(remoteProfiles.exportDoc()), updated: 'x' },
  });
  const d = makeDeps({ fetchImpl: f.impl });
  d.profiles.create('Lokal', 'l');
  KontoSync._configure(d, 1);
  await KontoSync.syncNow();
  assert.equal(d.profiles.list().length, 2);          // remote merget inn
  assert.equal(f.posts.profiles.length, 1);           // union pushet
  assert.equal(Object.keys(f.posts.profiles[0].profiles).length, 2);
});

test('keys: nyere remote-blob → dekrypter + replaceAll; re-krypter ved annen kekId', async () => {
  const keyDoc = { anthropic: 'sk-x', kaggle: 'k' };
  const blob = await KC.encryptDoc(keyDoc, KEK, 'cafebabe', '2026-08-05T12:00:00.000Z');
  const f = fakeFetch({ askkeys: { doc: JSON.stringify(blob), updated: blob.updated } });
  const d = makeDeps({ fetchImpl: f.impl });
  // cached kek matcher INNHOLDET men har annen kekId → prompt-veien unngås
  // fordi decrypt prøves kun ved lik/ukjent id; sett lik id først:
  d.storage.setItem('md_kek_id', 'cafebabe');
  KontoSync._configure(d, 1);
  await KontoSync.syncNow();
  assert.deepEqual(d.keys.getAll(), keyDoc);
  assert.equal(d.keys.updatedAt(), blob.updated);
  assert.equal(f.posts.askkeys, undefined);           // samme kekId → ingen re-push
});

test('keys: kekId-mismatch uten prompt → kek-mismatch, ingen replaceAll', async () => {
  const blob = await KC.encryptDoc({ a: '1' }, 'cd'.repeat(32), '11111111', '2026-08-05T12:00:00.000Z');
  const f = fakeFetch({ askkeys: { doc: JSON.stringify(blob), updated: blob.updated } });
  const d = makeDeps({ fetchImpl: f.impl });
  KontoSync._configure(d, 1);
  const r = await KontoSync.syncNow();
  assert.equal(r.askkeys, 'kek-mismatch');
  assert.deepEqual(d.keys.getAll(), {});
});

test('keys: prompt låser opp og re-krypterer under gjeldende kode', async () => {
  const fremmedKek = 'cd'.repeat(32);
  const blob = await KC.encryptDoc({ a: '1' }, fremmedKek, '11111111', '2026-08-05T12:00:00.000Z');
  const f = fakeFetch({ askkeys: { doc: JSON.stringify(blob), updated: blob.updated } });
  let promptedWith = null;
  const d = makeDeps({
    fetchImpl: f.impl,
    kekPrompt: async (id) => { promptedWith = id; return fremmedKek; },
  });
  KontoSync._configure(d, 1);
  const r = await KontoSync.syncNow();
  assert.equal(promptedWith, '11111111');
  assert.equal(r.askkeys, 'pulled');
  assert.deepEqual(d.keys.getAll(), { a: '1' });
  assert.equal(f.posts.askkeys.length, 1);            // re-kryptert under md_kek
  assert.equal(f.posts.askkeys[0].kekId, 'deadbeef');
});

test('401 → onUnauthorized, status error', async () => {
  const f = fakeFetch({ profiles: 401, history: 401, askkeys: 401 });
  let out = 0;
  const d = makeDeps({ fetchImpl: f.impl, onUnauthorized: () => out++ });
  KontoSync._configure(d, 1);
  const r = await KontoSync.syncNow();
  assert.ok(out >= 1);
  assert.equal(r.profiles, 'error');
});
