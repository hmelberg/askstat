// tests/js/data-directives-use.test.js — segmentnivå-use + kortform
// (plan 2026-07-11-segment-use-cross-runtime), på ny pythonsk grammatikk
// (spec 2026-07-26-pythonsk-direktivsyntaks-design).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

test('parseUse: explicit from still works', () => {
  const r = DD.parseUse('# df = ost.use("df", source="python")');
  assert.deepEqual(r.uses, [{ name: 'df', from: 'python' }]);
  assert.deepEqual(r.errors, []);
});

test('parseUse: short form gives from null', () => {
  const r = DD.parseUse('# df = ost.use("df")');
  assert.deepEqual(r.uses, [{ name: 'df', from: null }]);
});

test('parseUse: invalid source still errors', () => {
  const r = DD.parseUse('# df = ost.use("df", source="stata")');
  assert.equal(r.uses.length, 0);
  assert.equal(r.errors.length, 1);
});

test('runtimeFamily: microdata and pyodide share the python family', () => {
  assert.equal(DD.runtimeFamily('microdata'), 'python');
  assert.equal(DD.runtimeFamily('pyodide'), 'python');
  assert.equal(DD.runtimeFamily('duckdb'), 'duckdb');
  assert.equal(DD.runtimeFamily('r'), 'r');
});

test('parseSegmentUses: short form infers nearest preceding foreign segment', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: "df = 1" },
    { kind: 'r', text: '# df = ost.use("df")\nsummary(df)' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[1].uses, [{ name: 'df', from: 'python' }]);
  assert.equal(r.segments[1].text.includes('use df'), false);
  assert.equal(r.segments[1].text.includes('ost.use'), false);
  assert.equal(r.segments[1].text.includes('summary(df)'), true);
});

test('parseSegmentUses: use-linja tømmes, den slettes ikke (linjenummer bevares)', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'r', text: 'a <- 1\n# x = ost.use("x")\nb <- 2\nstop("her")' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.segments[1].text, 'a <- 1\n\nb <- 2\nstop("her")');
  assert.equal(r.segments[1].text.split('\n').length, 4);
});

test('parseSegmentUses: \\r\\n bevares', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'r', text: 'a <- 1\r\n# x = ost.use("x")\r\nb <- 2' },
  ]);
  assert.equal(r.segments[1].text, 'a <- 1\r\n\r\nb <- 2');
});

test('parseSegmentUses: py -> r -> py chain infers both directions', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'df = 1' },
    { kind: 'r', text: '# df = ost.use("df")\ndf2 <- df' },
    { kind: 'pyodide', text: '# df2 = ost.use("df2")\nprint(df2)' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[1].uses, [{ name: 'df', from: 'python' }]);
  assert.deepEqual(r.segments[2].uses, [{ name: 'df2', from: 'r' }]);
});

test('parseSegmentUses: microdata does not satisfy inference for a pyodide block (same family)', () => {
  const r = DD.parseSegmentUses([
    { kind: 'microdata', text: 'create-dataset d' },
    { kind: 'pyodide', text: '# d = ost.use("d")\nprint(d)' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /angi kilden/);
});

test('parseSegmentUses: explicit from wins over inference', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'duckdb', text: 'SELECT 1' },
    { kind: 'r', text: '# tall = ost.use("tall", source="duckdb")\nsummary(tall)' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[2].uses, [{ name: 'tall', from: 'duckdb' }]);
});

test('parseSegmentUses: use from own family errors', () => {
  const r = DD.parseSegmentUses([
    { kind: 'r', text: '# df = ost.use("df", source="r")\nsummary(df)' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /allerede i r/);
});

test('parseSegmentUses: no preceding foreign segment errors with guidance', () => {
  const r = DD.parseSegmentUses([{ kind: 'r', text: '# df = ost.use("df")\nsummary(df)' }]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /angi kilden/);
});

test('parseSegmentUses: -- and // comment prefixes work (SQL/R style)', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'df = 1' },
    { kind: 'duckdb', text: '-- df = ost.use("df")\nSELECT * FROM df' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[1].uses, [{ name: 'df', from: 'python' }]);
});

test('parseUse: omdøping avvises eksplisitt', () => {
  const r = DD.parseUse('# mine = ost.use("df", source="duckdb")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /omdøping i use er ikke støttet/);
});

test('parseUse: use uten tilordning avvises', () => {
  const r = DD.parseUse('# ost.use("df")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /krever en tilordning/);
});

test('parseUse: «from=» faller ikke stille tilbake til inferens', () => {
  const r = DD.parseUse('# df = ost.use("df", from="python")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /ukjent argument «from».*source/);
});

test('parseUse: annet ukjent argument avvises', () => {
  const r = DD.parseUse('# df = ost.use("df", kilde="python")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /ukjent argument «kilde»/);
});

test('parseUse: posisjonell kilde avvises med egen melding', () => {
  const r = DD.parseUse('# df = ost.use("df", "python")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /ett posisjonsargument/);
});

test('parseUse: source er ikke prototypeoppslag', () => {
  const r = DD.parseUse('# df = ost.use("df", source="constructor")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /kilde må være/);
});

test('parseUse: bare navn (ikke streng) gir lesbar melding', () => {
  const r = DD.parseUse('# df = ost.use(df)');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /ugyldig datasettnavn i use: «df»/);
});

test('parseUse: gammel syntaks gir migrasjonshint, ikke stillhet', () => {
  const r = DD.parseUse('# use df from python');
  assert.deepEqual(r.uses, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /gammel syntaks/);
});

test('parseSegmentUses: gammel syntaks gir migrasjonshint', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'r', text: '# use x from python\nx' },
  ]);
  assert.deepEqual(r.segments[1].uses, []);
  assert.match(r.errors[0], /gammel syntaks/);
});

test('parseSegmentUses: prosakommentarer blir ikke feil', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'r', text: '# use caution here\n# connect early as needed\nx' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.segments[1].text, '# use caution here\n# connect early as needed\nx');
});

test('parseSegmentUses: andre direktivlinjer blir stående', () => {
  const r = DD.parseSegmentUses([
    { kind: 'pyodide', text: 'x = 1' },
    { kind: 'r', text: '# s = ost.connect("ssb")\n# x = ost.use("x")\nx' },
  ]);
  assert.deepEqual(r.segments[1].uses, [{ name: 'x', from: 'python' }]);
  assert.equal(r.segments[1].text, '# s = ost.connect("ssb")\n\nx');
});

test('parseUse: «__proto__» som argumentnavn gjetter ikke kjøretiden i stillhet', () => {
  const r = DD.parseUse('# df = ost.use("df", __proto__="python")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /«__proto__» kan ikke brukes som argumentnavn/);
});

test('parseSegmentUses: ødelagt ost.use-linje varsles, ikke bare gammel syntaks', () => {
  const r = DD.parseSegmentUses([
    { kind: 'duckdb', text: 'CREATE TABLE tall AS SELECT 1' },
    { kind: 'pyodide', text: 'tall = 999' },
    { kind: 'r', text: '# tall = ost.use("tall", __proto__="duckdb")\ntall' },
  ]);
  assert.deepEqual(r.segments[2].uses, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /__proto__/);
});

test('parseUse: prosa med ordet «ost» eller «use» blir ikke feil', () => {
  ['# use caution here', '# ost is a nice place', '# we use ost.use later',
   '# connect early as needed', '# read this as int',
  ].forEach((line) => assert.deepEqual(DD.parseUse(line).errors, [], line));
});
