# Pythonsk direktivsyntaks — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt de åtte direktiv-regexene i `js/data-directives.js` med én pythonsk grammatikk (`meta.x.y = …` og `navn = ost.verb(…)`), og konsolider de seks divergerende verblistene til én `isDirectiveLine()`.

**Architecture:** Ny, ren parsermodul `js/directive-parser.js` bygges og testes helt isolert (faser A–B) mens appen er urørt og grønn. Deretter én cutover-fase der `data-directives.js` bytter innmat, alle eksempler konverteres av et engangsskript, og de seks verblistene erstattes — alt i samme runde, fordi omleggingen er hard og uten aliaser. `parse()`, `resolve()`, `parseAssembly()`, `parseUse()`, `parseSegmentUses()` og `metaByTarget()` beholder **identiske eksterne signaturer og returformer**, så ingen kallsted utenfor modulen endrer logikk.

**Tech Stack:** Vanilla ES5-stil browser-JS (samme stil som resten av `js/`), `node:test` for enhetstester, `deno test` for edge-paritetstestene, pytest for `openstat.py`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md`. Hver task refererer til sin §.
- **Ingen bakoverkompatibilitet.** Gammel syntaks skal gi feilmelding med forslag, aldri stille aksept (spec §8.1).
- **Ingen arkitekturendring.** `DataDirectives.parse()` kjøres fortsatt statisk på editorteksten før kjøring. Motorer, `js/data-loader.js` (fetch/proxy/nøkler/cache), `js/pxweb.js`, `js/api-kinds.js`, `js/assembly-duckdb.js` og `#%%`-cellemaskineriet røres ikke (spec §7).
- **Filstil i `js/*.js`:** IIFE med `(function (global) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);`, `var` ikke `let/const`, ingen pilfunksjoner, ingen moduler. Match `js/data-directives.js` nøyaktig (den har null `const`).
- **Filstil i `tests/js/*.test.js`:** moderne node-JS — `const`, pilfunksjoner og `require('node:test')`, som i `tests/js/meta-info.test.js` og `cells.test.js`. ES5-kravet over gjelder **ikke** testene.
- **Kommentarmarkører:** `#`, `--` og `//` er likeverdige overalt (uendret).
- **Språk:** kommentarer og feilmeldinger på norsk, verb og API-navn på engelsk.
- **Testkommandoer:**
  - `node --test tests/js/` (JS-enhetstester)
  - `cd netlify/edge-functions && deno test --allow-all _lib/` (paritet/edge)
  - `.venv/bin/python -m pytest tests/` (Python)
- **Ikke push.** Commit lokalt; push i openstat er Hans' beslutning.

## Spec-korreksjon vedtatt ved planlegging

Spec §5.2 lister `NAVNEROM := options | tag | meta`. Det er feil mot §7 og §10, som sier at `#options.` og `#tag.` beholder sine eksisterende parsere (`index.html:6901` og `js/cells.js:112`). **`js/directive-parser.js` tolker kun `meta.`** blant navnerommene. `options`/`tag` er utenfor `isDirectiveLine()` og strippes som i dag. Task 14 retter spec-teksten.

---

## Filstruktur

| Fil | Ansvar | Status |
|---|---|---|
| `js/directive-parser.js` | **Ny.** Ren grammatikk: literaler, linjeformer, feilmeldinger. Ingen kunnskap om kilder, registre, kinds eller URL-er. | Opprettes T1–T3 |
| `js/data-directives.js` | Semantikk: connects/loads/metas/assembly/use + `resolve()`. Bytter innmat fra 8 regexer til `DirectiveParser`. | Endres T4–T7, T9 |
| `tests/js/directive-parser.test.js` | Enhetstester for grammatikken. | Opprettes T1 |
| `tests/js/directive-semantics.test.js` | Enhetstester for de nye `parse()`/`parseAssembly()`-formene. | Opprettes T4 |
| `tools/migrate_directives.py` | Engangs (men beholdt) konverteringsskript gammel → ny syntaks. | Opprettes T8 |
| `openstat.py` | `Dataset.join`, `format=`, avvisning av editor-only kwargs. | Endres T12 |
| `js/portable-export.js` | Stripper editor-only kwargs; bruker `isDirectiveLine`. | Endres T11, T13 |

**Rekkefølgens hensikt:** faser A–B legger til en ny fil og rører ingenting annet, så `main` er grønn hele veien. Cutover (T8–T11) er den eneste fasen der appen midlertidig er inkonsistent, og den skal derfor gjøres ferdig i én sittende.

---

# Fase A — grammatikken, isolert

### Task 1: Literal-parser

**Files:**
- Create: `js/directive-parser.js`
- Test: `tests/js/directive-parser.test.js`

**Interfaces:**
- Consumes: ingenting.
- Produces: `DirectiveParser.parseLiteral(text, pos)` → `{value, pos}`; kaster `Error` med norsk melding ved syntaksfeil. `value` er JS-string/number/boolean/null, array (både `[…]` og `(…)`), rent objekt (`{…}`), eller `{__ref: "navn"}` for et bart identifikatornavn (kildereferanse).

- [ ] **Step 1: Write the failing test**

Create `tests/js/directive-parser.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-parser.test.js`
Expected: FAIL — `Cannot find module '../../js/directive-parser.js'`

- [ ] **Step 3: Write minimal implementation**

Create `js/directive-parser.js`:

```js
// js/directive-parser.js — grammatikken for direktivlinjer.
// Ren: kjenner ikke kilder, registre, kinds eller URL-er — kun form.
// Spec: docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md §5.
(function (global) {
  'use strict';

  var IDENT_RE = /^[A-Za-z_]\w*/;

  function skipWs(s, i) {
    while (i < s.length && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) i++;
    return i;
  }

  function fail(msg) { throw new Error(msg); }

  // parseLiteral(s, i) -> {value, pos}
  function parseLiteral(s, i) {
    i = skipWs(s, i);
    if (i >= s.length) fail('mangler verdi');
    var c = s.charAt(i);

    if (c === '"' || c === "'") return parseString(s, i, c);
    if (c === '[') return parseSeq(s, i, ']');
    if (c === '(') return parseSeq(s, i, ')');
    if (c === '{') return parseDict(s, i);
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber(s, i);

    var m = IDENT_RE.exec(s.slice(i));
    if (m) {
      var word = m[0];
      if (word === 'True') return { value: true, pos: i + 4 };
      if (word === 'False') return { value: false, pos: i + 5 };
      if (word === 'None') return { value: null, pos: i + 4 };
      return { value: { __ref: word }, pos: i + word.length };
    }
    fail('uventet tegn «' + c + '»');
  }

  function parseString(s, i, quote) {
    var out = '', j = i + 1;
    while (j < s.length) {
      var ch = s.charAt(j);
      if (ch === '\\' && j + 1 < s.length) { out += s.charAt(j + 1); j += 2; continue; }
      if (ch === quote) return { value: out, pos: j + 1 };
      out += ch; j++;
    }
    fail('uavsluttet streng');
  }

  function parseNumber(s, i) {
    var m = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) fail('ugyldig tall');
    return { value: parseFloat(m[0]), pos: i + m[0].length };
  }

  function parseSeq(s, i, close) {
    var out = [], j = skipWs(s, i + 1);
    if (s.charAt(j) === close) return { value: out, pos: j + 1 };
    while (j < s.length) {
      var r = parseLiteral(s, j);
      out.push(r.value);
      j = skipWs(s, r.pos);
      if (s.charAt(j) === ',') { j = skipWs(s, j + 1); if (s.charAt(j) === close) return { value: out, pos: j + 1 }; continue; }
      if (s.charAt(j) === close) return { value: out, pos: j + 1 };
      fail('forventet «,» eller «' + close + '»');
    }
    fail('mangler «' + close + '»');
  }

  function parseDict(s, i) {
    var out = {}, j = skipWs(s, i + 1);
    if (s.charAt(j) === '}') return { value: out, pos: j + 1 };
    while (j < s.length) {
      var k = parseLiteral(s, j);
      if (typeof k.value !== 'string') fail('dict-nøkkel må være streng');
      j = skipWs(s, k.pos);
      if (s.charAt(j) !== ':') fail('forventet «:» etter dict-nøkkel');
      var v = parseLiteral(s, j + 1);
      out[k.value] = v.value;
      j = skipWs(s, v.pos);
      if (s.charAt(j) === ',') { j = skipWs(s, j + 1); if (s.charAt(j) === '}') return { value: out, pos: j + 1 }; continue; }
      if (s.charAt(j) === '}') return { value: out, pos: j + 1 };
      fail('forventet «,» eller «}»');
    }
    fail('mangler «}»');
  }

  global.DirectiveParser = { parseLiteral: parseLiteral };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-parser.test.js`
Expected: PASS, 8 tester

- [ ] **Step 5: Commit**

```bash
git add js/directive-parser.js tests/js/directive-parser.test.js
git commit -m "feat(direktiv): literal-parser for pythonsk direktivgrammatikk"
```

---

### Task 2: Linjeparser — de tre formene

**Files:**
- Modify: `js/directive-parser.js`
- Test: `tests/js/directive-parser.test.js`

**Interfaces:**
- Consumes: `parseLiteral` fra Task 1.
- Produces: `DirectiveParser.parseLine(line)` → én av:
  - `null` — ikke en direktivlinje (vanlig kommentar, kode, tom linje)
  - `{form:'ns', ns:'meta', path:['bef','note'], value:<js>, raw:'…'}`
  - `{form:'call', target:'bef'|null, recv:'ost'|'ssb', verb:'read', args:[…], kwargs:{…}, raw:'…'}`
  - `{error:'melding'}` — ser ut som et direktiv, men er ugyldig

**Kritisk designregel (falske positiver):** en linje regnes kun som vår hvis
mottakeren er `ost`, eller verbet er `read`/`add`/`join` på et navn. Alt annet
gir `null`. Uten denne regelen ville en uskyldig kommentar som
`# bef = bef.query("alder > 18")` blitt en feilmelding.

- [ ] **Step 1: Write the failing test**

Append to `tests/js/directive-parser.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-parser.test.js`
Expected: FAIL — `DP.parseLine is not a function`

- [ ] **Step 3: Write minimal implementation**

In `js/directive-parser.js`, insert before the `global.DirectiveParser = …` line:

```js
  var MARKER_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*/;
  var NS = { meta: 1 };
  var OST_VERBS = { connect: 1, read: 1, create: 1, use: 1 };
  var METHODS = { read: 1, add: 1, join: 1 };

  // Gammel syntaks -> migrasjonshint. Hvert mønster krever et KJENNETEGN som
  // prosa ikke har: " as " sammen med en sti/URL eller opsjonshale, " into "
  // med en <kilde>/<kolonne>-referanse, " on ", ", key(", " from ".
  //
  // Prinsippet er at falske positiver er verre enn tapte hint: et hint som
  // uteblir koster brukeren en oppslagstur, mens en kommentar som blir en
  // hard feilmelding stopper scriptet. Derfor varsles IKKE de bare
  // enkeltord-formene, som er strukturelt identiske med prosa:
  //   «# meta bef tekst»  ~ «# meta information about this repo»
  //   «# use df»          ~ «# use caution»
  //   «# connect ssb»     ~ «# connect manually»
  //   «# read h as df»    ~ «# read this as int»
  // AKSEPTERT GJENSTÅENDE: «connect <ord> as <ord>» kan ikke strammes uten å
  // miste hintet for den vanligste ekte formen («# connect ssb as s»), så
  // «# connect early as needed» gir feilmelding. `use` slipper unna fordi
  // kilden der er et lukket sett (r|python|duckdb).
  // Migreringsskriptet (Task 8) konverterer alle eksisterende filer, så disse
  // formene finnes ikke i repoet — vakten er kun en håndskrivingshjelp.
  var OLD_PATTERNS = [
    { w: 'connect', re: /^connect[ \t]+\S+[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*(?:,[ \t]*\w+\(.*)?$|^connect[ \t]+\S+[ \t]*,[ \t]*\w+\(.*$/i },
    { w: 'read',    re: /^(?:read|load|require)[ \t]+\S*[\/:]\S*[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*(?:,[ \t]*\w+\(.*)?$|^(?:read|load|require)[ \t]+\S+[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*,[ \t]*\w+\(.*$/i },
    { w: 'create',  re: /^create(?:[-_]dataset)?[ \t]+[A-Za-z_]\w*[ \t]*,[ \t]*key\(/i },
    { w: 'add',     re: /^(?:add|import)[ \t]+\S*\/\S*.*[ \t]+into[ \t]+[A-Za-z_]\w*(?:[ \t]+(?:left|inner|outer))?[ \t]*$/i },
    { w: 'join',    re: /^join[ \t]+[A-Za-z_]\w*[ \t]+into[ \t]+[A-Za-z_]\w*[ \t]+on[ \t]+\S/i },
    { w: 'use',     re: /^use[ \t]+[A-Za-z_]\w*[ \t]+from[ \t]+(?:r|python|duckdb)[ \t]*$/i }
  ];

  var HINT = {
    connect: 'skriv «# <alias> = ost.connect("<mål>")»',
    read: 'skriv «# <navn> = ost.read("<mål>")» eller «# <navn> = <alias>.read("<tabell>")»',
    create: 'skriv «# <navn> = ost.create(key="<kolonne>")»',
    add: 'skriv «# <datasett>.add(<kilde>, ["<kolonne>"])»',
    join: 'skriv «# <datasett>.join(<navn>, on="<kolonne>")»',
    use: 'skriv «# <navn> = ost.use("<navn>")»'
  };

  function parseArgs(s, i) {
    var args = [], kwargs = {};
    i = skipWs(s, i);
    if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 };
    while (i < s.length) {
      var kw = /^([A-Za-z_]\w*)[ \t]*=(?!=)/.exec(s.slice(i));
      if (kw) {
        var v = parseLiteral(s, i + kw[0].length);
        kwargs[kw[1]] = v.value;
        i = skipWs(s, v.pos);
      } else {
        var a = parseLiteral(s, i);
        if (Object.keys(kwargs).length) fail('posisjonsargument etter navngitt argument');
        args.push(a.value);
        i = skipWs(s, a.pos);
      }
      if (s.charAt(i) === ',') { i = skipWs(s, i + 1); if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 }; continue; }
      if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 };
      fail('forventet «,» eller «)»');
    }
    fail('mangler «)»');
  }

  function oldSyntaxError(body) {
    for (var i = 0; i < OLD_PATTERNS.length; i++) {
      if (OLD_PATTERNS[i].re.test(body)) {
        return { error: '«' + body + '» er gammel syntaks — ' + (HINT[OLD_PATTERNS[i].w] || 'se hjelpen') };
      }
    }
    return null;
  }

  // parseLine(line) -> null | {form…} | {error}
  function parseLine(line) {
    var raw = String(line == null ? '' : line);
    var mk = MARKER_RE.exec(raw);
    if (!mk) return null;
    var body = raw.slice(mk[0].length).replace(/[ \t\r]+$/, '');
    if (!body) return null;

    // Den NYE grammatikken prøves først. Motsatt rekkefølge lot
    // gammel-syntaks-vakten svelge gyldige linjer som «read = ost.read("x")».
    try {
      // Form 1: <navnerom>.<sti> = <literal>
      var ns = /^([A-Za-z_]\w*)((?:\.[A-Za-z_]\w*)+)[ \t]*=[ \t]*/.exec(body);
      if (ns && NS[ns[1]]) {
        var path = ns[2].slice(1).split('.');
        var rest = body.slice(ns[0].length);
        var first = parseLiteral(rest, 0);
        var after = skipWs(rest, first.pos);
        if (after >= rest.length) return { form: 'ns', ns: ns[1], path: path, value: first.value, raw: raw.trim() };
        if (rest.charAt(after) !== ',') fail('uventet tekst etter verdi');
        var tup = [first.value];
        while (rest.charAt(after) === ',') {
          var probe = skipWs(rest, after + 1);
          if (probe >= rest.length) { after = probe; break; }   // trailing komma
          var nx = parseLiteral(rest, probe);
          tup.push(nx.value);
          after = skipWs(rest, nx.pos);
        }
        if (after < rest.length) fail('uventet tekst etter verdi');
        return { form: 'ns', ns: ns[1], path: path, value: tup, raw: raw.trim() };
      }

      // Form 2: [<navn> =] <mottaker>.<verb>(<args>)
      var call = /^(?:([A-Za-z_]\w*)[ \t]*=[ \t]*)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)[ \t]*\(/.exec(body);
      if (call) {
        var target = call[1] || null, recv = call[2], verb = call[3];
        if ((recv === 'ost') || METHODS[verb]) {
          if (recv === 'ost' && !OST_VERBS[verb]) {
            return { error: 'ukjent verb «ost.' + verb + '» — gyldige: connect, read, create, use' };
          }
          var pr = parseArgs(body, call[0].length);
          if (skipWs(body, pr.pos) < body.length) fail('uventet tekst etter «)»');
          return { form: 'call', target: target, recv: recv, verb: verb,
                   args: pr.args, kwargs: pr.kwargs, raw: raw.trim() };
        }
      }
    } catch (e) {
      return { error: e.message };
    }

    return oldSyntaxError(body);
  }
```

Change the export line to:

```js
  global.DirectiveParser = { parseLiteral: parseLiteral, parseLine: parseLine };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-parser.test.js`
Expected: PASS, 25 tester

- [ ] **Step 5: Commit**

```bash
git add js/directive-parser.js tests/js/directive-parser.test.js
git commit -m "feat(direktiv): linjeparser for ns-tilordning og ost-kall"
```

---

### Task 3: `parseScript()` + `isDirectiveLine()`

**Files:**
- Modify: `js/directive-parser.js`
- Test: `tests/js/directive-parser.test.js`

**Interfaces:**
- Consumes: `parseLine` fra Task 2.
- Produces:
  - `DirectiveParser.parseScript(text)` → `{items: [{lineNo, …parseLine-form}], errors: ['linje N: …']}`. `items` inneholder kun vellykkede parseringer, i kildeorden.
  - `DirectiveParser.isDirectiveLine(line)` → boolean. Sann for enhver linje `parseLine` gir en `form` **eller** en `error` for. Feilende direktivlinjer må telle som direktiver, ellers lekker de inn i DuckDB-SQL (spec §1.2).

- [ ] **Step 1: Write the failing test**

Append to `tests/js/directive-parser.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-parser.test.js`
Expected: FAIL — `DP.parseScript is not a function`

- [ ] **Step 3: Write minimal implementation**

In `js/directive-parser.js`, add before the export line:

```js
  function parseScript(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var items = [], errors = [];
    for (var i = 0; i < lines.length; i++) {
      var r = parseLine(lines[i]);
      if (!r) continue;
      if (r.error) { errors.push('linje ' + (i + 1) + ': ' + r.error); continue; }
      r.lineNo = i + 1;
      items.push(r);
    }
    return { items: items, errors: errors };
  }

  function isDirectiveLine(line) {
    return parseLine(line) !== null;
  }
```

Change the export line to:

```js
  global.DirectiveParser = { parseLiteral: parseLiteral, parseLine: parseLine,
                             parseScript: parseScript, isDirectiveLine: isDirectiveLine };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-parser.test.js`
Expected: PASS, 30 tester

- [ ] **Step 5: Commit**

```bash
git add js/directive-parser.js tests/js/directive-parser.test.js
git commit -m "feat(direktiv): parseScript + isDirectiveLine"
```

---

# Fase B — semantikk på det nye parsetreet

Fra og med Task 4 endres `js/data-directives.js`. Modulen laster
`js/directive-parser.js` som en vanlig global (samme mønster som `ApiKinds`),
så `index.html` må få `<script src="js/directive-parser.js"></script>` **før**
`data-directives.js` — det gjøres i Task 4, Step 5.

### Task 4: `optionsFromKwargs()` + ny `parse()` for connects/loads + `scrubKeys`

**Files:**
- Modify: `js/data-directives.js:17-32` (slett `CONNECT_RE`, `LOAD_RE`), `:159-161` (`scrubKeys`), `:163-197` (`parse`)
- Modify: `index.html` (script-tag)
- Test: `tests/js/directive-semantics.test.js` (ny)

**Interfaces:**
- Consumes: `DirectiveParser.parseScript` (T3).
- Produces: uendret ekstern form —
  `parse(script)` → `{connects:[{target, alias, options}], loads:[{verb:'read', target, alias, options, line}], metas:[…], errors:[…]}`.
  `options` har nøyaktig dagens form: `{key?, exec?, kind?, cache?, canonical?:{years:{from,to}, countries:[], regions:[], indicators:[], filters:{}, all:true}}`.
  Ny intern hjelper `optionsFromKwargs(kwargs, errors, lineNo)`.

**Mål-mapping (bevarer `resolve()` uendret):**

| Parsetre | `loads[]`/`connects[]` |
|---|---|
| `ssb = ost.connect("URL", kind="pxweb")` | `connects: {target:'URL', alias:'ssb', options:{kind:'pxweb'}}` |
| `ssb = ost.connect("ssb")` | `connects: {target:'ssb', alias:'ssb', options:{}}` |
| `bef = ssb.read("05839", …)` | `loads: {target:'ssb/05839', alias:'bef'}` |
| `df = h.read()` | `loads: {target:'h', alias:'df'}` |
| `df = ost.read("URL", …)` | `loads: {target:'URL', alias:'df'}` |

- [ ] **Step 1: Write the failing test**

Create `tests/js/directive-semantics.test.js`:

```js
// tests/js/directive-semantics.test.js — parse() på ny grammatikk
// (spec 2026-07-26-pythonsk-direktivsyntaks-design §4.1).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

test('parse: connect + read med kind og kanonisk vokabular', () => {
  const p = DD.parse([
    '# ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")',
    '# bef = ssb.read("05839", years="2000:2009", indicators="Personer")',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.connects, [{
    target: 'https://data.ssb.no/api/pxwebapi/v2/tables',
    alias: 'ssb', options: { kind: 'pxweb' },
  }]);
  assert.equal(p.loads.length, 1);
  assert.equal(p.loads[0].target, 'ssb/05839');
  assert.equal(p.loads[0].alias, 'bef');
  assert.equal(p.loads[0].verb, 'read');
  assert.deepEqual(p.loads[0].options.canonical,
    { years: { from: '2000', to: '2009' }, indicators: ['Personer'] });
});

test('parse: bar URL uten connect', () => {
  const p = DD.parse('# co2 = ost.read("https://ourworldindata.org/grapher/co2.csv")');
  assert.equal(p.loads[0].target, 'https://ourworldindata.org/grapher/co2.csv');
  assert.deepEqual(p.connects, []);
});

test('parse: read() uten argument gir hele rammen', () => {
  const p = DD.parse([
    '# h = ost.connect("helse2025", key="ask")',
    '# df = h.read()',
  ].join('\n'));
  assert.equal(p.connects[0].options.key, 'ask');
  assert.equal(p.loads[0].target, 'h');
});

test('parse: years med åpen ende, countries som liste, all og filters', () => {
  const p = DD.parse([
    '# eu = ost.connect("https://x/", kind="eurostat")',
    '# b = eu.read("nama_10_gdp", years="2020:", countries=["NO","SE"], all=True,',
    '#              filters={"na_item": "B1GQ"})',
  ].join('\n'));
  // flerlinjede kall støttes IKKE — linje 3 skal gi feil, ikke stille dropp
  assert.ok(p.errors.length >= 1);
});

test('parse: enlinjet variant av samme', () => {
  const p = DD.parse([
    '# eu = ost.connect("https://x/", kind="eurostat")',
    '# b = eu.read("nama_10_gdp", years="2020:", countries=["NO","SE"], all=True, filters={"na_item":"B1GQ"})',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const c = p.loads[0].options.canonical;
  assert.deepEqual(c.years, { from: '2020', to: null });
  assert.deepEqual(c.countries, ['NO', 'SE']);
  assert.equal(c.all, true);
  assert.deepEqual(c.filters, { na_item: 'B1GQ' });
});

test('parse: ukjent kwarg gir did-you-mean', () => {
  const p = DD.parse('# b = ost.read("https://x/d.csv", yers="2020")');
  assert.match(p.errors[0], /linje 1.*ukjent argument «yers».*years/);
});

test('parse: gammel syntaks gir feil, ikke stille dropp', () => {
  const p = DD.parse('# read ssb/05839 as bef');
  assert.equal(p.loads.length, 0);
  assert.match(p.errors[0], /gammel syntaks/);
});

test('scrubKeys: maskerer key="literal", beholder key="ask"', () => {
  assert.equal(DD.scrubKeys('# d = ost.read("u", key="hemmelig")'),
                            '# d = ost.read("u", key="***")');
  assert.equal(DD.scrubKeys('# d = ost.read("u", key="ask")'),
                            '# d = ost.read("u", key="ask")');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: FAIL — `parse` returnerer tomme `connects`/`loads` (gamle regexer matcher ikke ny syntaks)

- [ ] **Step 3: Write minimal implementation**

In `js/data-directives.js`: delete `CONNECT_RE` (`:17`) and `LOAD_RE` (`:18`). Replace `scrubKeys` (`:159-161`) and `parse` (`:163-197`) with:

```js
  // key="<literal>" -> key="***" før scriptet logges eller sendes til AI.
  // key="ask" er ingen hemmelighet og beholdes.
  function scrubKeys(script) {
    return String(script || '').replace(
      /\b(key[ \t]*=[ \t]*)(["'])(?!ask\2)[^"']*\2/gi, '$1"***"');
  }

  var CANON_KEYS = { years: 1, countries: 1, regions: 1, indicators: 1, filters: 1, all: 1 };
  var PLAIN_KEYS = { key: 1, exec: 1, kind: 1, cache: 1 };
  var LOWER_KEYS = { exec: 1, kind: 1, cache: 1 };

  // Ekte Levenshtein: posisjonssammenligning straffer innskudd for hardt og
  // ville foreslått «key» for «yers» (kortere navn vinner på lengdeleddet).
  function editDistance(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  function suggest(name) {
    var all = Object.keys(PLAIN_KEYS).concat(Object.keys(CANON_KEYS)), best = null, bestD = 99;
    for (var i = 0; i < all.length; i++) {
      var d = editDistance(all[i], name);
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    return bestD <= 3 ? best : null;
  }

  function asList(v) {
    if (v == null) return [];
    if (Object.prototype.toString.call(v) === '[object Array]') return v.map(String);
    return String(v).split(/[\s,]+/).filter(Boolean);
  }

  // kwargs -> dagens options-form (uendret for resolve()).
  function optionsFromKwargs(kwargs, errors, lineNo) {
    var opts = {}, canonical = null;
    function canon() { return (canonical = canonical || (opts.canonical = {})); }
    Object.keys(kwargs || {}).forEach(function (name) {
      var v = kwargs[name];
      if (PLAIN_KEYS[name]) {
        opts[name] = LOWER_KEYS[name] ? String(v).toLowerCase() : String(v);
        return;
      }
      if (name === 'years') {
        var parts = String(v).split(':');
        canon().years = { from: (parts[0] || '').trim() || null,
                          to: parts.length > 1 ? ((parts[1] || '').trim() || null)
                                               : ((parts[0] || '').trim() || null) };
        return;
      }
      if (name === 'countries' || name === 'regions' || name === 'indicators') {
        canon()[name] = asList(v); return;
      }
      if (name === 'filters') {
        if (typeof v !== 'object' || v === null || Object.prototype.toString.call(v) === '[object Array]') {
          errors.push('linje ' + lineNo + ': «filters» må være en dict — filters={"k": "v"}');
          return;
        }
        canon().filters = v; return;
      }
      if (name === 'all') { if (v) canon().all = true; return; }
      var s = suggest(name);
      errors.push('linje ' + lineNo + ': ukjent argument «' + name + '»' +
                  (s ? ' — mente du «' + s + '»?' : ''));
    });
    return opts;
  }

  function parse(script) {
    var connects = [], loads = [], metas = [], errors = [];
    var res = global.DirectiveParser.parseScript(script);
    errors = res.errors.slice();
    res.items.forEach(function (it) {
      // 'ns'-elementer (meta) håndteres i Task 5 — her ignoreres de, slik at
      // denne tasken ikke etterlater en tom stubbfunksjon som død kode.
      if (it.form !== 'call') return;
      var opts = optionsFromKwargs(it.kwargs, errors, it.lineNo);

      if (it.recv === 'ost' && it.verb === 'connect') {
        if (!it.target) { errors.push('linje ' + it.lineNo + ': ost.connect krever en tilordning — «# <alias> = ost.connect(…)»'); return; }
        if (typeof it.args[0] !== 'string') { errors.push('linje ' + it.lineNo + ': ost.connect krever et mål som streng'); return; }
        connects.push({ target: it.args[0], alias: it.target, options: opts });
        return;
      }
      if (it.verb === 'read') {
        if (!it.target) { errors.push('linje ' + it.lineNo + ': read krever en tilordning — «# <navn> = …read(…)»'); return; }
        var tgt;
        if (it.recv === 'ost') {
          if (typeof it.args[0] !== 'string') { errors.push('linje ' + it.lineNo + ': ost.read krever en URL som streng'); return; }
          tgt = it.args[0];
        } else {
          tgt = it.args.length ? (it.recv + '/' + String(it.args[0])) : it.recv;
        }
        loads.push({ verb: 'read', target: tgt, alias: it.target, options: opts, line: it.raw });
        return;
      }
      // create/add/join/use håndteres av parseAssembly/parseUse (T6/T7).
    });
    return { connects: connects, loads: loads, metas: metas, errors: errors };
  }
```

`metas` forblir tom i denne tasken — Task 5 legger til både `collectMeta` og
grenen i `parse()` som kaller den. Ingen stubb, ingen død kode.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: PASS, 8 tester

- [ ] **Step 5: Wire the new script tag**

In `index.html`, find the line loading `js/data-directives.js` and insert immediately **before** it:

```html
    <script src="js/directive-parser.js"></script>
```

Verify with: `grep -n "directive-parser.js\|data-directives.js" index.html`
Expected: `directive-parser.js` on a lower line number than `data-directives.js`.

- [ ] **Step 6: Commit**

```bash
git add js/data-directives.js js/directive-parser.js index.html tests/js/directive-semantics.test.js
git commit -m "feat(direktiv): parse() connects/loads på pythonsk grammatikk"
```

---

### Task 5: Meta-modellen

**Files:**
- Modify: `js/data-directives.js` — slett `META_RE` (`:34-37`), implementer `collectMeta` (stubben fra T4), utvid `metaByTarget` (`:425-443`)
- Test: `tests/js/directive-semantics.test.js`

**Spec-korreksjon nr. 2 (vedtatt her):** spec §3.1 sier både at ukjente nøkler
blir visningsfelt *og* at `meta.bef.alder = "…"` skal være en feil. Det er
selvmotsigende. **Vedtak: ukjent 2-leddsnøkkel blir et felt.** Utvidbarheten
(«legg til hva som helst uten ny syntaks») er den load-bearing egenskapen,
og konsekvensen av den feilen brukeren ville gjort er kosmetisk — feltet vises
som felt i stedet for som variabeletikett, synlig med én gang. Variabelnivå
krever alltid tre ledd. Task 14 retter spec-teksten.

**Interfaces:**
- Consumes: `{form:'ns', ns:'meta', path:[…], value}` (T2).
- Produces: `parse().metas` — utvidet, bakoverkompatibel form:
  `{target, variable, kind:'text'|'link'|'title'|'label'|'field', url?, label?, text?, field?, line}`.
  `metaByTarget()` → `{alias: {title?, text:[], links:[{url,label}], fields:[{label,verdi}], variables:{navn:{label?, text:[], links:[]}}}}`.

**Nøkkelvokabular:**

| Sti | Betydning |
|---|---|
| `meta.<ds>.title` | `kind:'title'` |
| `meta.<ds>.note` | `kind:'text'` |
| `meta.<ds>.link` | `kind:'link'` — streng, tuppel `(url, etikett)`, eller liste av begge |
| `meta.<ds>.labels` | dict → ett `kind:'label'` per variabel |
| `meta.<ds>.<annet>` | `kind:'field'`, `field:'<annet>'` |
| `meta.<ds>.<var>.label` | `kind:'label'`, `variable:'<var>'` |
| `meta.<ds>.<var>.note` | `kind:'text'`, `variable:'<var>'` |
| `meta.<ds>.<var>.link` | `kind:'link'`, `variable:'<var>'` |

- [ ] **Step 1: Write the failing test**

Append to `tests/js/directive-semantics.test.js`:

```js
test('meta: note, title og ukjent nøkkel som felt', () => {
  const p = DD.parse([
    '#meta.bef.title = "Folkemengde"',
    '#meta.bef.note = "Etter alder og kjønn 2000-2009"',
    '#meta.bef.publisher = "SSB"',
    '#meta.bef.metode = "Registerdata"',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.metas.map((m) => m.kind), ['title', 'text', 'field', 'field']);
  assert.equal(p.metas[2].field, 'publisher');
  assert.equal(p.metas[3].field, 'metode');
});

test('meta: lenke som streng, tuppel og liste', () => {
  const p = DD.parse([
    '#meta.a.link = "https://x/1"',
    '#meta.b.link = "https://x/2", "To"',
    '#meta.c.link = [("https://x/3", "Tre"), ("https://x/4", "Fire")]',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const links = p.metas.filter((m) => m.kind === 'link');
  assert.equal(links.length, 4);
  assert.equal(links[0].url, 'https://x/1');
  assert.equal(links[0].label, undefined);
  assert.equal(links[1].label, 'To');
  assert.equal(links[3].url, 'https://x/4');
});

test('meta: variabelnivå og bulk labels', () => {
  const p = DD.parse([
    '#meta.bef.alder.label = "Alder i hele år"',
    '#meta.bef.labels = {"kjonn": "Kjønn", "region": "Region"}',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  const labs = p.metas.filter((m) => m.kind === 'label');
  assert.deepEqual(labs.map((m) => [m.variable, m.text]),
    [['alder', 'Alder i hele år'], ['kjonn', 'Kjønn'], ['region', 'Region']]);
});

test('meta: kjent datasettnøkkel med ekstra ledd gir feil', () => {
  const p = DD.parse('#meta.bef.note.x = "y"');
  assert.match(p.errors[0], /linje 1.*«note» tar en verdi, ikke en sti/);
});

test('metaByTarget: felter, tittel og variabler', () => {
  const out = DD.metaByTarget([
    '#meta.bef.title = "Folkemengde"',
    '#meta.bef.note = "Notat"',
    '#meta.bef.publisher = "SSB"',
    '#meta.bef.link = "https://ssb.no", "Om SSB"',
    '#meta.bef.alder.label = "Alder"',
  ].join('\n'));
  assert.equal(out.bef.title, 'Folkemengde');
  assert.deepEqual(out.bef.text, ['Notat']);
  assert.deepEqual(out.bef.fields, [{ label: 'publisher', verdi: 'SSB' }]);
  assert.deepEqual(out.bef.links, [{ url: 'https://ssb.no', label: 'Om SSB' }]);
  assert.equal(out.bef.variables.alder.label, 'Alder');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: FAIL — `p.metas` er tom (stubben fra T4 gjør ingenting)

- [ ] **Step 3: Write minimal implementation**

Delete `META_RE` and its comment (`js/data-directives.js:34-37`). Add the
`ns`-branch back into `parse()` as the first line of its `forEach` body,
replacing the placeholder comment Task 4 left:

```js
      if (it.form === 'ns') { collectMeta(it, metas, errors); return; }
```

Then add `collectMeta` above `parse`:

```js
  var DS_KEYS = { title: 1, note: 1, link: 1, labels: 1 };
  var VAR_KEYS = { label: 1, note: 1, link: 1 };

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  // "https://x" | ("https://x", "etikett") | [ … ] -> [{url, label?}]
  function toLinks(v) {
    if (typeof v === 'string') return [{ url: v }];
    if (isArr(v) && v.length && typeof v[0] === 'string') {
      return [v.length > 1 ? { url: v[0], label: v[1] } : { url: v[0] }];
    }
    if (isArr(v)) {
      var out = [];
      for (var i = 0; i < v.length; i++) out = out.concat(toLinks(v[i]));
      return out;
    }
    return [];
  }

  function collectMeta(item, metas, errors) {
    var p = item.path, raw = item.raw, ln = item.lineNo;
    if (p.length < 2) {
      errors.push('linje ' + ln + ': meta krever datasett og nøkkel — «# meta.<datasett>.note = …»');
      return;
    }
    var ds = p[0], k1 = p[1], v = item.value;

    function pushLinks(variable, val) {
      var ls = toLinks(val);
      if (!ls.length) { errors.push('linje ' + ln + ': «link» må være en URL, et tuppel (url, etikett) eller en liste av dem'); return; }
      ls.forEach(function (l) {
        metas.push({ target: ds, variable: variable, kind: 'link',
                     url: l.url, label: l.label, text: undefined, line: raw });
      });
    }

    // Datasettnivå (to ledd)
    if (p.length === 2) {
      if (k1 === 'link') { pushLinks(null, v); return; }
      if (k1 === 'title') { metas.push({ target: ds, variable: null, kind: 'title', text: String(v), line: raw }); return; }
      if (k1 === 'note') { metas.push({ target: ds, variable: null, kind: 'text', text: String(v), line: raw }); return; }
      if (k1 === 'labels') {
        if (typeof v !== 'object' || v === null || isArr(v)) {
          errors.push('linje ' + ln + ': «labels» må være en dict — labels={"kolonne": "Etikett"}');
          return;
        }
        Object.keys(v).forEach(function (name) {
          metas.push({ target: ds, variable: name, kind: 'label', text: String(v[name]), line: raw });
        });
        return;
      }
      metas.push({ target: ds, variable: null, kind: 'field', field: k1, text: String(v), line: raw });
      return;
    }

    // Tre ledd: variabelnivå — men en kjent datasettnøkkel her er en feil
    if (DS_KEYS[k1]) {
      errors.push('linje ' + ln + ': «' + k1 + '» tar en verdi, ikke en sti');
      return;
    }
    if (p.length > 3) { errors.push('linje ' + ln + ': for dyp meta-sti — «# meta.<datasett>.<variabel>.<nøkkel>»'); return; }
    var k2 = p[2];
    if (!VAR_KEYS[k2]) {
      errors.push('linje ' + ln + ': ukjent variabelnøkkel «' + k2 + '» — gyldige: label, note, link');
      return;
    }
    if (k2 === 'link') { pushLinks(k1, v); return; }
    metas.push({ target: ds, variable: k1, kind: k2 === 'label' ? 'label' : 'text',
                 text: String(v), line: raw });
  }
```

Replace `metaByTarget` (`:425-443`) with:

```js
  // metaByTarget(script) -> {alias: {title?, text:[], links:[], fields:[], variables:{…}}}
  // Samme innhold som sidebaren viser (MetaInfo), formet for DataFrame.attrs['meta'].
  function metaByTarget(script) {
    var out = {};
    var metas = parse(script).metas || [];
    function bucket(o, key) {
      if (!o[key]) o[key] = { text: [], links: [] };
      return o[key];
    }
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      if (!out[m.target]) out[m.target] = { text: [], links: [], fields: [], variables: {} };
      var root = out[m.target];
      var dst = m.variable ? bucket(root.variables, m.variable) : root;
      if (m.kind === 'link') {
        dst.links.push(m.label ? { url: m.url, label: m.label } : { url: m.url });
      } else if (m.kind === 'title') {
        root.title = m.text;
      } else if (m.kind === 'label') {
        bucket(root.variables, m.variable).label = m.text;
      } else if (m.kind === 'field') {
        root.fields.push({ label: m.field, verdi: m.text });
      } else if (m.text) {
        dst.text.push(m.text);
      }
    }
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: PASS, 13 tester

- [ ] **Step 5: Commit**

```bash
git add js/data-directives.js tests/js/directive-semantics.test.js
git commit -m "feat(direktiv): meta-modell med navngitte felt, lenkelister og bulk labels"
```

---

### Task 6: `parseAssembly()` på ny grammatikk

**Files:**
- Modify: `js/data-directives.js` — slett `CREATE_RE` (`:29`), `IMPORT_RE` (`:30`), `JOIN_RE` (`:31`), `LOADAS_RE` (`:32`); skriv om `parseAssembly` (`:293-347`)
- Test: `tests/js/directive-semantics.test.js`

**Interfaces:**
- Consumes: `DirectiveParser.parseScript` (T3).
- Produces: **uendret** — `{spec: {sources:[…], datasets:[…], sourceTables:{…}}, errors:[…]}`.
  `datasets[]` er enten `{name, key:[…], format, steps:[]}` (fra `ost.create`)
  eller `{name, load:'<kildenøkkel>'}` (fra en `read` med alias-mottaker).
  `steps[]` er `{op:'import', source, columns:[…], how}` eller `{op:'join', from, on:[…], how}`.

**Kildenøkkel-konvensjon (uendret):** `alias` uten tabell, `alias__tabell` med.

- [ ] **Step 1: Write the failing test**

Append to `tests/js/directive-semantics.test.js`:

```js
test('parseAssembly: create + add + join', () => {
  const a = DD.parseAssembly([
    '# p = ost.connect("people")',
    '# s = ost.connect("sales_src")',
    '# panel = ost.create(key="pid")',
    '# panel.add(p, ["income", "edu"])',
    '# panel.add(p, "region")',
    '# sales = s.read()',
    '# panel.join(sales, on="pid")',
  ].join('\n'));
  assert.deepEqual(a.errors, []);
  const panel = a.spec.datasets.find((d) => d.name === 'panel');
  assert.deepEqual(panel.key, ['pid']);
  assert.deepEqual(panel.steps, [
    { op: 'import', source: 'p', columns: ['income', 'edu'], how: 'left' },
    { op: 'import', source: 'p', columns: ['region'], how: 'left' },
    { op: 'join', from: 'sales', on: ['pid'], how: 'left' },
  ]);
  assert.ok(a.spec.sources.indexOf('p') >= 0);
});

test('parseAssembly: sammensatt nøkkel, format og eksplisitt how', () => {
  const a = DD.parseAssembly([
    '# db = ost.connect("https://x/panel.duckdb", kind="duckdb")',
    '# d = ost.create(key=["kommune_nr", "year"], format="duckdb")',
    '# d.add(db, ["age"], table="patients", how="inner")',
  ].join('\n'));
  assert.deepEqual(a.errors, []);
  const d = a.spec.datasets.find((x) => x.name === 'd');
  assert.deepEqual(d.key, ['kommune_nr', 'year']);
  assert.equal(d.format, 'duckdb');
  assert.deepEqual(d.steps, [{ op: 'import', source: 'db__patients', columns: ['age'], how: 'inner' }]);
  assert.deepEqual(a.spec.sourceTables.db__patients, { source: 'db', table: 'patients' });
});

test('parseAssembly: add til ukjent datasett gir feil', () => {
  const a = DD.parseAssembly('# ukjent.add(p, "x")');
  assert.match(a.errors[0], /ukjent datasett «ukjent»/);
});

test('parseAssembly: duplikat create gir feil', () => {
  const a = DD.parseAssembly([
    '# d = ost.create(key="k")',
    '# d = ost.create(key="k")',
  ].join('\n'));
  assert.match(a.errors[0], /allerede opprettet/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: FAIL — `a.spec.datasets` er tom

- [ ] **Step 3: Write minimal implementation**

Replace `parseAssembly` (`js/data-directives.js:292-347`) with:

```js
  // Montering: create/add/join + read-med-alias → mode-nøytral spec.
  function parseAssembly(script) {
    var errors = [], datasets = [], byName = {}, sources = {}, sourceTables = {};
    var res = global.DirectiveParser.parseScript(script);
    res.errors.forEach(function (e) { errors.push(e); });

    function srcKey(alias, table) { return table ? (alias + '__' + table) : alias; }
    function noteSource(alias, table) {
      var k = srcKey(alias, table);
      sources[k] = true;
      if (table) sourceTables[k] = { source: alias, table: table };
      return k;
    }
    function names(v) {
      if (typeof v === 'string') return [v];
      if (Object.prototype.toString.call(v) === '[object Array]') {
        return v.filter(function (x) { return typeof x === 'string'; });
      }
      return [];
    }

    // Pass 1: create + read-med-alias definerer navn.
    res.items.forEach(function (it) {
      if (it.form !== 'call') return;
      if (it.recv === 'ost' && it.verb === 'create') {
        if (!it.target) { errors.push('linje ' + it.lineNo + ': ost.create krever en tilordning'); return; }
        if (byName[it.target]) { errors.push('datasettet «' + it.target + '» er allerede opprettet'); return; }
        var key = names(it.kwargs.key);
        if (!key.length) { errors.push('linje ' + it.lineNo + ': ost.create krever key="<kolonne>" eller key=[…]'); return; }
        var d = { name: it.target, key: key,
                  format: it.kwargs.format ? String(it.kwargs.format).toLowerCase() : null, steps: [] };
        datasets.push(d); byName[it.target] = d;
        return;
      }
      // `x = <alias>.read("tabell")` er også en monteringskilde (gammel LOADAS).
      // URL-lesing (`ost.read`) er IKKE en monteringskilde — som før.
      if (it.verb === 'read' && it.recv !== 'ost' && it.target) {
        if (byName[it.target]) { errors.push('datasettet «' + it.target + '» er allerede opprettet'); return; }
        var table = it.args.length ? String(it.args[0]) : null;
        // Bare enkle tabellnavn deltar i montering (som LOADAS_RE før).
        if (table !== null && !/^[A-Za-z_]\w*$/.test(table)) return;
        var k = noteSource(it.recv, table);
        var dl = { name: it.target, load: k };
        datasets.push(dl); byName[it.target] = dl;
      }
    });

    // Pass 2: add/join på definerte navn.
    res.items.forEach(function (it) {
      if (it.form !== 'call' || it.target) return;
      if (it.verb !== 'add' && it.verb !== 'join') return;
      var d = byName[it.recv];
      if (!d || d.load) { errors.push('ukjent datasett «' + it.recv + '» (mangler ost.create?)'); return; }
      var how = it.kwargs.how ? String(it.kwargs.how).toLowerCase() : 'left';

      if (it.verb === 'add') {
        var ref = it.args[0];
        if (!ref || !ref.__ref) { errors.push('linje ' + it.lineNo + ': add krever en kilde som første argument — add(<kilde>, ["<kolonne>"])'); return; }
        var cols = [];
        for (var i = 1; i < it.args.length; i++) cols = cols.concat(names(it.args[i]));
        if (!cols.length) { errors.push('linje ' + it.lineNo + ': add krever minst én kolonne'); return; }
        var tbl = it.kwargs.table ? String(it.kwargs.table) : null;
        d.steps.push({ op: 'import', source: noteSource(ref.__ref, tbl), columns: cols, how: how });
        return;
      }
      var from = it.args[0];
      if (!from || !from.__ref) { errors.push('linje ' + it.lineNo + ': join krever et datasettnavn — join(<navn>, on="<kolonne>")'); return; }
      if (!byName[from.__ref]) { errors.push('ukjent datasett «' + from.__ref + '» i join'); return; }
      var on = names(it.kwargs.on);
      if (!on.length) { errors.push('linje ' + it.lineNo + ': join krever on="<kolonne>" eller on=[…]'); return; }
      d.steps.push({ op: 'join', from: from.__ref, on: on, how: how });
    });

    return { spec: { sources: Object.keys(sources), datasets: datasets, sourceTables: sourceTables }, errors: errors };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: PASS, 17 tester

- [ ] **Step 5: Commit**

```bash
git add js/data-directives.js tests/js/directive-semantics.test.js
git commit -m "feat(direktiv): parseAssembly på ost.create/add/join"
```

---

### Task 7: `parseUse()` / `parseSegmentUses()` på ny grammatikk

**Files:**
- Modify: `js/data-directives.js` — slett `USE_RE` (`:355`); skriv om `parseUse` (`:356-366`) og `parseSegmentUses` (`:382-417`)
- Test: `tests/js/data-directives-use.test.js` (finnes; skriv om inndata-strengene)

**Tilbaketrukket lovnad:** spec §4.2 hevder at `ost.use` nå kan **døpe om**
(`mine = ost.use("df", source="duckdb")`). Det er utsatt. Dagens forbrukere i
`index.html` (materialiseringsfasen per modus) leser `u.name` som navnet i
*begge* kjøretider; omdøping krever et nytt `as`-felt og endringer der, som
bryter «ingen kallsted endrer logikk». **Vedtak: `ost.use("x")` må tilordnes
`x`.** Avvik gir feilmeldingen *«omdøping i use er ikke støttet ennå — skriv
«# x = ost.use("x")»»*. Task 14 retter spec §4.2.

**Interfaces:**
- Produces: **uendret** — `parseUse(script)` → `{uses:[{name, from}], errors:[]}`;
  `parseSegmentUses(segments)` → `{segments:[{kind, text, uses}], errors:[]}`.
  `runtimeFamily(kind)` er uendret.

- [ ] **Step 1: Rewrite the test inputs**

In `tests/js/data-directives-use.test.js`, replace every directive string:

| Gammel | Ny |
|---|---|
| `'# use df from python'` | `'# df = ost.use("df", source="python")'` |
| `'# use df'` | `'# df = ost.use("df")'` |
| `'# use df from stata'` | `'# df = ost.use("df", source="stata")'` |
| `'-- use df'` | `'-- df = ost.use("df")'` |
| `'# use tall from duckdb'` | `'# tall = ost.use("tall", source="duckdb")'` |

Add one new test:

```js
test('parseUse: omdøping avvises eksplisitt', () => {
  const r = DD.parseUse('# mine = ost.use("df", source="duckdb")');
  assert.deepEqual(r.uses, []);
  assert.match(r.errors[0], /omdøping i use er ikke støttet/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/data-directives-use.test.js`
Expected: FAIL — `r.uses` er tom for alle

- [ ] **Step 3: Write minimal implementation**

Replace `USE_RE`, `parseUse` and the body of `parseSegmentUses` with a shared
helper (`runtimeFamily` beholdes uendret):

```js
  var USE_SOURCES = { r: 1, python: 1, duckdb: 1 };

  // Ett use-item fra et parsetre-element, eller null (+ feil i errors).
  function useFromItem(it, errors) {
    if (it.form !== 'call' || it.recv !== 'ost' || it.verb !== 'use') return null;
    var name = it.args[0];
    if (typeof name !== 'string' || !/^[A-Za-z_]\w*$/.test(name)) {
      errors.push('ugyldig datasettnavn i use: «' + String(name) + '»'); return null;
    }
    if (!it.target) { errors.push('use krever en tilordning — «# ' + name + ' = ost.use("' + name + '")»'); return null; }
    if (it.target !== name) {
      errors.push('omdøping i use er ikke støttet ennå — skriv «# ' + name + ' = ost.use("' + name + '")»');
      return null;
    }
    var from = it.kwargs.source ? String(it.kwargs.source).toLowerCase() : null;
    if (from !== null && !USE_SOURCES[from]) {
      errors.push('use «' + name + '»: kilde må være r, python eller duckdb, fikk «' + it.kwargs.source + '»');
      return null;
    }
    return { name: name, from: from };
  }

  function parseUse(script) {
    var uses = [], errors = [];
    var res = global.DirectiveParser.parseScript(script);
    res.items.forEach(function (it) {
      var u = useFromItem(it, errors);
      if (u) uses.push(u);
    });
    return { uses: uses, errors: errors };
  }

  function parseSegmentUses(segments) {
    var out = [], errors = [];
    (segments || []).forEach(function (seg, i) {
      var fam = runtimeFamily(seg.kind);
      var uses = [];
      var kept = [];
      String(seg.text || '').split(/\r?\n/).forEach(function (line) {
        var pl = global.DirectiveParser.parseLine(line);
        if (!pl || pl.error || pl.form !== 'call' || pl.recv !== 'ost' || pl.verb !== 'use') {
          kept.push(line); return;
        }
        pl.lineNo = 0;
        var u = useFromItem(pl, errors);
        if (!u) return;                       // feil er registrert; linja fjernes uansett
        if (u.from === null) {
          for (var j = i - 1; j >= 0; j--) {
            var pf = runtimeFamily((segments[j] || {}).kind);
            if (pf !== fam) { u.from = pf; break; }
          }
          if (u.from === null) {
            errors.push('use «' + u.name + '»: fant ingen tidligere blokk med annet språk å hente fra — angi kilden: # ' + u.name + ' = ost.use("' + u.name + '", source="python")');
            return;
          }
        }
        if (u.from === fam) {
          errors.push('use «' + u.name + '» from ' + u.from + ': blokken kjører allerede i ' + u.from + ' — datasett derfra refereres direkte');
          return;
        }
        uses.push(u);
      });
      out.push({ kind: seg.kind, text: kept.join('\n'), uses: uses });
    });
    return { segments: out, errors: errors };
  }
```

> **Merk:** den gamle implementasjonen brukte `String.replace` og etterlot en
> tom linje der use-linja sto. Den nye fjerner linja helt. Det endrer
> linjenummerering i segmenter som inneholder `use`. Sjekk at
> `tests/js/data-directives-use.test.js` sine tekst-assertions oppdateres
> deretter, og behold tom-linje-oppførselen (`kept.push('')` i stedet for
> `return`) hvis noen test krever bevart linjetelling.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/data-directives-use.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole JS suite**

Run: `node --test tests/js/`
Expected: alle filer grønne unntatt de som bruker gammel direktivsyntaks i
inndata (`data-directives-apikinds.test.js`, `example-loads.test.js`,
`assembly-duckdb.test.js`) — disse konverteres i Task 8.

- [ ] **Step 6: Commit**

```bash
git add js/data-directives.js tests/js/data-directives-use.test.js
git commit -m "feat(direktiv): parseUse på ost.use, omdøping eksplisitt avvist"
```

---

# Fase C — cutover av innhold og kallsteder

### Task 8: Konverteringsskript + omskriving av alt innhold

**Files:**
- Create: `tools/migrate_directives.py`
- Modify: `examples/**/*.txt` (34+), `web_examples/**`, `docs/directive-language-examples.md`, `tests/js/data-directives-apikinds.test.js`, `tests/js/example-loads.test.js`, `tests/js/assembly-duckdb.test.js`, `netlify/edge-functions/_lib/data-directives.test.ts`, `netlify/edge-functions/_lib/data-loader.test.ts`, `netlify/edge-functions/_lib/portable-export.test.ts`

**Interfaces:**
- Produces: `tools/migrate_directives.py` — CLI: `python3 tools/migrate_directives.py <fil eller katalog>…`. Idempotent (kjører den to ganger gir samme resultat). Skriver om linjer den kjenner igjen, lar alt annet stå, og skriver en oppsummering med antall konverterte linjer per fil.

**Konverteringsregler** — nøyaktig oversettelsestabellen i spec §4.1. Opsjonshalen `, opt(v)` → `, opt="v"` med disse unntakene: `all()` → `all=True`, `countries/regions/indicators(a b)` → `["a","b"]`, `filters(k=v k2=v2)` → `{"k":"v","k2":"v2"}`, `years(a:b)` → `years="a:b"`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_migrate_directives.py`:

```python
import subprocess, sys, pathlib

def run(tmp_path, text):
    f = tmp_path / "s.txt"
    f.write_text(text, encoding="utf-8")
    subprocess.run([sys.executable, "tools/migrate_directives.py", str(f)], check=True)
    return f.read_text(encoding="utf-8")

def test_connect_read_meta(tmp_path):
    out = run(tmp_path, "\n".join([
        "# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)",
        "# read ssb/05839 as bef, years(2000:2009), indicators(Personer)",
        "# meta bef Folkemengde etter alder",
        "# meta bef https://www.ssb.no/befolkning Om SSB",
        "import pandas as pd",
    ]))
    assert 'ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")' in out
    assert 'bef = ssb.read("05839", years="2000:2009", indicators=["Personer"])' in out
    assert 'meta.bef.note = "Folkemengde etter alder"' in out
    assert 'meta.bef.link = "https://www.ssb.no/befolkning", "Om SSB"' in out
    assert "import pandas as pd" in out          # kode urørt

def test_assembly_and_markers(tmp_path):
    out = run(tmp_path, "\n".join([
        "-- connect people as p",
        "# create-dataset panel, key(kommune_nr year)",
        "# add p/income, p/edu into panel inner",
        "# join sales into panel on pid outer",
        "// use tall from duckdb",
    ]))
    assert '-- p = ost.connect("people")' in out
    assert 'panel = ost.create(key=["kommune_nr", "year"])' in out
    assert 'panel.add(p, ["income", "edu"], how="inner")' in out
    assert 'panel.join(sales, on="pid", how="outer")' in out
    assert '// tall = ost.use("tall", source="duckdb")' in out

def test_idempotent(tmp_path):
    src = '# connect fred\n'
    once = run(tmp_path, src)
    twice = run(tmp_path, once)
    assert once == twice
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_migrate_directives.py -v`
Expected: FAIL — `tools/migrate_directives.py` finnes ikke

- [ ] **Step 3: Write the migration script**

Create `tools/migrate_directives.py` implementing the rules above. Requirements the tests pin down:
- Preserve the original comment marker (`#`, `--`, `//`) and leading whitespace.
- `connect <mål> as <alias>` → `<alias> = ost.connect("<mål>")`; `connect <navn>` (uten `as`) → `<navn> = ost.connect("<navn>")`.
- `read|load|require <alias>/<sti> as <navn>` → `<navn> = <alias>.read("<sti>")`; `read <URL> as <navn>` → `<navn> = ost.read("<URL>")`; `read <alias> as <navn>` (ingen skråstrek, ikke URL) → `<navn> = <alias>.read()`.
- `create[-_dataset] <navn>, key(a b)` → `<navn> = ost.create(key=["a", "b"])`; ett nøkkelledd → `key="a"`. `format(x)` → `format="x"`.
- `add|import <a>/<c1>, <a>/<c2> into <d> [how]` → `<d>.add(<a>, ["c1", "c2"][, how="…"])`; `<a>/<tabell>.<kolonne>` → `table="<tabell>"`.
- `join <navn> into <d> on <k1>,<k2> [how]` → `<d>.join(<navn>, on=["k1", "k2"][, how="…"])`; ett ledd → `on="k1"`.
- `use <navn> [from <kilde>]` → `<navn> = ost.use("<navn>"[, source="<kilde>"])`.
- `meta <mål> <innhold>` → `meta.<mål>.link = "<url>"[, "<etikett>"]` når innholdet starter med `http`, ellers `meta.<mål>.note = "<innhold>"`. Punktum i målet beholdes som variabelsti, og variabel + ikke-URL blir `.label` kun hvis innholdet er kortere enn 40 tegn uten punktum — ellers `.note`. **Skriv denne heuristikken som en egen funksjon med en kommentar om at den er en engangsgjetning; feil kan rettes for hånd i de få filene det gjelder.**
- Idempotens: hopp over linjer der `DirectiveParser` allerede ville gitt en `form` (gjenkjenn `= ost.`/`.read(`/`meta.` og la dem stå).
- Escape `"` i strenger som konverteres.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_migrate_directives.py -v`
Expected: PASS, 3 tester

- [ ] **Step 5: Convert all content**

```bash
python3 tools/migrate_directives.py examples/ web_examples/ docs/directive-language-examples.md
git diff --stat
```
Expected: 34+ filer endret. **Les gjennom diffen for `# meta`-linjer med variabelmål** — heuristikken i Step 3 er den eneste delen som kan gjette feil.

- [ ] **Step 6a: Add the new module dependency to every suite that loads `data-directives.js`**

`js/data-directives.js` now calls `global.DirectiveParser` at parse time, so
every standalone test that `require`s/evals it must load `js/directive-parser.js`
**first**. Without this the suites fail with `TypeError`, not assertion
mismatches — a different failure than the old-syntax conversion below, and one
Task 4 surfaced. Eight files need it:

Node (`require('../../js/directive-parser.js');` before the `data-directives`
require):
- `tests/js/assembly-duckdb.test.js`
- `tests/js/data-directives-apikinds.test.js`
- `tests/js/data-directives-use.test.js`
- `tests/js/example-loads.test.js`
- `tests/js/pxweb.test.js`

Deno (eval `js/directive-parser.js` before `js/data-directives.js`, matching
the existing `Deno.readTextFile` + `(0, eval)` pattern in each file):
- `netlify/edge-functions/_lib/data-directives.test.ts`
- `netlify/edge-functions/_lib/data-loader.test.ts`
- `netlify/edge-functions/_lib/portable-export.test.ts`

Verify no file is missed:
```bash
for f in tests/js/*.test.js; do grep -q "data-directives.js" "$f" && ! grep -q "directive-parser.js" "$f" && echo "MANGLER: $f"; done
grep -ln "data-directives.js" netlify/edge-functions/_lib/*.test.ts | while read f; do grep -q "directive-parser.js" "$f" || echo "MANGLER: $f"; done
```
Expected: no output.

- [ ] **Step 6: Convert the test fixtures by hand**

Update directive strings in: `tests/js/data-directives-apikinds.test.js`, `tests/js/example-loads.test.js`, `tests/js/assembly-duckdb.test.js`, `netlify/edge-functions/_lib/data-directives.test.ts`, `netlify/edge-functions/_lib/data-loader.test.ts`, `netlify/edge-functions/_lib/portable-export.test.ts`, `tests/js/pxweb.test.js`. Only the input strings change — every assertion on parsed output must stay byte-identical. **Hvis en assertion må endres, er kontrakten brutt og det er en bug, ikke en testoppdatering.**

- [ ] **Step 7: Run everything**

```bash
node --test tests/js/
cd netlify/edge-functions && deno test --allow-all _lib/ && cd ../..
.venv/bin/python -m pytest tests/ -q
```
Expected: alt grønt.

- [ ] **Step 8: Commit**

```bash
git add tools/migrate_directives.py tests/test_migrate_directives.py examples web_examples docs tests netlify
git commit -m "refactor: konverter alt innhold til pythonsk direktivsyntaks"
```

---

### Task 9: `isDirectiveLine()` på alle seks kallsteder (fikser DuckDB-buggen)

**Files:**
- Modify: `js/data-directives.js` (eksporter `isDirectiveLine`), `js/data-loader.js:455`, `:477`, `js/portable-export.js:20`, `:543`, `:567`, `index.html:7962`, `:8357`
- Test: `tests/js/directive-semantics.test.js`

**Interfaces:**
- Produces: `DataDirectives.isDirectiveLine(line)` — videresender til `DirectiveParser.isDirectiveLine`. Alle seks stedene slutter å ha egne verblister.

- [ ] **Step 1: Write the failing regression test**

Append to `tests/js/directive-semantics.test.js`:

```js
test('isDirectiveLine: eksportert fra DataDirectives', () => {
  assert.equal(DD.isDirectiveLine('#meta.bef.note = "t"'), true);
  assert.equal(DD.isDirectiveLine('SELECT 1'), false);
});

// Regresjon for spec §1.2: «meta» manglet i stripDataDirectiveLines' verbliste,
// og «#» er ikke kommentar i DuckDB — meta-linjer lakk inn i __duck.exec().
test('isDirectiveLine: meta-linjer må strippes fra SQL', () => {
  const sql = [
    '#meta.bef.note = "Folkemengde"',
    '# bef = ssb.read("05839")',
    'SELECT * FROM bef',
  ].join('\n');
  const stripped = sql.split('\n').filter((l) => !DD.isDirectiveLine(l)).join('\n');
  assert.equal(stripped, 'SELECT * FROM bef');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: FAIL — `DD.isDirectiveLine is not a function`

- [ ] **Step 3: Export and rewire**

In `js/data-directives.js`, add to the export object:

```js
    isDirectiveLine: function (line) { return global.DirectiveParser.isDirectiveLine(line); },
```

Then replace each call site:

`js/data-loader.js:455` and `:477` — replace
```js
/^[ \t]*(?:#|--|\/\/)[ \t]*connect\b/i.test(ln)
```
with
```js
(DD.isDirectiveLine(ln) && /\bost\.connect\(/.test(ln))
```
(`DD` is already in scope at `:471`; at `:455` use `global.DataDirectives`.)

`js/portable-export.js:20` — replace `DIRECTIVE_LINE_RE` and its use in `scrubDirectiveLine`:
```js
  function scrubDirectiveLine(line, DD, state) {
    if (!DD.isDirectiveLine(line)) return line;
    var scrubbed = DD.scrubKeys(line);
    if (scrubbed !== line) state.masked = true;
    return scrubbed;
  }
```
Update `MASK_WARNING` to: `'key="…"-verdier ble maskert i eksporten — bruk key="ask" eller egen nøkkelhåndtering utenfor appen'`.

`js/portable-export.js:543` — replace `ASM_LINE_RE` usage with a check for an assembly directive:
```js
  function isAssemblyLine(line, DD) {
    var pl = global.DirectiveParser.parseLine(line);
    return !!(pl && pl.form === 'call' &&
              ((pl.recv === 'ost' && pl.verb === 'create') || pl.verb === 'add' || pl.verb === 'join'));
  }
```

`js/portable-export.js:567` and `index.html:7962` — same connect-filter replacement as `data-loader.js`.

`index.html:8357` — replace the whole function:
```js
      function stripDataDirectiveLines(text) {
        if (!window.DataDirectives) return String(text || '');
        return String(text || '').split(/\r?\n/)
          .filter(function (ln) { return !window.DataDirectives.isDirectiveLine(ln); })
          .join('\n');
      }
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/js/
cd netlify/edge-functions && deno test --allow-all _lib/ && cd ../..
```
Expected: alt grønt.

- [ ] **Step 5: Commit**

```bash
git add js/data-directives.js js/data-loader.js js/portable-export.js index.html tests/js/directive-semantics.test.js
git commit -m "refactor: én isDirectiveLine erstatter seks verblister (fikser meta-lekkasje til DuckDB)"
```

---

### Task 10: `makeLoad()` — fjern tekst-rundturene

**Files:**
- Modify: `js/data-directives.js` (ny eksport), `js/data-loader.js:457-461`, `:478-481`, `js/portable-export.js:568-571`, `index.html:7963`

**Interfaces:**
- Produces: `DataDirectives.makeLoad({alias, source, table, target})` → ett element på nøyaktig `parse().loads[i]`-form: `{verb:'read', target, alias, options:{}, line}`. Enten `target` (rå) eller `source`+`table` må oppgis.

- [ ] **Step 1: Write the failing test**

```js
test('makeLoad: gir samme form som parse().loads', () => {
  const made = DD.makeLoad({ alias: 'bef', source: 'ssb', table: '05839' });
  const parsed = DD.parse('# bef = ssb.read("05839")').loads[0];
  assert.equal(made.target, parsed.target);
  assert.equal(made.alias, parsed.alias);
  assert.equal(made.verb, parsed.verb);
  assert.deepEqual(made.options, parsed.options);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/directive-semantics.test.js`
Expected: FAIL — `DD.makeLoad is not a function`

- [ ] **Step 3: Implement**

```js
  function makeLoad(o) {
    var target = o.target || (o.table ? (o.source + '/' + o.table) : o.source);
    var line = o.table
      ? ('# ' + o.alias + ' = ' + o.source + '.read("' + o.table + '")')
      : ('# ' + o.alias + ' = ' + o.source + '.read()');
    return { verb: 'read', target: target, alias: o.alias, options: {}, line: line };
  }
```
Export it.

- [ ] **Step 4: Replace the four round-trips**

At `js/data-loader.js:457-461`, `:478-481`, `js/portable-export.js:568-571` and `index.html:7963`, the pattern is: build `'# load ' + target + ' as ' + alias` strings, concatenate with connect lines, then `DD.parse(...)`. Replace with building the `loads` array directly:

```js
    var parsedLoads = { connects: DD.parse(connectLines).connects,
                        loads: spec.sources.map(function (a) {
                          var t = tables[a];
                          return DD.makeLoad({ alias: a, source: t ? t.source : a, table: t ? t.table : null });
                        }),
                        metas: [], errors: [] };
```
(Adjust the alias prefix at `portable-export.js:568`, which uses `'src_' + k`.)

- [ ] **Step 5: Run tests + commit**

```bash
node --test tests/js/ && cd netlify/edge-functions && deno test --allow-all _lib/ && cd ../..
git add js/data-directives.js js/data-loader.js js/portable-export.js index.html tests/js/directive-semantics.test.js
git commit -m "refactor: makeLoad erstatter fire tekst-rundturer gjennom parseren"
```

---

# Fase D — pakke-paritet og dokumentasjon

### Task 11: `openstat.py` — `Dataset.join`, `format=`, avvis editor-only kwargs

**Files:**
- Modify: `openstat.py:391` (`Source.read`), `:496-529` (`Dataset`, `create`)
- Test: `tests/test_openstat.py`

**Hvorfor:** spec §4.5. Uten `Dataset.join` er `# panel.join(…)` ikke kopierbart, og uten avvisning blir `ost.read("URL", key="ask")` en *spørringsparameter* i stedet for en feil — stille galt, den verste utfallsklassen.

**Interfaces:**
- Produces:
  - `Dataset.join(other, on, how=None) -> Dataset` (chainable). `other` er `DataFrame` eller `Source`; `on` er streng eller liste.
  - `create(key, name=None, how="left", format=None)`; `Dataset.frame()` respekterer `format`.
  - `Source.read` reiser `ValueError` på `key`/`exec`/`cache`/`source`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_openstat.py`:

```python
def test_dataset_join_merges_on_explicit_key():
    a = pd.DataFrame({"k": [1, 2], "x": [10, 20]})
    b = pd.DataFrame({"pid": [1, 2], "y": [7, 8]})
    d = ost.create(key="k")
    d.add(a, "x")
    d.join(b.rename(columns={"pid": "k"}), on="k")
    out = d.frame()
    assert list(out.columns) == ["k", "x", "y"]
    assert out["y"].tolist() == [7, 8]


def test_dataset_join_how_outer():
    a = pd.DataFrame({"k": [1, 2], "x": [10, 20]})
    b = pd.DataFrame({"k": [2, 3], "y": [8, 9]})
    d = ost.create(key="k")
    d.add(a, "x").join(b, on="k", how="outer")
    assert len(d.frame()) == 3


def test_create_format_kwarg_is_accepted():
    d = ost.create(key="k", format="pandas")
    assert d.format == "pandas"


def test_editor_only_kwargs_are_rejected_loudly():
    src = ost.connect("https://x/d.csv", kind="csv")
    for bad in ("key", "exec", "cache", "source"):
        with pytest.raises(ValueError, match=bad):
            src.read(**{bad: "ask"})
```

Add `import pytest` at the top of the file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_openstat.py -k "join or format or editor_only" -v`
Expected: FAIL — `Dataset has no attribute 'join'`, `create() got an unexpected keyword argument 'format'`, and no `ValueError` raised.

- [ ] **Step 3: Implement**

In `openstat.py`, at the top of `Source.read` (`:391`), before any query handling:

```python
        _EDITOR_ONLY = ("key", "exec", "cache", "source")
        for _bad in _EDITOR_ONLY:
            if _bad in query:
                raise ValueError(
                    "«%s» er et editor-argument uten mening utenfor nettleseren "
                    "(nøkkelhåndtering, kjøringslokalitet, cache, kryssruntime-kopi). "
                    "Fjern det, eller kjør scriptet i OpenStat." % _bad)
```

Replace `Dataset.__init__`/`create` signatures and add `join`:

```python
    def __init__(self, key, name=None, how="left", format=None):
        self.key = [key] if isinstance(key, str) else list(key)
        self.name = name
        self.how = how
        self.format = format
        self._df = None
        if name:
            _DATASETS[name] = self

    def join(self, other, on, how=None):
        """Slå sammen en ramme eller kilde på en EKSPLISITT nøkkel (i motsetning
        til add(), som bruker datasettets deklarerte nøkkel)."""
        keys = [on] if isinstance(on, str) else list(on)
        piece = other if isinstance(other, pd.DataFrame) else other.read()
        missing = [k for k in keys if k not in piece.columns]
        if missing:
            raise ValueError("join: kolonnen(e) %s finnes ikke i høyre ramme" % ", ".join(missing))
        if self._df is None:
            raise ValueError("join krever at datasettet har innhold — bruk add() først")
        self._df = self._df.merge(piece, on=keys, how=how or self.how)
        return self
```

```python
def create(key, name=None, how="left", format=None):
    """Lag et tomt datasett med deklarert nøkkel — bygg det med add()/join()."""
    return Dataset(key, name=name, how=how, format=format)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_openstat.py -v`
Expected: PASS, alle tester

- [ ] **Step 5: Commit**

```bash
git add openstat.py tests/test_openstat.py
git commit -m "feat(openstat): Dataset.join, format=, og høylytt avvisning av editor-argumenter"
```

---

### Task 12: Portable export stripper editor-only kwargs

**Files:**
- Modify: `js/portable-export.js` (`transpile`-veien, ved siden av `scrubDirectiveLine`)
- Test: `netlify/edge-functions/_lib/portable-export.test.ts`

**Hvorfor:** spec §4.5(c) og §11. Task 11 gjør at pakken *feiler* høylytt; denne gjør at eksporten ikke produserer den feilen i utgangspunktet.

- [ ] **Step 1: Write the failing test**

Append to `netlify/edge-functions/_lib/portable-export.test.ts`:

```ts
Deno.test("export: editor-argumenter fjernes fra kommentert direktivlinje", () => {
  const out = PE.transpile(
    '# df = ost.read("https://x/d.csv", key="ask", cache="30m")\nprint(df)',
    "python", REG);
  assert(!out.code.includes('key='), "key= skal ikke overleve eksporten");
  assert(!out.code.includes('cache='), "cache= skal ikke overleve eksporten");
  assert(out.code.includes("editor-argumenter"),
         "eksporten skal forklare hva som ble fjernet");
});
```

(Match the existing helper names in that file — `PE`, `REG`, `assert` — the surrounding tests show the exact import style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/portable-export.test.ts`
Expected: FAIL — `key=` finnes i utdata

- [ ] **Step 3: Implement**

Add next to `scrubDirectiveLine` in `js/portable-export.js`:

```js
  // Editor-argumenter (spec §4.5c) har ingen mening utenfor appen, og
  // openstat.py avviser dem. Fjern dem fra den kommenterte direktivlinja i
  // stedet for å eksportere kode som feiler ved innliming.
  var EDITOR_ONLY_RE = /,[ \t]*(?:key|exec|cache|source)[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|\S+)/gi;

  function stripEditorOnly(line, state) {
    var out = line.replace(EDITOR_ONLY_RE, '');
    if (out !== line) state.strippedEditorOnly = true;
    return out;
  }
```

Call it from the same place `scrubDirectiveLine` is called (after scrubbing), and when `state.strippedEditorOnly` is set, append to the export header:

```
# editor-argumenter (key/exec/cache/source) er fjernet — de virker bare i OpenStat
```

- [ ] **Step 4: Run test + commit**

```bash
cd netlify/edge-functions && deno test --allow-all _lib/ && cd ../..
git add js/portable-export.js netlify/edge-functions/_lib/portable-export.test.ts
git commit -m "fix(eksport): fjern editor-argumenter så innlimt script ikke feiler stille"
```

---

### Task 13: Dokumentasjon, AI-promptmaler og spec-rettelser

**Files:**
- Modify: `hjelp.html`, `hjelp.en.html`, `js/command_help.js`, `README.md`, `docs/directive-language-examples.md` (prosaen rundt eksemplene — kodeblokkene ble konvertert i Task 8), `netlify/edge-functions/prompts/data-svar.md`, `netlify/edge-functions/_lib/data-svar-prompt.ts:34-60,91-92,137-157`, `index.html:1603,1626,1633` (publiseringsveien), `docs/ROADMAP.md`, `docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md`

- [ ] **Step 1: Publiseringsveien**

`index.html:1603` (`/^[ \t]*#[ \t]*load\b/mi`), `:1626` og `:1633` har egne `# load`/`# use`-regexer for «publiser dashboard». Replace with `DataDirectives.isDirectiveLine` line filtering, matching Task 9's pattern. Verify by publishing a dashboard from a script with one `ost.read` and one `ost.use`.

- [ ] **Step 2: Spec-rettelser**

In `docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md`:
- §5.2: change `NAVNEROM := options | tag | meta` to `NAVNEROM := meta`, and add a sentence that `#options.`/`#tag.` keep their existing parsers.
- §3.1: remove the contradictory sentence *«En `meta.bef.alder = "…"` uten videre ledd er en **feil**»* and the `labels`-reservation clause; state that unknown two-segment keys become display fields, and that variable level always requires three segments.
- §4.2: remove the renaming claim for `ost.use`; note it is deferred and why (`u.name` is the name in both runtimes for the consumers in `index.html`).

- [ ] **Step 3: Grammatikkens grenser må stå i hjelpen**

Add to `hjelp.html` and `hjelp.en.html`, verbatim from spec §5.3:

> Direktivlinjer er ikke Python. Grammatikken er lukket: ingen variabler i
> argumenter (unntatt kildenavn), ingen uttrykk, ingen f-strenger, ingen
> aritmetikk, ingen løkker eller betingelser, ingen import.

- [ ] **Step 4: AI-promptmaler**

Rewrite every directive example in `netlify/edge-functions/prompts/data-svar.md` and `_lib/data-svar-prompt.ts` to the new syntax. Run `deno test --allow-all _lib/data-svar-prompt.test.ts` — it asserts on the prompt text.

- [ ] **Step 5: ROADMAP**

Add under the directive section of `docs/ROADMAP.md`:

```
- [x] **Pythonsk direktivsyntaks** — LEVERT 2026-07-26: én grammatikk
      (`# <navn> = ost.<verb>(…)` og `#meta.<datasett>.<nøkkel> = …`) erstatter
      åtte regexer; `isDirectiveLine()` erstatter seks divergerende verblister
      (fikset meta-lekkasje til DuckDB-SQL); hard omlegging uten aliaser.
      openstat.py fikk `Dataset.join`/`format=` og avviser editor-argumenter.
      UTESTET: AI-evalene (`data-svar`) er fortsatt kalibrert mot gammelt
      vokabular og må re-kjøres med nøkkel.
```

- [ ] **Step 6: Browser-verifisering (spec §9)**

Serve locally and hard-reload with cache ignored (openstat verify-fella: Chrome HTTP-cacher `js/`). Verify three scripts end to end:

1. **pxweb + meta** — sidepanelet viser «Tilkoblede kilder» og «Datasett», ⓘ-modalen viser tittel, notat, felt (publisher) og lenker, og variabellista åpner.
2. **Montering** — `ost.create` + `add` + `join` gir riktig ramme, og datatabellen (⊞) åpner.
3. **R-modus med direktiver** — `-- ssb = ost.connect(…)` / `-- bef = ssb.read(…)` laster i webR.

Record what was observed, not what was expected.

- [ ] **Step 7: Full suite + commit**

```bash
node --test tests/js/
cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/ && cd ../..
.venv/bin/python -m pytest tests/ -q
.venv/bin/python manual_scripts/run_manual_scripts.py
```

```bash
git add -A
git commit -m "docs: pythonsk direktivsyntaks i hjelp, prompts, README og spec"
```

---

## Ferdigkriterier

- [ ] `node --test tests/js/` grønt
- [ ] `deno check` + `deno test --allow-all _lib/` grønt
- [ ] `pytest tests/` grønt
- [ ] `manual_scripts/run_manual_scripts.py` uten CRASH/PARTIAL
- [ ] Ingen `CONNECT_RE|LOAD_RE|LOADAS_RE|CREATE_RE|IMPORT_RE|JOIN_RE|META_RE|USE_RE` igjen: `grep -nE "CONNECT_RE|LOAD_RE|LOADAS_RE|CREATE_RE|IMPORT_RE|JOIN_RE|META_RE|USE_RE" js/`
- [ ] Ingen håndholdte verblister igjen: `grep -nE "connect\|read\|load\|require" js/ index.html`
- [ ] Browser-verifisering i Task 13 Step 6 utført og notert
- [ ] **Kjent gjenstående:** AI-evalene for `data-svar` er ikke re-kjørt (krever nøkkel) — noter det i sluttrapporten framfor å påstå full dekning.
- [ ] **Paritetshull notert (spec §11):** `Dataset.join` i `openstat.py` og
      join-en `AssemblyDuckdb.compile()` genererer er to implementasjoner av
      samme semantikk uten delt fixture. Task 6 tester *parsingen*, Task 11
      tester *pandas-merge-en* — ingen test binder dem sammen. Dette er en
      pre-eksisterende klasse (samme som `translateCanonical`-forken), ikke
      innført her. Noter det; ikke påstå paritet uten en delt fixture.
