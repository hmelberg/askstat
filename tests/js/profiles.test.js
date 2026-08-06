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

test('packs: tomt default; auto-forslag gir ett id m/auto-flagg', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  assert.deepEqual(P.packsState(), { ids: [], auto: false });
  P.setAutoPack('norway');
  assert.deepEqual(P.packsState(), { ids: ['norway'], auto: true });
});

test('packs: setPacks vinner over auto, rydder md_pack_auto, dedupper', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setAutoPack('norway');
  P.setPacks(['a', 'b', 'a']);
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false });
  assert.equal(s.getItem('md_pack_auto'), null);
  P.setAutoPack('norway'); // no-op når manuelt sett finnes
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false });
});

test('packs: togglePack legger til og fjerner; tom liste = manuelt tomt', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.togglePack('a');
  P.togglePack('b');
  assert.deepEqual(P.packsState().ids, ['a', 'b']);
  P.togglePack('a');
  assert.deepEqual(P.packsState().ids, ['b']);
  P.togglePack('b');
  assert.deepEqual(P.packsState(), { ids: [], auto: false });
});

test('packs: mergeRemote hele-settet-nyeste-vinner; likhet → uendret', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setPacks(['a']);
  const nyere = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['x', 'y'], updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(nyere), true);
  assert.deepEqual(P.packsState().ids, ['x', 'y']);
  const eldre = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['z'], updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(eldre), false);
  assert.deepEqual(P.packsState().ids, ['x', 'y']);
});

test('packs: gammel doc.pack ignoreres og skrubbes ved neste skriving', () => {
  const s = fakeStorage();
  s.setItem('md_profiles', JSON.stringify({ v: 1, active: null, updated: '',
    profiles: {}, pack: { id: 'country:IT', updated: '2026-08-05T00:00:00.000Z' } }));
  const P = makeProfiles(s);
  assert.deepEqual(P.packsState(), { ids: [], auto: false }); // Italia er død
  P.setPacks(['norway']);
  const doc = JSON.parse(s.getItem('md_profiles'));
  assert.equal('pack' in doc, false);
  // mergeRemote med legacy remote-pack rører ingenting:
  assert.equal(P.mergeRemote({ v: 1, active: null, updated: '', profiles: {},
    pack: { id: 'country:IT', updated: '2099-01-01T00:00:00.000Z' } }), false);
});
