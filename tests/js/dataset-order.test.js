// tests/js/dataset-order.test.js — DatasetOrder (js/dataset-order.js): deler
// datasett-info i {active, stale} basert på entry.runtime vs. aktiv runtime.
// Spec: .superpowers/sdd/task-5-brief.md — Task 5.
// Ren logikk (ingen DOM) — order() er selve modulens eneste ansvar.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/dataset-order.js');
const DatasetOrder = globalThis.DatasetOrder;

test('order: aktiv modus først, stale etter, rekkefølge bevart', () => {
  const info = { a: { runtime: 'brython' }, b: {}, c: { runtime: 'python' }, d: { runtime: 'r' } };
  assert.deepEqual(DatasetOrder.order(info, 'python'), { active: ['b', 'c'], stale: ['a', 'd'] });
  assert.deepEqual(DatasetOrder.order(info, 'brython'), { active: ['a'], stale: ['b', 'c', 'd'] });
});
test('order: tom info gir tomme lister', () => {
  assert.deepEqual(DatasetOrder.order({}, 'python'), { active: [], stale: [] });
});
