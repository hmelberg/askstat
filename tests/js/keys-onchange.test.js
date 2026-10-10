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

// S9b (review 2026-10-10): ett felles 'llm'-nøkkelfelt for egne leverandører.
// Bytter brukeren base_url til en annen vert uten å lime inn ny nøkkel, ville
// den gamle leverandørens nøkkel blitt sendt til den nye verten.
test('llmEndpointChanged: annen vert → true; samme vert → false', () => {
  const f = Keys.llmEndpointChanged;
  assert.equal(f({ type: 'openai-compat', base_url: 'https://api.openai.com/v1' },
                 { type: 'openai-compat', base_url: 'https://api.openai.com/v1/' }), false);
  assert.equal(f({ type: 'openai-compat', base_url: 'https://api.openai.com/v1' },
                 { type: 'openai-compat', base_url: 'https://API.openai.com/other' }), false);
  assert.equal(f({ type: 'openai-compat', base_url: 'https://api.openai.com/v1' },
                 { type: 'openai-compat', base_url: 'https://api.mistral.ai/v1' }), true);
  // Kun verten teller: samme vert, annen protokoll (compat ↔ responses) er samme leverandør.
  assert.equal(f({ type: 'openai-compat', base_url: 'https://x.org' },
                 { type: 'openai-responses', base_url: 'https://x.org' }), false);
  assert.equal(f({ type: 'openai-compat', base_url: 'https://x.org' },
                 { type: 'openai-compat', base_url: 'ikke en url' }), true);
  // Ingen tidligere egen leverandør (fersk eller Anthropic) → ingen gammel nøkkel å beskytte.
  assert.equal(f(null, { type: 'openai-compat', base_url: 'https://x.org' }), false);
});
