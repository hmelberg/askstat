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

test('parseLine: ost.connect med kwarg', () => {
  const r = DP.parseLine('# ssb = ost.connect("https://x/tables", kind="pxweb")');
  assert.equal(r.form, 'call');
  assert.equal(r.target, 'ssb');
  assert.equal(r.recv, 'ost');
  assert.equal(r.verb, 'connect');
  assert.deepEqual(r.args, ['https://x/tables']);
  assert.deepEqual(r.kwargs, { kind: 'pxweb' });
});

test('parseLine: metodekall på alias', () => {
  const r = DP.parseLine('# bef = ssb.read("05839", years="2000:2009")');
  assert.equal(r.recv, 'ssb');
  assert.equal(r.verb, 'read');
  assert.deepEqual(r.kwargs, { years: '2000:2009' });
});

test('parseLine: metodekall uten tilordning', () => {
  const r = DP.parseLine('# panel.add(p, ["income", "edu"])');
  assert.equal(r.target, null);
  assert.equal(r.recv, 'panel');
  assert.equal(r.verb, 'add');
  assert.deepEqual(r.args, [{ __ref: 'p' }, ['income', 'edu']]);
});

test('parseLine: alle tre kommentarmarkører', () => {
  ['#', '--', '//'].forEach((mk) => {
    const r = DP.parseLine(mk + ' df = ost.read("https://x/d.csv")');
    assert.equal(r.verb, 'read', 'markør ' + mk);
  });
});

test('parseLine: meta-navnerom', () => {
  const r = DP.parseLine('#meta.bef.note = "Folkemengde"');
  assert.equal(r.form, 'ns');
  assert.deepEqual(r.path, ['bef', 'note']);
  assert.equal(r.value, 'Folkemengde');
});

test('parseLine: meta-lenke som tuppel', () => {
  const r = DP.parseLine('#meta.bef.link = "https://ssb.no", "Om SSB"');
  assert.deepEqual(r.value, ['https://ssb.no', 'Om SSB']);
});

test('parseLine: vanlige kommentarer og kode gir null', () => {
  assert.equal(DP.parseLine('# dette er en vanlig kommentar'), null);
  assert.equal(DP.parseLine('bef = ssb.read("05839")'), null);   // ingen markør
  assert.equal(DP.parseLine('# bef = bef.query("alder > 18")'), null);
  assert.equal(DP.parseLine(''), null);
});

test('parseLine: ukjent ost-verb gir hjelpsom feil', () => {
  const r = DP.parseLine('# x = ost.fetch("u")');
  assert.match(r.error, /ukjent verb «ost\.fetch».*connect, read, create, use/);
});

test('parseLine: gammel syntaks gir migrasjonshint', () => {
  assert.match(DP.parseLine('# read ssb/05839 as bef').error,
               /gammel syntaks.*ost\.read/);
  assert.match(DP.parseLine('# connect fred').error, /gammel syntaks/);
  assert.match(DP.parseLine('# meta bef Folkemengde').error,
               /gammel syntaks.*meta\.bef/);
});

test('parseLine: syntaksfeil i argumenter propagerer', () => {
  assert.match(DP.parseLine('# x = ost.read("uavsluttet)').error, /uavsluttet streng/);
});
