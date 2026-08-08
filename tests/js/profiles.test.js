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

// Kildevelger-runde 2: packsState() forenklet til rent manuelt {ids} — auto/
// manual-flaggene og md_pack_auto-lesingen er ute (auto-VALGET bor nå i
// doc.country, se lenger ned; setPacksAuto er slettet).
test('packs: tomt default; setPacks setter/dedupper ids', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  assert.deepEqual(P.packsState(), { ids: [] });
  P.setPacks(['a', 'b', 'a']);
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'] });
});

test('packs: setAutoPack er device-lokalt og uavhengig av doc.packs (vedlikeholdes alltid)', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setAutoPack('norway');
  assert.equal(s.getItem('md_pack_auto'), 'norway');
  assert.deepEqual(P.packsState(), { ids: [] });        // packsState ser IKKE md_pack_auto lenger
  P.setPacks(['a']);
  assert.equal(s.getItem('md_pack_auto'), 'norway');    // setPacks rører den ikke lenger
  P.setAutoPack('finland');                             // fortsatt vedlikeholdt selv med manuelt sett
  assert.equal(s.getItem('md_pack_auto'), 'finland');
  P.setAutoPack(null);
  assert.equal(s.getItem('md_pack_auto'), null);
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
  assert.deepEqual(P.packsState(), { ids: [] });
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
  assert.equal(P.mergeRemote(nyere), false);            // likt innhold igjen → uendret
});

// Ingen automigrering (plan §Oppgaver): gamle synkede dokumenter kan ha
// {auto:true} i doc.packs. writeDoc skrubber den lokalt (test lenger ned);
// mergeRemote skal aldri adoptere den varianten fra en remote heller.
test('packs: mergeRemote ignorerer gammel {auto:true}-variant fra remote', () => {
  const P = makeProfiles(fakeStorage());
  P.setPacks(['a']);
  const legacyAuto = { v: 1, active: null, updated: '', profiles: {},
    packs: { auto: true, updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(legacyAuto), false);
  assert.deepEqual(P.packsState().ids, ['a']);
});

test('packs: writeDoc skrubber lokal {auto:true}-variant av doc.packs ved neste skriving', () => {
  const s = fakeStorage();
  s.setItem('md_profiles', JSON.stringify({ v: 1, active: null, updated: '',
    profiles: {}, packs: { auto: true, updated: '2026-08-05T00:00:00.000Z' } }));
  const P = makeProfiles(s);
  assert.deepEqual(P.packsState(), { ids: [] });        // {auto:true} har ingen .ids
  P.setPacks(['norway']);                               // enhver skriving trigger skrubb
  const doc = JSON.parse(s.getItem('md_profiles'));
  assert.deepEqual(doc.packs, { ids: ['norway'], updated: doc.packs.updated });
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
  assert.deepEqual(P.packsState(), { ids: [] }); // Italia er død
  P.setPacks(['norway']);
  const doc = JSON.parse(s.getItem('md_profiles'));
  assert.equal('pack' in doc, false);
  // mergeRemote med legacy remote-pack rører ingenting:
  assert.equal(P.mergeRemote({ v: 1, active: null, updated: '', profiles: {},
    pack: { id: 'country:IT', updated: '2099-01-01T00:00:00.000Z' } }), false);
});

// Kildevelger-runde 2 (§Designavgjørelser): doc.country = {mode, cc?, updated}.
// VALGET synces her; auto-RESULTATET (hvilken pakke locale pekte på) forblir
// device-lokalt i md_pack_auto (dekket av setAutoPack-testen over).
test('country: default {mode:"auto"} når fraværende; setCountry skriver alltid eksplisitt', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(P.countryState(), { mode: 'auto' });
  P.setCountry('none');
  const st = P.countryState();
  assert.equal(st.mode, 'none');
  assert.ok(st.updated);                                 // alltid eksplisitt — aldri delete
  P.setCountry('auto');
  assert.equal(P.countryState().mode, 'auto');
  assert.ok(P.exportDoc().country);                       // feltet finnes fortsatt (ikke slettet)
});

test('country: setCountry cc uppercases og validerer ^[A-Z]{2}$', () => {
  const P = makeProfiles(fakeStorage());
  P.setCountry('cc', 'no');
  const st = P.countryState();
  assert.equal(st.mode, 'cc');
  assert.equal(st.cc, 'NO');
  const before = st;
  P.setCountry('cc', 'xyz');                               // ugyldig (3 tegn) — ignoreres stille
  assert.deepEqual(P.countryState(), before);
  P.setCountry('cc', '1a');                                 // ugyldig (ikke bokstaver) — ignoreres stille
  assert.deepEqual(P.countryState(), before);
});

test('country: mergeRemote hele-verdien-nyeste-vinner; likhet → uendret', () => {
  const P = makeProfiles(fakeStorage());
  P.setCountry('cc', 'no');
  const nyere = { v: 1, active: null, updated: '', profiles: {},
    country: { mode: 'none', updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(nyere), true);
  assert.equal(P.countryState().mode, 'none');
  const eldre = { v: 1, active: null, updated: '', profiles: {},
    country: { mode: 'cc', cc: 'SE', updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(eldre), false);
  assert.equal(P.countryState().mode, 'none');
  assert.equal(P.mergeRemote(nyere), false);               // likt innhold → uendret
});

// Kildevelger-runde 2 (§Designavgjørelser): doc.sources_off = {ids, updated}
// — av-skrudde registry-kilder, klient-clampet.
test('sources_off: tomt default; toggleSourceOff legger til og fjerner', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(P.sourcesOff(), []);
  P.toggleSourceOff('dbnomics');
  assert.deepEqual(P.sourcesOff(), ['dbnomics']);
  P.toggleSourceOff('ssb');
  assert.deepEqual(P.sourcesOff(), ['dbnomics', 'ssb']);
  P.toggleSourceOff('dbnomics');
  assert.deepEqual(P.sourcesOff(), ['ssb']);
});

test('sources_off: toggleSourceOff avviser ugyldige id-er og håndhever tak 40', () => {
  const P = makeProfiles(fakeStorage());
  P.toggleSourceOff('UPPER');                              // regex krever småbokstaver
  P.toggleSourceOff('has space');
  P.toggleSourceOff('x'.repeat(33));                        // over 32 tegn
  assert.deepEqual(P.sourcesOff(), []);
  for (let i = 0; i < 40; i++) P.toggleSourceOff('s' + i);
  assert.equal(P.sourcesOff().length, 40);
  P.toggleSourceOff('s40');                                 // tak nådd — ignoreres
  assert.equal(P.sourcesOff().length, 40);
  assert.ok(!P.sourcesOff().includes('s40'));
  P.toggleSourceOff('s0');                                  // fjerning virker fortsatt ved tak
  assert.equal(P.sourcesOff().length, 39);
});

// Kilder-profil-output (2026-08-08, Task 1 §Interfaces): cleanTags — delt
// ren tag-clamp-funksjon, eksportert som Profiles.cleanTags. Aksepterer
// array ELLER kommaseparert streng; trim, lowercase, regex-filter, dedup,
// max 8.
test('cleanTags: trim, lowercase, filter, dedup (kommaseparert streng)', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(P.cleanTags('Mikro, MAKRO, x  ,mikro'), ['mikro', 'makro', 'x']);
});

test('cleanTags: array-input, ugyldige tegn/lengde filtreres bort', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(P.cleanTags(['A', 'b!', 'c'.repeat(30), 'ok', 'a']), ['a', 'ok']);
  assert.deepEqual(P.cleanTags(''), []);
  assert.deepEqual(P.cleanTags(undefined), []);
  assert.deepEqual(P.cleanTags(null), []);
});

test('cleanTags: "constructor" er en gyldig tag (ikke en arvet Object.prototype-kollisjon)', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(P.cleanTags(['constructor', '__proto__', 'ok']), ['constructor', '__proto__', 'ok']);
});

// Review-funn (fikserunde 1): "__proto__" er en nedarvet ACCESSOR på
// Object.prototype hvis setter stille ignorerer non-objekt-verdier — på et
// vanlig {} ville `seen['__proto__'] = true` derfor vært en no-op, og to
// forekomster av tagen "__proto__" ville IKKE blitt deduplisert (samme for
// "constructor", en vanlig data-property). Fikset med Object.create(null)
// for seen-objektet.
test('cleanTags: dedupliserer gjentatte "__proto__"/"constructor"-tagger', () => {
  const P = makeProfiles(fakeStorage());
  assert.deepEqual(
    P.cleanTags(['__proto__', '__proto__', 'constructor', 'constructor']),
    ['__proto__', 'constructor']
  );
});

test('cleanTags: maks 8 tagger', () => {
  const P = makeProfiles(fakeStorage());
  const many = Array.from({ length: 12 }, (_, i) => 't' + i);
  assert.deepEqual(P.cleanTags(many), many.slice(0, 8));
});

test('create: tags lagres clampet på oppføringen (kun når ikke-tom)', () => {
  const P = makeProfiles(fakeStorage());
  const id = P.create('Navn', 'tekst', 'source', undefined, 'Mikro, MAKRO, x  ,mikro');
  assert.deepEqual(P.get(id).tags, ['mikro', 'makro', 'x']);
  const id2 = P.create('Uten tags', 'tekst');
  assert.equal('tags' in P.get(id2), false);
  const id3 = P.create('Kun ugyldige tags', 'tekst', 'profile', undefined, '   , !!!');
  assert.equal('tags' in P.get(id3), false);
});

test('update: tags erstattes (ikke merges) når feltet er med i fields', () => {
  const P = makeProfiles(fakeStorage());
  const id = P.create('Navn', 'tekst', 'profile', undefined, ['a', 'b']);
  assert.deepEqual(P.get(id).tags, ['a', 'b']);
  P.update(id, { tags: ['c'] });
  assert.deepEqual(P.get(id).tags, ['c']);
  P.update(id, { name: 'Nytt navn' });          // tags ikke i fields → uendret
  assert.deepEqual(P.get(id).tags, ['c']);
  assert.equal(P.get(id).name, 'Nytt navn');
  P.update(id, { tags: [] });                   // tomt sett → feltet fjernes
  assert.equal('tags' in P.get(id), false);
});

test('sources_off: mergeRemote hele-verdien-nyeste-vinner; likhet → uendret', () => {
  const P = makeProfiles(fakeStorage());
  P.toggleSourceOff('dbnomics');
  const nyere = { v: 1, active: null, updated: '', profiles: {},
    sources_off: { ids: ['ssb', 'fhi'], updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(nyere), true);
  assert.deepEqual(P.sourcesOff(), ['ssb', 'fhi']);
  const eldre = { v: 1, active: null, updated: '', profiles: {},
    sources_off: { ids: ['x'], updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(eldre), false);
  assert.deepEqual(P.sourcesOff(), ['ssb', 'fhi']);
  assert.equal(P.mergeRemote(nyere), false);                // likt innhold → uendret
});
