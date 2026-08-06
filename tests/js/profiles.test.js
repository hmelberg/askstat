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
  assert.deepEqual(P.packsState(), { ids: [], auto: false, manual: false });
  P.setAutoPack('norway');
  assert.deepEqual(P.packsState(), { ids: ['norway'], auto: true, manual: false });
});

test('packs: setPacks vinner over auto, rydder md_pack_auto, dedupper', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setAutoPack('norway');
  P.setPacks(['a', 'b', 'a']);
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false, manual: true });
  assert.equal(s.getItem('md_pack_auto'), null);
  P.setAutoPack('norway'); // no-op når manuelt sett finnes
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false, manual: true });
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
  assert.deepEqual(P.packsState(), { ids: [], auto: false, manual: true });
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

test('packs: setPacksAuto gjenoppretter auto som eksplisitt, synkbar verdi', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setAutoPack('norway');
  P.setPacks(['a']);
  assert.deepEqual(P.packsState(), { ids: ['a'], auto: false, manual: true });
  P.setPacksAuto();
  assert.equal(P.exportDoc().packs.auto, true);        // eksplisitt verdi, ikke slettet felt
  P.setAutoPack('norway');                             // ikke lenger blokkert av doc.packs
  assert.deepEqual(P.packsState(), { ids: ['norway'], auto: true, manual: false });
});

test('packs: mergeRemote — nyere {auto:true} vinner over eldre manuelt sett, og omvendt', () => {
  const P = makeProfiles(fakeStorage());
  P.setPacks(['a']);
  const autoNyere = { v: 1, active: null, updated: '', profiles: {},
    packs: { auto: true, updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(autoNyere), true);
  assert.deepEqual(P.packsState().ids, []);            // auto uten md_pack_auto = tomt her
  assert.equal(P.packsState().manual, false);
  const manueltEldre = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['z'], updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(manueltEldre), false);    // eldre taper — ingen resurreksjon
  assert.equal(P.packsState().manual, false);
});

// Kontekstrunden fase 3 (§Unifisert lager): kind 'profile'|'source'.
test('kind: create default profile; sources filtreres; active ser kun profiler', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  const pid = P.create('Meg', 'tekst');
  const sid = P.create('ESS-kilde', 'yaml her', 'source');
  assert.deepEqual(P.list('profile').map((x) => x.id), [pid]);
  assert.deepEqual(P.list('source').map((x) => x.id), [sid]);
  P.setActive(sid); // avvises — kilder kan ikke være aktiv profil
  assert.equal(P.active(), null);
  P.setActive(pid);
  assert.equal(P.activeText(), 'tekst');
});

test('kind: origin lagres; legacy-oppføringer uten kind = profile', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  const id = P.create('Import', 't', 'source', { source: 'community', id: 'x' });
  assert.deepEqual(P.get(id).origin, { source: 'community', id: 'x' });
  const doc = JSON.parse(s.getItem('md_profiles'));
  doc.profiles['gammel'] = { name: 'G', text: 't', updated: '2026-01-01T00:00:00.000Z' };
  s.setItem('md_profiles', JSON.stringify(doc));
  assert.equal(P.list('profile').some((x) => x.id === 'gammel'), true);
});

test('kind: source-tekst har romsligere budsjett (40000) enn profil (8000)', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  const sid = P.create('Lang kilde', 'x'.repeat(50000), 'source');
  assert.equal(P.get(sid).text.length, 40000);
  const pid = P.create('Lang profil', 'x'.repeat(50000));
  assert.equal(P.get(pid).text.length, 8000);
  // update() leser eksisterende kind — budsjettet endres ikke av update:
  P.update(sid, { text: 'y'.repeat(50000) });
  assert.equal(P.get(sid).text.length, 40000);
});

// Review-funn 1 (2026-08-06): remove() av en kind:source-oppføring som er
// valgt i doc.packs.ids skal ikke etterlate en hengende 'user:'+id.
test('kind: remove() av en valgt kilde rydder også doc.packs.ids', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  const sid = P.create('ESS-kilde', 'yaml her', 'source');
  P.setPacks(['user:' + sid]);
  assert.deepEqual(P.packsState().ids, ['user:' + sid]);
  P.remove(sid);
  assert.deepEqual(P.packsState().ids, []);
  // en usignifikant id (som ikke matcher noen doc.packs-oppføring) rører
  // ikke doc.packs i det hele tatt:
  const pid = P.create('Vanlig profil', 't');
  P.setPacks(['norway']);
  P.remove(pid);
  assert.deepEqual(P.packsState().ids, ['norway']);
});

test('packs: gammel doc.pack ignoreres og skrubbes ved neste skriving', () => {
  const s = fakeStorage();
  s.setItem('md_profiles', JSON.stringify({ v: 1, active: null, updated: '',
    profiles: {}, pack: { id: 'country:IT', updated: '2026-08-05T00:00:00.000Z' } }));
  const P = makeProfiles(s);
  assert.deepEqual(P.packsState(), { ids: [], auto: false, manual: false }); // Italia er død
  P.setPacks(['norway']);
  const doc = JSON.parse(s.getItem('md_profiles'));
  assert.equal('pack' in doc, false);
  // mergeRemote med legacy remote-pack rører ingenting:
  assert.equal(P.mergeRemote({ v: 1, active: null, updated: '', profiles: {},
    pack: { id: 'country:IT', updated: '2099-01-01T00:00:00.000Z' } }), false);
});
