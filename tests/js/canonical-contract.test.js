// Paritetsvernet (spec 2026-08-15 §4): samme fasit som pytest kjører —
// JS- og python-oversettelsen kan ikke drifte stille igjen (målt:
// eurostat-liste-fiksen fantes kun i JS 2026-08-05..15).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

const fasit = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'contract', 'canonical-cases.json'), 'utf8'));

for (const c of fasit.cases) {
  if (c.only && c.only !== 'js') continue;
  test('kontrakt: ' + c.name, () => {
    const tr = DD.translateCanonical(c.kind, c.rest || '', c.canonical);
    if (c.expect_error) {
      assert.ok(tr && tr.error, 'ventet feilcase');
      assert.match(tr.error, new RegExp(c.expect_error));
      return;
    }
    assert.ok(!tr.error, tr.error);
    assert.deepEqual([...tr.params].sort(), [...c.expect_params].sort());
    if (c.expect_rest !== undefined) assert.equal(tr.rest, c.expect_rest);
  });
}
