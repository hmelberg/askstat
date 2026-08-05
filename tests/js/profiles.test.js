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
