const test = require('node:test');
const assert = require('node:assert');
const { makeStore, MAX_ENTRIES, MAX_BYTES } = require('../../js/ask-history.js');

function fakeStorage(failSets) {
  let fails = failSets || 0;
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (fails > 0) { fails--; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
}
function makeSeq() { // injiserbar klokke: monotone, GYLDIGE ISO-tider
  let i = 0;
  return () => {
    const n = i++;
    const min = String(Math.floor(n / 60)).padStart(2, '0');
    const sec = String(n % 60).padStart(2, '0');
    return `2026-08-05T00:${min}:${sec}.000Z`;
  };
}

test('save/list: nyeste først, get/remove/clear', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  const a = s.save({ question: 'first' });
  const b = s.save({ question: 'second' });
  assert.deepEqual(s.list().map((e) => e.question), ['second', 'first']);
  assert.equal(s.get(a).question, 'first');
  assert.equal(s.get('finnes-ikke'), null);
  s.remove(a);
  assert.equal(s.list().length, 1);
  s.clear();
  assert.equal(s.list().length, 0);
  assert.equal(s.get(b), null);
});

test('evict: aldri mer enn MAX_ENTRIES, eldste kastes', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  for (let i = 0; i < MAX_ENTRIES + 3; i++) s.save({ question: 'q' + i });
  const l = s.list();
  assert.equal(l.length, MAX_ENTRIES);
  assert.equal(l[l.length - 1].question, 'q3'); // q0..q2 kastet
});

test('evict: byte-taket kaster eldste', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  const big = 'x'.repeat(Math.ceil(MAX_BYTES / 3));
  s.save({ question: 'old', markdown: big });
  s.save({ question: 'mid', markdown: big });
  s.save({ question: 'new', markdown: big });
  const qs = s.list().map((e) => e.question);
  assert.ok(!qs.includes('old'));
  assert.ok(qs.includes('new'));
});

test('kvotefeil: kast eldste og prøv én gang til, deretter stille', () => {
  const s = makeStore(fakeStorage(1), { now: makeSeq() });
  s.save({ question: 'a' });          // første set feiler → retry etter evict
  const s2 = makeStore(fakeStorage(99), { now: makeSeq() });
  assert.doesNotThrow(() => s2.save({ question: 'b' })); // alt feiler → stille
});

test('korrupt JSON i lagringen → tomt dokument, ikke kast', () => {
  const st = fakeStorage();
  st.setItem('md_ask_history', '{skrot');
  const s = makeStore(st, { now: makeSeq() });
  assert.deepEqual(s.list(), []);
  s.save({ question: 'ok' });
  assert.equal(s.list().length, 1);
});

// Fase 2-synk: tombstones, merge, strip av markdown (spec 2026-08-05 §Fase 2c).
test('stripMarkdown + merge: lik updated → lokal markdown beholdes; tombstone vinner', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  const id = s.save({ question: 'q', markdown: 'MD', script: 'code' });
  const server = s.exportDoc({ stripMarkdown: true });
  assert.equal(server.entries[id].markdown, undefined);
  assert.equal(server.entries[id].script, 'code');
  assert.equal(s.mergeRemote(server), false);       // lik updated → lokal vinner
  assert.equal(s.get(id).markdown, 'MD');
  const remote = JSON.parse(JSON.stringify(server));
  remote.entries[id] = { id, ts: remote.entries[id].ts, deleted: true, updated: '2027-01-01T00:00:00.000Z' };
  assert.ok(s.mergeRemote(remote));
  assert.equal(s.get(id), null);
  assert.equal(s.list().length, 0);
});

test('clear tombstoner alle; onChange fyrer på save/remove/clear, ikke merge', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  let fired = 0;
  s.onChange(() => fired++);
  const a = s.save({ question: 'a' });
  s.remove(a);
  s.clear();
  assert.equal(fired, 3);
  assert.ok(s.exportDoc().entries[a].deleted);
  s.mergeRemote({ v: 1, entries: { zzz: { id: 'zzz', ts: '2026-09-01T00:00:00.000Z', updated: '2026-09-01T00:00:00.000Z', question: 'r' } } });
  assert.equal(fired, 3);                            // stille
  assert.equal(s.list().length, 1);
});
