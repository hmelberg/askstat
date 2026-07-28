# R-factor-runden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Samme typing-historie i R og mini-motorene som Pyodide: naken innlasting byte-lik + kun annotering; typing eksplisitt via `ost_read_csv`/`ost_convert_dtypes` (R) og `ost.read_csv`/`ost.convert_dtypes` (Brython/MicroPython); panelberikelse for R-rammer.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-r-factor-runden-design.md. Én kilde for typemeta-logikken: js/pxweb.js får en STRENG-flate (`metaUrlFor(url)`, `typemetaTsvFromText(text)`) som både R-workeren (via `webr::eval_js` etter at pxweb.js er evaluert inn i worker-scope) og mini-motorene (via `window.PxWeb`) konsumerer — strenger krysser alle broer trivielt. Main-thread-panelet bruker objektformen direkte (`ReadBridge.typemetaForUrl`). Anvendelsesreglene speiler openstat.py `_apply_best_effort` EKSAKT: kun kolonner hvis verdier ⊆ kildens koder typles; time+intlike → heltall; ellers factor/category i kildens orden; ALDRI verdiendring, ALDRI kast for metadata.

**Tech Stack:** js/pxweb.js (typeMetaFromJsonStat:186, dataUrlFor, recognizeUrl — FINNES), js/read-bridge.js (ensureText, rPatchSource:229), NY js/ost-r.js, shared/ost_core.py (ui_core-presedens: LIB_REGISTRY `path:`-overstyring), index.html (refreshDatasetSidebarFromR:8724, webR-boot:~10282, script-tags:12336-12339, openstat-boot:~10227), brython/tests/test_read_csv_url.py (stub-mønsteret).

## Global Constraints

- ALDRI push — commit lokalt; push er kontrollørens beslutning når runden er ferdig.
- Arbeidsgren: `r-factor-runden` (finnes, spec-en ligger der).
- ALDRI `git add` noe under `.superpowers/` — katalogen er utracket scratch (egen .gitignore med `*`; runtime-ost-lærdommen: en implementer force-committet smoke-fila).
- Overraskelsesprinsippet: naken `read.csv`/mini-`pd.read_csv` er byte-lik i verdier OG typer; automatisk skjer KUN annotering (attributt/panel). Verdier endres ALDRI av typing (koder forblir koder).
- Aldri kast for metadata: feil → utypet/uberiket + høylytt notat. HTTP-feil på DATA-henting er derimot høylytt feil.
- Paritet: anvendelsesreglene speiler openstat.py `_apply_best_effort` (openstat.py:270-288) — les den FØR du skriver apply-kode. Ingen ny logikk-tvilling av recognize/typemeta (js/pxweb.js er eneste kilde).
- Suiter ved hver task-slutt: `node --test "tests/js/"*.test.js` (1049/0 ved start), `python3 -m pytest -q` (1437/0 ved start). Ingen TS-endringer → deno røres ikke.
- Kommentarstil: norsk, hvorfor/kontrakt. Ikke-ASCII i JS-innbakte R-strenger escapes som `ø`-formen (rPatchSource-presedens).

---

### Task 1: pxweb.js strengflate — metaUrlFor + typemetaTsvFromText

**Files:**
- Modify: `js/pxweb.js` (nye funksjoner ved typeMetaFromJsonStat:186; eksporter i api-objektet nederst)
- Test: `tests/js/pxweb.test.js` (append)

**Interfaces:**
- Produces: `PxWeb.metaUrlFor(url) -> string` — json-stat2-metadata-URL-en for en gjenkjent register-URL, `''` for ukjent. Ren streng-komposisjon av recognizeUrl+dataUrlFor (samme uttrykk som prefetchScript-hinten i read-bridge.js:99-102).
- Produces: `PxWeb.typemetaTsvFromText(jsonText) -> string` — typemeta som linjeprotokoll for R/mini-konsum: én linje per dimensjon, felter skilt med `\x1f`: `did \x1f time|dim \x1f code1 \x1f code2 …`. Tom streng når typemeta mangler dims. `'ERR:<melding>'` ved parse-feil eller separator-tegn i navn/koder (aldri kast — kallere er sync-R/python).
- Consumes: `recognizeUrl`, `dataUrlFor`, `typeMetaFromJsonStat` (finnes i samme fil).

- [ ] **Step 1: Skriv feilende tester**

Append i `tests/js/pxweb.test.js` (filen har alt fixture-lasting av `tests/fixtures/pxweb_dataset.json` — gjenbruk mønsteret):

```js
test('metaUrlFor: gjenkjent -> json-stat2-form med samme spørring, ukjent -> tom', () => {
  assert.equal(
    PxWeb.metaUrlFor('https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?valueCodes[Tid]=*&outputFormat=csv'),
    PxWeb.dataUrlFor('pxweb', 'https://data.ssb.no/api/pxwebapi/v2/tables/05839?valueCodes[Tid]=*&outputFormat=csv'));
  assert.equal(PxWeb.metaUrlFor('https://ourworldindata.org/grapher/co2.csv'), '');
  assert.equal(PxWeb.metaUrlFor('ikke en url'), '');
});

test('typemetaTsvFromText: fixture -> linjer m/ klasse og koder i kildens orden', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pxweb_dataset.json'), 'utf8');
  const tsv = PxWeb.typemetaTsvFromText(text);
  const tm = PxWeb.typeMetaFromJsonStat(JSON.parse(text));
  const lines = tsv.split('\n');
  assert.equal(lines.length, Object.keys(tm.dims).length);
  for (const line of lines) {
    const p = line.split('\x1f');
    const did = p[0];
    assert.ok(tm.dims[did], did);
    assert.equal(p[1], tm.time.indexOf(did) !== -1 ? 'time' : 'dim');
    assert.deepEqual(p.slice(2), tm.dims[did].categories.map(String));
  }
});

test('typemetaTsvFromText: søppel og separator-koder gir ERR, aldri kast', () => {
  assert.match(PxWeb.typemetaTsvFromText('ikke json'), /^ERR:/);
  const evil = JSON.stringify({ id: ['a'], role: {},
    dimension: { a: { category: { index: { 'xy': 0 }, label: {} } } } });
  assert.match(PxWeb.typemetaTsvFromText(evil), /^ERR:/);
});
```

Merk til metaUrlFor-testen: fasiten uttrykkes VIA dataUrlFor (ikke en hardkodet streng) — kontrakten er «samme URL som prefetch-hinten», og dataUrlFor er allerede fixture-testet.

- [ ] **Step 2: Kjør → FAIL** — `node --test tests/js/pxweb.test.js` (funksjonene finnes ikke).

- [ ] **Step 3: Implementer**

I `js/pxweb.js`, rett etter `typeMetaFromJsonStat`:

```js
  // R-factor-runden §5: strengflaten R-workeren og mini-motorene konsumerer.
  // Strenger krysser alle broene (webr::eval_js, Brython/mpy-interop)
  // trivielt — objektformen gjør ikke det. Én kilde: gjenbruker recognize/
  // dataUrlFor/typeMetaFromJsonStat, aldri egen logikk.
  function metaUrlFor(url) {
    var rec = recognizeUrl(url);
    if (!rec) return '';
    var t = rec.base + '/' + rec.table + (rec.query ? '?' + rec.query : '');
    return dataUrlFor(rec.kind, t);
  }

  // Linjeprotokoll: «did \x1f time|dim \x1f code1 \x1f …» per dimensjon.
  // ERR:-prefiks i stedet for kast — kallerne er synkron R/python som skal
  // falle til utypet + notat, aldri velte. Separator-tegn i navn/koder er
  // teoretisk (register-koder), men stille korrupsjon er verre enn ERR.
  function typemetaTsv(tm) {
    var lines = [];
    var dims = (tm && tm.dims) || {};
    var time = (tm && tm.time) || [];
    for (var did in dims) {
      var cats = (dims[did].categories || []).map(String);
      var all = [did].concat(cats).join('');
      if (all.indexOf('\x1f') !== -1 || all.indexOf('\n') !== -1) return 'ERR:separator-tegn i dimensjonsnavn/kode';
      lines.push([did, time.indexOf(did) !== -1 ? 'time' : 'dim'].concat(cats).join('\x1f'));
    }
    return lines.join('\n');
  }

  function typemetaTsvFromText(jsonText) {
    try { return typemetaTsv(typeMetaFromJsonStat(JSON.parse(jsonText))); }
    catch (e) { return 'ERR:' + String((e && e.message) || e).slice(0, 200); }
  }
```

Eksporter i api-objektet nederst: `metaUrlFor: metaUrlFor, typemetaTsvFromText: typemetaTsvFromText,` (typemetaTsv holdes intern).

- [ ] **Step 4: Kjør → PASS** — `node --test "tests/js/"*.test.js`: 1052/0.

- [ ] **Step 5: Commit**

```bash
git add js/pxweb.js tests/js/pxweb.test.js
git commit -m "feat(pxweb): strengflate for R/mini-konsum — metaUrlFor + typemetaTsvFromText (r-factor §5)"
```

---

### Task 2: ReadBridge.typemetaForUrl (main-thread, for panelet)

**Files:**
- Modify: `js/read-bridge.js` (ny funksjon ved forPyodideSync; eksporter i ReadBridge-objektet)
- Test: `tests/js/read-bridge.test.js` (append)

**Interfaces:**
- Consumes: `PxWeb.metaUrlFor` (Task 1), `ensureText` (finnes), `PxWeb.typeMetaFromJsonStat`.
- Produces: `ReadBridge.typemetaForUrl(url) -> Promise<tm|null>` — typemeta-OBJEKTET (samme form som py-sveipens `info[name].typemeta`) for en gjenkjent URL; null for ukjent/feil, med console.warn. Aldri reject.

- [ ] **Step 1: Skriv feilende tester**

Append i `tests/js/read-bridge.test.js` (PX er alt requirt i filen):

```js
test('typemetaForUrl: gjenkjent URL -> tm via bro-cachen; ukjent -> null', async () => {
  RB._reset();
  const fixture = require('fs').readFileSync(require('path').join(__dirname, '..', 'fixtures', 'pxweb_dataset.json'), 'utf8');
  RB._setFetcher(async () => ({ bytes: Buffer.from(fixture), contentType: 'application/json; charset=utf-8' }));
  const tm = await RB.typemetaForUrl('https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?outputFormat=csv');
  assert.deepEqual(tm, PX.typeMetaFromJsonStat(JSON.parse(fixture)));
  assert.equal(await RB.typemetaForUrl('https://ourworldindata.org/grapher/co2.csv'), null);
});

test('typemetaForUrl: hentefeil og søppel-JSON -> null, aldri reject', async () => {
  RB._reset();
  RB._setFetcher(async () => { throw new Error('HTTP 500 for x'); });
  assert.equal(await RB.typemetaForUrl('https://data.ssb.no/api/pxwebapi/v2/tables/05839/data'), null);
  RB._reset();
  RB._setFetcher(async () => ({ bytes: Buffer.from('ikke json'), contentType: 'text/plain' }));
  assert.equal(await RB.typemetaForUrl('https://data.ssb.no/api/pxwebapi/v2/tables/05839/data'), null);
});
```

- [ ] **Step 2: Kjør → FAIL** — `node --test tests/js/read-bridge.test.js`.

- [ ] **Step 3: Implementer**

I `js/read-bridge.js`, etter `forPyodideSync`:

```js
  // R-factor-runden §2: typemeta for en data-URL, til panelberikelse av
  // R-rammer (main thread — sveipen er async). Deler bro-cachen: prefetch-
  // hinten og runtime-hentinger gjenbrukes gratis. null ved ukjent/feil —
  // panelet viser da bare det rammen selv kan fortelle. Aldri reject.
  function typemetaForUrl(url) {
    var px = global.PxWeb;
    if (!px || !px.metaUrlFor) return Promise.resolve(null);
    var mu = px.metaUrlFor(url);
    if (!mu) return Promise.resolve(null);
    return ensureText(mu).then(function (r) {
      if (r.error) { console.warn('typemetaForUrl:', url, r.error); return null; }
      try { return px.typeMetaFromJsonStat(JSON.parse(r.text)); }
      catch (e) { console.warn('typemetaForUrl:', url, (e && e.message) || e); return null; }
    });
  }
```

Legg `typemetaForUrl: typemetaForUrl,` i ReadBridge-eksporten.

- [ ] **Step 4: Kjør → PASS** — `node --test "tests/js/"*.test.js`: 1054/0. `python3 -m pytest -q`: 1437/0 urørt.

- [ ] **Step 5: Commit**

```bash
git add js/read-bridge.js tests/js/read-bridge.test.js
git commit -m "feat(read-bridge): typemetaForUrl — typemeta via bro-cachen for panelberikelse (r-factor §2)"
```

---

### Task 3: R-annotering (attr) + panelsveip-berikelse

**Files:**
- Modify: `js/read-bridge.js` (rPatchSource: `.ost_wrap_reader`, ~linje 298-309)
- Modify: `index.html` (`refreshDatasetSidebarFromR`, linje 8724)
- Test: `tests/js/read-bridge.test.js` (append — kildetekst-asserter på rPatchSource)

**Interfaces:**
- Produces (R): rammer født av patchede lesere (read.csv/read.csv2/fromJSON/readr::read_csv) med bro-URL får `attr(df, "ost_url") <- url`. Verdier/typer urørt.
- Produces (JS): `info[name].typemeta` for R-rammer med gjenkjent ost_url — samme felt py-sveipen sender, så `updateSidebarDatasets`/js/sidebar-typemeta.js er UENDRET.
- Consumes: `ReadBridge.typemetaForUrl` (Task 2).

- [ ] **Step 1: Skriv feilende kildetekst-tester**

Append i `tests/js/read-bridge.test.js` (samme stil som eksisterende rPatchSource-asserter i filen — grep `rPatchSource` der først og følg mønsteret):

```js
test('rPatchSource: wrapperen stempler ost_url-attributt (annotering, aldri typing)', () => {
  const src = RB.rPatchSource();
  assert.match(src, /attr\(res, "ost_url"\) <- u/);
  assert.match(src, /is\.data\.frame\(res\)/);
});
```

- [ ] **Step 2: Kjør → FAIL.**

- [ ] **Step 3: Implementer rPatchSource-endringen**

I `.ost_wrap_reader` i `js/read-bridge.js` erstattes wrapper-funksjonen (KUN disse linjene — resten av rPatchSource urørt):

```js
      '  w <- function(...) {',
      '    a <- list(...); nm <- names(a); if (is.null(nm)) nm <- rep("", length(a))',
      '    idx <- match(argname, nm)',
      '    if (is.na(idx) && length(a) && nm[1] == "") idx <- 1L',
      '    u <- NULL',
      '    if (!is.na(idx) && .ost_is_bridge_url(a[[idx]])) { u <- a[[idx]]; a[[idx]] <- .ost_fetch(u) }',
      '    res <- do.call(orig, a)',
      // R-factor §1: proveniens for panelberikelsen — KUN et attributt,
      // verdiene er byte-like (overraskelsesprinsippet). Gjenkjenning
      // (registerkilde eller ei) avgjøres JS-side i sveipen.
      '    if (!is.null(u) && is.data.frame(res)) attr(res, "ost_url") <- u',
      '    res',
      '  }',
```

- [ ] **Step 4: Utvid refreshDatasetSidebarFromR (index.html:8724)**

I R-evalen: utvid info-lista med ost_url (én linje i `info <- lapply(...)`-blokken):

```r
    ou <- attr(v, "ost_url")
    list(columns = as.character(names(v)), dtypes = dt, nrows = nrow(v),
         ost_url = if (is.null(ou)) "" else as.character(ou))
```

I JS-avlesningen (der `info[dsName] = {...}` bygges): plukk ut `ost_url`:

```js
          var ou = (m.ost_url && m.ost_url.values && m.ost_url.values[0]) || '';
          info[dsName] = { columns: (m.columns && m.columns.values) || [], dtypes: dtypes,
                           nrows: (m.nrows && m.nrows.values && m.nrows.values[0]) || 0, runtime: 'r',
                           ost_url: ou };
```

Etter at `info` er ferdigbygget, FØR `updateSidebarDatasets(info, 'R')`:

```js
        // R-factor §2: panelberikelse — typemeta hentes main-thread via
        // bro-cachen (typemetaForUrl er aldri-reject; null = uberiket).
        for (var dsName2 in info) {
          if (info[dsName2].ost_url && window.ReadBridge && window.ReadBridge.typemetaForUrl) {
            var _tm = await window.ReadBridge.typemetaForUrl(info[dsName2].ost_url);
            if (_tm) info[dsName2].typemeta = _tm;
          }
        }
```

- [ ] **Step 5: Kjør suitene → PASS** — node 1055/0, pytest 1437/0. (index.html-endringen dekkes av kontrollørens live-smoke — presedens fra metadata-runden.)

- [ ] **Step 6: Commit**

```bash
git add js/read-bridge.js tests/js/read-bridge.test.js index.html
git commit -m "feat(r-panel): ost_url-attributt fra bro-wrapperen + typemeta-berikelse i R-sveipen (r-factor §1-2)"
```

---

### Task 4: js/ost-r.js — ost_read_csv/ost_convert_dtypes + boot-wiring

**Files:**
- Create: `js/ost-r.js`
- Modify: `index.html` (script-tag etter read-bridge.js:12339; webR-boot ~10282; Pyodide-symmetrilinjen ~10227)
- Test: `tests/js/ost-r.test.js` (ny fil — kildetekst-asserter, pyPatchSource-presedensen)

**Interfaces:**
- Produces: `window.OstR.rSource() -> string` — R-kilde som evalueres med `webR.evalRVoid` ETTER rPatchSource (bruker `.ost_json_str`/`.ost_fetch`/`.ost_is_bridge_url` derfra) og ETTER at pxweb.js er evaluert inn i worker-scope. Definerer `ost_read_csv(url, convert = TRUE, ...)` og `ost_convert_dtypes(df, meta)` i globalenv.
- Consumes: `PxWeb.metaUrlFor`/`typemetaTsvFromText` (Task 1) — via `globalThis.PxWeb` i workeren.
- R-anvendelsesregler = `_apply_best_effort`-paritet: kun kolonner med verdier ⊆ koder; time + alle koder `^-?[0-9]+$` → `as.integer` (R-integer har NA — intet Int64-spesialfall); ellers `factor(levels = koder i kildens orden, ordered = time)`. INGEN value-koersjon (R parser tall nativt; py-tvillingens best-effort koersjerer heller ikke value).

- [ ] **Step 1: Skriv feilende tester**

Ny fil `tests/js/ost-r.test.js`:

```js
// tests/js/ost-r.test.js — R-typing-kilden (r-factor-runden §3).
// Kildetekst-asserter (pyPatchSource-presedensen): R kjøres ikke i CI —
// kontraktsbærende uttrykk sjekkes tekstlig, semantikken bevises i smoke.
const test = require('node:test');
const assert = require('node:assert');
require('../../js/ost-r.js');
const src = globalThis.OstR.rSource();

test('rSource: definerer begge funksjonene med riktige signaturer', () => {
  assert.match(src, /ost_read_csv <- function\(url, convert = TRUE, \.\.\.\)/);
  assert.match(src, /ost_convert_dtypes <- function\(df, meta\)/);
});

test('rSource: best-effort-paritet — koder-vakt, intlike-time, kildens orden, ordered', () => {
  assert.match(src, /all\(vals %in% cats\)/);                       // kun KODER typles
  assert.match(src, /grepl\("\^-\?\[0-9\]\+\$", cats\)/);           // intlike-regelen
  assert.match(src, /factor\(as\.character\(df\[\[did\]\]\), levels = cats, ordered = isTRUE\(e\$time\)\)/);
  assert.match(src, /as\.integer/);
});

test('rSource: aldri-kast for metadata + hoylytt melding + colClasses-vern', () => {
  assert.match(src, /tryCatch/);
  assert.match(src, /laster utypet/);
  assert.match(src, /colClasses/);
  assert.match(src, /'ost_convert_dtypes krever meta='|"ost_convert_dtypes krever meta="/);
});

test('rSource: attr settes for gjenkjent kilde uansett convert', () => {
  assert.match(src, /attr\(df, "ost_url"\) <- url/);
});
```

- [ ] **Step 2: Kjør → FAIL** (fila finnes ikke).

- [ ] **Step 3: Implementer js/ost-r.js**

```js
// js/ost-r.js — eksplisitt typing i R (r-factor-runden §3, spec
// docs/superpowers/specs/2026-07-28-r-factor-runden-design.md).
// R-kilden bor HER (node-testbar streng — pyPatchSource-presedensen) og
// evalueres ved webR-boot ETTER rPatchSource (gjenbruker .ost_json_str/
// .ost_fetch/.ost_is_bridge_url) og ETTER at js/pxweb.js er evaluert inn i
// worker-scope (globalThis.PxWeb — eneste kilde for gjenkjenning/typemeta,
// aldri en R-tvilling). Anvendelsesreglene speiler openstat.py
// _apply_best_effort: kun kolonner hvis verdier er kildens KODER typles;
// time+intlike -> as.integer (R-integer har NA); ellers factor i kildens
// orden. Verdier endres ALDRI. Metadata-feil -> utypet + hoylytt notat.
(function (global) {
  'use strict';

  function rSource() {
    return [
      // metadata-URL for en gjenkjent kilde ('' for ukjent/feil — aldri kast)
      '.ost_meta_url <- function(url) {',
      '  tryCatch({',
      '    r <- as.character(webr::eval_js(paste0(',
      "      '(function(){ try { var px = globalThis.PxWeb;',",
      "      ' if (!px || !px.metaUrlFor) return \"\";',",
      "      ' return px.metaUrlFor(', .ost_json_str(url), '); } catch (e) { return \"\"; } })()')))",
      '    if (length(r) == 1L && nzchar(r)) r else ""',
      '  }, error = function(e) "")',
      '}',
      // typemeta som linjeprotokoll (Task 1-flaten), parset til R-liste.
      // Henting via .ost_fetch = broen (proxy-fallback + manifest gratis).
      '.ost_typemeta_fetch <- function(murl) {',
      '  path <- tryCatch(.ost_fetch(murl), error = function(e) {',
      '    message("ost: metadata utilgjengelig (", conditionMessage(e), ") \\u2014 laster utypet."); NULL })',
      '  if (is.null(path)) return(NULL)',
      '  tsv <- tryCatch(as.character(webr::eval_js(paste0(',
      "    '(function(){ try { var t = new TextDecoder(\"utf-8\", {fatal:true}).decode(Module.FS.readFile(', .ost_json_str(path), '));',",
      "    ' return globalThis.PxWeb.typemetaTsvFromText(t); } catch (e) { return \"ERR:\" + String(e).slice(0,200); } })()'))),",
      '    error = function(e) paste0("ERR:", conditionMessage(e)))',
      '  if (!nzchar(tsv)) return(NULL)',
      '  if (startsWith(tsv, "ERR:")) {',
      '    message("ost: typemeta-feil (", sub("^ERR:", "", tsv), ") \\u2014 laster utypet."); return(NULL) }',
      '  lapply(strsplit(tsv, "\\n", fixed = TRUE)[[1]], function(l) {',
      '    p <- strsplit(l, "\\x1f", fixed = TRUE)[[1]]',
      '    list(did = p[1], time = identical(p[2], "time"),',
      '         codes = if (length(p) > 2) p[-c(1, 2)] else character(0))',
      '  })',
      '}',
      // best-effort-paritet med openstat.py _apply_best_effort — les den
      // ved endring («endres den ene, endres den andre»).
      '.ost_apply_typemeta_r <- function(df, tm) {',
      '  for (e in tm) {',
      '    did <- e$did',
      '    if (!(did %in% names(df))) next',
      '    cats <- e$codes',
      '    if (!length(cats)) next',
      '    vals <- unique(as.character(df[[did]][!is.na(df[[did]])]))',
      '    if (!length(vals) || !all(vals %in% cats)) next',
      '    if (isTRUE(e$time) && all(grepl("^-?[0-9]+$", cats))) {',
      '      df[[did]] <- as.integer(as.character(df[[did]]))',
      '    } else {',
      '      df[[did]] <- factor(as.character(df[[did]]), levels = cats, ordered = isTRUE(e$time))',
      '    }',
      '  }',
      '  df',
      '}',
      // 0301-vernet VED parse (py-paritet): dim-kolonner leses som character
      // saa "0301" ikke blir 301 foer factor-typingen. Konservativt: vernet
      // droppes helt naar brukeren selv sender sep= eller colClasses= i ...
      // (headeren sniffes med komma — feil sep gir feil vern, og brukerens
      // valg vinner alltid, som i py-tvillingen).
      '.ost_col_guard <- function(path, tm, dots) {',
      '  if (any(c("colClasses", "sep") %in% names(dots))) return(NULL)',
      '  hdr <- tryCatch(strsplit(readLines(path, n = 1L, warn = FALSE), ",", fixed = TRUE)[[1]],',
      '                  error = function(e) character(0))',
      '  hdr <- gsub(\'^"|"$\', "", hdr)',
      '  dids <- vapply(tm, function(e) e$did, character(1))',
      '  guard <- intersect(dids, hdr)',
      '  if (!length(guard)) return(NULL)',
      '  stats::setNames(rep("character", length(guard)), guard)',
      '}',
      'ost_read_csv <- function(url, convert = TRUE, ...) {',
      '  if (!.ost_is_bridge_url(url)) stop("ost_read_csv krever en URL (https://\\u2026 eller /api/hent?\\u2026)")',
      '  path <- .ost_fetch(url)',
      '  murl <- .ost_meta_url(url)',
      '  if (!nzchar(murl)) return(utils::read.csv(path, ...))',   // ukjent: ren passthrough
      '  tm <- NULL',
      '  if (isTRUE(convert)) tm <- .ost_typemeta_fetch(murl)',
      '  cc <- if (!is.null(tm)) .ost_col_guard(path, tm, list(...)) else NULL',
      '  df <- if (is.null(cc)) utils::read.csv(path, ...) else utils::read.csv(path, colClasses = cc, ...)',
      '  if (!is.null(tm)) df <- .ost_apply_typemeta_r(df, tm)',
      '  attr(df, "ost_url") <- url',                              // panelet — uansett convert
      '  df',
      '}',
      'ost_convert_dtypes <- function(df, meta) {',
      '  if (missing(meta) || is.null(meta)) stop("ost_convert_dtypes krever meta= (register-URL eller typemeta-liste) \\u2014 heuristikk uten meta er ikke st\\u00f8ttet i R")',
      '  tm <- if (is.character(meta) && length(meta) == 1L) {',
      '    murl <- .ost_meta_url(meta)',
      '    if (!nzchar(murl)) stop("gjenkjente ikke kilden: ", meta)',
      '    t2 <- .ost_typemeta_fetch(murl)',
      '    if (is.null(t2)) stop("kunne ikke hente metadata for ", meta)',
      '    t2',
      '  } else if (is.list(meta)) meta',
      '  else stop("meta m\\u00e5 v\\u00e6re en register-URL eller en typemeta-liste")',
      '  .ost_apply_typemeta_r(df, tm)',
      '}',
      ''
    ].join('\n');
  }

  global.OstR = { rSource: rSource };
})(typeof window !== 'undefined' ? window : globalThis);
```

VIKTIG sitat-detalj: R-kilde-linjene som selv bygger JS-strenger (paste0-linjene) blander '- og "-sitering — transkriber NØYAKTIG som over; kjør node-testene og les output ved tvil.

- [ ] **Step 4: index.html-wiring**

(a) Script-tag etter linje 12339: `<script src="js/ost-r.js"></script>`

(b) I `_loadWebRImpl`, rett etter rPatchSource-evalen (~10282-10284):

```js
        // r-factor §5: pxweb.js inn i worker-scope (globalThis.PxWeb) +
        // ost_read_csv/ost_convert_dtypes. Kildene bor i js/pxweb.js og
        // js/ost-r.js; feiler lastingen degraderes ost_read_csv til utypet
        // (aldri-kast-regelen) og naken vei er upåvirket.
        if (window.OstR && window.OstR.rSource) {
          try {
            const pxResp = await fetch('js/pxweb.js?v=' + encodeURIComponent(window.M2PY_VERSION || '')).catch(function () { return { ok: false }; });
            if (pxResp && pxResp.ok) {
              await webR.FS.writeFile('/ost_pxweb.js', new TextEncoder().encode(await pxResp.text()));
              const pxOk = await webR.evalRString(
                'as.character(webr::eval_js(\'(function(){ try { var t = new TextDecoder("utf-8").decode(Module.FS.readFile("/ost_pxweb.js")); (0,eval)(t); return typeof globalThis.PxWeb !== "undefined" ? "OK" : "ERR:PxWeb mangler"; } catch (e) { return "ERR:" + String(e).slice(0,200); } })()\'))');
              if (pxOk !== 'OK') console.warn('ost-r: pxweb i worker:', pxOk);
            }
            await webR.evalRVoid(window.OstR.rSource());
          } catch (e) { console.warn('ost-r:', e); }
        }
```

(Sjekk hvordan cache-bust gjøres for andre statiske filer i nærheten — bruk samme konvensjon som finnes; `?v=`-formen over er fallback.)

(c) Pyodide-symmetrien (~10227, inne i samme runPythonAsync som registrerer openstat):

```python
sys.modules["ost"] = sys.modules["openstat"]
```

(én linje til slutt i den eksisterende py-strengen — `import ost` virker da likt i alle tre python-motorene.)

- [ ] **Step 5: Kjør suitene → PASS** — node 1059/0 (1055 + 4 nye), pytest 1437/0.

- [ ] **Step 6: Commit**

```bash
git add js/ost-r.js tests/js/ost-r.test.js index.html
git commit -m "feat(ost-r): ost_read_csv/ost_convert_dtypes i R — pxweb i worker, colClasses-vern, best-effort-paritet (r-factor §3+§5)"
```

---

### Task 5: shared/ost_core.py — mini-ost for Brython/MicroPython

**Files:**
- Create: `shared/ost_core.py`
- Modify: `js/brython-engine.js` (LIB_REGISTRY, ~linje 38: ny oppføring)
- Modify: `js/micropython-engine.js` (LIB_REGISTRY, ~linje 18: ny oppføring)
- Test: `brython/tests/test_ost_core.py` (ny — stub-mønsteret fra brython/tests/test_read_csv_url.py)

**Interfaces:**
- Produces: `import ost` / `import openstat as ost` i begge mini-motorene → modul med `read_csv(url, convert=True, **kwargs)` og `convert_dtypes(df, meta=None)`.
- Consumes: mini-`pandas` (aliasregistrert i motoren), `window.__brythonFetchSync`/`js.__mpyFetchSync` (JSON-strengprotokoll {pending|text|error} — se brython/pandas_brython.py:4933 og micropython/pandas_mpy.py:5181), `window.PxWeb.metaUrlFor`/`typemetaTsvFromText` (Task 1 — strenger inn/ut, dialektsikkert).
- Registry-oppføringer (ui_core-presedensen med path-overstyring):
  - brython: `ost_core: { aliases: ['openstat', 'ost'], deps: ['pandas_brython'], js: [], path: 'shared/ost_core.py' },`
  - mpy: `ost_core: { aliases: ['openstat', 'ost'], deps: ['pandas_mpy'], js: [], path: 'shared/ost_core.py' },`
- KJENT BEGRENSNING (dokumenteres i modul-docstringen og ledgeren): mini-read_csv har ingen dtype-kwarg → 0301-vernet-ved-parse er umulig; kolonner med ledende-null-koder blir tall ved parse og best-effort-vakten hopper dem over (utypet, som naken). Ingen attrs settes (TSV bærer ikke etiketter/enheter; panel-typemeta for mini er utenfor scope).

- [ ] **Step 1: Skriv feilende tester**

Ny fil `brython/tests/test_ost_core.py` — følg stub-oppsettet i test_read_csv_url.py (sys.path-insert av brython/ og shared/, fake `browser`-modul). Kjernen:

```python
# brython/tests/test_ost_core.py — mini-ost (r-factor-runden §4). Kjøres
# under CPython: pandas = ekte pandas_brython, browser/js = stubber,
# PxWeb = stub med Task 1-strengkontrakten.
import json
import sys
import types
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "brython"))
sys.path.insert(0, str(ROOT / "shared"))

TSV = "Region\x1fdim\x1f11\x1f31\nTid\x1ftime\x1f2023\x1f2024"


def _install(responses, tsv=TSV, hook="__brythonFetchSync"):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    px = types.SimpleNamespace(
        metaUrlFor=lambda u: "https://meta.example/js2" if "tables/" in u else "",
        typemetaTsvFromText=lambda t: tsv)
    win = types.SimpleNamespace(PxWeb=px)
    setattr(win, hook, fetch_sync)
    mod = types.ModuleType("browser")
    mod.window = win
    sys.modules["browser"] = mod
    sys.modules.pop("pandas", None)
    sys.modules.pop("pandas_brython", None)
    import pandas_brython
    sys.modules["pandas"] = pandas_brython
    sys.modules.pop("ost_core", None)
    import ost_core
    return ost_core, calls


CSV_URL = "https://x.example/tables/05839/data?outputFormat=csv"
DATA = {"text": "Region,Tid,value\n11,2023,1\n31,2024,2\n"}
META = {"text": "{}"}


def test_read_csv_convert_typer_dims_og_time():
    ost, calls = _install({CSV_URL: DATA, "https://meta.example/js2": META})
    df = ost.read_csv(CSV_URL)
    assert str(df["Region"].dtype) == "category"
    assert list(df["Tid"]) == [2023, 2024]
    assert calls == [CSV_URL, "https://meta.example/js2"]


def test_read_csv_convert_false_er_naken():
    ost, calls = _install({CSV_URL: DATA})
    df = ost.read_csv(CSV_URL, convert=False)
    assert str(df["Region"].dtype) != "category"
    assert calls == [CSV_URL]          # metadata hentes ikke engang


def test_read_csv_best_effort_hopper_ved_verdier_utenfor_kodene():
    ost, _ = _install({CSV_URL: {"text": "Region,Tid,value\n99,2023,1\n"},
                       "https://meta.example/js2": META})
    df = ost.read_csv(CSV_URL)
    assert str(df["Region"].dtype) != "category"    # 99 ∉ {11, 31} -> urørt


def test_read_csv_metadatafeil_gir_utypet_ikke_kast():
    ost, _ = _install({CSV_URL: DATA})               # meta-URL svarer error
    df = ost.read_csv(CSV_URL)
    assert list(df.columns) == ["Region", "Tid", "value"]


def test_read_csv_ukjent_url_ren_passthrough():
    url = "https://x.example/plain.csv"
    ost, calls = _install({url: DATA})
    df = ost.read_csv(url)
    assert str(df["Region"].dtype) != "category"
    assert calls == [url]


def test_convert_dtypes_krever_meta():
    ost, _ = _install({})
    import pytest
    with pytest.raises(ValueError, match="krever meta="):
        ost.convert_dtypes(object())


def test_pending_propagerer():
    ost, _ = _install({CSV_URL: {"pending": True}})
    try:
        ost.read_csv(CSV_URL)
        assert False, "skulle reist pending"
    except BaseException as e:
        assert getattr(type(e), "__brython_pending__", False)


def test_mpy_hook_varianten():
    sys.modules.pop("browser", None)
    ost, calls = _install({CSV_URL: DATA, "https://meta.example/js2": META}, hook="__mpyFetchSync")
    # _install la stubben i browser-modulen; mpy-veien går via js-modulen:
    js = types.ModuleType("js")
    js.PxWeb = sys.modules["browser"].window.PxWeb
    js.__mpyFetchSync = getattr(sys.modules["browser"].window, "__mpyFetchSync")
    sys.modules["js"] = js
    del sys.modules["browser"]
    sys.modules.pop("ost_core", None)
    import ost_core
    df = ost_core.read_csv(CSV_URL)
    assert str(df["Region"].dtype) == "category"
    del sys.modules["js"]
```

Merk: mini-pandas leser "11"/"31" som TALL — testen over antar at best-effort sammenlikner `str(v)` mot kodene, så `11 -> "11" ∈ codes`. Verifiser under rød-fase hva pandas_brython faktisk gjør med numeriske kolonner, og juster TESTDATAENE (ikke semantikken) om nødvendig — f.eks. bokstavkoder ("KOSTRA-form") for dims-testen. Semantikken (vals ⊆ codes på str-form) ligger fast fra py-tvillingen.

- [ ] **Step 2: Kjør → FAIL** — `python3 -m pytest -q brython/tests/test_ost_core.py`.

- [ ] **Step 3: Implementer shared/ost_core.py**

```python
"""ost for mini-motorene (Brython/MicroPython) — r-factor-runden §4.

Delt fil (ui_core-presedensen): dialektforskjellen er KUN js-roten
(Brython: browser.window; MicroPython: js). Typemeta kommer som STRENGER
fra window.PxWeb (metaUrlFor/typemetaTsvFromText — Task 1-flaten); ingen
logikk-tvilling her. Anvendelse speiler openstat.py _apply_best_effort:
kun kolonner hvis verdier (str-form) er kildens KODER typles; time+intlike
-> int64; ellers category. Verdier endres ALDRI; metadata-feil -> utypet +
notat, aldri kast.

KJENTE BEGRENSNINGER (mini-pandas):
- read_csv har ingen dtype-kwarg -> 0301-vernet-ved-parse finnes ikke her;
  ledende-null-koder blir tall ved parse og best-effort hopper dem over.
- Ingen Int64 -> NaN i intlike tidskolonne forblir utypet (notat).
- Ingen attrs settes (TSV baerer ikke etiketter; panel-typemeta er kø).
- convert_dtypes tar KUN register-URL som meta (dict-formen er kø).
"""
import pandas as pd


class _PendingFetch(BaseException):
    # Klasse-attributt, ikke instans (mpy-fella; se pandas_mpy._PendingFetch)
    __brython_pending__ = True


def _js_root():
    try:
        from browser import window as w   # Brython
        return w
    except ImportError:
        import js                          # MicroPython
        return js


def _fetch_text(url):
    import json as _json
    w = _js_root()
    hook = getattr(w, "__brythonFetchSync", None)
    if hook is None:
        hook = getattr(w, "__mpyFetchSync", None)
    if hook is None:
        # js-namespace-fella (se pandas_mpy read_csv): 'import js' kan lykkes
        # stille utenfor motoren — sjekk at broen faktisk er koblet.
        raise ValueError("ost: URL-broen er ikke koblet (kjorer du utenfor motoren?)")
    res = _json.loads(hook(url))
    if res.get("pending"):
        raise _PendingFetch("venter paa " + url)
    if res.get("error"):
        raise ValueError(str(res["error"]))
    return res["text"]


def _intlike(codes):
    if not codes:
        return False
    for c in codes:
        try:
            int(str(c))
        except (TypeError, ValueError):
            return False
    return True


def _typemeta_entries(url):
    """[{did, time, codes}] for gjenkjent kilde; (None, feiltekst) ellers.
    Returnerer (entries, err) — err=None og entries=None betyr ukjent kilde
    (stille passthrough, som py)."""
    w = _js_root()
    px = getattr(w, "PxWeb", None)
    if px is None:
        return None, "PxWeb utilgjengelig"
    murl = str(px.metaUrlFor(str(url)) or "")
    if not murl:
        return None, None
    try:
        text = _fetch_text(murl)
    except _PendingFetch:
        raise
    except Exception as e:
        return None, str(e)
    tsv = str(px.typemetaTsvFromText(text))
    if tsv.startswith("ERR:"):
        return None, tsv[4:]
    if not tsv:
        return None, None
    out = []
    for line in tsv.split("\n"):
        if not line:
            continue
        p = line.split("\x1f")
        out.append({"did": p[0], "time": p[1] == "time", "codes": p[2:]})
    return out, None


def _apply(df, entries, who):
    for e in entries:
        did = e["did"]
        if did not in df.columns:
            continue
        cats = e["codes"]
        if not cats:
            continue
        col = df[did]
        vals = set()
        has_none = False
        for v in col:
            if v is None:
                has_none = True
            else:
                vals.add(str(v))
        if not vals or not vals.issubset(set(cats)):
            continue
        if e["time"] and _intlike(cats):
            if has_none:
                print(who + ": NaN i tidskolonnen " + did +
                      " - forblir utypet (ingen Int64 i mini-pandas)")
                continue
            df[did] = col.astype("int64")
        else:
            df[did] = col.astype("category")
    return df


def read_csv(url, convert=True, **kwargs):
    df = pd.read_csv(url, **kwargs)      # replay-broen håndterer henting
    if not convert:
        return df
    entries, err = _typemeta_entries(url)
    if err:
        print("ost.read_csv: metadata utilgjengelig for " + str(url) +
              " (" + err + ") - fortsetter utypet")
        return df
    if entries is None:
        return df                        # ukjent kilde: ren passthrough
    return _apply(df, entries, "ost.read_csv")


def convert_dtypes(df, meta=None):
    if meta is None or not isinstance(meta, str):
        raise ValueError("ost.convert_dtypes i mini-motorene krever meta= "
                         "(register-URL) - heuristikk/dict-form er ikke stottet her")
    entries, err = _typemeta_entries(meta)
    if err or entries is None:
        raise ValueError("kunne ikke hente metadata for " + str(meta) +
                         ((" (" + err + ")") if err else ""))
    return _apply(df, entries, "ost.convert_dtypes")
```

Tilpasninger som er LOV under grønn-fasen (mini-pandas-API-et avviker fra ekte pandas): iterasjon over Series, `astype`-varianter, kolonnetildeling — juster mekanikken, ALDRI semantikken (vals ⊆ codes, int for time-intlike uten NaN, category ellers, aldri kast for metadata). Måler du at `astype("int64")` mangler i mini-pandas: la time-kolonnen stå urørt + notat, og før det i rapporten.

- [ ] **Step 4: Registry-oppføringene**

I `js/brython-engine.js` LIB_REGISTRY (etter ui_core-oppføringen, samme innrykk):

```js
    // r-factor-runden §4: mini-ost — delt kilde (ui_core-presedensen).
    // Typemeta via window.PxWeb (strengflaten) — ingen logikk-tvilling.
    ost_core:               { aliases: ['openstat', 'ost'], deps: ['pandas_brython'], js: [],
                              path: 'shared/ost_core.py' },
```

I `js/micropython-engine.js` LIB_REGISTRY tilsvarende:

```js
    // r-factor-runden §4: mini-ost — delt kilde, se brython-oppføringen.
    ost_core:           { aliases: ['openstat', 'ost'], deps: ['pandas_mpy'], js: [],
                          path: 'shared/ost_core.py' },
```

Sjekk FØRST hvordan `import <alias>` faktisk registrerer modulnavn i ensureLibs (begge motorer) — hvis alias-navnene ikke automatisk blir sys.modules-navn, følg mønsteret motoren bruker for matplotlib-aliasene, og noter i rapporten hva du fant.

- [ ] **Step 5: Kjør → PASS** — `python3 -m pytest -q` (1437 + 8 nye = 1445/0), `node --test "tests/js/"*.test.js` (1059/0 — registry-endringer kan ha registry-asserter i motortestene; feiler noen, les dem og oppdater forventningslister ETTER mønsteret der, aldri ved å fjerne asserten).

- [ ] **Step 6: Commit**

```bash
git add shared/ost_core.py brython/tests/test_ost_core.py js/brython-engine.js js/micropython-engine.js
git commit -m "feat(mini-ost): ost.read_csv/convert_dtypes i Brython+MicroPython — delt kilde, PxWeb-strengflaten (r-factor §4)"
```

---

### Task 6: Hjelpetekst + smoke-scenario

**Files:**
- Modify: `hjelp.html` (~linje 475: setningen «R har foreløpig ingen tilsvarende funksjon»)
- Modify: `hjelp.en.html` (tilsvarende setning — grep etter "R has")
- Modify (KUN DISK, ALDRI git add): `.superpowers/sdd/bro-smoke.md` (append §11 HELT SIST i fila — etter §10)

**Interfaces:** ingen — dokumentasjon.

- [ ] **Step 1: hjelp.html**

Erstatt setningen «R har foreløpig ingen tilsvarende funksjon.» (slutten av avsnittet om automatisk metadata) med:

```html
I R finnes tilsvarende: <code>ost_read_csv(url)</code> (typing på med <code>convert=FALSE</code> for å skru av) og <code>ost_convert_dtypes(df, meta=url)</code> — kodekolonner blir factor med kildens nivåer i kildens orden. I de lette Python-motorene (Brython/MicroPython) finnes <code>ost.read_csv</code>/<code>ost.convert_dtypes</code> med samme regler (uten vern mot at koder med ledende nuller alt er blitt tall under parsing).
```

Behold resten av avsnittet urørt. Speil samme innhold i `hjelp.en.html` på engelsk (finn det tilsvarende avsnittet — samme struktur).

- [ ] **Step 2: bro-smoke.md §11 (kun disk)**

Append HELT SIST (etter §10 — «append» betyr SLUTTEN av fila; §10 ble feilplassert i forrige runde):

```markdown
---

## 11. R-factor + mini-ost (r-factor-runden 2026-07-28)

**Modus: R.**

```r
df <- read.csv("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?outputFormat=csv")
tdf <- ost_read_csv("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?outputFormat=csv")
str(tdf)
```

**Se:** (a) naken `read.csv`-ramme: verdier/typer som naken R, men
datasettpanelet viser etiketter/nivåliste/enheter (ost_url-attributt +
typemetaForUrl); (b) `str(tdf)`: dim-kolonner er `Factor` med kildens
nivåer i kildens orden, Tid er `int`; (c) `ost_convert_dtypes(df,
meta="…samme url…")` gir samme typing på den nakne rammen.

**Modus: Brython (og MicroPython):**

```python
import ost
df = ost.read_csv("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?outputFormat=csv")
df.dtypes
```

**Se:** kjøring nr. 1 kan replay-vente (pending); deretter category-dtype
på dim-kolonner med bokstavkoder, int på Tid. NB: kolonner med
ledende-null-koder (0301) forblir tall — dokumentert mini-begrensning.

**Modus: Python (Pyodide):** `import ost` alene virker nå (symmetrien);
`ost.read_csv is openstat.read_csv` er True.
```

- [ ] **Step 3: Kjør suitene (uendret grønt) og commit**

```bash
git add hjelp.html hjelp.en.html
git commit -m "docs(hjelp): R- og mini-ost-veiene dokumentert — R-forbeholdet fjernet (r-factor §7)"
```

(bro-smoke.md skal IKKE med i commiten — utracket scratch.)

---

## Kontrollørens sluttsteg (utenfor task-nummereringen)

- Slutt-review av hele diffen (main..r-factor-runden) på mest kapable modell.
- Live browser-smoke §11 mot netlify dev :8888 (playwright fersk instans — omgår js-cache-fella; pkill stale ms-playwright-mcp først om nødvendig; btnRun klikkes via evaluate): R-panelberikelse, ost_read_csv-factor, mini-ost i Brython, `import ost` i Pyodide.
- Merge til main, push (kontrollørens beslutning), ledger-oppdatering nederst i progress.md.
