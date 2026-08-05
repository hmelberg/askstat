const test = require('node:test');
const assert = require('node:assert');
const { makeProfiles } = require('../../js/profiles.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('CRUD + caps + sortering', () => {
  const p = makeProfiles(fakeStorage());
  const a = p.create('B-profil', 'tekst b');
  const b = p.create('A-profil', 'x'.repeat(9000));
  assert.deepEqual(p.list().map((x) => x.name), ['A-profil', 'B-profil']);
  assert.equal(p.get(b).text.length, 8000);                    // TEXT_MAX
  assert.equal(p.create('n'.repeat(80), 't'), p.list().find((x) => x.name.length === 60).id); // NAME_MAX
  p.update(a, { name: 'Nytt navn', text: 'ny' });
  assert.equal(p.get(a).name, 'Nytt navn');
  p.remove(a);
  assert.equal(p.get(a), null);
});

test('active/activeText: undefined uten aktiv, deaktiveres ved sletting', () => {
  const p = makeProfiles(fakeStorage());
  assert.equal(p.active(), null);
  assert.equal(p.activeText(), undefined);
  const id = p.create('OECD only', 'Use only OECD as a data source.');
  p.setActive(id);
  assert.equal(p.active().name, 'OECD only');
  assert.equal(p.activeText(), 'Use only OECD as a data source.');
  p.setActive('finnes-ikke');                 // ignoreres
  assert.equal(p.active().id, id);
  p.remove(id);
  assert.equal(p.active(), null);
  assert.equal(p.activeText(), undefined);
});

test('seedFromLegacy: md_ask_prefs → aktiv «My preferences», legacy slettes', () => {
  const st = fakeStorage();
  st.setItem('md_ask_prefs', 'standardland Norge');
  const p = makeProfiles(st);
  p.seedFromLegacy();
  assert.equal(p.active().name, 'My preferences');
  assert.equal(p.activeText(), 'standardland Norge');
  assert.equal(st.getItem('md_ask_prefs'), null);
  // idempotent + rører ikke eksisterende profiler:
  st.setItem('md_ask_prefs', 'noe annet');
  p.seedFromLegacy();
  assert.equal(p.list().length, 1);
  assert.equal(st.getItem('md_ask_prefs'), null);
});

test('onChange fyrer på mutasjoner, korrupt JSON → tomt dokument', () => {
  const st = fakeStorage();
  st.setItem('md_profiles', '{skrot');
  const p = makeProfiles(st);
  let fired = 0;
  p.onChange(() => { fired++; });
  assert.deepEqual(p.list(), []);
  const id = p.create('x', 'y');
  p.setActive(id);
  assert.ok(fired >= 2);
});

// Fase 2-synk: tombstones, merge, prune (spec 2026-08-05 §Fase 2c).
function seq(day) { let i = 0; return () => `2026-08-0${day}T00:00:${String(i++).padStart(2, '0')}.000Z`; }

test('tombstones + merge: sletting vinner, ukjente overlever, aktiv følger nyeste dok', () => {
  const A = makeProfiles(fakeStorage(), { now: seq(1) });
  const B = makeProfiles(fakeStorage(), { now: seq(2) });
  const idA = A.create('Felles', 'x');
  B.mergeRemote(A.exportDoc());
  assert.equal(B.list().length, 1);
  B.remove(idA);                                    // dag 2 > dag 1
  assert.ok(A.mergeRemote(B.exportDoc()));
  assert.equal(A.get(idA), null);                   // sletting spredd
  assert.ok(A.exportDoc().profiles[idA].deleted);   // som tombstone
  const idB = B.create('Bare B', 'y');
  B.mergeRemote(A.exportDoc());
  assert.ok(B.get(idB));                            // lokal ukjent overlever
  B.setActive(idB);
  A.mergeRemote(B.exportDoc());
  assert.equal(A.active() && A.active().id, idB);   // aktiv fulgte nyeste dok
});

test('merge er stille (ingen onChange) og idempotent', () => {
  const A = makeProfiles(fakeStorage(), { now: seq(1) });
  const B = makeProfiles(fakeStorage(), { now: seq(2) });
  B.create('Remote', 'r');
  let fired = 0;
  A.onChange(() => fired++);
  assert.ok(A.mergeRemote(B.exportDoc()));
  assert.equal(fired, 0);
  assert.equal(A.mergeRemote(B.exportDoc()), false); // andre gang: uendret
});

test('prune: tombstones eldre enn 90 dager fjernes ved skriving', () => {
  let t = '2026-01-01T00:00:00.000Z';
  const p = makeProfiles(fakeStorage(), { now: () => t });
  const id = p.create('Gammel', 'x');
  p.remove(id);
  t = '2026-06-01T00:00:00.000Z';
  p.create('Ny', 'y');
  assert.equal(p.exportDoc().profiles[id], undefined);
});

test('pack-slot: manuelt valg vinner over auto, auto aldri i doc', () => {
  const s = fakeStorage();
  const p = makeProfiles(s, { now: () => '2026-08-05T10:00:00.000Z' });
  assert.deepEqual(p.packState(), { id: null, auto: false });
  p.setAutoPack('norway');
  assert.deepEqual(p.packState(), { id: 'norway', auto: true });
  assert.equal(p.exportDoc().pack, undefined);          // auto aldri i doc
  p.setPack('finland');
  assert.deepEqual(p.packState(), { id: 'finland', auto: false });
  assert.equal(p.exportDoc().pack.id, 'finland');
  p.setAutoPack('norway');                              // no-op etter manuelt valg
  assert.deepEqual(p.packState(), { id: 'finland', auto: false });
});

test('pack-slot: mergeRemote nyeste vinner, fravær bevarer lokal', () => {
  const p = makeProfiles(fakeStorage(), { now: () => '2026-08-05T10:00:00.000Z' });
  p.setPack('norway');
  p.mergeRemote({ v: 1, updated: '2026-08-06T00:00:00.000Z', profiles: {} }); // uten pack-felt
  assert.equal(p.packState().id, 'norway');
  p.mergeRemote({ v: 1, updated: '2026-08-04T00:00:00.000Z', profiles: {},
    pack: { id: 'finland', updated: '2026-08-04T00:00:00.000Z' } });          // eldre → taper
  assert.equal(p.packState().id, 'norway');
  assert.ok(p.mergeRemote({ v: 1, updated: '2026-08-06T00:00:00.000Z', profiles: {},
    pack: { id: null, updated: '2026-08-06T00:00:00.000Z' } }));              // nyere eksplisitt International
  assert.deepEqual(p.packState(), { id: null, auto: false });
  assert.equal(p.exportDoc().pack.id, null);            // manuelt International består i doc
});
