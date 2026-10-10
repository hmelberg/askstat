// tests/js/portable-export-scrub.test.js — review 2026-10-10 (S9a): portabel
// eksport/kopi maskerte bare direktivlinjer. KEYS = {...}-linja som
// js/ai-chat.js (mdAskExecuteScript) prepender med RÅ nøkkelverdier er ingen
// direktivlinje og lakk dermed ut i den eksporterte filen.
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
require('../../js/portable-export.js');
const PE = globalThis.PortableExport;

test('transpile (ingen loads): KEYS-linja maskeres og gir advarsel', () => {
  const src = 'KEYS = {"fred": "HEMMELIG123"}\nimport requests\nprint(KEYS["fred"])';
  const out = PE.transpile(src, 'python', []);
  assert.ok(!out.code.includes('HEMMELIG123'), out.code);
  assert.match(out.code, /KEYS = \{"\*\*\*": "\*\*\*"\}/);
  assert.ok(out.warnings.length >= 1);
});

test('transpile (med load): KEYS-linja maskeres også', () => {
  const src = 'KEYS = {"fred": "HEMMELIG123"}\n# df = ost.read("https://example.com/x.csv")\nprint(df)';
  const out = PE.transpile(src, 'python', []);
  assert.ok(!out.code.includes('HEMMELIG123'), out.code);
});

test('transpile: vanlig script uten hemmeligheter passerer byte-identisk', () => {
  const src = 'import pandas as pd\nx = 1\nprint(x)';
  const out = PE.transpile(src, 'python', []);
  assert.equal(out.code, src);
  assert.deepEqual(out.warnings, []);
});
