# Runtime-ost-runden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** openstat.py sin transport i Pyodide ruter via ReadBridge («samme bro, to fasader») — ost-verbene og metadata-hentingen får proxy-fallback ved CORS og deler bytecache med pd.read_csv-fasaden.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-runtime-ost-design.md. To kirurgiske inngrep: (1) `ReadBridge.forPyodideSync` får valgfri `headersJson`-parameter (JSON-streng; ikke-tomme headere bypasser den URL-nøklede cachen helt — les OG skriv); (2) `openstat.py::_fetch_bytes` sin emscripten-gren prøver `window.ReadBridge` først og faller til dagens nakne XHR når broen mangler (standalone Pyodide). Ingen tvilling-endringer — ren transport.

**Tech Stack:** js/read-bridge.js (forPyodideSync:129, prefetchScript-kommentaren:90), openstat.py (_fetch_bytes:35), tests/js/read-bridge.test.js (_setXhr/_setFetcher-mønsteret), tests/test_openstat.py (fake js-modul + monkeypatch sys.platform).

## Global Constraints

- ALDRI push underveis — commit lokalt; push er kontrollørens beslutning når HELE runden er ferdig (husregel: feedback_openstat_no_autopush).
- Arbeidsgren: `runtime-ost` (opprettes fra main FØR Task 1).
- Uten headers skal `forPyodideSync` være BYTE-LIK dagens semantikk — alle eksisterende tester består uendret.
- openstat.py forblir portabel («ingen harde avhengigheter», fil-headeren): CPython-veien og standalone-Pyodide-veien (uten ReadBridge) er uendret; alle js-oppslag er sene imports i try/except.
- Feilform bevares: `RuntimeError("HTTP <status> for <url>")`-mønsteret (SDMX-fallbacken `_sdmx_csv` fanger unntak — bro-feil MÅ være vanlige Python-unntak, aldri ubehandlede JsProxy-tilstander).
- Suiter ved hver task-slutt: `node --test "tests/js/"*.test.js` (1046/0 ved start), `python3 -m pytest -q` (1433/0 ved start). Ingen TS-endringer → deno-suiten røres ikke.
- Kommentarstil: norsk, forklarer hvorfor/kontrakt (husets stil i begge filer).

---

### Task 1: forPyodideSync med valgfri headers-JSON

**Files:**
- Modify: `js/read-bridge.js:129-153` (funksjonen `forPyodideSync`)
- Test: `tests/js/read-bridge.test.js` (append)

**Interfaces:**
- Produces: `ReadBridge.forPyodideSync(url, headersJson)` — `headersJson` er en JSON-streng (f.eks. `'{"Accept":"text/csv"}'`), `undefined`/tom streng, eller `'{}'`. Tom/utelatt/`'{}'` ≡ dagens ett-args-kall. Returverdi uendret: `{bytes: Uint8Array|null, error: string|null}`. Ugyldig JSON → `{bytes: null, error: 'ugyldig headers-JSON for <url>: <melding>'}` (aldri kast — kalleren er sync-Python).
- Consumes: `xhr(url, headers)` (finnes, `_setXhr`-injiserbar), `DataLoader.proxyHeaders` (finnes, returnerer ferskt objekt per kall).

- [ ] **Step 1: Skriv feilende tester**

Append i `tests/js/read-bridge.test.js`:

```js
test('runtime-ost forPyodideSync: headers bypasser cachen (les OG skriv)', () => {
  RB._reset();
  const calls = [];
  RB._setXhr((u, headers) => { calls.push([u, headers || null]); return { status: 200, bytes: new Uint8Array([9]) }; });
  // Seedet headerløs oppføring skal IGNORERES av headers-kallet …
  RB.insertBytes('https://sdmx.example/EXR', new Uint8Array([1]), 'text/csv');
  const r = RB.forPyodideSync('https://sdmx.example/EXR', '{"Accept":"application/vnd.sdmx.data+csv"}');
  assert.equal(r.error, null);
  assert.deepEqual(Array.from(r.bytes), [9]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].Accept, 'application/vnd.sdmx.data+csv');
  // … og suksessen skal IKKE ha overskrevet den headerløse oppføringen.
  assert.deepEqual(Array.from(RB.getCached('https://sdmx.example/EXR').bytes), [1]);
});

test('runtime-ost forPyodideSync: proxylegg fletter auth- og custom-headere', () => {
  RB._reset();
  RB.configure(() => ({ anthropicKey: 'K3' }));
  const seen = [];
  RB._setXhr((u, headers) => {
    seen.push([u, headers || {}]);
    return u.indexOf('/api/hent?') === 0 ? { status: 200, bytes: new Uint8Array([2]) } : { status: 0, bytes: null };
  });
  const r = RB.forPyodideSync('https://cors.sdmx/EXR', '{"Accept":"text/csv"}');
  RB.configure(null);
  assert.equal(r.error, null);
  assert.equal(seen[0][1].Accept, 'text/csv');            // direktelegget bærer headerne
  assert.equal(seen[1][1]['X-Anthropic-Key'], 'K3');      // proxylegget: auth …
  assert.equal(seen[1][1].Accept, 'text/csv');            // … OG custom flettet inn
  assert.equal(RB.getCached('https://cors.sdmx/EXR'), null); // headers → aldri cache-skriv
});

test('runtime-ost forPyodideSync: tomme headere ≡ headerløst, ugyldig JSON er høylytt-i-retur', () => {
  RB._reset();
  RB._setXhr(() => ({ status: 200, bytes: new Uint8Array([5]) }));
  const r1 = RB.forPyodideSync('https://x/h.csv', '{}');
  assert.equal(r1.error, null);
  // '{}' ≡ dagens kall: suksessen CACHES som før.
  assert.deepEqual(Array.from(RB.getCached('https://x/h.csv').bytes), [5]);
  const r2 = RB.forPyodideSync('https://x/h2.csv', 'ikke json');
  assert.equal(r2.bytes, null);
  assert.match(r2.error, /headers-JSON/);
});
```

- [ ] **Step 2: Kjør testene → FAIL**

Run: `node --test tests/js/read-bridge.test.js`
Expected: 3 nye tester FAIL (headers-argumentet ignoreres i dag: cache-treffet på [1] vinner i test 1, `seen[0][1]` mangler Accept i test 2, 'ikke json' gir ingen error i test 3). Eksisterende tester fortsatt grønne.

- [ ] **Step 3: Implementer**

Erstatt `forPyodideSync` i `js/read-bridge.js` (behold kommentarene som gjenbrukes her — diffen skal være minimal):

```js
  function forPyodideSync(url, headersJson) {
    // Runtime-ost (plan 2026-07-28): valgfri headers-JSON fra openstat.py
    // (_fetch_bytes, SDMX-Accept). JSON-streng, ikke objekt — en Python-dict
    // blir PyProxy på JS-siden og for..in enumererer den ikke. Ikke-tomme
    // headere BYPASSER cachen (les OG skriv): den er URL-nøklet, og en
    // Accept-header endrer svaret (SDMX: csv vs xml) — delt oppføring ville
    // vært stille feil data. Ugyldig JSON returneres som error (aldri kast —
    // kalleren er synkron Python).
    var hdrs = null;
    if (headersJson) {
      try { hdrs = JSON.parse(headersJson); }
      catch (e) { return { bytes: null, error: 'ugyldig headers-JSON for ' + url + ': ' + e.message }; }
      if (!hdrs || Object.keys(hdrs).length === 0) hdrs = null;
    }
    var c = hdrs ? null : cache[url];
    if (c && !c.error) return { bytes: c.bytes, error: null };
    // En cachet FEIL behandles som miss: sync-veien får prøve selv.
    var canXhr = xhrImpl || typeof XMLHttpRequest !== 'undefined';
    if (!canXhr) {
      return { bytes: null, error: (c && c.error) || ('ingen cache-oppføring og ingen XHR for ' + url) };
    }
    var r = xhr(url, hdrs || undefined);
    // Proxy KUN ved status 0 (CORS/nettverk) — samme konvensjon som
    // fetchRawUrl/fetchLoadTarget. En ekte 404 er like ekte via proxyen,
    // og «HTTP 404» er en klarere melding enn «proxy 404».
    if (r.bytes === null && r.status === 0 && url.indexOf('/api/hent?') !== 0) {
      // S5: samme auth-headere som direktiv-veien — proxyen er auth-portet.
      // Custom-headere flettes inn (hent-core videresender accept oppstrøms,
      // api-kinds-spec §4.4 — andre custom-headere dør i proxyen, dokumentert
      // i runtime-ost-spec §1).
      var d = currentDeps() || {};
      var ph = (global.DataLoader && global.DataLoader.proxyHeaders)
        ? global.DataLoader.proxyHeaders(d.authToken, d.anthropicKey) : {};
      if (hdrs) ph = Object.assign({}, ph, hdrs);
      r = xhr('/api/hent?url=' + encodeURIComponent(url), ph);
    }
    if (r.bytes === null) {
      return { bytes: null, error: (r.status ? 'HTTP ' + r.status : 'CORS/nettverksfeil') + ' for ' + url };
    }
    if (!hdrs) cache[url] = { bytes: r.bytes, contentType: '' };
    return { bytes: r.bytes, error: null };
  }
```

- [ ] **Step 4: Kjør suitene → PASS**

Run: `node --test "tests/js/"*.test.js`
Expected: 1049/0 (1046 + 3 nye).

- [ ] **Step 5: Commit**

```bash
git add js/read-bridge.js tests/js/read-bridge.test.js
git commit -m "feat(read-bridge): forPyodideSync tar valgfri headers-JSON (runtime-ost §1) — cache-bypass, proxylegg fletter auth+custom"
```

---

### Task 2: openstat.py `_fetch_bytes` — bro først, naken XHR som fallback

**Files:**
- Modify: `openstat.py:35-59` (funksjonen `_fetch_bytes`; kun emscripten-grenen + docstring)
- Test: `tests/test_openstat.py` (append)

**Interfaces:**
- Consumes: `ReadBridge.forPyodideSync(url, headersJson)` fra Task 1 — `r.error` (str|None etter JsProxy-konvertering; null → None), `r.bytes.to_py()` (bytes-konverterbar). Sen import: `from js import window`.
- Produces: `_fetch_bytes(url, headers=None) -> bytes` — signatur, `_MEMO`-semantikk og feilform (`RuntimeError`) uendret for alle kallere (`Source.read`, `_typemeta_for`, `read_csv`, …).

- [ ] **Step 1: Skriv feilende tester**

Append i `tests/test_openstat.py` (filen har alt `json`, `sys`, `pytest` importert; `types` importeres lokalt i hjelperen):

```python
# ── runtime-ost: _fetch_bytes via ReadBridge i emscripten ────────────────────
# Fake js-modul + sys.platform-monkeypatch: emscripten-grenen er ren Python
# (sene js-imports), så den kan testes i CPython uten Pyodide.

class _FakeJsBytes:
    def __init__(self, data):
        self._d = data

    def to_py(self):
        return bytearray(self._d)


class _FakeJsResult:
    def __init__(self, data=None, error=None):
        self.bytes = _FakeJsBytes(data) if data is not None else None
        self.error = error


def _install_fake_js(monkeypatch, bridge=None, xhr=None):
    import types
    js = types.ModuleType("js")
    win = types.SimpleNamespace()
    if bridge is not None:
        win.ReadBridge = bridge
    js.window = win
    if xhr is not None:
        js.XMLHttpRequest = xhr
    monkeypatch.setitem(sys.modules, "js", js)
    monkeypatch.setattr(sys, "platform", "emscripten")
    ost._MEMO.clear()


def test_fetch_bytes_emscripten_bro_treff_og_memo(monkeypatch):
    seen = []

    class Bridge:
        @staticmethod
        def forPyodideSync(url, headers_json=None):
            seen.append((url, headers_json))
            return _FakeJsResult(data=b"a,b\n1,2\n")

    _install_fake_js(monkeypatch, bridge=Bridge)
    assert ost._fetch_bytes("https://bro.example/t1.csv") == b"a,b\n1,2\n"
    assert seen == [("https://bro.example/t1.csv", None)]
    # _MEMO-semantikken er uendret: andre kall når aldri broen.
    assert ost._fetch_bytes("https://bro.example/t1.csv") == b"a,b\n1,2\n"
    assert len(seen) == 1


def test_fetch_bytes_emscripten_bro_feil_er_runtimeerror(monkeypatch):
    class Bridge:
        @staticmethod
        def forPyodideSync(url, headers_json=None):
            return _FakeJsResult(error="HTTP 404 for " + url)

    _install_fake_js(monkeypatch, bridge=Bridge)
    with pytest.raises(RuntimeError, match="HTTP 404 for https://bro.example/borte.csv"):
        ost._fetch_bytes("https://bro.example/borte.csv")


def test_fetch_bytes_emscripten_headers_som_json(monkeypatch):
    seen = []

    class Bridge:
        @staticmethod
        def forPyodideSync(url, headers_json=None):
            seen.append(headers_json)
            return _FakeJsResult(data=b"x")

    _install_fake_js(monkeypatch, bridge=Bridge)
    ost._fetch_bytes("https://bro.example/sdmx", headers={"Accept": "text/csv"})
    assert json.loads(seen[0]) == {"Accept": "text/csv"}


def test_fetch_bytes_emscripten_uten_bro_faller_til_xhr(monkeypatch):
    # Standalone Pyodide (JupyterLite o.l.): window finnes, ReadBridge gjør
    # ikke — dagens nakne XHR-vei skal kjøre uendret.
    class _Req:
        status = 200
        responseText = "ab"

        def open(self, *a):
            pass

        def overrideMimeType(self, *a):
            pass

        def setRequestHeader(self, *a):
            pass

        def send(self, *a):
            pass

    class _XHR:
        @staticmethod
        def new():
            return _Req()

    _install_fake_js(monkeypatch, bridge=None, xhr=_XHR)
    assert ost._fetch_bytes("https://uten-bro.example/f.csv") == b"ab"
```

- [ ] **Step 2: Kjør testene → FAIL**

Run: `python3 -m pytest -q tests/test_openstat.py -k fetch_bytes_emscripten`
Expected: 3 første FAIL (dagens kode går rett på `from js import XMLHttpRequest` — fake-js uten XMLHttpRequest gir ImportError; headers-testen når aldri broen). Fallback-testen (`uten_bro`) PASSER allerede (den tester dagens vei) — det er riktig og bevisst: den er regresjonsvernet.

- [ ] **Step 3: Implementer**

Erstatt `_fetch_bytes` i `openstat.py` (CPython/urllib-grenen ordrett uendret):

```python
def _fetch_bytes(url, headers=None):
    """Rå bytes fra URL, memoisert per (URL, headere) i økten. I appen ruter
    emscripten-grenen via ReadBridge («samme bro, to fasader»: delt bytecache
    og proxy-fallback m/ auth ved CORS, som pd.read_csv-fasaden); standalone
    Pyodide uten ReadBridge bruker naken synkron XHR (binærtrygg via
    x-user-defined-charset), CPython urllib."""
    memo_key = (url, tuple(sorted((headers or {}).items())))
    if memo_key in _MEMO:
        return _MEMO[memo_key]
    if sys.platform == "emscripten":
        rb = None
        try:
            from js import window as _w
            rb = getattr(_w, "ReadBridge", None)
        except Exception:
            rb = None
        if rb is not None:
            r = rb.forPyodideSync(url, _json.dumps(headers)) if headers \
                else rb.forPyodideSync(url)
            if r.error:
                raise RuntimeError(str(r.error))
            data = bytes(r.bytes.to_py())
        else:
            from js import XMLHttpRequest
            req = XMLHttpRequest.new()
            req.open("GET", url, False)
            req.overrideMimeType("text/plain; charset=x-user-defined")
            for hk, hv in (headers or {}).items():
                req.setRequestHeader(hk, hv)
            req.send(None)
            if req.status >= 400:
                raise RuntimeError("HTTP " + str(req.status) + " for " + url)
            data = bytes(ord(c) & 0xFF for c in req.responseText)
    else:
        from urllib.request import Request, urlopen
        hdrs = {"User-Agent": "openstat"}
        hdrs.update(headers or {})
        with urlopen(Request(url, headers=hdrs)) as r:
            data = r.read()
    _MEMO[memo_key] = data
    return data
```

Merk: fil-headerens linje 4-5 («transporten bytter selv til synkron XHR i
browseren (pyodide-http-trikset)») oppdateres i samme commit til:

```
harde avhengigheter. Samme fil kjører i CPython og i Pyodide/emscripten —
i appen ruter transporten via ReadBridge (delt cache + proxy-fallback),
utenfor appen synkron XHR (pyodide-http-trikset), i CPython urllib.
```

- [ ] **Step 4: Kjør suitene → PASS**

Run: `python3 -m pytest -q` og `node --test "tests/js/"*.test.js`
Expected: pytest 1438/0 (1433 + 5 nye), node 1049/0 uendret.

- [ ] **Step 5: Commit**

```bash
git add openstat.py tests/test_openstat.py
git commit -m "feat(openstat): _fetch_bytes ruter via ReadBridge i appen (runtime-ost §2) — proxy-fallback + cache-deling for ost-verb og metadata"
```

---

### Task 3: Premiss-kommentaren i prefetchScript + smoke-scenario §10

**Files:**
- Modify: `js/read-bridge.js:90-98` (kommentarblokken i `prefetchScript` — KUN kommentar, ingen kodeendring)
- Modify: `.superpowers/sdd/bro-smoke.md` (append §10)

**Interfaces:** ingen — dokumentasjon. (Kommentaren er kontraktsbærende: dagens tekst påstår at hinten IKKE varmer cachen Python leser, og det blir usant etter Task 2.)

- [ ] **Step 1: Skriv om kommentarblokken**

Erstatt kommentaren over metadata-hinten i `prefetchScript` (behold koden):

```js
      // Metadata-hint (metadata-runden Task 3; premisset snudd i runtime-
      // ost-runden): gjenkjent registerkilde -> prefetch json-stat2-formen
      // av SAMME spørring. Fødsels-annoteringen i Pyodide (_ost_annotate_read
      // -> openstat._typemeta_for -> _fetch_bytes) ruter nå via
      // forPyodideSync, så hinten varmer NETTOPP den cachen Python leser —
      // treff = null ventetid under read_csv-kallet. Ren hint fortsatt: en
      // bom (f.eks. avvik mellom dataUrlFor og py-tvillingens data_url)
      // koster ventetid, aldri korrekthet — sync-veien henter selv.
```

- [ ] **Step 2: Append §10 i bro-smoke.md**

```markdown
## 10. Runtime-ost via broen (runtime-ost-runden 2026-07-28)

**Modus:** Python.

```python
import openstat as ost
ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")
df = ssb.read("05839")
df.head()
```

**Se:** rammen kommer med etiketter og typede kolonner (pxweb-veien typer
ved fødsel via apply_typemeta). Network-panelet: data-hentingen
(`05839/data?…outputFormat=json-stat2`) skjer ÉN gang — en re-kjøring av
cellen gjør ingen ny henting (_MEMO + ReadBridge-cachen deler økt).

**Beviser:** ost-verbene går gjennom broen. CORS-stengte kilder faller nå
til /api/hent-proxyen også for ost-verb og metadata-henting — samme
auth-krav som scenario 6 (nøkkel/innlogging i AI-innstillingene).
```

- [ ] **Step 3: Kjør suitene (uendret grønt) og commit**

Run: `node --test "tests/js/"*.test.js` → 1049/0.

```bash
git add js/read-bridge.js .superpowers/sdd/bro-smoke.md
git commit -m "docs(read-bridge+smoke): prefetch-hinten varmer nå cachen Python leser (premiss snudd); smoke §10 runtime-ost"
```

---

## Kontrollørens sluttsteg (utenfor task-nummereringen)

- Slutt-review av hele diffen (main..runtime-ost).
- Live browser-smoke §10 mot netlify dev :8888 (hard reload m/ ignoreCache; sjekk GET /data/data-sources.json=200 først — cwd-fella).
- Merge til main, push (kontrollørens beslutning), ledger-oppdatering nederst i progress.md + lukk de to oppfølgingene (proxy-fallback-metadata, prefetch-varmer-feil-cache).
