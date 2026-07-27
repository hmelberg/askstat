// tests/js/example-loads.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');

function loadDD() {
  const sandbox = { window: {}, console }; vm.createContext(sandbox);
  // data-directives.js kaller global.DirectiveParser ved parsing — grammatikken
  // må lastes FØRST, ellers er feilen en TypeError og ikke et assertion-avvik.
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'directive-parser.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data-directives.js'), 'utf8'), sandbox);
  return sandbox.window.DataDirectives;
}
const DD = loadDD();
// python/ex_csv_iris.txt is NOT in this list (pandas-url-bro, Task 6): it was
// converted from a `# iris = ost.read(...)` directive to real
// `iris = pd.read_csv(...)` code, so it correctly has zero load directives
// now — see examples/python/ex_csv_iris.txt and .superpowers/sdd/bro-smoke.md.
const FILES = ['python/ex_columns_penguins.txt',
               'r/rex_csv_iris.txt','r/rex_columns_penguins.txt'];

for (const f of FILES) {
  test('load directive parses: ' + f, () => {
    const text = fs.readFileSync(path.join(root, 'examples', f), 'utf8');
    const parsed = DD.parse(text);      // { connects, loads, errors } shape
    const loads = (parsed && parsed.loads) || [];
    assert.ok(loads.length >= 1, 'has at least one load directive');
    assert.ok(/^https?:\/\//.test(loads[0].target || ''), 'load target is a URL');
  });
}
