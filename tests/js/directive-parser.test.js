// tests/js/directive-parser.test.js — grammatikken for direktivlinjer
// (spec 2026-07-26-pythonsk-direktivsyntaks-design §5.2).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
const DP = globalThis.DirectiveParser;

function lit(s) { return DP.parseLiteral(s, 0).value; }

test('parseLiteral: strenger med begge hermetegn', () => {
  assert.equal(lit('"hei"'), 'hei');
  assert.equal(lit("'hei'"), 'hei');
  assert.equal(lit('"med \\"escape\\""'), 'med "escape"');
});

test('parseLiteral: tall, bool, None', () => {
  assert.equal(lit('42'), 42);
  assert.equal(lit('-3.5'), -3.5);
  assert.equal(lit('True'), true);
  assert.equal(lit('False'), false);
  assert.equal(lit('None'), null);
});

test('parseLiteral: liste og tuppel gir begge array', () => {
  assert.deepEqual(lit('["NOR", "SWE"]'), ['NOR', 'SWE']);
  assert.deepEqual(lit('("url", "etikett")'), ['url', 'etikett']);
  assert.deepEqual(lit('[("u1","l1"), ("u2","l2")]'), [['u1','l1'], ['u2','l2']]);
});

test('parseLiteral: dict', () => {
  assert.deepEqual(lit('{"na_item": "B1GQ", "unit": "CP_MEUR"}'),
                   { na_item: 'B1GQ', unit: 'CP_MEUR' });
});

test('parseLiteral: bart navn blir kildereferanse', () => {
  assert.deepEqual(lit('panel'), { __ref: 'panel' });
});

test('parseLiteral: trailing comma tillatt', () => {
  assert.deepEqual(lit('["a", "b",]'), ['a', 'b']);
});

test('parseLiteral: uavsluttet streng gir feil', () => {
  assert.throws(() => lit('"uavsluttet'), /uavsluttet streng/);
});

test('parseLiteral: ukjent tegn gir feil', () => {
  assert.throws(() => lit('@'), /uventet tegn/);
});
