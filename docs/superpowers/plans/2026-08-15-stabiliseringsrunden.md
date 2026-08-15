# Stabiliseringsrunden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre kjørefeil synlige i prosessloggen, få bare-alias (`eurostat.read(...)`) til å virke som ekte Python, og verne adapterparitet med live-batteri + delte kontrakt-caser.

**Architecture:** Fire uavhengige leveranser i samme repo (askstat, main-avledet gren): (1) én sentral FEIL-emisjon i runSvarLoop; (2) `connect_alias` i openstat.py + idempotent boot-binding i index.html; (3) live-API-batteri bak `ASKSTAT_LIVE=1`; (4) én JSON-fasit for kanonisk kwargs-oversettelse kjørt av både pytest og node.

**Tech Stack:** Vanilla JS (IIFE-moduler, node --test), Python (openstat.py, pytest), ingen nye avhengigheter.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-15-stabiliseringsrunden-design.md` — les den først.
- Testkommandoer (alle må være grønne før hver commit): `node --test 'tests/js/*.test.js'` (ANFØRSELSTEGN rundt globben — uten dem feiler node på katalogform), `python3 -m pytest tests/test_openstat.py -q` (fra repo-rot), og for edge-endringer `cd netlify/edge-functions && deno test --allow-all _lib/`. Denne runden rører IKKE edge-funksjonene.
- Live-batteriet kjøres KUN med `ASKSTAT_LIVE=1` — default-suitene skal forbli hermetiske og like raske som før.
- Stil: matchende IIFE/var-stil i js/-filer (ingen ESM/let-refaktorering), norske kommentarer som forklarer HVORFOR (målte feller), aldri «hva neste linje gjør».
- Kommentarkonvensjon: nye funksjoner refererer målingen som begrunner dem (f.eks. «målt norden-runden 2026-08-15»).
- Ingen endringer i netlify/edge-functions/, prompts/ eller data/sources/ i denne runden.
- Commit-meldinger: norsk, imperativ, med Co-Authored-By: Claude Fable 5 <noreply@anthropic.com> og Claude-Session: https://claude.ai/code/session_012djYDZPEB3YPGkECwgnmLi

---

### Task 1: FEIL-linja i prosessloggen

**Files:**
- Modify: `js/ai-chat.js` (runSvarLoop, ~linje 784–790 — blokka `if (pendingRun != null) { ... runResult = await handlers.onRunCode(pendingRun); ... }`)
- Test: `tests/js/run-kontrakt.test.js` (append)

**Interfaces:**
- Consumes: `handlers.onRunCode(script)` returnerer `{ok: boolean, result: string}` (mdAskExecuteScript-kontrakten; result starter med `'FEIL:\n'` ved feil og er allerede nøkkel-maskert).
- Produces: ved `ok === false` emitteres via `handlers.onProgress({text: '⚠️ Kjøring feilet: <første linje>'})` (samme handler-objekt som løkka alt bruker). Ingen ny API-flate.

- [ ] **Step 1: Skriv den feilende testen**

I `tests/js/run-kontrakt.test.js`, legg til en literal-kontrakttest i samme stil som fila alt bruker (den leser `js/ai-chat.js` som tekst og asserter literaler):

```js
test('runSvarLoop emitterer FEIL-linje til prosessloggen (spec 2026-08-15 §1)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  // Emisjonen skjer sentralt i løkka (én gang for ALLE kallere), etter onRunCode.
  assert.ok(src.includes("'⚠️ Kjøring feilet: '"), 'FEIL-prosesslinje-literalen mangler');
  // FEIL:\n-prefikset er kontrakt mot modellen og skal strippes i visningen.
  assert.ok(src.includes("replace(/^FEIL:\\n/"), 'FEIL-prefiks-strippingen mangler');
});
```

- [ ] **Step 2: Kjør testen — skal feile**

Run: `node --test tests/js/run-kontrakt.test.js`
Expected: FAIL («FEIL-prosesslinje-literalen mangler»)

- [ ] **Step 3: Implementer emisjonen**

I `js/ai-chat.js`, i `if (pendingRun != null) {`-blokka, rett etter `runResult = await handlers.onRunCode(pendingRun);`:

```js
            // FEIL-linja i prosessloggen (spec 2026-08-15 §1, målt: tre
            // blinddiagnose-runder fordi run_result-FEIL aldri var synlig
            // for mennesker). Sentralt her — begge kallere (ask-view og
            // AI-panelet) får den via sin egen onProgress. Teksten er
            // alt nøkkel-maskert av mdAskExecuteScript.
            if (runResult && runResult.ok === false && handlers.onProgress) {
              var feilLinje = String(runResult.result || '')
                .replace(/^FEIL:\n/, '').split('\n')[0].slice(0, 160);
              if (feilLinje) handlers.onProgress({ text: '⚠️ Kjøring feilet: ' + feilLinje });
            }
```

NB: `handlers.onProgress` tar `{text, replace?}` — se eksisterende kall i samme fil. Ikke sett `replace` (linja skal bli stående).

- [ ] **Step 4: Kjør testene**

Run: `node --test tests/js/run-kontrakt.test.js` → PASS, deretter `node --test 'tests/js/*.test.js'` → alle grønne (1384+).

- [ ] **Step 5: Commit**

```bash
git add js/ai-chat.js tests/js/run-kontrakt.test.js
git commit -m "feat: kjørefeil synlige i prosessloggen (spec 2026-08-15 §1)"
```

---

### Task 2: Bare-alias i ekte Python

**Files:**
- Modify: `openstat.py` (ny `_REGISTRY`-modulvariabel + `connect_alias(id)`; plasser rett etter `def connect(url, kind=None)`)
- Modify: `index.html` (~linje 10642, seamen der `pyodide_http.patch_urllib()` kjøres — samme boot-område)
- Test: `tests/test_openstat.py` (append)

**Interfaces:**
- Consumes: `Source(url, kind)` (eksisterende konstruktør), `DataLoader.loadRegistry()` (async, JS, returnerer register-listen med feltene `id`, `base_url`, `kind`, `tilgang`).
- Produces: `ost.connect_alias(id) -> Source` og `ost._REGISTRY: list[dict]` (settes utenfra). Boot-koden binder toppnivå-navn i pyodides globals.

- [ ] **Step 1: Skriv de feilende testene**

I `tests/test_openstat.py`:

```python
def test_connect_alias_binder_registerkilder():
    # Bare-alias som ekte kode (spec 2026-08-15 §2, målt norden-runden:
    # NameError på eurostat.read → «adapteren er ikke tilgjengelig»).
    gammel = ost._REGISTRY
    ost._REGISTRY = [
        {"id": "eurostat", "base_url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data", "kind": "eurostat"},
        {"id": "ssb", "base_url": "https://data.ssb.no/api/pxwebapi/v2/tables", "kind": "pxweb"},
    ]
    try:
        e = ost.connect_alias("eurostat")
        assert e.kind == "eurostat"
        s = ost.connect_alias("ssb")
        assert s.kind == "pxweb"
        with pytest.raises(ValueError, match="ukjent kilde 'nope'"):
            ost.connect_alias("nope")
    finally:
        ost._REGISTRY = gammel
```

NB: sjekk hvordan `Source` eksponerer kind (attributt-navnet kan være `self.kind` — les klassen; juster asserten til det reelle navnet, aldri omvendt).

- [ ] **Step 2: Kjør testen — skal feile**

Run: `python3 -m pytest tests/test_openstat.py -q -k connect_alias`
Expected: FAIL (AttributeError: no attribute '_REGISTRY' / 'connect_alias')

- [ ] **Step 3: Implementer i openstat.py**

Rett etter `def connect(url, kind=None):`-blokka:

```python
# Bare-alias som ekte kode (spec 2026-08-15 §2, målt norden-runden
# 2026-08-15: modellen skrev eurostat.read(...) som kjørbar Python og
# fikk NameError — prompten (EVAL-regel 1) lærer formen, så miljøet må
# holde det den lover). _REGISTRY settes av appens boot-kode (JS eier
# kind-avledningen — én kilde til sannhet om registeret); utenfor appen
# er lista tom og connect_alias feiler instruktivt.
_REGISTRY = []


def connect_alias(source_id):
    for e in _REGISTRY:
        if e.get("id") == source_id:
            return Source(e.get("base_url"), e.get("kind") or None)
    raise ValueError("ukjent kilde '" + str(source_id) + "' — utenfor appen: bruk "
                     "ost.connect(url, kind=...) med kildens base-URL")
```

- [ ] **Step 4: Kjør testene**

Run: `python3 -m pytest tests/test_openstat.py -q`
Expected: alle grønne (82+).

- [ ] **Step 5: Boot-bindingen i index.html**

Finn seamen ved ~linje 10642 (`await pyodide.runPythonAsync('import pyodide_http\npyodide_http.patch_urllib()');`). Legg til, ETTER at openstat/ost er importert i samme boot-løp (let etter hvor `ost`/openstat lastes i nærheten — bindingen MÅ skje etter den importen):

```js
      // Bare-alias som ekte kode (spec 2026-08-15 §2): bind registerkildene
      // som toppnivå-navn (ssb, eurostat, …) så modellens naturlige
      // eurostat.read(...) virker som kjørbar Python — miljøet holder det
      // EVAL-regel 1 lover. Idempotent og fail-open: registerfeil skal
      // aldri knekke Python-booten.
      try {
        var regAlias = await window.DataLoader.loadRegistry();
        var forPy = (regAlias || []).map(function (r) {
          return { id: r.id, base_url: r.base_url,
                   kind: r.kind || (r.tilgang === 'pxweb' || r.tilgang === 'sdmx' ? r.tilgang : null) };
        }).filter(function (r) { return r.id && r.base_url && /^[a-z0-9_]+$/.test(r.id); });
        pyodide.globals.set('_OST_REGISTRY_JSON', JSON.stringify(forPy));
        await pyodide.runPythonAsync(
          'import json as _j\n' +
          'import openstat as _ost_mod\n' +
          '_ost_mod._REGISTRY = _j.loads(_OST_REGISTRY_JSON)\n' +
          'for _e in _ost_mod._REGISTRY:\n' +
          '    globals().setdefault(_e["id"], _ost_mod.connect_alias(_e["id"]))\n'
        );
      } catch (eAlias) { console.warn('alias-binding hoppet over:', eAlias); }
```

NB 1: modulnavnet i pyodide kan være `openstat` eller noe annet — finn hvordan openstat.py faktisk importeres i boot-koden i nærheten (søk `openstat` i index.html) og bruk samme navn/mekanisme. NB 2: `globals().setdefault` = brukerkode som alt har definert navnet, vinner. NB 3: id-regexen utelukker bindestrek-id-er (ugyldige som Python-navn) — det er riktig, ikke en bug.

- [ ] **Step 6: Verifiser boot-koden statisk**

Ingen browser-test i denne runden (batteriet i Task 3 dekker adapterlaget; Hans' røyk dekker booten). Kjør `node --test 'tests/js/*.test.js'` (index.html-endringen skal ikke knekke noe) og les diffen én gang til mot NB-punktene i Step 5.

- [ ] **Step 7: Commit**

```bash
git add openstat.py index.html tests/test_openstat.py
git commit -m "feat: bare-alias (ssb/eurostat/...) som ekte Python via connect_alias + boot-binding (spec §2)"
```

---

### Task 3: Adapter-batteriet (live-API-tester)

**Files:**
- Create: `tests/test_adapter_battery.py`
- Create: `tests/js/adapter-battery.test.js`

**Interfaces:**
- Consumes: `ost.connect(url, kind=...).read(...)` (python), `DataDirectives.translateCanonical(kind, rest, c)` + `PX.dataUrl`/`PX.eurostatDataUrl` (JS, se js/pxweb.js api-eksporten).
- Produces: ingenting nytt — kun tester. Kjøres KUN med `ASKSTAT_LIVE=1`.

- [ ] **Step 1: Python-batteriet**

`tests/test_adapter_battery.py` (hele fila):

```python
"""Adapter-batteriet (spec 2026-08-15 §3): representative, spørsmålsformede
live-lesinger per styrt kilde — så adaptergap oppdages i CI/lokalt, ikke i
Hans' neste manuelle røyk. Kjøres KUN med ASKSTAT_LIVE=1 (default-suitene
er hermetiske):  ASKSTAT_LIVE=1 python3 -m pytest tests/test_adapter_battery.py -q
Basert på målte feilklasser: eurostat kommaform-stille-tomt (norden-runden),
ssb aggregat-via-utelatelse (Oslo-runde 9)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import openstat as ost  # noqa: E402

live = pytest.mark.skipif(not os.environ.get("ASKSTAT_LIVE"),
                          reason="live-API-batteri — sett ASKSTAT_LIVE=1")

SSB = "https://data.ssb.no/api/pxwebapi/v2/tables"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"


@live
def test_ssb_kommune_aarserie():
    df = ost.connect(SSB, kind="pxweb").read(
        "07459", regions=["0301"], years="2015:2024", indicators=["Personer1"])
    assert len(df) > 0
    assert df["value"].notna().any()


@live
def test_ssb_aggregat_via_utelatte_eliminerbare_dims():
    # Oslo-runde 9: modellen gjettet Kjonn=0/Alder=000 — riktig form er å
    # UTELATE eliminerbare dimensjoner; da svarer PxWeb med aggregatet.
    df = ost.connect(SSB, kind="pxweb").read(
        "07459", regions=["0301"], years="2023:2024", indicators=["Personer1"])
    assert len(df) > 0


@live
def test_eurostat_flerland_maanedsserie():
    # Norden-runden: kommaformen geo=NO,SE svarer Eurostat STILLE TOMT på —
    # liste-verdier skal bli én param per verdi og gi data for alle fem.
    df = ost.connect(EUROSTAT, kind="eurostat").read(
        "ei_lmhr_m", filters={"geo": ["DK", "FI", "IS", "NO", "SE"], "s_adj": "SA"},
        years="2024:2026")
    assert len(df) > 0
    assert set(df["geo"].unique()) >= {"DK", "FI", "IS", "NO", "SE"}


@live
def test_norgesbank_valutakurs():
    df = ost.connect("https://data.norges-bank.no/api/data", kind="sdmx").read(
        "EXR", years="2024:2025", filters={"BASE_CUR": "USD", "QUOTE_CUR": "NOK", "FREQ": "M"})
    assert len(df) > 0
```

NB: sdmx-signaturen (flowRef-form, filternavn) kan avvike — les eksisterende sdmx-tester i tests/test_openstat.py (`test_read_sdmx_kanonisk_med_introspeksjon`) og norgesbank-guiden i data/sources/, og juster caset til den formen som faktisk er dokumentert/testet. Å endre openstat.py for å få batteriet grønt er UTENFOR denne taskens scope — feiler et case pga. en reell adapterbug, marker caset `@pytest.mark.xfail(reason="<målt gap — beskriv>")` og rapporter det i din DONE-rapport.

- [ ] **Step 2: Kjør batteriet live**

Run: `ASKSTAT_LIVE=1 python3 -m pytest tests/test_adapter_battery.py -q`
Expected: grønt (eller xfail med begrunnelse per NB over). Uten flagg: alt skippes.

- [ ] **Step 3: JS-batteriet**

`tests/js/adapter-battery.test.js` (hele fila):

```js
// Adapter-batteriet, JS-siden (spec 2026-08-15 §3): bygg URL-ene via samme
// oversettelse som direktivveien bruker, hent LIVE, assert ikke-tomt
// (assertHarDatarader-kontrakten). Kjøres KUN med ASKSTAT_LIVE=1:
//   ASKSTAT_LIVE=1 node --test tests/js/adapter-battery.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/data-directives.js');
const PX = require('../../js/pxweb.js');
const DD = globalThis.DataDirectives;
const LIVE = !!process.env.ASKSTAT_LIVE;

test('eurostat flerland via translateCanonical gir data live', { skip: !LIVE && 'sett ASKSTAT_LIVE=1' }, async () => {
  const tr = DD.translateCanonical('eurostat', 'ei_lmhr_m', {
    filters: { geo: ['DK', 'FI', 'IS', 'NO', 'SE'], s_adj: 'SA' },
    years: { from: '2024', to: '2026' },
  });
  assert.ok(!tr.error, tr.error);
  const base = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ei_lmhr_m';
  const url = PX.eurostatDataUrl(base + '?' + tr.params.join('&'));
  const res = await fetch(url);
  assert.equal(res.ok, true);
  const ds = await res.json();
  const cols = PX.columnsFromJsonStat(ds);
  assert.ok((cols.value || []).some((v) => v !== null), 'stille tomt — kommaform-regresjonen?');
});

test('ssb kommuneserie via translateCanonical gir data live', { skip: !LIVE && 'sett ASKSTAT_LIVE=1' }, async () => {
  const tr = DD.translateCanonical('pxweb', '07459', {
    regions: ['0301'], indicators: ['Personer1'],
    years: { from: '2015', to: '2024' },
  });
  assert.ok(!tr.error, tr.error);
  const url = PX.dataUrl('https://data.ssb.no/api/pxwebapi/v2/tables/07459?' + tr.params.join('&'));
  const res = await fetch(url);
  assert.equal(res.ok, true);
  const ds = await res.json();
  const cols = PX.columnsFromJsonStat(ds);
  assert.ok((cols.value || []).some((v) => v !== null));
});
```

NB: `translateCanonical`-returformen — les funksjonen (js/data-directives.js ~37) for om params ligger i `tr.params` eller annen form (`out.params`?); juster til det reelle. `rest`-argumentets rolle likeså. Skip-formen `{ skip: !LIVE && '...' }` er node:test-standard.

- [ ] **Step 4: Kjør begge veier**

Run: `ASKSTAT_LIVE=1 node --test tests/js/adapter-battery.test.js` → grønt. `node --test 'tests/js/*.test.js'` (uten flagg) → alle grønne og like raske som før (skip).

- [ ] **Step 5: Commit**

```bash
git add tests/test_adapter_battery.py tests/js/adapter-battery.test.js
git commit -m "test: adapter-batteri per styrt kilde bak ASKSTAT_LIVE=1 (spec §3)"
```

---

### Task 4: Delte kontrakt-caser (paritetsvern)

**Files:**
- Create: `tests/contract/canonical-cases.json`
- Create: `tests/js/canonical-contract.test.js`
- Modify: `tests/test_openstat.py` (append kjøreren)

**Interfaces:**
- Consumes: `ost._translate_canonical(kind, rest, c)` (python — returnerer `(rest, params, needs_key, client_years)`, kaster ValueError på feilcaser), `DataDirectives.translateCanonical(kind, rest, c)` (JS — returnerer objekt med params/rest eller `{error}`).
- Produces: `tests/contract/canonical-cases.json` — fasitfila begge kjørere leser.

- [ ] **Step 1: Skriv fasitfila**

`tests/contract/canonical-cases.json`:

```json
{
  "kommentar": "Delt fasit for kanonisk kwargs-oversettelse (spec 2026-08-15 §4). Kjøres av tests/test_openstat.py (python) og tests/js/canonical-contract.test.js (node). params sammenlignes SORTERT — rekkefølge er ikke del av kontrakten. Målt bakgrunn: eurostat-liste-fiksen fantes kun i JS 2026-08-05..15.",
  "cases": [
    { "name": "eurostat liste-i-filters gir en param per verdi",
      "kind": "eurostat", "rest": "ei_lmhr_m",
      "canonical": { "filters": { "geo": ["NO", "SE", "DK"], "s_adj": "SA" } },
      "expect_params": ["geo=NO", "geo=SE", "geo=DK", "s_adj=SA"] },
    { "name": "eurostat countries+years+skalarfilter",
      "kind": "eurostat", "rest": "nama_10_gdp",
      "canonical": { "countries": ["NO", "SE"], "years": { "from": "2020", "to": "2024" },
                     "filters": { "na_item": "B1GQ" } },
      "expect_params": ["geo=NO", "geo=SE", "sinceTimePeriod=2020", "untilTimePeriod=2024", "na_item=B1GQ"] },
    { "name": "pxweb regions+indicators+years-enumerering",
      "kind": "pxweb", "rest": "07459",
      "canonical": { "regions": ["0301"], "indicators": ["Personer1"],
                     "years": { "from": "2007", "to": "2009" } },
      "expect_params": ["valueCodes[Region]=0301", "valueCodes[ContentsCode]=Personer1", "valueCodes[Tid]=2007,2008,2009"] },
    { "name": "pxweb aapen years gir from()",
      "kind": "pxweb", "rest": "07459",
      "canonical": { "years": { "from": "2007", "to": null } },
      "expect_params": ["valueCodes[Tid]=from(2007)"] },
    { "name": "pxweb liste-i-filters joines med komma",
      "kind": "pxweb", "rest": "07459",
      "canonical": { "filters": { "Kjonn": ["1", "2"] } },
      "expect_params": ["valueCodes[Kjonn]=1,2"] },
    { "name": "worldbank sti-form + date",
      "kind": "worldbank", "rest": "",
      "canonical": { "indicators": ["NY.GDP.MKTP.CD"], "countries": ["NOR", "SWE"],
                     "years": { "from": "2015", "to": "2024" } },
      "expect_rest": "country/NOR;SWE/indicator/NY.GDP.MKTP.CD",
      "expect_params": ["date=2015:2024"] },
    { "name": "worldbank indicators sammen med sti er konflikt",
      "kind": "worldbank", "rest": "country/NOR/indicator/A",
      "canonical": { "indicators": ["B"] },
      "expect_error": "én form" },
    { "name": "pxweb years uten startaar er feil",
      "kind": "pxweb", "rest": "07459",
      "canonical": { "years": { "from": null, "to": "2009" } },
      "expect_error": "startår" }
  ]
}
```

- [ ] **Step 2: Python-kjøreren (feiler først hvis paritetsbrudd)**

Append i `tests/test_openstat.py`:

```python
def _kontrakt_caser():
    import json
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contract", "canonical-cases.json")
    with open(p, encoding="utf-8") as f:
        return [c for c in json.load(f)["cases"] if c.get("only") in (None, "py")]


@pytest.mark.parametrize("case", _kontrakt_caser(), ids=lambda c: c["name"])
def test_kanonisk_kontrakt(case):
    # Paritetsvernet (spec 2026-08-15 §4): samme fasit kjøres av node —
    # driftes én side, feiler den siden her/der, aldri stille.
    if case.get("expect_error"):
        with pytest.raises(ValueError, match=case["expect_error"]):
            ost._translate_canonical(case["kind"], case.get("rest", ""), case["canonical"])
        return
    rest, params, _, _ = ost._translate_canonical(case["kind"], case.get("rest", ""), case["canonical"])
    assert sorted(params) == sorted(case["expect_params"])
    if "expect_rest" in case:
        assert rest == case["expect_rest"]
```

NB: `os` er antakelig alt importert i testfila — sjekk toppen.

- [ ] **Step 3: Node-kjøreren**

`tests/js/canonical-contract.test.js` (hele fila):

```js
// Paritetsvernet (spec 2026-08-15 §4): samme fasit som pytest kjører —
// JS- og python-oversettelsen kan ikke drifte stille igjen (målt:
// eurostat-liste-fiksen fantes kun i JS 2026-08-05..15).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

const fasit = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'contract', 'canonical-cases.json'), 'utf8'));

for (const c of fasit.cases) {
  if (c.only && c.only !== 'js') continue;
  test('kontrakt: ' + c.name, () => {
    const tr = DD.translateCanonical(c.kind, c.rest || '', c.canonical);
    if (c.expect_error) {
      assert.ok(tr && tr.error, 'ventet feilcase');
      assert.match(tr.error, new RegExp(c.expect_error));
      return;
    }
    assert.ok(!tr.error, tr.error);
    assert.deepEqual([...tr.params].sort(), [...c.expect_params].sort());
    if (c.expect_rest !== undefined) assert.equal(tr.rest, c.expect_rest);
  });
}
```

NB: JS-returformen (feltnavn for params/rest; kanskje `out.rest`/`out.params`) og canonical-formen JS forventer (`years` som `{from, to}`? `filters`-nøkkelnavn?) — LES translateCanonical (js/data-directives.js ~37) og parse-laget som bygger canonical-objektet, og juster kjøreren (IKKE fasit-verdiene) til den reelle formen. Avdekker kjøringen et REELT paritetsbrudd (ulik oversettelse), er det et funn: fiks den siden som avviker fra fasiten hvis det er et en-linjes hull, ellers marker caset med `only` og rapporter bruddet tydelig i DONE-rapporten.

- [ ] **Step 4: Kjør begge kjørere**

Run: `python3 -m pytest tests/test_openstat.py -q` og `node --test tests/js/canonical-contract.test.js`, deretter `node --test 'tests/js/*.test.js'`.
Expected: alt grønt.

- [ ] **Step 5: Commit**

```bash
git add tests/contract/canonical-cases.json tests/js/canonical-contract.test.js tests/test_openstat.py
git commit -m "test: delt kontrakt-fasit for kanonisk oversettelse, pytest+node (spec §4)"
```
