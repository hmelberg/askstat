# Runtime-ost-runden — design (2026-07-28)

**Mål:** «Samme bro, to fasader» (strategisk retning avtalt med Hans
2026-07-27, punkt 3): openstat.py sin transport i Pyodide (`_fetch_bytes`
i emscripten) ruter via ReadBridge — samme bytecache, proxy-fallback og
feilsemantikk som pd.read_csv-fasaden. pd.read_csv-URL-broen er den ene
fasaden; runtime-ost (connect/read/Dataset/read_csv/convert_dtypes i
openstat.py) blir den andre — over samme bro.

**Oppfølginger som lukkes** (fra ledgeren, metadata-runden 2026-07-28):

- «metadata-fetch fra Pyodide går DIREKTE (ingen proxy-fallback i
  _fetch_bytes) — cors:false-kilde gir data-men-ikke-metadata» → med broen
  får `_typemeta_for`-hentingen proxy-fallback, og cors:false-kilder får
  metadata (panel-etiketter) i tillegg til data.
- «prefetch varmer HTTP-cache, ikke ReadBridge» → metadata-hinten i
  `prefetchScript` varmer nå cachen Python faktisk leser.

## §1 ReadBridge.forPyodideSync får valgfri headers-parameter

- Signatur: `forPyodideSync(url, headersJson)` — `headersJson` er en
  JSON-streng (`'{"Accept": "application/vnd.sdmx.data+csv;…"}'`) eller
  utelatt/tom. JSON-streng, ikke objekt: en Python-dict blir PyProxy på
  JS-siden, og `for..in` enumererer den ikke — strengen er entydig og
  testbar fra begge sider.
- Uten headers: NØYAKTIG dagens semantikk (cache-les → direkte sync-XHR →
  proxy KUN ved status 0 m/ auth-headere → cache-skriv). Eksisterende
  tester skal bestå uendret.
- Med ikke-tomme headers: cachen BYPASSES helt — verken les eller skriv.
  Cachen er URL-nøklet, og en Accept-header endrer svaret (SDMX: csv vs
  xml) — en header-henting som deler cacheoppføring med en headerløs ville
  vært stille feil data. Direktelegg sender headerne; proxylegg sender
  proxyHeaders (auth) + headerne flettet. `/api/hent` videresender accept
  oppstrøms (api-kinds-spec §4.4, verifisert i hent-core.ts:78-83); andre
  custom-headere dør i proxyen — dokumentert begrensning, openstat.py
  bruker i dag kun Accept (SDMX_ACCEPT).

## §2 openstat.py `_fetch_bytes`: bro først, naken XHR som fallback

I emscripten-grenen, FØR dagens XHR-kode:

- Slå opp `ReadBridge` via `from js import window` + `getattr(_w,
  "ReadBridge", None)` i try/except (sen import, som dagens
  `from js import XMLHttpRequest`). Standalone Pyodide utenfor appen
  (JupyterLite o.l.) har ikke ReadBridge → None → dagens nakne XHR-vei
  kjører uendret. Portabilitet er kontrakten («ingen harde avhengigheter»,
  fil-header): samme fil skal fortsatt kjøre i CPython og hvilken som
  helst Pyodide.
- Med bro: `r = rb.forPyodideSync(url)` (headerløs) eller
  `rb.forPyodideSync(url, _json.dumps(headers))` (med headere).
  `r.error` sann → `RuntimeError(str(r.error))` — bevarer dagens
  «HTTP <status> for <url>»-form, og «CORS/nettverksfeil for <url>» er
  NY, klarere feil der dagens vei kastet en rå JsException fra send().
  Bytes: `bytes(r.bytes.to_py())` (pyPatchSource-mønsteret, bevist i
  `_ost_url_buf`).
- `_MEMO` (py-side, nøklet (url, headers)) er uendret; CPython/urllib-veien
  er uendret.
- `_sdmx_csv`-fallbacken (unntak → `sdmx_fallback_url`, ECB-veien) virker
  uendret: bro-feil er RuntimeError, som fanges av dagens `except`.

## §3 Konsekvenser som følger gratis (verifiseres, ikke bygges)

- ost-verbene får proxy-fallback + cache-deling med direktiv- og
  read_csv-veiene (én henting per URL per økt på tvers av fasadene).
- Fødsels-annotereren (`_ost_annotate_read` → `_typemeta_for` →
  `_fetch_bytes`) treffer nå metadata-hinten som `prefetchScript` la i
  ReadBridge-cachen — kommentaren i js/read-bridge.js (~linje 90) har
  premisset «varmer ikke en JS-side cache Python leser fra» og MÅ skrives
  om (premisset blir usant i denne runden).
- Headerløse runtime-ost-hentinger lander i ReadBridge-cachen; exportTags
  baker fortsatt kun literal-skannede URL-er ved publisering — dynamisk
  bygde ost-URL-er hentes live av publisert side (hint-prinsippet,
  uendret).

## §4 Testkontrakt

- node (tests/js/read-bridge.test.js, `_setXhr`/`_setFetcher`-mønsteret):
  (a) headers-kall IGNORERER en seedet cacheoppføring; (b) direktelegg
  sender headerne; (c) proxylegg ved status 0 fletter proxyHeaders +
  headers; (d) suksess med headers skriver IKKE cache; (e) headerløst kall
  etter et headers-kall henter selv (ingen forgiftning); eksisterende
  tester uendret grønne.
- pytest (tests/test_openstat.py, monkeypatch `sys.platform` +
  fake `js`-modul i `sys.modules`): (a) bro-treff gir bytes; (b) `r.error`
  → RuntimeError med meldingen; (c) headers når broen som JSON-streng;
  (d) ReadBridge=None → fallback til XHR-veien (fake XMLHttpRequest);
  (e) CPython-veien uberørt (eksisterende tester).
- Ingen tvilling-endringer (ren transport — pxweb.js/openstat.py-paritetene
  røres ikke).

## §5 Utenfor scope

- R-ost / webR (egen kø: R-URL-bro-oppfølgingene).
- Brython/MicroPython (egne replay-broer; openstat.py kjører ikke der).
- Auth-headere på direktelegget (bevisst skopet, jf. fetchRawUrl-notatet i
  ledgeren — egen fremtidig beslutning om nøkkelkilder).
- Promptomtale av ost.read_csv (egen runde med eval-måling, jf. køen).
- Encoding i ost.read_csv (transporten endrer ikke bytes; pre-eksisterende
  adferd).
- Literal-skann av ost-verbformer utover det SCAN_RE alt dekker
  (`ost.read_csv("https://…")` matcher allerede `\bread_csv\(`-mønsteret).
