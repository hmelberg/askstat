# Metadata-runden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etiketter/nivåer/enheter fra ost_typemeta synlig i datasettpanelet; fødselstyping (obligatorisk-men-feilbar) for gjenkjente registerkilde-URL-er i Pyodide; eksplisitte portable funksjoner `ost.read_csv`/`ost.apply_meta` i openstat.py.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-metadata-runden-design.md. Gjenkjenning av data-URL-er (pxweb-familien + eurostat) implementeres som JS/py-TVILLINGER med delt fixture (husets paritetsmønster). Metadata hentes som json-stat2 med SAMME spørring som brukerens URL (aldri krympet utvalg — top(1)-krymping gir hullete kategorier → NaN i Categorical), caches i ReadBridge/_MEMO. Typing er BEST-EFFORT: kun kolonner hvis verdier er kildens KODER typles (UseTexts-etikettverdier får attrs/panel, aldri dtype-endring); dtype=str-vernet injiseres VED parse (0301→301 kan ikke repareres etterpå — reparasjon ville vært gjetting). Rammer typles ved fødsel eller aldri.

**Tech Stack:** openstat.py (typemeta_from_jsonstat/apply_typemeta/metadata_url FINNES — gjenbruk), js/pxweb.js (typeMetaFromJsonStat/pyApplyTypemetaSource FINNES), js/read-bridge.js (pyPatchSource = fødsels-choke-punktet), index.html (updateSidebarDatasets:4496, refreshDatasetSidebarFromPy), tests/fixtures/pxweb_dataset.json (delt fixture).

## Global Constraints

- ALDRI push — commit lokalt; push skjer først når HELE runden er ferdig (Hans' stående ord fra 2026-07-28: «når du er ferdig, push»).
- Arbeidsgren: `metadata-runden` (opprettes fra main FØR Task 1).
- Aldri stille feil data: metadata-feil → utypet last + console.warn m/ URL; ALDRI gjetting (ingen zfill-reparasjon, ingen etikett-gjetting, ingen typing av kolonner som ikke matcher kodene eksakt).
- Kjøringen feiler ALDRI på metadata (obligatorisk = alltid forsøkt, feilbar = aldri blokkerende).
- Ingen mutasjon av rammer etter kjøring — typing ved fødsel eller aldri; alt sent-ankommet er panel/attrs-berikelse.
- JS/py-paritet: gjenkjennings- og typemeta-endringer speiles i BEGGE tvillinger m/ delt fixture (mønster: «endres den ene, endres den andre»-kommentarene i openstat.py/js/pxweb.js).
- Wrappere: idempotente (attr-vakt), håndterer posisjonelle OG navngitte argumenter (M1-lærdommen).
- Suiter ved hver task-slutt: `node --test "tests/js/*.test.js"` (1025/0 ved start), `python3 -m pytest -q` (1410/0), `cd netlify/edge-functions && deno test --allow-read --allow-env --allow-net` (285/0 — kun relevant der TS røres; ingen TS-endringer er planlagt).
- Browser-verifisering: netlify dev på 8888; hard-reload m/ ignoreCache (Chrome-js-cache-fella); INGEN skjermbilder.

---

### Task 1: URL-gjenkjenning — JS/py-tvillinger m/ delt fixture

**Files:**
- Modify: `openstat.py` (nye funksjoner etter `metadata_url`, ~linje 84)
- Modify: `js/pxweb.js` (ny funksjon ved url-hjelperne; eksporteres i PxWeb-objektet ~linje 235)
- Create: `tests/fixtures/recognize_urls.json` (delt fixture)
- Test: `tests/test_openstat.py` (append), `tests/js/pxweb.test.js` (append)

**Interfaces:**
- Produces (py): `recognize_url(url) -> dict | None` med nøkler `{"kind": "pxweb"|"eurostat", "base": "<api-base t.o.m. /tables>", "table": "<id>", "query": "<rå querystring uten ledende ?>"}`. None for alt ukjent.
- Produces (js): `PxWeb.recognizeUrl(url)` → samme objekt (null for ukjent). Feltnavnene er identiske — fixturen håndhever det.
- Mønstrene (kopieres verbatim til begge tvillinger og fixturen):
  - pxweb v2: `^https?://[^/]+/api/pxwebapi/v2/tables/([A-Za-z0-9]+)/data(?:\?(.*))?$` (ssb-familien; verts-agnostisk — scb/dst/statfin-verter matcher samme sti-form der de bruker v2)
  - pxweb v2beta (scb): samme form med `/v2beta/` i stedet for `/v2/`
  - eurostat statistics-api: `^https?://ec\.europa\.eu/eurostat/api/dissemination/statistics/1\.0/data/([A-Za-z0-9_]+)(?:\?(.*))?$`
  - ALT annet → None/null (aldri gjett; /api/hent?url=-innpakkede URL-er dekodes ÉN gang med decodeURIComponent/unquote FØR matching, og resultatet re-matches).

- [ ] **Step 1: Skriv delt fixture**

`tests/fixtures/recognize_urls.json`:

```json
{
  "cases": [
    {"url": "https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?valueCodes[Tid]=*&outputFormat=csv&stub=Tid",
     "expect": {"kind": "pxweb", "base": "https://data.ssb.no/api/pxwebapi/v2/tables", "table": "05839", "query": "valueCodes[Tid]=*&outputFormat=csv&stub=Tid"}},
    {"url": "https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB1267/data?outputFormat=csv",
     "expect": {"kind": "pxweb", "base": "https://api.scb.se/OV0104/v2beta/api/v2/tables", "table": "TAB1267", "query": "outputFormat=csv"}},
    {"url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_202?format=JSON&geo=NO",
     "expect": {"kind": "eurostat", "base": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data", "table": "nrg_pc_202", "query": "format=JSON&geo=NO"}},
    {"url": "/api/hent?url=https%3A%2F%2Fdata.ssb.no%2Fapi%2Fpxwebapi%2Fv2%2Ftables%2F07230%2Fdata%3FvalueCodes%5BTid%5D%3D*",
     "expect": {"kind": "pxweb", "base": "https://data.ssb.no/api/pxwebapi/v2/tables", "table": "07230", "query": "valueCodes[Tid]=*"}},
    {"url": "https://ourworldindata.org/grapher/co2.csv", "expect": null},
    {"url": "https://data.ssb.no/api/v0/no/table/05839", "expect": null},
    {"url": "ikke en url", "expect": null}
  ]
}
```

MERK scb-formen: verifiser mot ekte SCB-URL-form FØR fixturen låses (curl mot api.scb.se — v2beta-stien har vist seg å avvike, jf. eval-funnet «SCB-v2beta avviser stub»). Er formen en annen: rett fixturen og mønsteret, ikke koden rundt.

- [ ] **Step 2: Skriv feilende tester (begge suiter, samme fixture)**

`tests/test_openstat.py` (append; følg filens eksisterende import/stil):

```python
def test_recognize_url_fixture():
    import json, pathlib
    cases = json.loads((pathlib.Path(__file__).parent / "fixtures" / "recognize_urls.json").read_text())["cases"]
    for c in cases:
        assert openstat.recognize_url(c["url"]) == c["expect"], c["url"]
```

`tests/js/pxweb.test.js` (append; følg filens require/fixture-mønster):

```js
test('recognizeUrl: delt fixture, paritet med openstat.py', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'recognize_urls.json'), 'utf8')).cases;
  for (const c of cases) {
    assert.deepStrictEqual(PxWeb.recognizeUrl(c.url), c.expect, c.url);
  }
});
```

Kjør begge → FAIL (funksjonene finnes ikke).

- [ ] **Step 3: Implementer py-tvillingen**

I `openstat.py` etter `metadata_url` (kommentarblokk: «paritet med js/pxweb.js recognizeUrl — endres den ene, endres den andre; delt fixture tests/fixtures/recognize_urls.json»):

```python
_RECOGNIZE_PATTERNS = (
    ("pxweb", r"^(https?://[^/]+.*?/tables)/([A-Za-z0-9_]+)/data$"),
    ("eurostat", r"^(https?://ec\.europa\.eu/eurostat/api/dissemination/statistics/1\.0/data)/([A-Za-z0-9_]+)$"),
)


def recognize_url(url):
    """Data-URL -> {kind, base, table, query} for kilder med kjent metadata
    (pxweb-familien via /tables/<id>/data-formen, eurostat statistics-api).
    None for alt annet — aldri gjetting. /api/hent-innpakning pakkes ut én
    gang før matching."""
    import re as _re
    from urllib.parse import unquote
    s = str(url or "")
    if s.startswith("/api/hent?"):
        for part in s.split("?", 1)[1].split("&"):
            if part.startswith("url="):
                s = unquote(part[4:])
                break
    base, _, query = s.partition("?")
    # Ingen verts-vakt: /tables/<id>/data-formen ER signaturen (verts-
    # agnostisk for pxweb-familien); v0-API-et («/table/<id>», entall, uten
    # /data) matcher aldri mønsteret — fixturens negative case håndhever det.
    for kind, pat in _RECOGNIZE_PATTERNS:
        m = _re.match(pat, base)
        if m:
            return {"kind": kind, "base": m.group(1), "table": m.group(2), "query": query}
    return None
```

MERK: pxweb-mønsteret krever `/pxwebapi/`-segmentet via for-sjekken (v0-API-et `api/v0/no/table/...` skal IKKE matche — fixturens negative case håndhever det). Legg `recognize_url` i `__all__`.

- [ ] **Step 4: Implementer js-tvillingen**

I `js/pxweb.js` (samme kommentarkobling begge veier):

```js
  var RECOGNIZE_PATTERNS = [
    ['pxweb', /^(https?:\/\/[^\/]+.*?\/tables)\/([A-Za-z0-9_]+)\/data$/],
    ['eurostat', /^(https?:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data)\/([A-Za-z0-9_]+)$/],
  ];

  function recognizeUrl(url) {
    var s = String(url || '');
    if (s.indexOf('/api/hent?') === 0) {
      var q = s.split('?')[1] || '';
      var parts = q.split('&');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf('url=') === 0) { s = decodeURIComponent(parts[i].slice(4)); break; }
      }
    }
    var qi = s.indexOf('?');
    var base = qi >= 0 ? s.slice(0, qi) : s;
    var query = qi >= 0 ? s.slice(qi + 1) : '';
    // Ingen verts-vakt — se py-tvillingens kommentar (paritet).
    for (var p = 0; p < RECOGNIZE_PATTERNS.length; p++) {
      var m = RECOGNIZE_PATTERNS[p][1].exec(base);
      if (m) return { kind: RECOGNIZE_PATTERNS[p][0], base: m[1], table: m[2], query: query };
    }
    return null;
  }
```

Eksporter `recognizeUrl: recognizeUrl` i PxWeb-objektet (~linje 235).

- [ ] **Step 5: Kjør begge suitene grønt + commit**

Run: `python3 -m pytest -q tests/test_openstat.py` og `node --test tests/js/pxweb.test.js` → PASS; deretter fulle suiter.

```bash
git add openstat.py js/pxweb.js tests/fixtures/recognize_urls.json tests/test_openstat.py tests/js/pxweb.test.js
git commit -m "feat(metadata): recognize_url/recognizeUrl — JS/py-tvillinger m/ delt fixture for registerkilde-URL-er"
```

---

### Task 2: openstat.py — read_csv og apply_meta (eksplisitte, portable)

**Files:**
- Modify: `openstat.py` (nye offentlige funksjoner etter `apply_typemeta`; `__all__` utvides)
- Test: `tests/test_openstat.py`

**Interfaces:**
- Consumes: `recognize_url` (Task 1), `data_url`/`eurostat_data_url`, `_fetch_bytes`, `typemeta_from_jsonstat`, `apply_typemeta` (finnes).
- Produces:
  - `ost.apply_meta(df, url_or_table, base=None)` → samme df, BEST-EFFORT typet + attrs satt. `url_or_table` er en gjenkjennbar URL ELLER en tabell-id (da kreves `base=`).
  - `ost.read_csv(url, **pandas_kwargs)` → typet DataFrame for gjenkjent URL; ren `pd.read_csv`-passthrough (uendret semantikk) for ukjent URL.
  - Intern: `_typemeta_for(kind, base, table, query)` → tm-dict (json-stat2 m/ SAMME query, force_jsonstat; memoisert via _fetch_bytes) og `_apply_best_effort(df, tm)` → df.
- BEST-EFFORT-REGELEN (eksakt): for hver dim i tm som finnes som kolonne i df: hvis settet av ikke-NA-verdier (som str) ⊆ dims kategorikoder → Categorical m/ kanonisk veis regler (tidsregelen inkludert); ellers (f.eks. UseTexts-etiketter som verdier) → IKKE rør dtype. attrs["ost_typemeta"] settes ALLTID ved gjenkjent kilde (panel/visning trenger den). value-kolonner røres ikke i best-effort (brukerens parse bestemte dem).

- [ ] **Step 1: Skriv feilende tester**

```python
def _mini_jsonstat():
    return {"id": ["Region", "Tid"], "size": [2, 2],
            "role": {"time": ["Tid"]},
            "dimension": {
                "Region": {"category": {"index": {"0301": 0, "1103": 1},
                                        "label": {"0301": "Oslo", "1103": "Stavanger"}}},
                "Tid": {"category": {"index": {"2023": 0, "2024": 1},
                                     "label": {"2023": "2023", "2024": "2024"}}}},
            "value": [1, 2, 3, 4]}


def test_apply_meta_best_effort_koder_types(monkeypatch):
    tm = openstat.typemeta_from_jsonstat(_mini_jsonstat())
    monkeypatch.setattr(openstat, "_typemeta_for", lambda *a: tm)
    df = pd.DataFrame({"Region": ["0301", "1103"], "Tid": ["2023", "2024"], "verdi": [1.0, 2.0]})
    out = openstat.apply_meta(df, "https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?x=1")
    assert str(out["Region"].dtype) == "category"
    assert str(out["Tid"].dtype) == "int64"          # tidsregelen
    assert out.attrs["ost_typemeta"]["dims"]["Region"]["labels"]["0301"] == "Oslo"
    assert str(out["verdi"].dtype) == "float64"       # value røres ikke


def test_apply_meta_usetexts_etiketter_typles_ikke(monkeypatch):
    tm = openstat.typemeta_from_jsonstat(_mini_jsonstat())
    monkeypatch.setattr(openstat, "_typemeta_for", lambda *a: tm)
    df = pd.DataFrame({"Region": ["Oslo", "Stavanger"], "Tid": ["2023", "2024"]})
    out = openstat.apply_meta(df, "https://data.ssb.no/api/pxwebapi/v2/tables/05839/data")
    assert str(out["Region"].dtype) == "object"       # etikett-verdier: aldri dtype-endring
    assert "ost_typemeta" in out.attrs                 # men attrs settes (panel)


def test_apply_meta_ukjent_url_feiler_hoylytt():
    with pytest.raises(ValueError, match="gjenkjen"):
        openstat.apply_meta(pd.DataFrame(), "https://example.com/x.csv")


def test_read_csv_passthrough_ukjent(monkeypatch):
    monkeypatch.setattr(openstat, "_fetch_bytes", lambda url, headers=None: b"a,b\n1,2\n")
    out = openstat.read_csv("https://example.com/x.csv")
    assert list(out.columns) == ["a", "b"] and "ost_typemeta" not in out.attrs


def test_read_csv_gjenkjent_dtype_str_vern(monkeypatch):
    tm = openstat.typemeta_from_jsonstat(_mini_jsonstat())
    monkeypatch.setattr(openstat, "_typemeta_for", lambda *a: tm)
    monkeypatch.setattr(openstat, "_fetch_bytes",
                        lambda url, headers=None: b"Region,Tid,verdi\n0301,2023,1\n1103,2024,2\n")
    out = openstat.read_csv("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?outputFormat=csv")
    # 0301-fella: uten vern hadde pandas gjort Region til int64 (301)
    assert str(out["Region"].dtype) == "category"
    assert list(out["Region"].astype(str)) == ["0301", "1103"]
```

Kjør → FAIL (funksjonene finnes ikke).

- [ ] **Step 2: Implementer**

Etter `apply_typemeta` i openstat.py:

```python
def _typemeta_for(kind, base, table, query):
    """Typekontrakt for en gjenkjent kilde: json-stat2 m/ SAMME spørring
    (aldri krympet utvalg — top(1)-krymping gir hullete kategorier -> NaN i
    Categorical). Memoisert via _fetch_bytes."""
    target = base.rstrip("/") + "/" + table + (("?" + query) if query else "")
    du = eurostat_data_url(target) if kind == "eurostat" else data_url(target)
    return typemeta_from_jsonstat(_json.loads(_fetch_bytes(du).decode("utf-8")))


def _apply_best_effort(df, tm):
    """Typ kun kolonner hvis verdier er kildens KODER; etikett-verdier
    (UseTexts) får aldri dtype-endring — men attrs settes alltid (panelet
    trenger etikettene uansett)."""
    for did, d in (tm.get("dims") or {}).items():
        if did not in df.columns:
            continue
        cats = [str(c) for c in (d.get("categories") or [])]
        vals = set(df[did].dropna().astype(str))
        if not vals or not vals.issubset(set(cats)):
            continue
        if did in (tm.get("time") or []) and _all_intlike(cats):
            df[did] = df[did].astype("int64")
        else:
            df[did] = pd.Categorical(df[did].astype(str), categories=cats,
                                     ordered=did in (tm.get("time") or []))
    df.attrs["ost_typemeta"] = tm
    return df


def apply_meta(df, url_or_table, base=None):
    """Påfør registermetadata på en ramme du alt har lastet. Portabel
    tvilling av appens fødselstyping — samme regler, eksplisitt."""
    rec = recognize_url(url_or_table)
    if rec is None and base:
        rec = {"kind": "pxweb", "base": str(base), "table": str(url_or_table), "query": ""}
    if rec is None:
        raise ValueError("URL-en gjenkjennes ikke som en registerkilde med kjent metadata "
                         "(pxweb/eurostat) — oppgi base= og tabell-id, eller bruk ost.read().")
    return _apply_best_effort(df, _typemeta_for(rec["kind"], rec["base"], rec["table"], rec["query"]))


def read_csv(url, **kwargs):
    """pd.read_csv med metadata på: gjenkjent register-URL -> CSV-en lastes
    (brukerens form/params), dim-kolonner får dtype=str-vern VED parse
    (0301-fella kan ikke repareres etterpå), og rammen typles best-effort.
    Ukjent URL -> ren pandas-passthrough, uendret semantikk."""
    rec = recognize_url(url)
    raw = io.BytesIO(_fetch_bytes(str(url)))
    if rec is None:
        return pd.read_csv(raw, **kwargs)
    tm = None
    try:
        tm = _typemeta_for(rec["kind"], rec["base"], rec["table"], rec["query"])
    except Exception as e:
        sys.stderr.write("ost.read_csv: metadata utilgjengelig for %s (%s) — laster utypet.\n"
                         % (rec["table"], e))
    if tm is not None and "dtype" not in kwargs:
        kwargs = dict(kwargs)
        kwargs["dtype"] = {d: str for d in (tm.get("dims") or {})}
    df = pd.read_csv(raw, **kwargs)
    return _apply_best_effort(df, tm) if tm is not None else df
```

Legg `read_csv`, `apply_meta` i `__all__`. MERK: `apply_meta` er bevisst HØYLYTT ved ukjent URL (eksplisitt kall = brukeren mente det), mens `read_csv` er passthrough (den skal føles som pandas).

- [ ] **Step 3: Kjør pytest grønt + full suite + commit**

```bash
python3 -m pytest -q tests/test_openstat.py && python3 -m pytest -q
git add openstat.py tests/test_openstat.py
git commit -m "feat(openstat.py): read_csv/apply_meta — eksplisitt portabel typing m/ dtype=str-vern og best-effort-regel"
```

---

### Task 3: Fødselstyping i appen (Pyodide via ReadBridge-wrapperen)

**Files:**
- Modify: `js/read-bridge.js` (pyPatchSource ~linje 143-171 + prefetchScript ~linje 87)
- Modify: `index.html` (KUN hvis openstat.py ikke allerede er tilgjengelig i Pyodide — verifiser med grep hvordan preamblet laster openstat.py i dag; pakken brukes av editor-pariteten, så den finnes trolig)
- Test: `tests/js/read-bridge.test.js` (kildekontrakt-needles på pyPatchSource)

**Interfaces:**
- Consumes: `PxWeb.recognizeUrl` (JS, Task 1 — for prefetch), openstat.py `recognize_url`/`_typemeta_for`/`_apply_best_effort` (Task 2 — kjører INNE i Pyodide; gjenbruk, aldri duplisering av reglene).
- Produces: `pd.read_csv("<gjenkjent register-URL>")` i Pyodide returnerer ferdig typet ramme (dtype=str-vern ved parse, best-effort Categorical, attrs satt) — født typet, aldri mutert. Metadata-json-stat2-URL-en PREFETCHES parallelt (ReadBridge-cachen), så fødselstypingen ikke koster ekstra ventetid på happy path.

- [ ] **Step 1: Utvid prefetchScript med metadata-hint**

I `js/read-bridge.js`:

```js
  function prefetchScript(script) {
    scanUrls(script).forEach(function (u) {
      ensure(u);
      // Metadata-hint (metadata-runden): gjenkjent registerkilde -> prefetch
      // json-stat2-formen av SAMME spørring, så fødselstypingen i Pyodide
      // treffer varm cache. Ren hint — bom koster tid, aldri korrekthet.
      var rec = global.PxWeb && global.PxWeb.recognizeUrl ? global.PxWeb.recognizeUrl(u) : null;
      if (rec && global.PxWeb.dataUrl) {
        var t = rec.base + '/' + rec.table + (rec.query ? '?' + rec.query : '');
        ensure(rec.kind === 'eurostat' ? global.PxWeb.eurostatDataUrl(t) : global.PxWeb.dataUrl(t));
      }
    });
  }
```

MERK: verifiser de FAKTISKE eksportnavnene i js/pxweb.js (dataUrl/eurostatDataUrl — grep PxWeb-objektet); bruk de reelle navnene, og hopp over hint-grenen med en kommentar hvis eurostat-varianten ikke finnes JS-side.

- [ ] **Step 2: Utvid pyPatchSource-wrapperen med fødselstyping**

I `_ost_wrap_reader`-koden (pyPatchSource) endres URL-grenen for read_csv-tilfellet slik (VIS hele den nye py-kilden i diffen; kjernen):

```python
def _ost_typed_read(_orig, _url, _a, _kw):
    import openstat as _ost
    _rec = _ost.recognize_url(_url)
    _buf = _ost_url_buf(_url)
    if _rec is None:
        return _orig(_buf, *_a, **_kw)
    _tm = None
    try:
        _tm = _ost._typemeta_for(_rec["kind"], _rec["base"], _rec["table"], _rec["query"])
    except Exception as _e:
        print("fødselstyping: metadata utilgjengelig for", _rec["table"], "(", _e, ") — laster utypet")
    if _tm is not None and "dtype" not in _kw:
        _kw = dict(_kw)
        _kw["dtype"] = {(_d): str for _d in (_tm.get("dims") or {})}
    _df = _orig(_buf, *_a, **_kw)
    return _ost._apply_best_effort(_df, _tm) if _tm is not None else _df
```

og `_w` ruter `pd.read_csv`-wrapperen (KUN read_csv — json/parquet har ikke CSV-parsefella) gjennom `_ost_typed_read`. VIKTIG: `import openstat` må være tilgjengelig i Pyodide — Step 3 verifiserer; feiler importen skal wrapperen falle tilbake til dagens oppførsel (utypet) med ETT console-notat, aldri kast.

- [ ] **Step 3: Kildekontrakt-tester + Pyodide-tilgjengelighet**

`tests/js/read-bridge.test.js` (append):

```js
test('pyPatchSource: fødselstyping — recognize + dtype=str-vern + best-effort, aldri kast', () => {
  const src = ReadBridge.pyPatchSource();
  for (const needle of ['recognize_url', '_typemeta_for', '_apply_best_effort',
                        '"dtype"', 'laster utypet']) {
    assert.ok(src.includes(needle), 'mangler: ' + needle);
  }
});
```

Verifiser openstat-importen i Pyodide: grep i index.html hvordan openstat.py gjøres tilgjengelig (søk `openstat.py` / `openstat` i preamble-regionen ~7400-7600). Finnes den ikke: legg en fetch+FS-skriv av /openstat.py i getInterpreterCorePython-oppsettet (samme mønster som andre preamble-ressurser) — dokumentér valget i rapporten.

- [ ] **Step 4: Browser-verifisering (chrome-devtools, tre scenarier fra spec §4)**

Mot localhost:8888 (fersk fane, ignoreCache): (a) rått `pd.read_csv("<SSB stub-URL, outputFormat=csv, UTEN UseTexts>")`-script via appens Kjør-vei → panel/dtypes viser category/int64 og `df["Region"]`-koder har bevart ledende nuller; (b) samme med UseTexts → kolonnene FORBLIR utypet (object) men attrs/panel har etiketter; (c) ugyldig tabell-id i URL-form som matcher mønsteret → lasten fullfører utypet + konsollnotat. Faktiske verdier i rapporten.

- [ ] **Step 5: Suiter + commit**

```bash
node --test "tests/js/*.test.js" && python3 -m pytest -q
git add js/read-bridge.js tests/js/read-bridge.test.js index.html
git commit -m "feat(pyodide): fødselstyping ved read_csv av gjenkjente register-URL-er — dtype=str-vern + best-effort via openstat.py"
```

---

### Task 4: Panelvisning — etikett, utvidbar nivåliste, unit

**Files:**
- Modify: `index.html` — `updateSidebarDatasets` (~4496) + `refreshDatasetSidebarFromPy` (grep; attrs-lesing) + CSS-blokk for nivålisten (følg eksisterende sidebar-CSS-plassering)
- Test: `tests/js/` — ny fil `tests/js/sidebar-typemeta.test.js` KUN hvis panel-logikken faktoreres ut; ellers utvid der sidebar-logikk testes i dag (grep `updateSidebarDatasets` i tests/js — finnes ingen: faktorer ut en ren funksjon `buildVarRowHtml(name, dtype, tmForCol)` til `js/dataset-order.js`? NEI — lag heller `js/sidebar-typemeta.js` (ny liten modul, én oppgave: typemeta→rad-HTML og nivåliste-HTML) så den er node-testbar; index.html konsumerer den.)

**Interfaces:**
- Consumes: `info[name].typemeta` — NY valgfri nøkkel på panel-info-objektet: `{dims: {<kolonne>: {label, labels: {kode: etikett}}}, units: {...}, time: [...], metric: [...]}` (samme form som attrs["ost_typemeta"]).
- Produces: `window.SidebarTypemeta.varRow(name, dtype, tm)` → HTML-streng for én kolonnerad (navn — etikett · dtype, m/ `▸`-toggle når labels finnes); `SidebarTypemeta.levelList(tm, name)` → HTML for nivålisten (første 20 + «+N flere»). All HTML escapes med samme escapeHtml-regler som resten (XSS-testene fra meta-info-mønsteret gjenbrukes).
- Datakilde: `refreshDatasetSidebarFromPy` leser `df.attrs.get("ost_typemeta")` per ramme (utvid eval-strengen den bruker — grep hvordan dtypes hentes i dag og følg samme rundtur) og legger den i info. Direktiv-veiens JS-side har typemeta der den fantes fra før (grep typeMetaFromJsonStat-kallstedene og koble om de finnes; finnes ingen JS-side lagring, er py-attrs-veien den eneste i denne runden — noter det).
- BEVISST NEDSKALERING (avvik fra spec §2, avklart ved planskriving): R- og mini-motor-rammer får IKKE panelberikelse i denne runden — det krever URL→ramme-navn-kobling som ikke finnes (R-sveipen leser globalenv uten opphavs-URL). Ført som oppfølging i ledgeren; spec-en er justert med samme formulering.

- [ ] **Step 1: Skriv feilende node-tester** (render-nivå, meta-info-mønsteret: modellen OG HTML)

```js
const tm = { dims: { Region: { label: 'region', labels: { '0301': 'Oslo', '1103': 'Stavanger' } } },
             units: { verdi: { base: 'antall' } }, time: ['Tid'], metric: [] };

test('varRow: navn — etikett · dtype, toggle når labels finnes', () => {
  const html = SidebarTypemeta.varRow('Region', 'category', tm);
  for (const n of ['Region', 'region', 'category', '▸']) assert.ok(html.includes(n));
  assert.ok(!SidebarTypemeta.varRow('Tid', 'int64', tm).includes('▸'));  // ingen labels → ingen toggle
});

test('levelList: første 20 + «+N flere», escaping', () => {
  const many = { dims: { X: { labels: Object.fromEntries(
    Array.from({length: 25}, (_, i) => ['k' + i, '<b>' + i]) ) } } };
  const html = SidebarTypemeta.levelList(many, 'X');
  assert.ok(html.includes('+5 flere'));
  assert.ok(html.includes('&lt;b&gt;'));   // aldri rå HTML fra etiketter
  assert.ok(!html.includes('<b>0'));
});
```

- [ ] **Step 2: Implementer js/sidebar-typemeta.js**

```js
// js/sidebar-typemeta.js — typemeta -> panel-HTML (metadata-runden, spec
// 2026-07-28). Én oppgave: rad- og nivåliste-HTML fra ost_typemeta-formen.
// Ren strengbygging uten DOM-avhengighet, så node-testene ser den.
(function (global) {
  'use strict';

  var MAX_LEVELS = 20;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dimFor(tm, name) {
    return ((tm || {}).dims || {})[name] || null;
  }

  function hasLevels(tm, name) {
    var d = dimFor(tm, name);
    return !!(d && d.labels && Object.keys(d.labels).length);
  }

  // Én kolonnerad: «navn — etikett · dtype», med ▸-toggle når nivåer finnes.
  // Unit hektes på når units bærer en oppføring for kolonnen.
  function varRow(name, dtype, tm) {
    var d = dimFor(tm, name);
    var label = d && d.label ? ' — ' + esc(d.label) : '';
    var unit = (((tm || {}).units || {})[name] || {}).base;
    var unitHtml = unit ? ' · ' + esc(unit) : '';
    var toggle = hasLevels(tm, name)
      ? '<span class="sidebar-var-toggle" data-tm-toggle="' + esc(name) + '">▸</span>' : '';
    return '<span class="sidebar-var-name">' + esc(name) + label + '</span>' +
           '<span class="sidebar-var-dtype">' + esc(dtype || '') + unitHtml + '</span>' + toggle;
  }

  // Nivåliste: kildens orden (labels-objektets nøkkelorden er innsettings-
  // orden fra json-stat-index), første MAX_LEVELS + «+N flere».
  function levelList(tm, name) {
    var d = dimFor(tm, name);
    if (!d || !d.labels) return '';
    var codes = Object.keys(d.labels);
    var shown = codes.slice(0, MAX_LEVELS);
    var rest = codes.length - shown.length;
    var rows = shown.map(function (c) {
      return '<div class="sidebar-level-row"><code>' + esc(c) + '</code> ' +
             esc(d.labels[c]) + '</div>';
    }).join('');
    if (rest > 0) rows += '<div class="sidebar-level-more">+' + rest + ' flere</div>';
    return '<div class="sidebar-level-list" data-tm-levels="' + esc(name) + '">' + rows + '</div>';
  }

  global.SidebarTypemeta = { varRow: varRow, levelList: levelList, _esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
```

Koble inn i updateSidebarDatasets: `varsHtml`-løkka bruker `SidebarTypemeta.varRow(v, dtypeStr, meta.typemeta)` når `meta.typemeta` finnes (ellers dagens vei uendret), nivålista appendes skjult etter raden og klikk på `[data-tm-toggle]` toggler `display` (vanlig delegert click-handler ved de andre sidebar-handlerne, ingen ny state). `<script src="js/sidebar-typemeta.js">`-tag legges ved de andre js/-taggene (grep read-bridge-taggen og legg inntil).

- [ ] **Step 3: Utvid refreshDatasetSidebarFromPy** til å lese attrs["ost_typemeta"] (følg dens eksisterende dtypes-rundtur) → `info[name].typemeta`.

- [ ] **Step 4: Browser-verifisering:** smoke 1-scriptet (kanonisk direktiv-vei) og Task 3s scenario (a) — panelet viser «Region — region · category», klikk åpner nivåliste med «0301 Oslo», units på verdikolonnen. Faktiske DOM-utdrag i rapporten.

- [ ] **Step 5: Suiter + commit**

```bash
node --test "tests/js/*.test.js" && python3 -m pytest -q
git add js/sidebar-typemeta.js tests/js/sidebar-typemeta.test.js index.html
git commit -m "feat(panel): etiketter/nivåer/units fra ost_typemeta — utvidbar nivåliste, py-attrs-sveip"
```

---

### Task 5: Hjelpedok + smoke + ledger (kontrollør-nær oppsamling)

**Files:**
- Modify: `hjelp.html` + `hjelp.en.html` (kort avsnitt under datainnlasting: fødselstyping for registerkilder, divergensen mot naken Jupyter, og `ost.read_csv`/`ost.apply_meta` som eksplisitt portabel form)
- Modify: `.superpowers/sdd/bro-smoke.md` (usporet — nytt §9: metadata-smoken, tre scenarier fra Task 3/4 som sjekkliste for Hans)

Hjelp-tekst (norsk; engelsk oversettes 1:1 i hjelp.en.html):

> **Automatisk metadata for registerkilder.** Laster du en tabell-URL fra en
> kjent registerkilde (SSB-familien, Eurostat) med `pd.read_csv`, henter
> appen metadataen automatisk: kodekolonner beskyttes mot talltolkning
> (0301 forblir 0301), dimensjoner får kategoritype i kildens orden, og
> sidepanelet viser etiketter, nivåer og enheter. Feiler metadatahentingen,
> lastes dataene som vanlig — uten typing, med beskjed i konsollen.
> Utenfor appen (Jupyter/RStudio) gir samme script utypede rammer; vil du ha
> samme typing der, bruk `ost.read_csv(url)` eller
> `ost.apply_meta(df, url)` fra openstat-pakken — samme regler, eksplisitt.

**Steps:** skriv begge, verifiser at hjelp-teksten ikke lover noe utestet (les den mot Task 3/4-rapportene), commit hjelp-filene (bro-smoke forblir usporet):

```bash
git add hjelp.html hjelp.en.html
git commit -m "docs(hjelp): fødselstyping + ost.read_csv/apply_meta — portabilitetsnotat"
```

---

### Task 6: Kontrollørens sluttsteg (IKKE subagent)

- Slutt-review av hele grenen (superpowers:requesting-code-review-malen, mest kapable modell) m/ reviewpakke fra merge-base.
- Merge til main, suiter på merget main, ledger-post, push (Hans' stående ord), Netlify-deploy skjer automatisk.
