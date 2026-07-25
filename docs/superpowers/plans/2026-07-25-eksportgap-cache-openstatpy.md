# Eksport-gap + datacache + openstat.py — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hans' beslutning 2026-07-25 etter pakke-diskusjonen: (1) lukk
eksport-gapet (montering + pxweb i portable-export) og lever cache()-opsjonen;
(2) `openstat.py` — ÉN fil for CPython **og** Pyodide med
connect/read/dataset/add-verbene + editor-preload. (3) R-pakke/brython/mpy/
PyPI VENTER til reelle brukere finnes.

**Architecture:** Eksporten forblir selvforsynt (emitterer hjelpefunksjoner,
ikke pakke-avhengighet). cache() er opt-in disk-cache via Cache API som
L2 under dagens _bufCache (side-kontekst, ikke SW — SW-varianten blir aktuell
først når pakke-sync-XHR skal dele cache). openstat.py er ring-1-ren: stdlib
urllib i CPython, synkron XHR (pyodide-http-trikset) i emscripten; duckdb kun
som valgfri akselerator; delt pxweb-fixture med node-testene (kontraktsfrøet).

**Tech Stack:** som forrige planer + pytest for openstat.py, deno for eksport.

## Global Constraints

- Samme husregler som forrige plan (IIFE/var/norske kommentarer; t()→en.js;
  node+pytest+deno grønne per task; M2PY_VERSION → '2026-07-25a' i SISTE task).
- openstat.py: kun stdlib + pandas som harde avhengigheter (duckdb valgfri);
  må importere rent i CPython 3.9+ (miniforge python3 lokalt).
- Eksportert kode verifiseres ved FAKTISK kjøring: python3 (finnes) og
  Rscript (finnes, /opt/homebrew/bin/Rscript) mot SSB-API-et.

### Task 0: ROADMAP-notat — pakke-diskusjonens konklusjoner
Erstatt «under designdiskusjon»-punktet med konklusjonene: verb =
connect/read/dataset/add (read valgt: kollisjonsfritt, load maskerer
base::load), ring-modellen (JS som forbedring bak feature-detection, aldri
krav), sync XHR som felles browser-transport (webR-worker = lovlig sync XHR),
duckdb IKKE lim (Promise-API bryter sync-kontrakten; valgfri
CPython-akselerator), montering i pakken = dataset/add-byggeren (ramme-nivå,
ikke SQL-imitasjon), SW-cache utsatt til pakke-sporet trenger delt cache.
Beslutning: punkt 1+2 leveres nå (denne planen), punkt 3 (R-pakke, brython/
mpy-moduler, PyPI/CRAN) venter på reelle brukere; jamovi-validering forblir
øverste prioritet. Commit.

### Task 1: cache()-opsjonen
**Files:** js/data-directives.js (parseOptions + resolve-passthrough),
js/data-loader.js (parseCacheTtl + Cache API-L2 i fetchBytes),
tests/js/data-directives-use.test.js eller pxweb.test.js (parse/resolve),
ny node-test for parseCacheTtl.
- parseOptions: `cache` → opts.cache (rå verdi). resolve(): cache følger
  key/exec/kind-mønsteret i ALLE grener (urlish, pxweb, duckdb, generisk).
- `parseCacheTtl('90')→90s`, `'30m'`, `'2h'`, `'1d'` → ms; `'0'|'no'|'off'`→0;
  ugyldig → null (= ingen cache) — eksporteres som DataLoader._parseCacheTtl.
- fetchBytes: hvis item.cache og `typeof caches !== 'undefined'`:
  ttl>0 → prøv `caches.open('m2py-data')`.match(url); treff der
  (nå − 'x-m2py-fetched-at'-header) < ttl → bruk cachet bytes/headers.
  Miss/utløpt → nett; lagre `new Response(buf, {headers: {content-type,
  x-m2py-fetched-at}})`. ttl===0 → slett oppføringen, gå på nett.
  Opt-in per linje: `# load url as x, cache(1d)` / `cache(0)` som bust.
- Tester (node): ttl-parseren + at cache-opsjonen overlever parse→resolve.
  Cache API-veien browser-verifiseres i Task 5. Commit.

### Task 2: pxweb i eksporten
**Files:** js/portable-export.js, netlify/edge-functions/_lib/portable-export.test.ts.
- emitFor: gren for `item.kind === 'pxweb'` FØR formatFor: dataUrl =
  global.PxWeb.dataUrl(item.url); python: `alias = _px_frame(requests.get(u).json())`
  (needs.requests + needs.pandas + needs.pxHelperPy); R:
  `alias <- px_frame_(jsonlite::fromJSON(u, simplifyVector = FALSE))`
  (needs.pxHelperR).
- transpile: når needs.pxHelperPy/R → emitter hjelpefunksjonen ÉN gang etter
  importblokken (json-stat2 → langt format; python-versjon speiler
  js/pxweb.js columnsFromJsonStat; R-versjon m/ expand.grid(rev(...))+rev()
  for row-major-orden og sparse-objekt-håndtering).
- Deno-tester: py-eksport inneholder _px_frame-def + data-URL m/
  outputFormat=json-stat2; R-eksport tilsvarende; helper emitteres én gang
  ved to pxweb-loads. Test-filen må eval-e js/pxweb.js. Commit.

### Task 3: montering i eksporten
**Files:** js/portable-export.js, portable-export.test.ts.
- transpile: kjør DD.parseAssembly(script). Har spec datasets med steps:
  (a) syntetiser '# load <src>/<tabell> as src_<key>'-linjer mot
  connect-linjene (som resolveSourcesOnly), resolve, og emit kilde-lesing
  via eksisterende emitFor (alias overstyres til src_<key>) for kilder som
  refereres av import-steg; duckdb/sqlite-kilder → kommentar+warning (som i
  dag). (b) Emitter monteringsblokk ETTER siste monteringsdirektiv-linje:
  python: subset `[keys+cols]` + `.merge(..., on=keys, how=...)`-kjede;
  join-steg: merge mot datasett-variabelen. R: `x[, c(...)]` +
  `merge(by = c(...), all.x/all)`. Datasett med .load hoppes over (linje-
  emisjonen har dem alt). format(): data.table/tibble i R → as.data.table/
  as_tibble-linje; duckdb/andre → kommentar «editor-spesifikk».
- Deno-tester: composite key → `on=["kommune_nr","year"]` (py) og
  `by = c("kommune_nr", "year")` (R); pxweb-kilde i montering; join-steg;
  duckdb-kilde → warning. Commit.

### Task 4: openstat.py + delt fixture + editor-preload
**Files:** Create openstat.py (rot, som duckdb_bridge.py),
tests/fixtures/pxweb_dataset.json, tests/test_openstat.py; Modify
tests/js/pxweb.test.js (les fixturen fra fil), index.html (preload etter
notebook_prose-mønsteret ~9362).
- API (kontrakten): `connect(url, kind=None) -> Source`;
  `Source.read(table=None, columns=None, **query) -> pandas.DataFrame`
  (pxweb: query → valueCodes-parametre; csv/parquet: columns-subset,
  duckdb-pushdown for parquet HVIS duckdb importerbar);
  `read(url, **kw)` (kind fra endelse); `dataset(key, name=None) -> Dataset`
  m/ `.add(kilde_eller_ramme, columns, table=None, how='left')` og
  `.frame()`; `datasets()` → navnregisteret. Modulnivå byte-cache per URL.
- Transport: `sys.platform == 'emscripten'` → synkron XHR via js-interop
  (overrideMimeType x-user-defined; bytes via ord&0xff), ellers
  urllib.request. Testbar via injiserbar `_fetch_bytes`-hook.
- pxweb-logikk portert fra js/pxweb.js (data_url/metadata_url/
  columns_from_jsonstat) — fixturen tests/fixtures/pxweb_dataset.json (dagens
  FIX fra pxweb.test.js) leses av BEGGE suitene (kontrakts-frø).
- Preload i index.html: fetch openstat.py?v=M2PY → registrer som modul
  (notebook_prose-mønsteret), valgfri/ikke-fatal.
- pytest: URL-bygging (paritet m/ node-testene), jsonstat-konvertering
  (fixture, inkl. sparse), dataset/add-byggeren (to kilder, composite key,
  mock-fetch), columns-subset. Commit.

### Task 5: verifisering, ROADMAP-avkryssing, bump, push
- Suiter: node + pytest + deno.
- EKTE eksport-kjøring: transpiler et script (pxweb-load + montering m/
  composite key) til python og R via node-kall av PortableExport, kjør
  `python3` og `Rscript` på resultatet mot SSB — verifiser radtall/kolonner.
- Browser (én kompakt seanse): (a) editor-python `import openstat as ost` +
  `ost.connect(ssb).read("05839").shape` (sync XHR-beviset); (b) cache(1h):
  kjør, sjekk `caches`-oppføring finnes; cache(0) tømmer.
- ROADMAP: kryss av datacache (a) og eksport-gapet; openstat.py notert
  levert for CPython+pyodide. M2PY_VERSION → '2026-07-25a'. Commit + push;
  rapport «pushet og live på …» først + ærlige forbehold.
