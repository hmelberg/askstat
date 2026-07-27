# Pandas-URL-broen — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pd.read_csv("https://…")` (og `read_json`/`read_parquet` der de finnes) virker i alle tre Python-motorene (Pyodide, Brython, MicroPython) via én delt hentebro — samme linje er ren pandas i CPython.

**Architecture:** Én ny modul `js/read-bridge.js` eier URL-skann (prefetch-hint), byte-cache og synkron-henting; den bygger på en ny eksport `DataLoader.fetchRawUrl` som gjenbruker dagens proxy-fallback. Pyodide (main thread, `index.html:9986`) får en pandas-wrapper i Python-preamblet som slår opp i cachen og faller tilbake på synkron XHR; Brython/MicroPython gjenbruker den eksisterende replay-async-broen (samme `PENDING`-protokoll som duckdb-broen, `js/brython-engine.js:383-403` / `js/micropython-engine.js:347`).

**Tech Stack:** Vanilla JS (IIFE-moduler som resten av `js/`), node:test, Deno-test, pytest (CPython-fakes for brython/mpy-modulene, presedens: `brython/tests/test_duckdb_brython.py`).

## Global Constraints

- **Aldri stille feil data:** HTTP-feil skal feile FØR parsing — en 400-JSON-kropp inn i CSV-parseren gir en absurd én-kolonnes ramme. Feilmeldingen skal bære status og URL.
- **Hint-prinsippet:** prefetch-skannen er en OPTIMALISERING. En bom skal koste ventetid, aldri korrekthet. Skannen tar bare rene string-literaler; dynamiske URL-er dekkes av sync-fallbackene.
- **Standalone-paritet:** wrapperne endrer INGENTING for ikke-URL-argumenter. Samme script skal kjøre uendret i CPython (der er `pd.read_csv(url)` allerede standard).
- **Ingen nye avhengigheter:** ingen pyodide-http, ingen pyjstat. Broen bruker dagens fetch-vei.
- **Suite-baseline (0 fail):** node 998, deno 273, pytest 1394. Én ny feil er en regresjon.
- Kjør pytest med `python3` — det finnes ingen `.venv`.
- Commit lokalt. **ALDRI push** (Hans' beslutning i openstat).
- **Ikke-mål:** R/webR (python først), runtime-`ost` i Pyodide (egen plan; broen er forutsetningen), `read_parquet` i Brython/MicroPython (kun Pyodide har ekte parquet; mini-pandasene gir klar feilmelding som i dag).

## Filstruktur

- `js/data-loader.js` — MODIFY: ny eksport `fetchRawUrl` (gjenbruker `fetchLoadTarget`-mekanikken `:73-100`).
- `js/read-bridge.js` — CREATE: skann + cache + `ensure`/`getCached`/`forPyodideSync` + `pyPatchSource()` (Pyodide-patchens Python-kilde, node-testbar streng).
- `index.html` — MODIFY: last `read-bridge.js`; injiser Pyodide-patchen i interpreter-preamblet; kall `prefetchScript` ved de tre PYODIDE-inngangene. **KORRIGERT ved pre-sjekk 2026-07-27:** `:2716`/`:2791`/`:2856` er brython/mpy/js-innganger — de riktige er `:10374` (hovedkjøring, `effectiveScript`), `:10860` (notatbok-boot, `scriptInput.value`), `:11907` (forklar, `snapshotScript`). Patchen i `getInterpreterCorePython` (`:7470`) dekker alle Pyodide-veier automatisk (både `:10458` setupCode og `:11920` explainInit bygger på den).
- `js/brython-engine.js` — MODIFY: `beginFetchBridge()` parallelt med `beginDuckBridge()`; replay-løkka flusher begge køene.
- `brython/pandas_brython.py` — MODIFY: URL-gren i `read_csv` (`:4888`).
- `js/micropython-engine.js` + `micropython/pandas_mpy.py` — MODIFY: samme mønster (`__mpyFetchSync`, `read_csv` `:5161`).
- Tester: `netlify/edge-functions/_lib/data-loader.test.ts`, `tests/js/read-bridge.test.js` (CREATE), `brython/tests/test_read_csv_url.py` (CREATE), `micropython/tests/test_read_csv_url.py` (CREATE).
- Dokumentasjon/AI: `hjelp.html`, `hjelp.en.html`, `docs/directive-language-examples.md`/`.html`, `netlify/edge-functions/prompts/data-svar.md`, `_lib/data-svar-prompt.ts`, `kode-svar.ts`, tre eksempelfiler, `.superpowers/sdd/bro-smoke.md` (CREATE).

---

### Task 1: `DataLoader.fetchRawUrl(url)`

**Files:**
- Modify: `js/data-loader.js` (ny funksjon ved siden av `fetchLoadTarget` `:73`; eksportlista `:515`)
- Test: `netlify/edge-functions/_lib/data-loader.test.ts`

**Interfaces:**
- Consumes: intern `fetchLoadTarget`-mekanikk (direkte fetch → `!ok` kaster `HTTP <status>`; `TypeError` → proxy-retry via `/api/hent?url=`).
- Produces: `DataLoader.fetchRawUrl(url, deps?) -> Promise<{bytes: Uint8Array, contentType: string}>`. Kaster `Error('HTTP <status> for <url>')` ved HTTP-feil (også via proxy: `Error('proxy <status> for <url>')`). `deps.fetchImpl` overstyrbar for tester (samme konvensjon som `resolveAndFetchLoads`).

- [ ] **Step 1: Skriv den feilende testen**

Legg til i `netlify/edge-functions/_lib/data-loader.test.ts` (samme `fetchImpl`-stubbestil som resten av fila):

```ts
Deno.test("fetchRawUrl: bytes + contentType ved 200", async () => {
  const fetchImpl = (u: string) =>
    Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  const out = await DL.fetchRawUrl("https://x.example/d.csv", { fetchImpl });
  assertEquals(new TextDecoder().decode(out.bytes), "a,b\n1,2");
  assertEquals(out.contentType.includes("text/csv"), true);
});

Deno.test("fetchRawUrl: HTTP-feil kaster med status og URL — aldri bytes fra en feilkropp", async () => {
  const fetchImpl = (u: string) =>
    Promise.resolve(new Response('{"type":"Parameter error","status":400}', { status: 400 }));
  await assertRejects(
    () => DL.fetchRawUrl("https://x.example/d.csv", { fetchImpl }),
    Error, "HTTP 400");
});

Deno.test("fetchRawUrl: TypeError (CORS/nettverk) faller tilbake på proxy", async () => {
  const calls: string[] = [];
  const fetchImpl = (u: string) => {
    calls.push(u);
    if (u.indexOf("/api/hent?") === 0)
      return Promise.resolve(new Response("ok", { status: 200, headers: { "content-type": "text/csv" } }));
    return Promise.reject(new TypeError("Failed to fetch"));
  };
  const out = await DL.fetchRawUrl("https://cors-stengt.example/d.csv", { fetchImpl });
  assertEquals(new TextDecoder().decode(out.bytes), "ok");
  assertEquals(calls[1].indexOf("/api/hent?url="), 0);
});
```

`assertRejects` importeres fra samme assert-modul som `assertEquals` øverst i fila hvis den ikke alt er der.

- [ ] **Step 2: Kjør og se dem feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/data-loader.test.ts`
Expected: FAIL — `DL.fetchRawUrl is not a function`

- [ ] **Step 3: Implementer**

I `js/data-loader.js`, rett under `fetchLoadTarget`:

```js
  // Rå URL-henting for pandas-URL-broen (plan 2026-07-27): pd.read_csv(url)
  // i motorene ruter hit. Kontrakten er «aldri stille feil data»: HTTP-feil
  // KASTER (med status og URL) i stedet for å levere en feilkropp som
  // parseren ville gjort om til en absurd én-kolonnes ramme. CORS/nettverk
  // (TypeError) prøver proxyen — samme fallback som direktiv-veien.
  async function fetchRawUrl(url, deps) {
    deps = deps || {};
    var fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(global) : null);
    if (!fetchImpl) throw new Error('fetchRawUrl: ingen fetch tilgjengelig');
    async function viaProxy() {
      var pr = await fetchImpl('/api/hent?url=' + encodeURIComponent(url));
      if (!pr.ok) throw new Error('proxy ' + pr.status + ' for ' + url);
      return pr;
    }
    var resp;
    if (url.indexOf('/api/hent?') === 0) {
      resp = await fetchImpl(url);
      if (!resp.ok) throw new Error('proxy ' + resp.status + ' for ' + url);
    } else {
      try {
        resp = await fetchImpl(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
      } catch (e) {
        if (e instanceof TypeError) resp = await viaProxy();
        else throw e;
      }
    }
    var buf = await resp.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType: resp.headers.get('content-type') || '' };
  }
```

Legg `fetchRawUrl: fetchRawUrl,` inn i eksportobjektet på `:515`.

- [ ] **Step 4: Kjør og se dem passere**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/data-loader.test.ts`
Expected: PASS. Kjør deretter hele `deno test --allow-all _lib/` — fortsatt 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/data-loader.js netlify/edge-functions/_lib/data-loader.test.ts
git commit -m "feat(bro): DataLoader.fetchRawUrl — rå URL-henting med høylytte HTTP-feil og proxy-fallback"
```

---

### Task 2: `js/read-bridge.js` — skann, cache, sync-fasader

**Files:**
- Create: `js/read-bridge.js`
- Test: `tests/js/read-bridge.test.js`
- Modify: `index.html` (script-tag rett etter `js/data-loader.js` på `:12090`-blokken)

**Interfaces:**
- Consumes: `DataLoader.fetchRawUrl(url, deps)` (Task 1).
- Produces: `window.ReadBridge` med:
  - `scanUrls(script) -> [url, …]` — rene string-literaler i `read_csv("…")`/`read_json("…")`/`read_parquet("…")` som starter med `http://`, `https://` eller `/api/hent?`. Duplikater fjernet.
  - `prefetchScript(script) -> void` — fyrer `ensure()` for hver skannet URL, fire-and-forget.
  - `ensure(url) -> Promise<entry>` — henter (én gang) og cacher; entry er `{bytes, contentType}` eller `{error}` (strengen fra `fetchRawUrl`-kastet).
  - `getCached(url) -> entry | null`.
  - `forPyodideSync(url) -> {bytes: Uint8Array|null, error: string|null}` — cache-treff, ellers synkron XHR (kun browser).
  - `pyPatchSource() -> string` — Python-kilden for Pyodide-wrapperne (Task 3 injiserer den).
  - `_reset()` — test-only cache-tømming (samme konvensjon som `DataLoader`-testhooken).

- [ ] **Step 1: Skriv de feilende testene**

Create `tests/js/read-bridge.test.js`:

```js
// tests/js/read-bridge.test.js — pandas-URL-broen (plan 2026-07-27).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/data-loader.js');
require('../../js/read-bridge.js');
const RB = globalThis.ReadBridge;
const DL = globalThis.DataLoader;

test('scanUrls: finner literaler i read_csv/read_json/read_parquet', () => {
  const s = [
    'import pandas as pd',
    'iris = pd.read_csv("https://x.example/iris.csv")',
    "j = pd.read_json('https://x.example/d.json')",
    'p = pd.read_parquet("/api/hent?url=https%3A%2F%2Fy%2Fd.parquet")',
    'lokal = pd.read_csv("data/lokal.csv")',        // ikke URL — ignoreres
    'dyn = pd.read_csv(url)',                        // variabel — ignoreres (hint-prinsippet)
  ].join('\n');
  assert.deepEqual(RB.scanUrls(s), [
    'https://x.example/iris.csv',
    'https://x.example/d.json',
    '/api/hent?url=https%3A%2F%2Fy%2Fd.parquet',
  ]);
});

test('scanUrls: duplikater én gang, tom skript tom liste', () => {
  const s = 'a = pd.read_csv("https://x/a.csv")\nb = pd.read_csv("https://x/a.csv")';
  assert.deepEqual(RB.scanUrls(s), ['https://x/a.csv']);
  assert.deepEqual(RB.scanUrls(''), []);
});

test('ensure: cacher bytes; andre kall henter ikke på nytt', async () => {
  RB._reset();
  let calls = 0;
  RB._setFetcher(async (url) => { calls++; return { bytes: new Uint8Array([97]), contentType: 'text/csv' }; });
  const e1 = await RB.ensure('https://x/a.csv');
  const e2 = await RB.ensure('https://x/a.csv');
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(e1.bytes), [97]);
  assert.equal(e2, RB.getCached('https://x/a.csv'));
});

test('ensure: feil caches som {error} — aldri et kast som forsvinner', async () => {
  RB._reset();
  RB._setFetcher(async () => { throw new Error('HTTP 404 for https://x/borte.csv'); });
  const e = await RB.ensure('https://x/borte.csv');
  assert.match(e.error, /HTTP 404/);
  assert.equal(RB.getCached('https://x/borte.csv').error, e.error);
});

test('forPyodideSync: cache-treff gir bytes; feil-entry gir error', async () => {
  RB._reset();
  RB._setFetcher(async () => ({ bytes: new Uint8Array([98]), contentType: 'text/csv' }));
  await RB.ensure('https://x/b.csv');
  assert.deepEqual(Array.from(RB.forPyodideSync('https://x/b.csv').bytes), [98]);
  RB._setFetcher(async () => { throw new Error('HTTP 500 for x'); });
  await RB.ensure('https://x/feil.csv');
  assert.match(RB.forPyodideSync('https://x/feil.csv').error, /HTTP 500/);
});

test('pyPatchSource: wrapper alle tre leserne og feiler høylytt', () => {
  const src = RB.pyPatchSource();
  ['read_csv', 'read_json', 'read_parquet'].forEach((n) => assert.ok(src.includes(n), n));
  assert.ok(src.includes('ValueError'));
  assert.ok(src.includes('/api/hent?'));
});
```

- [ ] **Step 2: Kjør og se dem feile**

Run: `node --test tests/js/read-bridge.test.js`
Expected: FAIL — `ReadBridge is undefined`

- [ ] **Step 3: Implementer**

Create `js/read-bridge.js`:

```js
// js/read-bridge.js — pandas-URL-broen (plan 2026-07-27-pandas-url-bro).
// «pd.read_csv("https://…")» i motorene ruter hit: skann-og-prefetch mens
// motoren booter (HINT — en bom koster ventetid, aldri korrekthet), byte-
// cache, og synkrone fasader for motorer som ikke kan vente (Pyodide kjører
// på main thread; Brython/MicroPython bruker replay-broen i sine motorfiler).
(function (global) {
  'use strict';

  var cache = Object.create(null);   // url -> {bytes, contentType} | {error}
  var inflight = Object.create(null);

  // Testbar henter — produksjon bruker DataLoader.fetchRawUrl (proxy-fallback
  // + høylytte HTTP-feil bor DER, ikke her).
  var fetcher = function (url) { return global.DataLoader.fetchRawUrl(url); };

  // Rene string-literaler i de tre leserne. BEVISST enkel: variabler,
  // f-strenger og sammensatte uttrykk dekkes av sync-fallbackene i stedet —
  // hint-prinsippet sier at skannen aldri skal måtte ha rett.
  var SCAN_RE = /\bread_(?:csv|json|parquet)\(\s*(['"])((?:https?:\/\/|\/api\/hent\?)[^'"\n]+)\1/g;

  function scanUrls(script) {
    var out = [], seen = Object.create(null), m;
    SCAN_RE.lastIndex = 0;
    while ((m = SCAN_RE.exec(String(script || ''))) !== null) {
      if (!seen[m[2]]) { seen[m[2]] = true; out.push(m[2]); }
    }
    return out;
  }

  function ensure(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    if (inflight[url]) return inflight[url];
    inflight[url] = fetcher(url).then(function (r) {
      cache[url] = { bytes: r.bytes, contentType: r.contentType };
      return cache[url];
    }, function (e) {
      // Feil CACHES — et kast her ville forsvunnet i fire-and-forget-
      // prefetchen, og sync-oppslaget etterpå må kunne rapportere den.
      cache[url] = { error: (e && e.message) || String(e) };
      return cache[url];
    }).finally(function () { delete inflight[url]; });
    return inflight[url];
  }

  function prefetchScript(script) {
    scanUrls(script).forEach(function (u) { ensure(u); });
  }

  function getCached(url) { return cache[url] || null; }

  // Synkron XHR for cache-miss i Pyodide (dynamisk bygde URL-er). Kun
  // main thread — og sync XHR kan ikke bruke responseType, så binærdata
  // hentes med x-user-defined-trikset (charCode & 0xff per byte).
  function syncXhr(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    try { xhr.send(null); } catch (e) { return { status: 0, bytes: null }; }
    if (xhr.status === 0 || xhr.status >= 400) return { status: xhr.status, bytes: null };
    var t = xhr.responseText, u8 = new Uint8Array(t.length);
    for (var i = 0; i < t.length; i++) u8[i] = t.charCodeAt(i) & 0xff;
    return { status: xhr.status, bytes: u8 };
  }

  function forPyodideSync(url) {
    var c = cache[url];
    if (c) return c.error ? { bytes: null, error: c.error } : { bytes: c.bytes, error: null };
    if (typeof XMLHttpRequest === 'undefined') {
      return { bytes: null, error: 'ingen cache-oppføring og ingen XHR for ' + url };
    }
    var r = syncXhr(url);
    if (r.bytes === null && url.indexOf('/api/hent?') !== 0) {
      // status 0 = CORS/nettverk → samme proxy-fallback som fetchRawUrl
      r = syncXhr('/api/hent?url=' + encodeURIComponent(url));
    }
    if (r.bytes === null) {
      return { bytes: null, error: 'HTTP ' + (r.status || 'CORS/nettverksfeil') + ' for ' + url };
    }
    cache[url] = { bytes: r.bytes, contentType: '' };
    return { bytes: r.bytes, error: null };
  }

  // Python-kilden for Pyodide-wrapperne. Ligger HER (ikke inline i
  // index.html) så node-testene kan asserte på den. Kontrakt: URL-argument →
  // bro; alt annet → original uendret (standalone-paritet). HTTP-feil →
  // ValueError med status og URL, FØR parsing.
  function pyPatchSource() {
    return [
      'import io as _ost_io',
      'def _ost_url_buf(_p):',
      '    from js import window as _ost_w',
      '    _r = _ost_w.ReadBridge.forPyodideSync(str(_p))',
      '    if _r.error:',
      '        raise ValueError(str(_r.error))',
      '    return _ost_io.BytesIO(bytes(_r.bytes.to_py()))',
      'def _ost_wrap_reader(_orig):',
      '    def _w(_fp, *a, **kw):',
      '        if isinstance(_fp, str) and (_fp.startswith("http://") or _fp.startswith("https://") or _fp.startswith("/api/hent?")):',
      '            return _orig(_ost_url_buf(_fp), *a, **kw)',
      '        return _orig(_fp, *a, **kw)',
      '    return _w',
      'pd.read_csv = _ost_wrap_reader(pd.read_csv)',
      'pd.read_json = _ost_wrap_reader(pd.read_json)',
      'pd.read_parquet = _ost_wrap_reader(pd.read_parquet)',
      ''
    ].join('\n');
  }

  global.ReadBridge = {
    scanUrls: scanUrls, prefetchScript: prefetchScript, ensure: ensure,
    getCached: getCached, forPyodideSync: forPyodideSync, pyPatchSource: pyPatchSource,
    _reset: function () { cache = Object.create(null); inflight = Object.create(null); },
    _setFetcher: function (f) { fetcher = f; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

I `index.html`, legg til rett etter `data-loader.js`-script-taggen (`:12090`-blokken):

```html
  <script src="js/read-bridge.js"></script>
```

- [ ] **Step 4: Kjør og se dem passere**

Run: `node --test tests/js/read-bridge.test.js`, deretter hele `node --test 'tests/js/*.test.js'`
Expected: PASS, totalen 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/read-bridge.js tests/js/read-bridge.test.js index.html
git commit -m "feat(bro): ReadBridge — URL-skann (hint), byte-cache, sync-fasader og Pyodide-patchkilden"
```

---

### Task 3: Pyodide — wrapperne inn i preamblet + prefetch ved kjørestart

**Files:**
- Modify: `index.html` — interpreter-preamblet (`getInterpreterCorePython` `:7470`, som ALLE Pyodide-veier bygger på — både setupCode `:10458` og explainInit `:11920`), og de tre Pyodide-inngangene `:10374`, `:10860`, `:11907` (korrigert ved pre-sjekk; linjetall flytter seg — søk etter `resolveAndFetchLoads`).

**Interfaces:**
- Consumes: `ReadBridge.pyPatchSource()`, `ReadBridge.prefetchScript(script)` (Task 2).
- Produces: `pd.read_csv/read_json/read_parquet` med URL-støtte i Pyodide-modus. Ingen nye eksporter.

- [ ] **Step 1: Finn injeksjonspunktet**

Søk i `index.html` etter der interpreter-kjernens Python bygges (funksjonen `getInterpreterCorePython` rett under `buildWebDataLoaderPreamble`). Patchen skal inn ETTER at `pd` er importert i kjernen og FØR brukerkode kan kjøre. Verifiser med:

```bash
grep -n "getInterpreterCorePython\|import pandas" index.html | head
```

- [ ] **Step 2: Injiser patchen**

I JS-koden som bygger kjerne-preamblet, legg til (etter at kjernens `import pandas as pd`-del er med i strengen):

```js
      // pandas-URL-broen (plan 2026-07-27): read_csv/json/parquet med URL
      // ruter via ReadBridge (cache fylt av prefetchScript; miss → sync XHR).
      // Kilden bor i js/read-bridge.js så node-testene kan asserte på den.
      + '\n' + (window.ReadBridge ? window.ReadBridge.pyPatchSource() : '') + '\n'
```

- [ ] **Step 3: Prefetch ved de tre PYODIDE-inngangene**

**KORRIGERT ved pre-sjekk:** planens opprinnelige `:2716`/`:2791`/`:2856` er
brython/mpy/js-innganger. De riktige Pyodide-stedene er:
- `:10374` — hovedkjøringen (`effectiveScript`)
- `:10860` — notatbok-boot (`scriptInput.value`)
- `:11907` — forklar-veien (`snapshotScript`)

(Søk etter `resolveAndFetchLoads` og verifiser konteksten — linjetall flytter
seg.) Ved hvert av de tre, legg til linjen RETT FØR kallet:

```js
          if (window.ReadBridge) window.ReadBridge.prefetchScript(script);
```

(Variabelnavnet for scriptet kan variere per sted — bruk det som sendes til `resolveAndFetchLoads` på samme linje.)

- [ ] **Step 4: Statisk verifisering**

```bash
node --check js/read-bridge.js
grep -c "prefetchScript" index.html    # forventet: 3 kallsteder + ev. kommentar
node --test 'tests/js/*.test.js'       # 0 fail
```

Reell kjøreverifisering skjer i browser-smoken (Task 6) — sync-XHR og
`to_py()`-konverteringen kan ikke testes i node.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bro): Pyodide — pandas-URL-wrapperne i preamblet + prefetch ved kjørestart"
```

---

### Task 4: Brython — fetch-pending-bro + URL-gren i `read_csv`

**Files:**
- Modify: `js/brython-engine.js` — `beginFetchBridge()` ved siden av `beginDuckBridge()` (`:211`); replay-løkka (`:383-403`) flusher begge køene.
- Modify: `brython/pandas_brython.py` — URL-gren øverst i `read_csv` (`:4888`).
- Test: `brython/tests/test_read_csv_url.py` (CREATE)

**Interfaces:**
- Consumes: `DataLoader.fetchRawUrl` (Task 1). Pending-protokollen: exceptions med attributtet `__brython_pending__ = True` får runneren til å sette `_last_error = '__BRYTHON_PENDING__'` (`brython/brython_runner.py:328-332`), og motorens replay-løkke ruller tilbake og kjører på nytt.
- Produces: `window.__brythonFetchSync(url) -> JSON-streng` `{"pending":true}` | `{"text":"…"}` | `{"error":"…"}` (ALLTID JSON-streng — JS null blir ikke Python None i Brython, samme felle som duck-broen dokumenterer).

- [ ] **Step 1: Skriv den feilende pytest-testen**

Create `brython/tests/test_read_csv_url.py` (CPython-fake av `browser`-modulen — samme grep som `test_duckdb_brython.py` bruker for sine fakes):

```python
# brython/tests/test_read_csv_url.py — pandas-URL-broen i Brython-modus.
# Kjøres under CPython med en fake window.__brythonFetchSync; selve
# nettverket testes i browser-smoken.
import json
import sys
import types
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _install_fake_browser(responses):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    win = types.SimpleNamespace(__brythonFetchSync=fetch_sync)
    mod = types.ModuleType("browser")
    mod.window = win
    sys.modules["browser"] = mod
    return calls


def _fresh_pandas():
    sys.modules.pop("pandas_brython", None)
    import pandas_brython
    return pandas_brython


def test_read_csv_url_bruker_broen():
    _install_fake_browser({"https://x.example/iris.csv": {"text": "a,b\n1,2\n3,4"}})
    pd = _fresh_pandas()
    df = pd.read_csv("https://x.example/iris.csv")
    assert df.shape == (2, 2)
    assert list(df.columns) == ["a", "b"]


def test_read_csv_url_pending_reiser_replay_unntak():
    _install_fake_browser({"https://x.example/sen.csv": {"pending": True}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/sen.csv")
        raise AssertionError("skulle reist pending-unntak")
    except Exception as e:
        assert getattr(e, "__brython_pending__", False), e


def test_read_csv_url_http_feil_er_hoylytt():
    _install_fake_browser({"https://x.example/borte.csv": {"error": "HTTP 404 for https://x.example/borte.csv"}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/borte.csv")
        raise AssertionError("skulle feilet")
    except ValueError as e:
        assert "HTTP 404" in str(e)


def test_read_csv_lokal_sti_er_uendret():
    _install_fake_browser({})
    pd = _fresh_pandas()
    import io
    df = pd.read_csv(io.StringIO("a,b\n1,2"))
    assert df.shape == (1, 2)
```

- [ ] **Step 2: Kjør og se dem feile**

Run: `python3 -m pytest brython/tests/test_read_csv_url.py -q`
Expected: FAIL — URL-strengen behandles som filsti i dag.

- [ ] **Step 3: URL-grenen i `pandas_brython.read_csv`**

Øverst i `read_csv` (`brython/pandas_brython.py:4888`, rett etter docstringen og den ubetingede csv-importen):

```python
    # pandas-URL-broen (plan 2026-07-27): URL-er ruter via motorens
    # per-run-cache (window.__brythonFetchSync). Protokollen er ALLTID en
    # JSON-streng ({pending}|{text}|{error}) — samme mønster og samme
    # begrunnelse som duckdb_brython._run_sql (JS null != Python None).
    # Miss → pending-unntak → motorens replay-løkke henter og kjører på nytt.
    if isinstance(filepath, str) and (
        filepath.startswith("http://") or filepath.startswith("https://")
        or filepath.startswith("/api/hent?")
    ):
        import json as _json
        from browser import window as _window
        _res = _json.loads(_window.__brythonFetchSync(filepath))
        if _res.get("pending"):
            _e = RuntimeError("venter på " + filepath)
            _e.__brython_pending__ = True
            raise _e
        if _res.get("error"):
            raise ValueError(str(_res["error"]))
        import io as _io
        filepath = _io.StringIO(_res["text"])
```

- [ ] **Step 4: Kjør pytest og se dem passere**

Run: `python3 -m pytest brython/tests/test_read_csv_url.py -q`
Expected: PASS (4 tester). Kjør så hele `python3 -m pytest -q` — 0 fail.

- [ ] **Step 5: Motorsiden — `beginFetchBridge` + replay-flush**

I `js/brython-engine.js`, rett under `beginDuckBridge` (`:211`-blokken slutter der `return`-objektet lukkes):

```js
  // pandas-URL-broen (plan 2026-07-27): samme pending/replay-mønster som
  // duck-broen — read_csv(url) slår synkront opp her; miss legges i kø og
  // replay-løkka henter via DataLoader.fetchRawUrl (proxy-fallback +
  // høylytte HTTP-feil bor der). Feil caches så replay-passet feiler PÅ
  // kallstedet med status og URL — aldri stille.
  function beginFetchBridge() {
    var cache = {};      // url -> JSON-streng {text}|{error}
    var pending = [];
    global.__brythonFetchSync = function (url) {
      if (cache.hasOwnProperty(url)) return cache[url];
      if (pending.indexOf(url) === -1) pending.push(url);
      return '{"pending":true}';
    };
    return {
      hasPending: function () { return pending.length > 0; },
      flush: async function () {
        var batch = pending; pending = [];
        for (var i = 0; i < batch.length; i++) {
          try {
            var r = await global.DataLoader.fetchRawUrl(batch[i]);
            cache[batch[i]] = JSON.stringify({ text: new TextDecoder().decode(r.bytes) });
          } catch (e) {
            cache[batch[i]] = JSON.stringify({ error: (e && e.message) || String(e) });
          }
        }
      },
    };
  }
```

I replay-løkka (`run()`, `:383-403`), der duck-broen flushes i dag:

```js
        if (err !== PENDING_MARKER) break;
        var _hadWork = false;
        if (duck.hasPending()) { await duck.flush(); _hadWork = true; }
        if (fetchBr.hasPending()) { await fetchBr.flush(); _hadWork = true; }
        if (!_hadWork) {
          return { text: '', error: 'brython: replay uten ventende arbeid (intern feil)' };
        }
```

med `var fetchBr = beginFetchBridge();` rett ved `var duck = beginDuckBridge(spec);`. Gjør samme kobling i notatbok-stien (`nbRunCell`) der duck-broen begynnes per celle.

- [ ] **Step 6: Kjør alt + commit**

```bash
node --check js/brython-engine.js
node --test 'tests/js/*.test.js'
python3 -m pytest -q
git add js/brython-engine.js brython/pandas_brython.py brython/tests/test_read_csv_url.py
git commit -m "feat(bro): Brython — read_csv(url) via fetch-pending-broen (replay-mønsteret fra duckdb)"
```

---

### Task 5: MicroPython — samme mønster

**Files:**
- Modify: `js/micropython-engine.js` — fetch-bro ved siden av duck-hooken (`:237`), replay-løkka (`:347-360`).
- Modify: `micropython/pandas_mpy.py` — URL-gren i `read_csv` (`:5161`).
- Test: `micropython/tests/test_read_csv_url.py` (CREATE)

**Interfaces:**
- Consumes: `DataLoader.fetchRawUrl` (Task 1). MicroPython-modulene importerer `js` (ikke `browser`): hooken heter `js.__mpyFetchSync`. Pending-protokollen er DELT med Brython (`__brython_pending__`-attributtet, `PENDING_MARKER = '__BRYTHON_PENDING__'` i `js/micropython-engine.js:224`).
- Produces: `globalThis.__mpyFetchSync(url) -> JSON-streng` — samme kontrakt som `__brythonFetchSync`.

- [ ] **Step 1: Skriv den feilende testen**

Create `micropython/tests/test_read_csv_url.py` — identisk struktur som Brython-testen i Task 4 Step 1, med disse forskjellene (fullstendig fil, ikke referanse):

```python
# micropython/tests/test_read_csv_url.py — pandas-URL-broen i MicroPython-modus.
import json
import sys
import types
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _install_fake_js(responses):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    mod = types.ModuleType("js")
    mod.__mpyFetchSync = fetch_sync
    sys.modules["js"] = mod
    return calls


def _fresh_pandas():
    sys.modules.pop("pandas_mpy", None)
    import pandas_mpy
    return pandas_mpy


def test_read_csv_url_bruker_broen():
    _install_fake_js({"https://x.example/iris.csv": {"text": "a,b\n1,2\n3,4"}})
    pd = _fresh_pandas()
    df = pd.read_csv("https://x.example/iris.csv")
    assert df.shape == (2, 2)


def test_read_csv_url_pending_reiser_replay_unntak():
    _install_fake_js({"https://x.example/sen.csv": {"pending": True}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/sen.csv")
        raise AssertionError("skulle reist pending-unntak")
    except Exception as e:
        assert getattr(e, "__brython_pending__", False), e


def test_read_csv_url_http_feil_er_hoylytt():
    _install_fake_js({"https://x.example/borte.csv": {"error": "HTTP 404 for https://x.example/borte.csv"}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/borte.csv")
        raise AssertionError("skulle feilet")
    except ValueError as e:
        assert "HTTP 404" in str(e)
```

- [ ] **Step 2: Kjør og se dem feile**

Run: `python3 -m pytest micropython/tests/test_read_csv_url.py -q`
Expected: FAIL.

- [ ] **Step 3: URL-grenen i `pandas_mpy.read_csv`**

Øverst i `read_csv` (`micropython/pandas_mpy.py:5161`) — NB MicroPython-fellene fra
tidligere runder: lazy import av `js`, ingen fancy stdlib:

```python
    # pandas-URL-broen (plan 2026-07-27): samme JSON-strengprotokoll og
    # pending-attributt som duckdb_mpy._run_sql — se den for begrunnelsen.
    if isinstance(filepath, str) and (
        filepath.startswith("http://") or filepath.startswith("https://")
        or filepath.startswith("/api/hent?")
    ):
        import json as _json
        import js as _js
        _res = _json.loads(_js.__mpyFetchSync(filepath))
        if _res.get("pending"):
            _e = RuntimeError("venter paa " + filepath)
            _e.__brython_pending__ = True
            raise _e
        if _res.get("error"):
            raise ValueError(str(_res["error"]))
        import io as _io
        filepath = _io.StringIO(_res["text"])
```

- [ ] **Step 4: Motorsiden**

I `js/micropython-engine.js`, ved siden av duck-hooken (`:237`):

```js
  // pandas-URL-broen (plan 2026-07-27): samme pending/replay-mønster som
  // duck-broen — read_csv(url) slår synkront opp her; miss legges i kø og
  // replay-løkka henter via DataLoader.fetchRawUrl (proxy-fallback +
  // høylytte HTTP-feil bor der). Feil caches så replay-passet feiler PÅ
  // kallstedet med status og URL — aldri stille.
  function beginFetchBridge() {
    var cache = {};      // url -> JSON-streng {text}|{error}
    var pending = [];
    global.__mpyFetchSync = function (url) {
      if (cache.hasOwnProperty(url)) return cache[url];
      if (pending.indexOf(url) === -1) pending.push(url);
      return '{"pending":true}';
    };
    return {
      hasPending: function () { return pending.length > 0; },
      flush: async function () {
        var batch = pending; pending = [];
        for (var i = 0; i < batch.length; i++) {
          try {
            var r = await global.DataLoader.fetchRawUrl(batch[i]);
            cache[batch[i]] = JSON.stringify({ text: new TextDecoder().decode(r.bytes) });
          } catch (e) {
            cache[batch[i]] = JSON.stringify({ error: (e && e.message) || String(e) });
          }
        }
      },
    };
  }
```

Replay-løkka (`:347-360`), der duck-broen flushes i dag:

```js
        if (err !== PENDING_MARKER) break;
        var _hadWork = false;
        if (duck.hasPending()) { await duck.flush(); _hadWork = true; }
        if (fetchBr.hasPending()) { await fetchBr.flush(); _hadWork = true; }
        if (!_hadWork) {
          return { text: '', error: 'micropython: replay uten ventende arbeid (intern feil)' };
        }
```

med `var fetchBr = beginFetchBridge();` rett ved der duck-broen begynnes,
og samme kobling i notatbok-stien om den finnes i denne fila.

- [ ] **Step 5: Kjør alt + commit**

```bash
node --check js/micropython-engine.js
python3 -m pytest -q
node --test 'tests/js/*.test.js'
git add js/micropython-engine.js micropython/pandas_mpy.py micropython/tests/test_read_csv_url.py
git commit -m "feat(bro): MicroPython — read_csv(url) via fetch-pending-broen"
```

---

### Task 6: Grenseregelen i dokumentasjon, AI-promptmaler, tre eksempler, smoke

**Files:**
- Modify: `hjelp.html`, `hjelp.en.html` (#direktiver-seksjonen), `docs/directive-language-examples.md` + `.html` (ny innledning), `netlify/edge-functions/prompts/data-svar.md`, `netlify/edge-functions/_lib/data-svar-prompt.ts`, `netlify/edge-functions/kode-svar.ts`
- Modify: `examples/python/ex_csv_iris.txt`, `examples/brython/bry03_csv_iris.txt`, `examples/micropython/04_csv_url.txt`
- Create: `.superpowers/sdd/bro-smoke.md`

**Interfaces:**
- Consumes: alt fra Task 1-5. Ingen kodeendringer — kun tekst og tre eksempelfiler.

- [ ] **Step 1: Grenseregelen, ordrett, i alle dokumentflater**

Regelen som skal inn (tilpass språk per fil, men innholdet er dette):

> **Når trenger du IKKE et direktiv?** En ren GET-URL som returnerer en tabell
> leses med vanlig pandas: `iris = pd.read_csv("https://…/iris.csv")` — det
> virker i alle Python-modusene og uendret utenfor appen. Bruk `ost` når noe
> mer enn en URL trengs: registerkilder, `secret_key`, kanonisk spørring
> (`years=`/`indicators=` — tryggest mot SDMX-kilder, som stille ignorerer
> ukjente parametere i rå URL-er), POST-kropper, databaser/tabeller,
> kryptering, `use` og montering.

- Legg den inn øverst i #direktiver-seksjonen i `hjelp.html`/`hjelp.en.html`.
- Ny «§0 When you don't need a directive» øverst i begge examples-filene.
- I `data-svar-prompt.ts` og `prompts/data-svar.md` (som NY datert post, ikke
  omskriving av gamle): beslutningstabellen «åpen tabell-URL → pandas;
  nøkkel/proxy/kanonisk/database → ost», med ett eksempel av hver.
  Kjør `deno test --allow-all _lib/data-svar-prompt.test.ts` — den asserterer
  på promptteksten; oppdater assertions ÆRLIG (rapportér hver endring).
- `kode-svar.ts` (`:868-869`-området): nevn at `pd.read_csv(url)` også virker.

- [ ] **Step 2: Tre kanoniske eksempler**

Konverter NETTOPP disse tre til pandas-form (de andre venter til
browser-smoken har bekreftet sidebar/publisering — rapportér det som utsatt):

`examples/python/ex_csv_iris.txt`: bytt `# iris = ost.read("…iris.csv")`-linja
til vanlig kode `iris = pd.read_csv("https://raw.githubusercontent.com/hmelberg/openstat/main/data/iris.csv")`
(uten `#` — det er nå ekte kode) + `import pandas as pd` om det mangler.
Samme mønster i `bry03_csv_iris.txt` og `04_csv_url.txt`. Behold resten av
innholdet uendret; oppdater kommentarprosaen i toppen så den forklarer at
dette er vanlig pandas, og at `ost.read` finnes for kilder som trenger mer.

- [ ] **Step 3: Smoke-sjekklista**

Create `.superpowers/sdd/bro-smoke.md` med scenarier for Hans (samme format
som task-13-smoke, inkl. cache-fella øverst — sjekk at `js/read-bridge.js`
lastes i Network-fanen):

1. **Pyodide literal:** `ex_csv_iris`-eksempelet — rammen laster, og Network
   viser at CSV-en ble hentet FØR Pyodide var ferdig bootet (prefetch-hintet).
2. **Pyodide dynamisk URL:** `url = "https://raw.githubusercontent.com/hmelberg/openstat/main/data/" + "penguins.csv"` +
   `pd.read_csv(url)` — virker (sync-XHR-fallbacken).
3. **Høylytt HTTP-feil:** `pd.read_csv("https://raw.githubusercontent.com/hmelberg/openstat/main/data/finnes-ikke.csv")`
   → ValueError med «HTTP 404» og URL-en — IKKE en énkolonnes søppelramme.
4. **CORS-fallback:** en `cors=False`-kilde (f.eks. en Wikipedia-URL) →
   data kommer via proxyen uten at scriptet endres.
5. **Brython + MicroPython:** de to konverterte eksemplene kjører; feil-URL
   gir norsk feilmelding på kallstedet (replay-broen).
6. **Publiserings-sømmen:** publiser dashboardet fra ex_csv_iris — bekreft at
   dataene bakes inn som tag (rammen finnes i `getLastDatasetSpec`-veien).
   HVIS IKKE: rapportér — da holder vi resten av eksempelkonverteringen
   tilbake til sømmen er tettet.
7. **SSB direkte:** `pd.read_csv("https://data.ssb.no/api/pxwebapi/v2/tables/05810/data?lang=no&valueCodes[Kjonn]=*&valueCodes[Alder]=*&valueCodes[ContentsCode]=*&valueCodes[Tid]=top(2)&outputFormat=csv")`
   — CSV rett fra SSB, ingen direktiv (CORS-probet 2026-07-27).

- [ ] **Step 4: Kjør alt + commit**

```bash
node --test 'tests/js/*.test.js'
cd netlify/edge-functions && deno test --allow-all _lib/ && cd ../..
python3 -m pytest -q
git add -A
git commit -m "docs(bro): grenseregelen filer-vs-kilder i hjelp, prompts og tre eksempler + smoke-sjekkliste"
```

---

## Ferdigkriterier

1. Alle tre suitene 0 fail (baseline node 998 / deno 273 / pytest 1394, pluss de nye).
2. `pd.read_csv(url)` med literal-URL virker i Pyodide, Brython og MicroPython (browser-smoke, Hans kjører).
3. HTTP-feil gir ValueError med status+URL i alle tre — aldri en parset feilkropp.
4. En CORS-stengt kilde faller stille tilbake på proxyen.
5. AI-promptene lærer bort pandas-først-regelen; `ost` er dokumentert som kilde-verktøyet.
6. Publiserings-sømmen (smoke 6) er verifisert eller rapportert som åpen.
