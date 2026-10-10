// tests/js/directive-receivers.test.js — B2: vanlige kommentarer med
// .add/.join/.read er IKKE direktiver; B10a: literal-detaljer.
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DP = globalThis.DirectiveParser;
const DD = globalThis.DataDirectives;

function lit(s) { return DP.parseLiteral(s, 0).value; }

// ── B2 ──────────────────────────────────────────────────────────────────────
test('parseScript: «# seen.add(code)» uten ost.create er en vanlig kommentar', () => {
  const r = DP.parseScript('seen = set()\n# seen.add(code)\nprint(1)');
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.errors, []);
  const a = DD.parseAssembly('# seen.add(code)');
  assert.deepEqual(a.errors, []);
});

test('parseScript: «# html = resp.read()» uten connect er en vanlig kommentar', () => {
  const r = DP.parseScript('# html = resp.read()\n# n = f.read(1024)');
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.errors, []);
  const p = DD.parse('# html = resp.read()');
  assert.deepEqual(p.loads, []);
  assert.deepEqual(p.errors, []);
});

test('parseScript: .add/.join på et ost.create-datasett er fortsatt direktiver', () => {
  const s = '# p = ost.connect("x")\n# panel = ost.create(key="pid")\n# panel.add(p, ["a"])\n' +
            '# other = ost.create(key="pid")\n# other.add(p, ["b"])\n# panel.join(other, on="pid")';
  const r = DP.parseScript(s);
  assert.deepEqual(r.errors, []);
  assert.equal(r.items.filter(i => i.verb === 'add').length, 2);
  assert.equal(r.items.filter(i => i.verb === 'join').length, 1);
});

test('parseScript: create ETTER add i scriptet teller (alle create samles først)', () => {
  const r = DP.parseScript('# panel.add(p, ["a"])\n# panel = ost.create(key="pid")');
  assert.equal(r.items.filter(i => i.verb === 'add').length, 1);
});

test('parseScript: <alias>.read på connect-alias eller med streng-arg/kwargs er direktiv', () => {
  const r = DP.parseScript('# h = ost.connect("x")\n# df = h.read()\n# a = ssb.read("05839")\n' +
                           '# w = worldbank.read(indicators=["NY.GDP"])');
  assert.deepEqual(r.items.filter(i => i.verb === 'read').map(i => i.target), ['df', 'a', 'w']);
});

test('parseScript: kjente kilde-id-er (setKnownSources) godtas uten argumenter', () => {
  DP.setKnownSources(['datacommons']);
  try {
    const r = DP.parseScript('# d = datacommons.read()');
    assert.equal(r.items.length, 1);
  } finally { DP.setKnownSources(null); }
  assert.equal(DP.parseScript('# d = datacommons.read()').items.length, 0);
});

test('parseScript: syntaksfeil i .add på et ikke-datasett er en kommentar, ikke en feil', () => {
  const r = DP.parseScript('# seen.add(f"x{y}")');
  assert.deepEqual(r.errors, []);
});

test('parseScript: ost.* er alltid direktiv, også uten kontekst', () => {
  const r = DP.parseScript('# x = ost.read("https://x/y.csv")');
  assert.equal(r.items.length, 1);
});

// ── B10a ────────────────────────────────────────────────────────────────────
test('parseLiteral: tall med ledende null forblir strenger (SSB-regionkoder)', () => {
  assert.equal(lit('0301'), '0301');
  assert.equal(lit('-0301'), '-0301');
  assert.equal(lit('0'), 0);
  assert.equal(lit('0.5'), 0.5);
  assert.equal(lit('10'), 10);
  assert.deepEqual(lit('[0301, 1103]'), ['0301', 1103]);
});

test('parseLiteral: standard escapes i strenger', () => {
  assert.equal(lit('"a\\nb"'), 'a\nb');
  assert.equal(lit('"a\\tb"'), 'a\tb');
  assert.equal(lit('"a\\\\b"'), 'a\\b');
  assert.equal(lit("'it\\'s'"), "it's");
  assert.equal(lit('"med \\"escape\\""'), 'med "escape"');
  assert.equal(lit('"\\u00e6"'), 'æ');
  assert.equal(lit('"C:\\dir"'), 'C:\\dir');   // ukjent escape beholdes, som i python
});

test('parseLine: hale-kommentar etter meta-verdi tolereres som etter kall', () => {
  const r = DP.parseLine('# meta.x = "a"  # forklaring');
  assert.ok(!r.error, r.error);
  assert.equal(r.value, 'a');
  const r2 = DP.parseLine('# meta.x = "a", "b"  # forklaring');
  assert.deepEqual(r2.value, ['a', 'b']);
  assert.match(DP.parseLine('# meta.x = "a" b').error, /uventet tekst/);
});
