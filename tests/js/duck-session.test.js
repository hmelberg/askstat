// tests/js/duck-session.test.js — B11b/B11c (review 2026-10): den EKTE
// window.__duck-økten og __ensureDuckDB hentet ut av index.html og kjørt
// mot falske DuckDB-objekter.
//  B11b: to samtidige begin()/end()-løp delte én conn uten lås — andre
//        begin() erstattet conn uten close, første end() nullet den under
//        det andre løpet.
//  B11c: workeren ble ikke terminert når instantiate() feilet (lekkasje
//        per nytt forsøk).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

function slice(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  assert.ok(s >= 0, 'fant ikke ' + startMarker);
  const e = HTML.indexOf(endMarker, s);
  assert.ok(e > s, 'fant ikke slutt for ' + startMarker);
  return HTML.slice(s, e + endMarker.length);
}

function fakeDb(log) {
  let n = 0;
  return {
    async connect() {
      const id = ++n;
      const conn = {
        id, closed: false,
        async query(sql) {
          if (conn.closed) throw new Error('conn ' + id + ' is closed');
          log.push(id + ':' + sql);
          await new Promise(r => setTimeout(r, 1));
          return { rows: [] };
        },
        async close() { conn.closed = true; log.push(id + ':close'); }
      };
      return conn;
    },
    async registerFileBuffer() {}
  };
}

function loadDuck(db) {
  const src = slice('    window.__duck = {', '\n    };');
  const win = { DuckdbNative: require('../../js/duckdb-native.js') };
  new Function('window', '__ensureDuckDB', '__arrowToColumns', src)(
    win, async () => db, () => ({ table_name: [], table_type: [] }));
  return win.__duck;
}

test('__duck: samtidige løp serialiseres — hvert løp beholder sin egen conn', async () => {
  const log = [];
  const duck = loadDuck(fakeDb(log));
  async function run(tag) {
    await duck.begin({ fresh: false });
    try {
      await duck.exec('A' + tag);
      await new Promise(r => setTimeout(r, 5));
      await duck.exec('B' + tag);
    } finally {
      await duck.end();
    }
  }
  await Promise.all([run(1), run(2)]);
  // Løp 1 (conn 1) må være helt ferdig før løp 2 (conn 2) starter.
  assert.deepEqual(log, ['1:A1', '1:B1', '1:close', '2:A2', '2:B2', '2:close']);
});

test('__duck: feil i begin() slipper låsen', async () => {
  const log = [];
  const db = fakeDb(log);
  const duck = loadDuck(db);
  const realConnect = db.connect;
  db.connect = async () => { throw new Error('boom'); };
  await assert.rejects(duck.begin({ fresh: false }), /boom/);
  db.connect = realConnect;
  await duck.begin({ fresh: false });   // må ikke henge
  await duck.exec('X');
  await duck.end();
  assert.deepEqual(log, ['1:X', '1:close']);
});

test('__ensureDuckDB: worker termineres når instantiate feiler', async () => {
  const src = slice('    let __duckdbPromise = null;', '\n      return __duckdbPromise;\n    }');
  const terminated = [];
  class FakeWorker { constructor() { this.t = false; } terminate() { this.t = true; terminated.push(this); } }
  const fakeDuck = {
    selectBundle: async () => ({ mainWorker: 'w.js', mainModule: 'm', pthreadWorker: null }),
    getJsDelivrBundles: () => ({}),
    ConsoleLogger: function () {},
    AsyncDuckDB: function () { this.instantiate = async () => { throw new Error('wasm nope'); }; }
  };
  const ensure = new Function('Worker', 'URL', 'Blob', '__import',
    src.replace("await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm')", 'await __import()') +
    '\nreturn __ensureDuckDB;')(
    FakeWorker,
    { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    function () {},
    async () => fakeDuck);
  await assert.rejects(ensure(), /wasm nope/);
  assert.equal(terminated.length, 1);
});
