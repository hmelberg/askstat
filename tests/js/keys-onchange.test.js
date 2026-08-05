// Konto-runden fase 2: keys.js synk-kroker (onChange/getAll/replaceAll/updatedAt).
const test = require('node:test');
const assert = require('node:assert');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage(), configurable: true });
const Keys = require('../../js/keys.js');

test('onChange fyrer på set/remove, ALDRI på replaceAll (pull-veien)', () => {
  let fired = 0;
  Keys.onChange(() => fired++);
  Keys.set('kaggle', 'k1');
  assert.equal(fired, 1);
  assert.ok(Keys.updatedAt());
  assert.deepEqual(Keys.getAll(), { kaggle: 'k1' });
  Keys.replaceAll({ anthropic: 'a' }, '2026-08-05T00:00:00.000Z');
  assert.equal(fired, 1);
  assert.equal(Keys.get('anthropic'), 'a');
  assert.equal(Keys.updatedAt(), '2026-08-05T00:00:00.000Z');
  Keys.remove('anthropic');
  assert.equal(fired, 2);
});
