// Krypto for nøkkelsynk (konto-runden fase 2): KEK avledes av login-koden
// (PBKDF2-600k, salt=email), md_keys krypteres som AES-GCM-blob. normalizeCode
// SPEILER serverens auth_hash.normalize_code — vektorene er kontrakten
// (microdata-api tests/test_auth_hash.py).
const test = require('node:test');
const assert = require('node:assert');
const { makeKeysCrypto } = require('../../js/keys-crypto.js');

const KC = makeKeysCrypto(globalThis.crypto);

test('normalizeCode speiler serveren', () => {
  assert.equal(KC.normalizeCode('Abacus Charity Twelve'), 'abacus-charity-twelve');
  assert.equal(KC.normalizeCode('abacus-charity-twelve'), 'abacus-charity-twelve');
  assert.equal(KC.normalizeCode('  aB2c__dE  '), 'ab-c-de');
  assert.equal(KC.normalizeCode('---'), '');
  assert.equal(KC.normalizeCode(''), '');
});

test('kekId: 8 hex, deterministisk, normalisert-invariant', async () => {
  const a = await KC.kekId('Abacus Charity Twelve');
  const b = await KC.kekId('abacus-charity-twelve');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('rundtur: encrypt → blob-felter → decrypt; feil KEK → null', async () => {
  const kek = await KC.deriveKekHex('abacus-charity-twelve', 'Hans@Example.com ');
  assert.match(kek, /^[0-9a-f]{64}$/);
  const id = await KC.kekId('abacus-charity-twelve');
  const doc = { anthropic: 'sk-ant-x', kaggle: 'k-123' };
  const blob = await KC.encryptDoc(doc, kek, id, '2026-08-05T12:00:00.000Z');
  assert.equal(blob.v, 'ask1');
  assert.equal(blob.kekId, id);
  assert.equal(blob.updated, '2026-08-05T12:00:00.000Z');
  assert.ok(blob.ct && blob.iv);
  assert.ok(!JSON.stringify(blob).includes('sk-ant-x')); // aldri klartekst
  const tilbake = await KC.decryptDoc(blob, kek);
  assert.deepEqual(tilbake, doc);
  const feilKek = kek.slice(0, 63) + (kek.endsWith('0') ? '1' : '0');
  assert.equal(await KC.decryptDoc(blob, feilKek), null);
});
