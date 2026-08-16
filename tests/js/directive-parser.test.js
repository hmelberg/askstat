// tests/js/directive-parser.test.js — grammatikken for direktivlinjer
// (spec 2026-07-26-pythonsk-direktivsyntaks-design §5.2).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DP = globalThis.DirectiveParser;
const DD = globalThis.DataDirectives;

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
  assert.match(DP.parseLine('# connect helse2025 as h, key(ask)').error, /gammel syntaks/);
  assert.match(DP.parseLine('# load gh/iris.csv as iris').error, /gammel syntaks/);
  assert.match(DP.parseLine('# add p/x into panel inner').error, /gammel syntaks/);
  assert.match(DP.parseLine('# join sales into panel on pid').error, /gammel syntaks/);
  assert.match(DP.parseLine('# create-dataset panel, key(pid)').error, /gammel syntaks/);
});

// Gammel-syntaks-vakten MÅ kreve strukturelle kjennetegn (" as ", " into ",
// " on ", ", key("). Uten det ble «# import numpy as np» en feilmelding —
// en av de vanligste kommentarene som finnes i Python-scripts.
test('parseLine: prosa som starter med et direktivord er IKKE gammel syntaks', () => {
  ['# import numpy as np', '# import pandas as pd', '# add more tests later',
   '# join us on slack', '# connect to database manually', '# read the docs first',
   '# use this function carefully', '# meta information about this repo',
   '# meta bef Folkemengde etter alder',
  ].forEach((line) => assert.equal(DP.parseLine(line), null, line));
});

// Ny syntaks må prøves FØR gammel-vakten, ellers svelges gyldige linjer der
// målnavnet tilfeldigvis er et direktivord.
test('parseLine: direktivord som målnavn er gyldig ny syntaks', () => {
  assert.equal(DP.parseLine('# read = ost.read("x")').form, 'call');
  assert.equal(DP.parseLine('# add = panel.add(p, ["x"])').form, 'call');
  assert.equal(DP.parseLine('# join = panel.join(o, on="id")').form, 'call');
});

test('parseLine: trailing komma i ns-tuppel', () => {
  assert.deepEqual(DP.parseLine('#meta.b.link = "u", "l",').value, ['u', 'l']);
});

test('parseLine: syntaksfeil i argumenter propagerer', () => {
  assert.match(DP.parseLine('# x = ost.read("uavsluttet)').error, /uavsluttet streng/);
});

// Bare enkeltord-former har INGEN kjennetegn som skiller dem fra prosa
// («# use df» ~ «# use caution»), så de varsles bevisst ikke. Migrerings-
// skriptet dekker alle eksisterende filer; dette er kun håndskrivingshjelp.
test('parseLine: bare enkeltord-former varsles bevisst ikke', () => {
  ['# connect fred', '# connect ssb', '# read h as df', '# use df',
   '# meta bef Folkemengde etter alder',
  ].forEach((line) => assert.equal(DP.parseLine(line), null, line));
});

// `use` slipper unna prosa-kollisjonen fordi kilden er et LUKKET sett.
test('parseLine: use-hint krever en gyldig kilde (r|python|duckdb)', () => {
  assert.match(DP.parseLine('# use tall from duckdb').error, /gammel syntaks/);
  assert.match(DP.parseLine('# use df from python').error, /gammel syntaks/);
  ['# use value from cache', '# use token from header', '# use config from settings',
  ].forEach((line) => assert.equal(DP.parseLine(line), null, line));
});

// AKSEPTERT KOLLISJON: «connect <ord> as <ord>» kan ikke strammes uten å miste
// hintet for den vanligste ekte formen. Testen låser avgjørelsen som bevisst.
test('parseLine: connect <ord> as <ord> — akseptert falsk positiv', () => {
  assert.match(DP.parseLine('# connect ssb as s').error, /gammel syntaks/);
  assert.match(DP.parseLine('# connect early as needed').error, /gammel syntaks/);
});

test('parseLine: CRLF-linjeslutt bryter ikke gjenkjenning', () => {
  assert.equal(DP.parseLine('# bef = ost.read("x")\r').form, 'call');
  assert.match(DP.parseLine('# load gh/iris.csv as iris\r').error, /gammel syntaks/);
});

test('parseScript: samler i kildeorden med linjenummer', () => {
  const r = DP.parseScript([
    'import pandas as pd',
    '# ssb = ost.connect("https://x/tables", kind="pxweb")',
    '# bef = ssb.read("05839")',
    '#meta.bef.note = "Folkemengde"',
  ].join('\n'));
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.items.map((it) => it.lineNo), [2, 3, 4]);
  assert.deepEqual(r.items.map((it) => it.form), ['call', 'call', 'ns']);
});

test('parseScript: feil får linjenummer og stopper ikke resten', () => {
  const r = DP.parseScript([
    '# a = ost.read("https://x/a.csv")',
    '# read ssb/05839 as bef',
    '# d = ost.read("https://x/d.csv")',
  ].join('\n'));
  assert.equal(r.items.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^linje 2: .*gammel syntaks/);
});

test('isDirectiveLine: sann for gyldige OG ugyldige direktiver', () => {
  assert.equal(DP.isDirectiveLine('# x = ost.read("u")'), true);
  assert.equal(DP.isDirectiveLine('#meta.bef.note = "t"'), true);
  assert.equal(DP.isDirectiveLine('# panel.add(p, ["a"])'), true);
  // Ugyldige direktiver MÅ telle som direktiver — ellers lekker de inn i
  // DuckDB-SQL, der «#» ikke er kommentar (spec §1.2).
  assert.equal(DP.isDirectiveLine('# read ssb/05839 as bef'), true);   // gammel syntaks
  assert.equal(DP.isDirectiveLine('# x = ost.fetch("u")'), true);      // ukjent verb
});

// Task 2-beslutningen: former uten strukturelt kjennetegn detekteres ikke,
// fordi de er uskillbare fra prosa. De er dermed heller ikke direktivlinjer.
test('isDirectiveLine: usann for de bevisst udetekterte formene', () => {
  ['# meta bef tekst', '# use df', '# connect fred', '# read h as df',
  ].forEach((line) => assert.equal(DP.isDirectiveLine(line), false, line));
});

test('isDirectiveLine: usann for kommentarer, kode, celler og tags', () => {
  assert.equal(DP.isDirectiveLine('# vanlig kommentar'), false);
  assert.equal(DP.isDirectiveLine('SELECT * FROM t'), false);
  assert.equal(DP.isDirectiveLine('#%% python'), false);
  assert.equal(DP.isDirectiveLine('#tag.hide-code = true'), false);
  assert.equal(DP.isDirectiveLine('#options.view = "output-only"'), false);
});

// «__proto__» er den ene nøkkelen som er en aksessor på Object.prototype:
// out['__proto__'] = v setter prototypen i stedet for å lage en egen nøkkel,
// så verdien forsvant STILLE og ingen Object.keys-basert vakt nedstrøms så
// den. For ost.use ga det gjetning av kjøretid uten et ord (Task 7-review).
test('parseLine: «__proto__» som argumentnavn avvises', () => {
  const r = DP.parseLine('# df = ost.use("df", __proto__="python")');
  assert.match(r.error, /«__proto__» kan ikke brukes som argumentnavn/);
});

test('parseLine: «__proto__» som dict-nøkkel avvises', () => {
  const r = DP.parseLine('# meta.bef.link = {"__proto__": "x"}');
  assert.match(r.error, /«__proto__» kan ikke brukes som dict-nøkkel/);
});

test('parseLine: «constructor» skygges normalt og fanges av vaktene nedstrøms', () => {
  const r = DP.parseLine('# df = ost.use("df", constructor="python")');
  assert.deepEqual(Object.keys(r.kwargs), ['constructor']);
});

test('parseLine: Object.prototype forblir urørt etter parsing', () => {
  DP.parseLine('# df = ost.use("df", __proto__="python")');
  DP.parseLine('# meta.bef.link = {"__proto__": "x"}');
  assert.equal(({}).source, undefined);
  assert.equal(({}).x, undefined);
});

// += (2026-07-27): «=» erstatter, «+=» føyer til — standard Python-semantikk.
// Før denne fantes var «# meta.iris.note += "x"» en STILLE kommentar (parseLine
// ga null) — formen er så naturlig at folk kommer til å skrive den uansett.
test('parseLine: += gir augment-flagg, = gir ikke', () => {
  const r = DP.parseLine('# meta.iris.note += "B"');
  assert.equal(r.form, 'ns');
  assert.deepEqual(r.path, ['iris', 'note']);
  assert.equal(r.augment, true);
  assert.equal(DP.parseLine('# meta.iris.note = "B"').augment, false);
});

test('parseLine: += virker også for tuppel- og dict-verdier', () => {
  const r = DP.parseLine('# meta.iris.link += {"https://a": "A"}');
  assert.equal(r.augment, true);
  assert.deepEqual(r.value, { 'https://a': 'A' });
});

// Juli-feilklassen (målt 2026-07-28): modeller la ofte til en forklarende
// hale ETTER kallets avsluttende «)» («# e = eurostat.read("x")  # forklaring»,
// «… ) — kilde: X»). Parseren hardfeilet på halen («uventet tekst etter «)»»)
// i stedet for å ignorere den. Halen kan inneholde «#», «—», ord — alt etter
// SISTE balanserte «)» på linja ignoreres. parseArgs' returnerte pos er
// allerede det balanserte endepunktet (strenger/nøstede lister/dicter er
// konsumert riktig der), så stripping = ikke lenger feile på resten.
test('parseLine: kall tåler en etterfølgende kommentar etter avsluttende )', () => {
  const r1 = DP.parseLine('# e = eurostat.read("nrg_pc_202")  # åpen GET, probet');
  assert.equal(r1.form, 'call');
  assert.equal(r1.recv, 'eurostat');
  assert.equal(r1.verb, 'read');
  assert.deepEqual(r1.args, ['nrg_pc_202']);

  const r2 = DP.parseLine('# o = oecd.read("A,B@C", years="2020:2024") — kilde: OECD');
  assert.equal(r2.form, 'call');
  assert.deepEqual(r2.kwargs, { years: '2020:2024' });
});

// Balansering: en «)» INNI en strengverdi (typisk en etikett) er ikke
// kallets avsluttende parentes. parseLiteral/parseString er sitat-bevisste,
// så den ekte lukkeparentesen finnes korrekt, og halen etter DEN strippes.
test('parseLine: ) inni en strengverdi forveksles ikke med kallets avsluttende )', () => {
  const r = DP.parseLine(
    '# g = worldbank.read(indicators=["NY.GDP.MKTP.CD (current US$)"])  # kilde: WB');
  assert.equal(r.form, 'call');
  assert.deepEqual(r.kwargs, { indicators: ['NY.GDP.MKTP.CD (current US$)'] });
});

// Ingen balansert avsluttende «)» på linja: uendret oppførsel (fortsatt feil).
test('parseLine: uten avsluttende ) er oppførselen uendret', () => {
  const r = DP.parseLine('# x = ssb.read("05839"  # halvferdig');
  assert.ok(r.error, 'skal fortsatt feile uten balansert )');
});

// -- og // markørene deler samme parseLine-vei som # — ingen markørspesifikk
// logikk skiller dem, så toleransen gjelder likt for R/duckdb/JS-kommentarer.
test('parseLine: -- og // markører tåler også etterfølgende kommentar etter )', () => {
  ['--', '//'].forEach((mk) => {
    const r = DP.parseLine(mk + ' d = ost.read("https://x/d.csv")  ' + mk + ' merknad');
    assert.equal(r.form, 'call', 'markør ' + mk);
  });
});

// DD.parse (data-directives.js): samme toleranse på det nivået brukeren og
// AI-tolken faktisk ser — loads[].target og options.canonical bygges likt
// som uten halen.
test('DD.parse: direktivlinje med etterfølgende kommentar parses som om halen ikke fantes', () => {
  const p1 = DD.parse('# e = eurostat.read("nrg_pc_202")  # åpen GET, probet');
  assert.equal(p1.errors.length, 0);
  assert.equal(p1.loads.length, 1);
  assert.equal(p1.loads[0].target, 'eurostat/nrg_pc_202');

  const p2 = DD.parse('# o = oecd.read("A,B@C", years="2020:2024") — kilde: OECD');
  assert.equal(p2.errors.length, 0);
  assert.equal(p2.loads.length, 1);
  assert.equal(p2.loads[0].options.canonical.years.from, '2020');

  // Uten sluttparentes: uendret (fortsatt feil/ikke-direktiv som før).
  const p3 = DD.parse('# x = ssb.read("05839"  # halvferdig');
  assert.equal(p3.loads.length, 0);
  assert.equal(p3.errors.length, 1);
});

// Kodesak B (målt r10 fhi-raden): «# df = fhi.read(f"…")» ga den
// uinstruktive «forventet «,» eller «)»» — modellen gjettet «prikk i
// f-streng»-teorier og brant en kjøring. Direktiver ER literal-only
// (EVAL-regel 7); feilen skal SI det.
test('f-streng i direktiv-arg gir instruktiv literal-only-feil', () => {
  const r = DP.parseScript('# df = fhi.read(f"https://x.no/api/{tabell}/data")');
  assert.equal(r.items.length, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /f-streng/);
  assert.match(r.errors[0], /literal/i);
  assert.match(r.errors[0], /vanlig kode/);
});

test('rf"/b"-prefikser får samme instruktive feil; vanlige kall uendret', () => {
  const r = DP.parseScript('# x = ssb.read(rb"noe")');
  assert.match((r.errors[0] || ''), /f-streng|prefiks/);
  const ok = DP.parseScript('# body = fhi.read("vanlig")');
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.items.length, 1);
});
