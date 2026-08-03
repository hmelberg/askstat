# Datasøk og nedlasting fase 1+2 — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feiltelemetri til Anvil + bibliotek-spike (fase 1) og herding av lasteveien (fase 2) per spec `docs/superpowers/specs/2026-08-03-datasok-og-nedlasting-v1-design.md`. Fase 3 (fire kilder) får egen plan når basen er inne.

**Architecture:** Klient-side telemetrimodul (fire-and-forget → dumt Anvil-endepunkt i microdata-api); feilkropper og tomt-uttrekk-vakter i den eksisterende lastepipelinen (`js/data-loader.js`, `probe.ts`); prompt- og budsjettendringer i `svar-prompt.ts` med drift-tester som låser tall og hint til virkeligheten.

**Tech Stack:** Vanilla JS (IIFE-moduler, node --test), Deno/TypeScript edge-funksjoner (deno test), Anvil server-Python (pytest for ren logikk).

## Global Constraints

- Brukervendte feilstrenger på norsk; ask-visningens UI-tekster på engelsk (dagens konvensjon per fil beholdes).
- Budsjett-tallene finnes TO steder (runtime-knotter + DEPTH-prompttabellen) — endres alltid sammen; Task 7 håndhever det med test.
- `js/data-loader.js` sin pxweb-400-oversettelse matcher på `/(HTTP|proxy) 400 /` — nye feilmeldinger må BEHOLDE prefikset `proxy <status> for <alias>` / `HTTP <status> for <alias>` og kun APPENDE bak.
- Telemetri: alltid `DataDirectives.scrubKeys` på script; aldri BYOK-/kilde-nøkler eller provider-config utover typestreng; fire-and-forget (egne feil svelges stille).
- Ingen nye runtime-avhengigheter i noen av appene.
- Testkommandoer: `node --test tests/js/` (askstat-rot), `cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/`, `python3 -m pytest` (microdata-api-rot).
- Commits per task; **push skjer først i Task 12** (askstat = Netlify-autodeploy) etter Hans' smoke. microdata-api pushes i Task 1 (krever uansett Anvil-pull av Hans før endepunktet er live — telemetriklienten tåler 404 i mellomtiden).

## File Structure

**microdata-api** (`/Users/hom/Documents/GitHub/microdata-api/`):
- Create `server_code/feil_validering.py` — ren validering (ingen anvil-imports, pytest-bar).
- Create `server_code/feil_endpoints.py` — POST `/feil`, lagrer i tabell, nøkkelfritt.
- Modify `anvil.yaml` — `feilrapporter`-tabell i `db_schema`.
- Create `tests/test_feil_validering.py`.

**askstat** (`/Users/hom/Documents/GitHub/askstat/`):
- Create `js/feil-telemetri.js` — byggFeilrapport (ren) + sendFeilrapport (fetch keepalive).
- Modify `js/ask-view.js` — samle feilede runs i `runAskFlow`, send ved flytslutt/katastrofe.
- Modify `index.html` — script-tag for feil-telemetri.js.
- Create `tests/js/feil-telemetri.test.js`.
- Create `docs/2026-08-spike-wbgapi-sdmx1.md` — spike-memo (Task 4).
- Modify `js/data-loader.js` — `httpFeilMedKropp` + `assertHarDatarader`.
- Create `netlify/edge-functions/_lib/data-loader-feilkropp.test.ts`.
- Modify `netlify/edge-functions/_lib/tools/probe.ts` — 0-datarader-noter.
- Modify `netlify/edge-functions/_lib/tools/probe.test.ts` — nye tester (append).
- Modify `netlify/edge-functions/_lib/svar-prompt.ts` — budsjetter, DEKNINGSSJEKK-regel, omstartsregel, `ROUTING`-blokk, `coercePreferences` + preferanseblokk.
- Create `netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts`.
- Create `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts`.
- Modify `netlify/edge-functions/svar.ts` — `preferences`-felt.
- Create `netlify/edge-functions/_lib/tools/hints-parse.test.ts` — hint-må-parse.
- Create `data/source-guides/{eurostat,oecd,worldbank,dbnomics}.md`.
- Modify `data/data-sources.json` — `"guide": true` på de fire.
- Create `netlify/edge-functions/_lib/source-guides-drift.test.ts`.
- Modify `js/ai-chat.js` — `preferences` i svar-body; settings-dialog les/lagre.
- Modify `index.html` — Datapreferanser-textarea i settings-modalen.
- Modify `js/i18n/en.js` — to nye strenger.

---

### Task 1: Anvil-endepunkt `/feil` i microdata-api

**Files:**
- Create: `/Users/hom/Documents/GitHub/microdata-api/server_code/feil_validering.py`
- Create: `/Users/hom/Documents/GitHub/microdata-api/server_code/feil_endpoints.py`
- Modify: `/Users/hom/Documents/GitHub/microdata-api/anvil.yaml` (db_schema)
- Test: `/Users/hom/Documents/GitHub/microdata-api/tests/test_feil_validering.py`

**Interfaces:**
- Consumes: ingenting (frittstående).
- Produces: `POST https://mdataapi.anvil.app/_/api/feil` — body: JSON-objekt med minst `app: string`; svar 204 ved lagret, 400 ved ugyldig/for stor. Task 2 poster hit.
- `valider_feilrapport(raw: bytes) -> tuple[bool, str | None, str | None]` (ok, payload_tekst, feilmelding).

- [ ] **Step 1: Sjekk testkonvensjonen i microdata-api**

Run: `ls /Users/hom/Documents/GitHub/microdata-api/tests/ 2>/dev/null; head -30 /Users/hom/Documents/GitHub/microdata-api/conftest.py`
Finnes ingen `tests/`-katalog: opprett den. Merk hvordan conftest gjør `server_code` importerbar (typisk `sys.path.insert`); gjenbruk mønsteret — `feil_validering` importerer IKKE anvil, så stubs trengs ikke.

- [ ] **Step 2: Skriv feilende test**

`tests/test_feil_validering.py`:

```python
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server_code"))

import feil_validering  # noqa: E402


def test_gyldig_rapport_gir_ok_og_json_tekst():
    raw = json.dumps({"app": "askstat", "runs": []}).encode("utf-8")
    ok, payload, feil = feil_validering.valider_feilrapport(raw)
    assert ok and feil is None
    assert json.loads(payload)["app"] == "askstat"


def test_for_stor_kropp_avvises():
    raw = json.dumps({"app": "askstat", "x": "a" * 300_000}).encode("utf-8")
    ok, payload, feil = feil_validering.valider_feilrapport(raw)
    assert not ok and "for stor" in feil


def test_ugyldig_json_og_manglende_app_avvises():
    assert not feil_validering.valider_feilrapport(b"ikke json")[0]
    assert not feil_validering.valider_feilrapport(b'{"uten_app": 1}')[0]
    assert not feil_validering.valider_feilrapport(b'[1,2]')[0]
    assert not feil_validering.valider_feilrapport(None)[0]
```

(Bruk repoets eget import-mønster fra Step 1 i stedet for sys.path-linjen hvis conftest allerede ordner det.)

- [ ] **Step 3: Kjør testen — skal feile**

Run: `cd /Users/hom/Documents/GitHub/microdata-api && python3 -m pytest tests/test_feil_validering.py -q`
Expected: FAIL/ERROR (`ModuleNotFoundError: feil_validering`)

- [ ] **Step 4: Implementer valideringen**

`server_code/feil_validering.py`:

```python
"""Ren validering for /feil-endepunktet (ingen anvil-imports — pytest-bar).

Kontrakt (askstat-spec 2026-08-03-datasok-og-nedlasting-v1-design.md §1a):
endepunktet er bevisst dumt — parse + størrelsesvakt, ingen skjemavalidering
utover toppnivåform. Payloaden lagres som JSON-tekst; analyse skjer offline.
"""
import json

MAX_BYTES = 200_000


def valider_feilrapport(raw):
    """raw: bytes | None -> (ok, payload_tekst | None, feilmelding | None)."""
    if not raw:
        return False, None, "tom kropp"
    if len(raw) > MAX_BYTES:
        return False, None, f"for stor ({len(raw)} > {MAX_BYTES} bytes)"
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        return False, None, f"ugyldig JSON: {e}"
    if not isinstance(obj, dict) or not isinstance(obj.get("app"), str):
        return False, None, "toppnivå må være et objekt med app-felt (streng)"
    return True, json.dumps(obj, ensure_ascii=False), None
```

- [ ] **Step 5: Kjør testen — skal passere**

Run: `cd /Users/hom/Documents/GitHub/microdata-api && python3 -m pytest tests/test_feil_validering.py -q`
Expected: 3 passed

- [ ] **Step 6: Endepunkt + tabellskjema**

`server_code/feil_endpoints.py`:

```python
"""POST /feil — mottak av feilrapporter fra askstat (spec i askstat-repoet:
docs/superpowers/specs/2026-08-03-datasok-og-nedlasting-v1-design.md §1a).

Bevisst dumt og NØKKELFRITT (avsenderen er en nettleser uten hemmeligheter):
størrelsesvakt + JSON-parse + lagre rått. Aldri mer logikk her — endepunktet
skal aldri trenge en ny Anvil-synk. Analyse: eksporter tabellen, jobb offline.
"""
import datetime

import anvil.server
from anvil.server import HttpResponse
from anvil.tables import app_tables

import feil_validering


@anvil.server.http_endpoint("/feil", methods=["POST"], cross_site_session=False, enable_cors=True)
def http_feil():
    req = anvil.server.request
    raw = req.body.get_bytes() if req.body else b""
    ok, payload, feil = feil_validering.valider_feilrapport(raw)
    if not ok:
        return HttpResponse(400, feil)
    app_tables.feilrapporter.add_row(
        mottatt=datetime.datetime.now(datetime.timezone.utc), payload=payload)
    return HttpResponse(204, "")
```

I `anvil.yaml` under `db_schema:` (alfabetisk plassering blant tabellene, samme feltform som naboene):

```yaml
  feilrapporter:
    client: none
    columns:
    - admin_ui: {}
      client_hidden: null
      name: mottatt
      type: datetime
    - admin_ui: {}
      client_hidden: null
      name: payload
      type: string
    indexes: []
    server: full
    title: feilrapporter
```

- [ ] **Step 7: Kjør hele microdata-api-testsuiten**

Run: `cd /Users/hom/Documents/GitHub/microdata-api && python3 -m pytest -q`
Expected: alt grønt (nye + eksisterende).

- [ ] **Step 8: Commit + push (microdata-api)**

```bash
cd /Users/hom/Documents/GitHub/microdata-api
git add server_code/feil_validering.py server_code/feil_endpoints.py anvil.yaml tests/test_feil_validering.py
git commit -m "feat(feil): dumt POST /feil-endepunkt for askstat-feiltelemetri"
git push
```

Si eksplisitt i oppsummeringen: **Hans må pulle i Anvil-editoren** før endepunktet er live. Telemetriklienten (Task 2) tåler 404 i mellomtiden (fire-and-forget).

---

### Task 2: Telemetriklient i askstat + wiring i ask-flyten

**Files:**
- Create: `js/feil-telemetri.js`
- Modify: `js/ask-view.js` (runAskFlow)
- Modify: `index.html` (script-tag)
- Test: `tests/js/feil-telemetri.test.js`

**Interfaces:**
- Consumes: `DataDirectives.scrubKeys(script)` (js/data-directives.js); `POST /_/api/feil` fra Task 1; `window.M2PY_VERSION`; `window.mdAiProviderConfig()`.
- Produces: `window.FeilTelemetri.byggFeilrapport(inn, deps?) -> objekt` og `window.FeilTelemetri.sendFeilrapport(inn) -> void`. `inn`: `{version, ui_lang, mode, route, depth, question, tolkning, runs: [{script, error}], flow_error?, final_ok, probed_sources: string[], provider_type}`.

- [ ] **Step 1: Skriv feilende test**

`tests/js/feil-telemetri.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const FT = require('../../js/feil-telemetri.js');

test('byggFeilrapport skrubber, klipper og setter faste felter', () => {
  const r = FT.byggFeilrapport({
    question: 'q', route: 'data', final_ok: false,
    runs: [{ script: 'x'.repeat(30000), error: 'e'.repeat(9000) }],
  }, { scrub: (s) => s.replace(/x/g, 'y') });
  assert.equal(r.app, 'askstat');
  assert.equal(r.route, 'data');
  assert.equal(r.runs[0].script.length, 20000);
  assert.ok(r.runs[0].script.startsWith('yyyy'));       // scrub kjørte FØR klipp
  assert.equal(r.runs[0].error.length, 4000);
  assert.equal(r.final_ok, false);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(r.ts));
});

test('byggFeilrapport dropper ELDSTE runs over payload-taket', () => {
  const runs = Array.from({ length: 20 }, (_, i) =>
    ({ script: String(i) + '|' + 'a'.repeat(15000), error: 'e' }));
  const r = FT.byggFeilrapport({ runs }, { scrub: (s) => s });
  assert.ok(JSON.stringify(r).length <= 200000);
  assert.ok(r.runs.length < 20);
  assert.ok(r.runs[r.runs.length - 1].script.startsWith('19|'));  // nyeste beholdes
});

test('flow_error tas med, tom utelates', () => {
  const med = FT.byggFeilrapport({ flow_error: 'strømmen røk' }, { scrub: (s) => s });
  assert.equal(med.flow_error, 'strømmen røk');
  const uten = FT.byggFeilrapport({}, { scrub: (s) => s });
  assert.ok(!('flow_error' in uten) || uten.flow_error === undefined);
});
```

- [ ] **Step 2: Kjør testen — skal feile**

Run: `cd /Users/hom/Documents/GitHub/askstat && node --test tests/js/feil-telemetri.test.js`
Expected: FAIL (`Cannot find module '../../js/feil-telemetri.js'`)

- [ ] **Step 3: Implementer modulen**

`js/feil-telemetri.js`:

```js
// js/feil-telemetri.js — feilrapportering fra ask-flyten til Anvil
// (spec docs/superpowers/specs/2026-08-03-datasok-og-nedlasting-v1-design.md
// §1a). KUN feil sendes; fire-and-forget: egne feil svelges, ask-flyten
// bremses aldri. Endepunktet er dumt (lagrer rå JSON) — all analyse offline.
(function (global) {
  'use strict';

  var FEIL_URL = 'https://mdataapi.anvil.app/_/api/feil';
  var MAX_ERROR_CHARS = 4000;      // per run og for flow_error
  var MAX_SCRIPT_CHARS = 20000;    // per run
  var MAX_PAYLOAD_BYTES = 200000;  // matcher Anvil-sidens MAX_BYTES

  function klipp(s, n) { return String(s == null ? '' : s).slice(0, n); }

  // Ren og node-testbar. deps.scrub injiseres i test; produksjon bruker
  // DataDirectives.scrubKeys (aldri nøkler i telemetri — husregel).
  function byggFeilrapport(inn, deps) {
    inn = inn || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) ||
      function (s) { return s; };
    var rapport = {
      app: 'askstat',
      ts: new Date().toISOString(),
      version: inn.version || '',
      ui_lang: inn.ui_lang || '',
      mode: inn.mode || '',
      route: inn.route || '',
      depth: inn.depth || '',
      question: klipp(inn.question, 4000),
      tolkning: klipp(inn.tolkning, 2000),
      runs: (inn.runs || []).map(function (r) {
        return { script: klipp(scrub(r.script), MAX_SCRIPT_CHARS),
                 error: klipp(r.error, MAX_ERROR_CHARS) };
      }),
      flow_error: klipp(inn.flow_error, MAX_ERROR_CHARS) || undefined,
      final_ok: !!inn.final_ok,
      probed_sources: (inn.probed_sources || []).slice(0, 60),
      provider_type: inn.provider_type || 'anthropic',
    };
    // Størrelsestak: dropp ELDSTE runs til payloaden er under taket —
    // metadata + nyeste feil er mer verdt enn komplett scripthistorikk.
    while (JSON.stringify(rapport).length > MAX_PAYLOAD_BYTES && rapport.runs.length) {
      rapport.runs.shift();
    }
    return rapport;
  }

  function sendFeilrapport(inn) {
    try {
      var rapport = byggFeilrapport(inn);
      fetch(FEIL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rapport),
        keepalive: true,
      }).catch(function () { /* telemetri feiler stille */ });
    } catch (e) { /* aldri knekk flyten */ }
  }

  var api = { byggFeilrapport: byggFeilrapport, sendFeilrapport: sendFeilrapport };
  global.FeilTelemetri = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Kjør testen — skal passere**

Run: `node --test tests/js/feil-telemetri.test.js`
Expected: 3 pass

- [ ] **Step 5: Wire inn i runAskFlow (js/ask-view.js)**

I `runAskFlow` (js/ask-view.js, funksjonen rundt linje 701):

1. Rett etter `var uiLang = …`-linjen, legg til:

```js
      var feilRuns = [];
      var lastSources = [];
      function sendTelemetri(flowError) {
        if (!window.FeilTelemetri) return;
        if (!feilRuns.length && !flowError) return;
        window.FeilTelemetri.sendFeilrapport({
          version: window.M2PY_VERSION || '',
          ui_lang: uiLang,
          mode: currentAskMode(),
          route: route.rute,
          depth: askDepth(),
          question: question,
          tolkning: route.tolkning,
          runs: feilRuns,
          flow_error: flowError || undefined,
          final_ok: lastRunOk,
          probed_sources: lastSources,
          provider_type: (window.mdAiProviderConfig && window.mdAiProviderConfig() || {}).type || 'anthropic',
        });
      }
```

Merk: `route` deklareres først inne i `try` — flytt `var route = { rute: 'data', … }`-initialiseringen OPP før hjelperen (behold resten av trinn 1-logikken urørt), slik at `sendTelemetri` alltid ser den.

2. I `onRunCode`, etter `lastRunOk = r.ok;`:

```js
              if (!r.ok) feilRuns.push({ script: prefix + script, error: r.result });
```

3. Etter `var res = await window.mdSvarRun({ … });`, før svar-visningen:

```js
        lastSources = (res.sources || []).map(function (s) { return s.url; });
```

4. Nederst i `try` (etter siste `showAnswer`-gren): `sendTelemetri(null);`

5. I `catch`-grenen, i ikke-abort-tilfellet (else-grenen), FØR `showAnswer`:

```js
        sendTelemetri((e && e.message) ? e.message : String(e));
```

- [ ] **Step 6: Script-tag i index.html**

Finn script-taggen som laster `js/ask-view.js` (`grep -n "ask-view.js" index.html`) og legg til PÅ LINJEN FØR (feil-telemetri må være definert før ask-view initialiserer):

```html
    <script src="js/feil-telemetri.js"></script>
```

- [ ] **Step 7: Full JS-suite**

Run: `node --test tests/js/`
Expected: alt grønt (inkl. eksisterende ask-view.test.js — wiring-endringene er inne i DOM-delen som node-stubben hopper over).

- [ ] **Step 8: Commit**

```bash
git add js/feil-telemetri.js js/ask-view.js index.html tests/js/feil-telemetri.test.js
git commit -m "feat(telemetri): feilrapporter fra ask-flyten til Anvil (kun feil, fire-and-forget)"
```

---

### Task 3: CHECKPOINT — baseline-eval på dagens prod (Hans)

**Files:**
- Create: `docs/eval/2026-08-baseline.md`

**Interfaces:** ingen kode. Målepunktet FØR fase 2-endringene deployes (Task 12) — spec §Testing.

- [ ] **Step 1: Skriv baseline-skjema**

`docs/eval/2026-08-baseline.md`:

```markdown
# Baseline-kjøring før fase 2-herdingen (spec 2026-08-03 §Testing)

Kjørt på https://ask.melberg.app (commit: <fyll inn fra footer/versjon>),
dybde standard, python-modus, av Hans. Spørsmålene er data-rute-settet i
docs/eval/ask-evalsett.md.

| # | Spørsmål (kortform) | Runder (run_code) | Utfall (ok / feil / delvis) | Feiltype (transport / hint / modell / dekning) |
|---|---------------------|-------------------|------------------------------|-----------------------------------------------|
| 1 |                     |                   |                              |                                               |

## Notater

- <observasjoner>
```

- [ ] **Step 2: Be Hans kjøre settet**

Dette er et menneskesteg (token-økonomi: Hans tester selv i browser). Meld fra: «Baseline-skjemaet ligger i docs/eval/2026-08-baseline.md — kjør data-rute-spørsmålene fra ask-evalsett.md på prod når det passer, før vi pusher fase 2 (Task 12).» Task 4–11 kan fortsette uavhengig; Task 12 venter på at skjemaet har innhold.

- [ ] **Step 3: Commit skjemaet**

```bash
git add docs/eval/2026-08-baseline.md
git commit -m "docs(eval): baseline-skjema før fase 2-herdingen"
```

---

### Task 4: CHECKPOINT — spike: wbgapi/sdmx1 i Pyodide (Hans + memo)

**Files:**
- Create: `docs/2026-08-spike-wbgapi-sdmx1.md`

**Interfaces:** ingen produksjonskode. Leveransen er KJENNELSEN (spec §1b) — (a) virker → egen oppfølging senere; (b) virker ikke → ROADMAP-punktet lukkes. Spiken endrer ingen prompter/lastere.

- [ ] **Step 1: Skriv memo med kjørbare spike-scripts**

`docs/2026-08-spike-wbgapi-sdmx1.md`:

````markdown
# Spike: wbgapi/sdmx1 i Pyodide (ROADMAP «DSL vs. LLM-vaner» pkt 2)

**Hvordan:** åpne https://ask.melberg.app/?view=editor (python-modus) og kjør
scriptene under ETT AV GANGEN med Kjør-knappen. Noter utfall i tabellen.
(Manuelt spike-script — EVAL-regel 4 gjelder GENERERTE script, ikke dette.)

## Script 1 — virker requests i det hele tatt?

```python
import requests, sys
print("python:", sys.version)
r = requests.get("https://api.worldbank.org/v2/country/NOR/indicator/SP.POP.TOTL?format=json&per_page=3")
print("requests OK:", r.status_code, r.json()[0].get("total"))
```

## Script 2 — wbgapi

```python
import micropip
await micropip.install("wbgapi")
import wbgapi as wb
df = wb.data.DataFrame("SH.XPD.CHEX.GD.ZS", ["NOR", "SWE"], time=range(2015, 2023))
print(df.head())
print("WBGAPI OK, form:", df.shape)
```

## Script 3 — sdmx1

```python
import micropip
await micropip.install("sdmx1")
import sdmx
oecd = sdmx.Client("OECD")
fl = oecd.dataflow()
print("SDMX1 OK, antall dataflows:", len(fl.dataflow))
```

## Resultater

| Script | Install ok? | Nettkall ok? | Resultat/feilmelding |
|--------|-------------|--------------|----------------------|
| 1 requests |         |              |                      |
| 2 wbgapi   |         |              |                      |
| 3 sdmx1    |         |              |                      |

## Kjennelse

- [ ] **(a) virker rent** → egen oppfølging: prompt-tillatelse i python-modus;
      vurder å pensjonere håndrullet SDMX-nøkkelbygging (eget løp).
- [ ] **(b) virker ikke** → ROADMAP-punktet «DSL vs. LLM-vaner» pkt 2 lukkes
      med denne evidensen; `ost` beholder dagens omfang.

Begrunnelse: <fyll inn etter kjøring>
````

- [ ] **Step 2: Be Hans kjøre spiken og rapportere**

Menneskesteg: Hans limer inn resultatlinjene (eller et skjermbilde-referat). Agenten fyller ut tabellen + krysser kjennelsen og oppdaterer ROADMAP-punktet i `docs/ROADMAP.md` med én linje som peker på memoet.

- [ ] **Step 3: Commit**

```bash
git add docs/2026-08-spike-wbgapi-sdmx1.md docs/ROADMAP.md
git commit -m "docs(spike): wbgapi/sdmx1-i-Pyodide-memo med kjennelse"
```

---

### Task 5: Feilkropper fra oppstrøms inn i lastefeil

**Files:**
- Modify: `js/data-loader.js` (fetchLoadTarget ~linje 82–111, fetchRawUrl ~linje 118–147)
- Test: `netlify/edge-functions/_lib/data-loader-feilkropp.test.ts` (ny)

**Interfaces:**
- Consumes: dagens throw-steder i `fetchLoadTarget`/`fetchRawUrl`.
- Produces: feilmeldinger på formen `proxy 400 for <alias> — oppstrøms svar: <kropp≤1500 tegn>` / `HTTP 404 for <alias> (<url>) — oppstrøms svar: …`. Prefikset er UENDRET (pxweb-400-oversettelsens regex `/(HTTP|proxy) 400 /` består).

- [ ] **Step 1: Skriv feilende test**

`netlify/edge-functions/_lib/data-loader-feilkropp.test.ts`:

```ts
import { assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

for (const f of ["directive-parser.js", "data-directives.js", "api-kinds.js", "pxweb.js", "data-loader.js", "enc-crypto.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const DL = (globalThis as any).DataLoader;

Deno.test("lastefeil tar med oppstrøms feilkropp", async () => {
  DL._resetCacheForTests();
  const fetchImpl = (() => Promise.resolve(new Response(
    "Missing selection for mandatory variable Tid", { status: 400 }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = ost.read("https://kilde.example/tab.csv")',
      { fetchImpl, registry: [] }),
    Error, "oppstrøms svar: Missing selection");
});

Deno.test("fetchRawUrl tar med oppstrøms feilkropp", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("ukjent tabell", { status: 404 }))) as typeof fetch;
  await assertRejects(
    () => DL.fetchRawUrl("https://kilde.example/x.csv", { fetchImpl }),
    Error, "oppstrøms svar: ukjent tabell");
});

Deno.test("prefikset for pxweb-400-oversettelsen består", async () => {
  DL._resetCacheForTests();
  const fetchImpl = (() => Promise.resolve(new Response("detaljer", { status: 400 }))) as typeof fetch;
  const err = await DL.resolveAndFetchLoads('# x = ost.read("https://kilde.example/t.csv")',
    { fetchImpl, registry: [] }).then(() => null, (e: Error) => e);
  if (!err || !/HTTP 400 for x /.test(err.message)) {
    throw new Error("prefikset «HTTP 400 for x » mangler: " + (err && err.message));
  }
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/data-loader-feilkropp.test.ts`
Expected: FAIL (meldingen inneholder ikke «oppstrøms svar»)

- [ ] **Step 3: Implementer**

I `js/data-loader.js`, rett under `assertNotTruncated`:

```js
  // Feilkropper (spec 2026-08-03 §fase 2.1): oppstrøms feilkropp er ekstern
  // grunnsannhet («Missing selection for mandatory variable Tid») — ta den
  // med i kastet melding så run_code-FEIL-teksten navngir årsaken og
  // modellen kan reparere på ÉN runde. Prefikset («proxy 400 for x» /
  // «HTTP 400 for x») BEVARES — pxweb-400-oversettelsen i
  // fetchResolvedItems matcher på det.
  async function httpFeilMedKropp(resp, prefiks) {
    var kropp = '';
    try { kropp = (await resp.text()).slice(0, 1500).trim(); } catch (e) {}
    return new Error(prefiks + (kropp ? ' — oppstrøms svar: ' + kropp : ''));
  }
```

Bytt de fire throw-stedene:

- `fetchLoadTarget` → `viaProxy()`: `if (!pr.ok) throw await httpFeilMedKropp(pr, 'proxy ' + pr.status + ' for ' + item.alias);`
- `fetchLoadTarget` → `/api/hent`-grenen (`r0`): samme form med `r0`.
- `fetchLoadTarget` → direktegrenen (`r1`): `if (!r1.ok) throw await httpFeilMedKropp(r1, 'HTTP ' + r1.status + ' for ' + item.alias + ' (' + item.url + ')');`
- `fetchRawUrl`: begge `!ok`-stedene, med `url` i stedet for alias: `'proxy ' + pr.status + ' for ' + url` og `'HTTP ' + resp.status + ' for ' + url`.

- [ ] **Step 4: Kjør ny + eksisterende Deno-suite**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: alt grønt (data-loader.test.ts sine eksisterende feiltekst-asserts bruker samme prefiks).

- [ ] **Step 5: Node-suite (data-loader deles ikke der, men sjekk regresjon)**

Run: `node --test tests/js/`
Expected: grønt.

- [ ] **Step 6: Commit**

```bash
git add js/data-loader.js netlify/edge-functions/_lib/data-loader-feilkropp.test.ts
git commit -m "feat(lasting): oppstrøms feilkropp med i lastefeil — én-rundes reparasjon"
```

---

### Task 6: Tomt-uttrekk-vakt i lasteren + 0-datarader-note i probe

**Files:**
- Modify: `js/data-loader.js` (kind-stiene i fetchResolvedItems, ~linje 307–433)
- Modify: `netlify/edge-functions/_lib/tools/probe.ts` (inferSchema, ~linje 90–121)
- Test: `netlify/edge-functions/_lib/data-loader-feilkropp.test.ts` (append), `netlify/edge-functions/_lib/tools/probe.test.ts` (append)

**Interfaces:**
- Produces: `assertHarDatarader(csvText, alias)` i data-loader (kaster norsk, handlingsrettet feil ved 0 datarader); probe-noter som inneholder strengen `0 DATARADER`.

- [ ] **Step 1: Skriv feilende tester**

Append i `data-loader-feilkropp.test.ts`:

```ts
Deno.test("tomt worldbank-uttrekk kaster i stedet for å binde tom ramme", async () => {
  DL._resetCacheForTests();
  const registry = [{ id: "worldbank", navn: "WB", utgiver: "WB", tillit: "etablert",
    tilgang: "rest", kind: "worldbank", base_url: "https://api.worldbank.org/v2/", cors: true }];
  const fetchImpl = (() => Promise.resolve(new Response(
    JSON.stringify([{ page: 1, pages: 1, total: 0 }, []]),
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = worldbank.read("country/NOR/indicator/SP.POP.TOTL")',
      { fetchImpl, registry }),
    Error, "TOMT");
});
```

Append i `_lib/tools/probe.test.ts` (samme import/mønster som filens eksisterende tester — sjekk toppen av filen først):

```ts
Deno.test("probe flagger CSV med 0 datarader", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("kol1,kol2\n",
    { status: 200, headers: { "content-type": "text/csv", "access-control-allow-origin": "*" } }))) as typeof fetch;
  const r = await probeUrl("https://kilde.example/tom.csv", { fetchImpl });
  if (!r.ok || !r.note?.includes("0 DATARADER")) {
    throw new Error("forventet 0 DATARADER-note, fikk: " + JSON.stringify(r));
  }
});

Deno.test("probe flagger tom JSON-array", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("[]",
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  const r = await probeUrl("https://kilde.example/tom.json", { fetchImpl });
  if (!r.ok || !r.note?.includes("0 DATARADER")) {
    throw new Error("forventet 0 DATARADER-note, fikk: " + JSON.stringify(r));
  }
});
```

(`probeUrl` importeres allerede i probe.test.ts; gjenbruk filens fetchImpl-konvensjon om den avviker.)

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/probe.test.ts _lib/data-loader-feilkropp.test.ts`
Expected: FAIL på de tre nye.

- [ ] **Step 3: Implementer lastervakten**

I `js/data-loader.js`, under `httpFeilMedKropp`:

```js
  // Tomt-uttrekk-vakt (spec 2026-08-03 §fase 2.4): HTTP 200 med bare header
  // er den stille SDMX/PxWeb-feilklassen (filtre ignorert/feil koder) —
  // kast handlingsrettet i stedet for å binde en tom ramme videre.
  function assertHarDatarader(csvText, alias) {
    var rader = String(csvText || '').split('\n').filter(function (l) { return l.trim(); });
    if (rader.length < 2) {
      throw new Error('«' + alias + '»: uttrekket kom TOMT tilbake (0 datarader) — ' +
        'sjekk filtre/dekning (koder, år, land); slakk én dimensjon og prøv igjen');
    }
    return csvText;
  }
```

Bruk den på de fire kind-stiene i `fetchResolvedItems`:

- pxweb/eurostat-retur: `bytes: new TextEncoder().encode(assertHarDatarader(csvPx, item.alias))`
- sdmx/worldbank/dbnomics: rett før `return { alias: …`, legg til `csvText = assertHarDatarader(csvText, item.alias);`

(IKKE på `probeCsv`-introspeksjonen i sdmx-grenen — den er en 1-observasjons-probe, ikke uttrekket.)

- [ ] **Step 4: Implementer probe-notene**

I `probe.ts` `inferSchema`, CSV-grenen — erstatt siste return med:

```ts
  const dataRows = lines.slice(1);
  const tomNote = dataRows.length === 0
    ? " — 0 DATARADER: HTTP 200 men tomt uttrekk; sjekk filtre/dekning (koder, år, land) før du bygger scriptet"
    : "";
  return { columns: split(lines[0]), sampleRows: dataRows.map(split),
    note: `CSV (skilletegn '${sep}')${tomNote}` };
```

Og i JSON-grenen, FØR `if (Array.isArray(json) && json.length && …)`:

```ts
      if (Array.isArray(json) && json.length === 0) {
        return { columns: [], sampleRows: [],
          note: "JSON-array — 0 DATARADER: tomt uttrekk; sjekk filtre/dekning" };
      }
```

- [ ] **Step 5: Kjør — skal passere, hele suiten**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/`
Expected: alt grønt.

- [ ] **Step 6: Commit**

```bash
git add js/data-loader.js netlify/edge-functions/_lib/tools/probe.ts netlify/edge-functions/_lib/tools/probe.test.ts netlify/edge-functions/_lib/data-loader-feilkropp.test.ts
git commit -m "feat(lasting): tomt-uttrekk kaster; probe flagger 0 datarader"
```

---

### Task 7: Budsjetter — standard 8/3/2/4 med drift-test

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (DEPTH_STANDARD ~linje 53–71, buildRouteToolDefs ~linje 756–775, depthClientToolCalls/depthRunCodeCalls ~linje 779–785)
- Test: `netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts` (ny)

**Interfaces:**
- Produces: `depthClientToolCalls("standard") === 8`, `depthRunCodeCalls("standard") === 4`, web_search max_uses 3 / web_fetch 2 i standard. DEPTH_STANDARD-teksten forteller samme tall.

- [ ] **Step 1: Skriv feilende test**

`netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRouteToolDefs, buildSvarSystem, depthClientToolCalls, depthRunCodeCalls } from "./svar-prompt.ts";

Deno.test("budsjettknotter og DEPTH-teksten forteller samme historie (spec fase 2.5)", () => {
  assertEquals(depthClientToolCalls("standard"), 8);
  assertEquals(depthRunCodeCalls("standard"), 4);
  assertEquals(depthClientToolCalls("deep"), 12);
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("≤ 8 totalt"), "DEPTH-tabellen må si ≤ 8 klientverktøykall");
  assert(sys.includes("| ≤ 3 |"), "DEPTH-tabellen må si ≤ 3 web_search");
  assert(sys.includes("| ≤ 2 |"), "DEPTH-tabellen må si ≤ 2 web_fetch");
  assert(sys.includes("≤ 4 kjøringer"), "DEPTH-tabellen må si ≤ 4 run_code");
  const tools = buildRouteToolDefs("data", "standard") as { name: string; max_uses?: number }[];
  assertEquals(tools.find((t) => t.name === "web_search")?.max_uses, 3);
  assertEquals(tools.find((t) => t.name === "web_fetch")?.max_uses, 2);
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt-budsjett.test.ts`
Expected: FAIL (4 ≠ 8).

- [ ] **Step 3: Endre knottene og teksten SAMMEN**

I `svar-prompt.ts`:

- `depthClientToolCalls`: `return depth === "standard" ? 8 : 12;`
- `depthRunCodeCalls`: `return 4;` (begge dybder — behold funksjonen, oppdater kommentaren).
- `buildRouteToolDefs`: standard-grenen → `{ search: 3, fetch: 2, fetchTokens: 15_000 }`.
- DEPTH_STANDARD-tabellen:

```
| Klientverktøykall (katalog/metadata/probe/litteratur) | ≤ 8 totalt |
| web_search | ≤ 3 |
| web_fetch | ≤ 2 |
| run_code | ≤ 4 kjøringer |
```

(Resten av DEPTH_STANDARD-teksten uendret; svar.ts leser knottene, ingen endring der.)

- [ ] **Step 4: Kjør — skal passere + hele suiten**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: grønt (sjekk at svar-prompt.test.ts ikke asserterer gamle tall — oppdater i så fall dens forventninger til de nye).

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts
git commit -m "feat(budsjett): standard 8 verktøykall / 3 søk / 2 fetch / 4 kjøringer, drift-testet"
```

---

### Task 8: Prompt-regler — dekningssjekk før kode + omstart etter to reparasjoner

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (META_SEARCH ~linje 314–329, RUN ~linje 345–386)
- Test: `netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts` (append)

**Interfaces:**
- Produces: buildSvarSystem("data", …) inneholder «DEKNINGSSJEKK» og «forkast tilnærmingen».

- [ ] **Step 1: Skriv feilende test (append i svar-prompt-budsjett.test.ts)**

```ts
Deno.test("dekningssjekk- og omstartsreglene er montert i data-ruten (spec fase 2.4)", () => {
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("DEKNINGSSJEKK"), "META_SEARCH må ha dekningssjekk-regelen");
  assert(sys.includes("forkast tilnærmingen"), "RUN må ha omstartsregelen");
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt-budsjett.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementer**

I META_SEARCH, nytt punkt 5 (etter web_search-punktet, før failed-setningen):

```
5. DEKNINGSSJEKK før scriptet: probe den EKSAKTE filtrerte data-URL-en du
   akter å bruke (riktige koder/år/land) — ikke bare basen. Viser proben
   0 DATARADER: slakk ÉN dimensjon om gangen og re-probe før du skriver
   kode. Et treff i søket er IKKE dekning — bare proben beviser at akkurat
   dette utvalget finnes.
```

I RUN, nytt kulepunkt i arbeidsmåte-listen etter punkt 2:

```
   Feiler også ANDRE reparasjonsforsøk på samme tilnærming: ikke lapp
   videre — forkast tilnærmingen (annen kilde, annet uttrekk, enklere
   metode) eller lever ærlig degradering. Dype reparasjonsløkker er målt
   dårligere enn omstart.
```

- [ ] **Step 4: Kjør — skal passere + hele suiten**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: grønt.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts
git commit -m "feat(prompt): dekningssjekk før kode + omstart etter to reparasjoner"
```

---

### Task 9: Hint-må-parse — strukturell drift-test

**Files:**
- Test/Create: `netlify/edge-functions/_lib/tools/hints-parse.test.ts`

**Interfaces:**
- Consumes: `searchDatasets` (search-datasets.ts), `parseRegistry` (registry.ts), `buildSvarSystem` (svar-prompt.ts), evaluerte `js/{directive-parser,data-directives,api-kinds}.js`, ekte `data/data-sources.json`.
- Produces: CI-vakt: hvert how_to_read-hint og hvert direktiveksempel i systemprompten overlever parse+resolve. (Fase 3-armene MÅ utvide mockene her — det er meningen.)

- [ ] **Step 1: Les dbnomics-hintets form**

Run: `sed -n 45,95p netlify/edge-functions/_lib/tools/catalogs/dbnomics.ts`
Noter hvordan `how_to_read` bygges (sti-form + filters-eksempel) — mocken under må gi et treff som produserer et representativt hint. Juster canned-svaret om feltnavn avviker.

- [ ] **Step 2: Skriv testen (forventes delvis GRØNN — den er en vakt, ikke TDD)**

`netlify/edge-functions/_lib/tools/hints-parse.test.ts`:

```ts
// Hint-må-parse (spec 2026-08-03 §fase 2.2): hvert how_to_read-hint fra
// søkearmene og hvert direktiveksempel i systemprompten skal overleve
// DataDirectives.parse + resolve mot det EKTE registeret. August-lærdommen:
// et hint i en form grammatikken ikke tar er en INTERN SELVMOTSIGELSE —
// denne testen gjør klassen umulig å gjeninnføre.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { searchDatasets } from "./search-datasets.ts";
import { parseRegistry } from "../registry.ts";
import { buildSvarSystem } from "../svar-prompt.ts";

for (const f of ["directive-parser.js", "data-directives.js", "api-kinds.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const DD = (globalThis as any).DataDirectives;

const registry = parseRegistry(JSON.parse(await Deno.readTextFile(
  new URL("../../../../data/data-sources.json", import.meta.url))));

// Hint bruker … som «fyll inn»-plassholder og <…>-maler; normaliser så
// grammatikk-FORMEN testes, ikke plassholderne.
function normaliser(linje: string): string | null {
  let s = linje.trim();
  const hash = s.indexOf("# ");
  if (!s.startsWith("#") && hash > 0) s = s.slice(hash);  // «table_metadata(...) → # s = …»-formen
  if (!s.startsWith("#")) return null;
  if (s.includes("<")) return null;
  s = s.replace(/,\s*(years|countries|indicators|regions|filters)=…/g, "");
  s = s.replace(/…/g, "");
  return /=\s*[\w.]+\.(read|connect)\(/.test(s) ? s : null;
}

function assertParser(linje: string, kilde: string) {
  const parsed = DD.parse(linje);
  assert(parsed.loads.length + parsed.connects.length > 0,
    `${kilde}: ikke gjenkjent som direktiv: ${linje}`);
  for (const r of DD.resolve(parsed, registry)) {
    assert(!r.error, `${kilde}: resolve-feil for «${linje}»: ${r.error}`);
  }
}

function hentDirektivlinjer(tekst: string): string[] {
  const ut: string[] = [];
  for (const rå of tekst.split("\n")) {
    const n = normaliser(rå);
    if (n) ut.push(n);
  }
  return ut;
}

Deno.test("alle search_datasets-hint parser mot ekte register", async () => {
  const ssbSok = registry.find((s) => s.id === "ssb")?.sok_endepunkt ?? "";
  const fetchImpl = ((input: string | URL | Request) => {
    const url = String(input);
    const svar = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body),
      { status: 200, headers: { "content-type": "application/json" } }));
    if (ssbSok && url.startsWith(ssbSok.split("{q}")[0])) {
      return svar({ tables: [{ id: "05839", label: "Arbeidsledige" }] });
    }
    if (url.includes("sdmx.oecd.org") && url.includes("dataflow/all/all")) {
      return svar({ data: { dataflows: [{ id: "DF_TEST", agencyID: "OECD.SDD", name: "Health spending test" }] } });
    }
    if (url.includes("/data/apd-catalog.json")) {
      return svar([{ identifier: "apd1", name: "Health data", description: "",
        url: "https://example.org/x.csv", keywords: [], category: "Healthcare" }]);
    }
    if (url.includes("/data/worldbank-catalog.json")) {
      return svar({ indicators: [{ id: "SH.XPD.CHEX.GD.ZS", name: "Health expenditure share" }] });
    }
    if (url.includes("/data/eurostat-catalog.json")) {
      return svar({ tables: [{ code: "hlth_sha11_hf", title: "Health spending", start: "2000", end: "2024" }] });
    }
    if (url.includes("api.db.nomics.world")) {
      return svar({ results: { docs: [{ code: "WEO:latest", name: "World Economic Outlook",
        provider_code: "IMF", provider_name: "IMF", nb_series: 5 }] } });
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;

  const res = await searchDatasets("health spending", "stats",
    { registry, origin: "https://ask.melberg.app", fetchImpl });
  assert(res.failed.length === 0,
    "søkearmer feilet i mock (utvid fetchImpl): " + res.failed.join(", "));
  assert(res.hits.length >= 5, "for få treff til å dekke armene: " + res.hits.length);
  for (const hit of res.hits) {
    for (const linje of hentDirektivlinjer(hit.how_to_read ?? "")) {
      assertParser(linje, `hint(${hit.source})`);
    }
  }
});

Deno.test("direktiveksemplene i systemprompten parser mot ekte register", () => {
  for (const mode of ["python", "r", "duckdb"] as const) {
    const linjer = hentDirektivlinjer(buildSvarSystem("data", mode, ""));
    assert(linjer.length >= 2, `prompt(${mode}): fant for få direktiveksempler`);
    for (const linje of linjer) assertParser(linje, `prompt(${mode})`);
  }
});
```

- [ ] **Step 3: Kjør — fiks det den finner**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/hints-parse.test.ts`
To utfall: (a) grønt → hintene er konsistente i dag, vakten står; (b) rødt → testen har funnet en EKTE hint/grammatikk-drift à la august. Da fikses HINTET (eller normaliser-funksjonen hvis det er en legitim plassholderform testen ikke kjenner) — aldri grammatikk-koden — til grønt. Dokumenter eventuelle funn i commit-meldingen.

Kjente kandidater testen trolig feller: eurostat-hintet (catalogs/eurostat.ts) har prose på selve direktivlinjen — grammatikken avviser etterfølgende tekst etter `)` — og `filters={…}`-plassholderen. Fiks i så fall hintet: flytt prosen til en egen linje i how_to_read (etter `\n`), og bruk et konkret filters-eksempel (f.eks. `filters={"geo": "NO"}`).

- [ ] **Step 4: Hele suiten**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: grønt.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/tools/hints-parse.test.ts
git commit -m "test(hint): hint-må-parse — strukturvakt mot hint/grammatikk-drift"
```

---

### Task 10: Kildeguider for eurostat, oecd, worldbank, dbnomics + drift-test

**Files:**
- Create: `data/source-guides/eurostat.md`, `data/source-guides/oecd.md`, `data/source-guides/worldbank.md`, `data/source-guides/dbnomics.md`
- Modify: `data/data-sources.json` (`"guide": true` på de fire oppføringene)
- Test: `netlify/edge-functions/_lib/source-guides-drift.test.ts` (ny)

**Interfaces:**
- Consumes: `makeGuideAttacher` (source-guides.ts, uendret — leverer filene automatisk).
- Produces: guide-filer ≤ 8 000 tegn (attacher-taket); drift-test guide-flagg ↔ fil.

- [ ] **Step 1: Skriv feilende drift-test**

`netlify/edge-functions/_lib/source-guides-drift.test.ts`:

```ts
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRegistry } from "./registry.ts";

const registry = parseRegistry(JSON.parse(await Deno.readTextFile(
  new URL("../../../data/data-sources.json", import.meta.url))));

Deno.test("guide:true ↔ guidefil finnes, ikke-tom, ≤ 8000 tegn", async () => {
  for (const s of registry) {
    let text: string | null = null;
    try {
      text = await Deno.readTextFile(new URL(`../../../data/source-guides/${s.id}.md`, import.meta.url));
    } catch { /* mangler */ }
    if (s.guide) {
      assert(text !== null && text.trim().length > 0, `${s.id}: guide:true men fil mangler/tom`);
      assert(text!.length <= 8000, `${s.id}: guide over attacher-taket (8000 tegn)`);
    } else {
      assert(text === null, `${s.id}: guidefil finnes men guide-flagget mangler i registeret`);
    }
  }
});

Deno.test("fase 2-guidene finnes (spec fase 2.3)", () => {
  for (const id of ["ssb", "eurostat", "oecd", "worldbank", "dbnomics"]) {
    assert(registry.find((s) => s.id === id)?.guide === true, `${id}: skal ha guide:true`);
  }
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/source-guides-drift.test.ts`
Expected: FAIL (fire kilder mangler flagg/fil).

- [ ] **Step 3: Skriv guidene + sett flaggene**

Sett `"guide": true` i `data/data-sources.json` på eurostat, oecd, worldbank, dbnomics (samme felt som ssb har).

`data/source-guides/eurostat.md`:

```markdown
# Eurostat — kildeguide

- Kanonisk vei: `# e = eurostat.read("<datasettkode>", years="2015:2024", filters={"geo": "NO", "unit": "PC_GDP"})` — kildens EGNE dimensjoner (geo, unit, na_item, sex, age, siec …) går ALLTID i filters={}. countries=/indicators= finnes IKKE for eurostat.
- geo-koder er Eurostats egne: "NO" (ikke NOR), EU-aggregat "EU27_2020". Sjekk kodene med table_metadata(find="Norway") — aldri gjett.
- Norge ER med i de fleste datasett (EFTA-rapportering), ofte også regionalt (NUTS: NO0…-koder).
- years="2015:2024" oversettes til sinceTimePeriod/untilTimePeriod. Kvartals-/månedsdata: filtrer heller med kildens egne tidskoder via filters.
- Datasettkoder er små bokstaver (nama_10_gdp, hlth_sha11_hf) — store bokstaver 404-er.
- Uttrekk uten filters kan bli enorme — velg alltid geo + de sentrale dimensjonene eksplisitt.
```

`data/source-guides/oecd.md`:

```markdown
# OECD (SDMX) — kildeguide

- flowRef er KOMMA-form og skal KOPIERES ordrett fra search_datasets/search_catalog-treffet: `# o = oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2015:2024", countries=["NOR","SWE"])`. Slash-form 404-er («Could not find Dataflow»). Id-er inneholder @ og komma — ikke «rens» dem.
- countries= → REF_AREA, indicators= → MEASURE; ALT annet i filters={"<DIM>": "<kode>"} — dimensjonene og kodene får du fra table_metadata (bruk find= for lange lister).
- Nøkkelstien (punktumdelte dimensjoner) bygger lasteren selv — bygg den ALDRI for hånd, og aldri /all + startPeriod som kwargs. years= er eneste tidsvei.
- SDMX ignorerer ukjente parametre STILLE (HTTP 200 med UFILTRERTE data) — aldri rå pd.read_csv-URL mot OECD; alltid den kanoniske read-linjen.
- 404 «NoResultsFound» betyr tomt UTVALG (feil koder), ikke nettverksfeil — sjekk kodene i table_metadata i stedet for å bytte kilde.
```

`data/source-guides/worldbank.md`:

```markdown
# World Bank — kildeguide

- Ressursstien er OBLIGATORISK: `# x = worldbank.read("country/NOR;SWE/indicator/SH.XPD.CHEX.GD.ZS", years="2000:2023")` — read uten sti FEILER (målt: kostet tre reparasjonsrunder).
- Land = ISO3 adskilt med `;`, eller `all`. Aggregater er «land» i stien: EUU (EU), OED (OECD), WLD (verden).
- years="2000:2023" → date-parameteren; åpne ender fylles automatisk.
- ÉN indikator per read-linje er normen; flere variabler = flere read-linjer + merge på countryiso3code+date (join-nøklene i rammen).
- Lasteren paginerer selv og feiler med råd hvis uttrekket er >10 sider — snevre da inn (years=, færre land).
- Ekstra parametre (mrv, gapfill) kan gis i filters={"mrv": "5"}.
```

`data/source-guides/dbnomics.md`:

```markdown
# DBnomics — kildeguide (internasjonal ryggrad, ~90 kilder bak én kontrakt)

- Sti er `<PROVIDER>/<DATASET>`: `# d = dbnomics.read("IMF/WEO:latest", filters={"weo-country": ["NOR"], "weo-subject": ["NGDP_RPCH"]}, years="2015:2029")`.
- Versjonerte datasett: bruk ALLTID `:latest` — aldri hardkod en release («WEO:2024-10» råtner).
- countries=/indicators= finnes IKKE her: dimensjonsnavnene varierer per datasett (weo-country, geo, REF_AREA …). ALT utvalg går i filters={} med koder fra table_metadata (bruk find="Norway" for landkoder).
- filters-verdier kan være lister; years= filtreres klient-side etter henting.
- Treffer spørringen >1000 serier feiler lasteren med råd — snevre inn med flere filters-dimensjoner.
- IMF/BIS/ILO/FRED med flere nås HER uten egne nøkler — foretrekk dbnomics framfor kildens eget API når begge finnes.
```

- [ ] **Step 4: Kjør — skal passere + hele suiten**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: grønt (source-guides.test.ts og registry.test.ts er flagg-agnostiske; sjekk).

- [ ] **Step 5: Commit**

```bash
git add data/source-guides/ data/data-sources.json netlify/edge-functions/_lib/source-guides-drift.test.ts
git commit -m "feat(guider): kildeguider for eurostat/oecd/worldbank/dbnomics + drift-test"
```

---

### Task 11: Brukerpreferanser + landruting

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (ny ROUTING-konst, `coercePreferences`, `renderPreferencesBlock`, buildSvarSystem-opts)
- Modify: `netlify/edge-functions/svar.ts` (RequestBody + gjennomplumbing)
- Modify: `js/ai-chat.js` (runSvarLoop-body ~linje 681; cacheDom-listen ~linje 40; openSettings/saveSettings ~linje 1304–1345)
- Modify: `index.html` (settings-modalen, etter `#aiCfgSourceKeys`-diven ~linje 300)
- Modify: `js/i18n/en.js` (to strenger)
- Test: `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts` (ny)

**Interfaces:**
- Produces: `coercePreferences(u: unknown): string` (trim + tak 2000, '' ellers); `buildSvarSystem(route, mode, registryBlock, { preferences? })` monterer `## Landruting` (alltid, kun data-ruten) og `## Brukerens datapreferanser` (kun når satt, ETTER registerblokka); klienten sender `preferences` fra localStorage `md_ask_prefs`.

- [ ] **Step 1: Skriv feilende test**

`netlify/edge-functions/_lib/svar-prompt-prefs.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSvarSystem, coercePreferences } from "./svar-prompt.ts";

Deno.test("coercePreferences: streng, trim, tak 2000", () => {
  assertEquals(coercePreferences(undefined), "");
  assertEquals(coercePreferences(42), "");
  assertEquals(coercePreferences("  x  "), "x");
  assertEquals(coercePreferences("a".repeat(3000)).length, 2000);
});

Deno.test("landruting alltid i data-ruten; preferanseblokk kun når satt, sist", () => {
  const uten = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x");
  assert(uten.includes("## Landruting"));
  assert(!uten.includes("Brukerens datapreferanser"));
  const med = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x",
    { preferences: "standardland Norge; foretrekk SSB" });
  assert(med.includes("standardland Norge; foretrekk SSB"));
  assert(med.indexOf("Brukerens datapreferanser") > med.indexOf("## Kilderegister"),
    "preferansene skal stå ETTER registerblokka (mest spesifikke sist)");
  assert(!buildSvarSystem("beregning", "python", "").includes("## Landruting"));
  assert(!buildSvarSystem("utforsk", "python", "", { preferences: "x" }).includes("Brukerens datapreferanser"));
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt-prefs.test.ts`
Expected: FAIL (coercePreferences finnes ikke).

- [ ] **Step 3: Implementer i svar-prompt.ts**

Ny konst (plasser etter META_SEARCH):

```ts
const ROUTING = `\
## Landruting (standardvalg — brukerens preferanser har forrang)

Velg kilder etter spørsmålets GEOGRAFI, ikke etter språket det er stilt på:
- **Norge**: ssb først (offisiell statistikk); fhi for helse/registerdata.
  Kjente hull: ungdoms-rusdata bor hos FHI/Ungdata, ikke SSB; rente/valuta
  hos norgesbank.
- **Norden**: dst (Danmark), scb (Sverige), statfin (Finland) — samme
  tabellfamilie som SSB, men agentur-lokale tabell-id-er (søk per kilde).
- **EU/regionalt (NUTS)**: eurostat — Norge er med i de fleste datasett.
- **Global makro/tidsserier**: dbnomics først (IMF/OECD/BIS/ILO m.fl. bak
  én kontrakt), worldbank for utviklingsindikatorer, oecd for OECD-land.
- **Hverdagsspråklige tverrlandssammenligninger**: owid (åpen GET-CSV).
Angir brukerens datapreferanser et standardland/-region eller foretrukne
kilder, har DE forrang over denne tabellen.`;
```

Nye funksjoner (ved siden av coerceDepth):

```ts
export function coercePreferences(p: unknown): string {
  return typeof p === "string" ? p.trim().slice(0, 2000) : "";
}

function renderPreferencesBlock(prefs: string): string {
  if (!prefs) return "";
  return `## Brukerens datapreferanser (overstyrer standardvalg)

Brukeren har lagret varige instrukser for datasøk og kildevalg. De har
forrang over landrutingen og registerets standardvalg — men opphever ALDRI
ærlighetsreglene (probe-✅, fabrikasjonsvern, budsjettene):

${prefs}`;
}
```

I `buildSvarSystem`: utvid opts-typen med `preferences?: unknown`, og i data-rute-grenen:

```ts
  const blocks = [INTRO, DEPTH[depth], DELIVERY, QUERYLOGIC, SCIENCE, INLINE, MULTI, MODE[mode], ROUTING, META_SEARCH, KODEBOK, RUN, PARTIAL];
  if (opts?.memoryUrls) blocks.push(MEMORY_URLS);
  blocks.push(registryBlock);
  const prefBlock = renderPreferencesBlock(coercePreferences(opts?.preferences));
  if (prefBlock) blocks.push(prefBlock);
  return blocks.join("\n\n");
```

- [ ] **Step 4: Plumbing i svar.ts**

- `RequestBody`: legg til `preferences?: unknown;`
- Kallet: `const system = buildSvarSystem(route, mode, registryBlock, { memoryUrls, depth, preferences: body.preferences });`

- [ ] **Step 5: Klient — body-felt + settings-UI**

`js/ai-chat.js` i `runSvarLoop`-body (etter `available_keys`-linjen):

```js
              preferences: (function () {
                try { return localStorage.getItem('md_ask_prefs') || undefined; }
                catch (e) { return undefined; }
              })(),
```

`index.html`, i settings-modalen rett ETTER `<div id="aiCfgSourceKeys" …></div>`:

```html
      <div style="margin-bottom:18px;">
        <label for="aiCfgDataPrefs" data-i18n>Datapreferanser (valgfritt)</label>
        <textarea id="aiCfgDataPrefs" rows="3" maxlength="2000" placeholder="F.eks.: standardland Norge; foretrekk SSB og Eurostat; oppgi alltid kilde-URL"></textarea>
        <div class="ai-modal-help" data-i18n>Varige instrukser for datasøk og kildevalg i Ask. Sendes med hvert spørsmål og overstyrer appens standardvalg.</div>
      </div>
```

`js/ai-chat.js`:

- cacheDom-id-listen (~linje 40): legg til `'aiCfgDataPrefs'`.
- `openSettings()`: `if (dom.aiCfgDataPrefs) { try { dom.aiCfgDataPrefs.value = localStorage.getItem('md_ask_prefs') || ''; } catch (e) {} }`
- `saveSettings()`: 

```js
        if (dom.aiCfgDataPrefs) {
          try {
            var dp = dom.aiCfgDataPrefs.value.trim().slice(0, 2000);
            if (dp) localStorage.setItem('md_ask_prefs', dp);
            else localStorage.removeItem('md_ask_prefs');
          } catch (e) {}
        }
```

`js/i18n/en.js` (samme seksjon som de andre modal-strengene):

```js
  "Datapreferanser (valgfritt)": "Data preferences (optional)",
  "Varige instrukser for datasøk og kildevalg i Ask. Sendes med hvert spørsmål og overstyrer appens standardvalg.": "Standing instructions for data search and source choice in Ask. Sent with every question; overrides the app's defaults.",
```

- [ ] **Step 6: Kjør alt**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/ && cd ../.. && node --test tests/js/`
Expected: grønt.

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt-prefs.test.ts netlify/edge-functions/svar.ts js/ai-chat.js index.html js/i18n/en.js
git commit -m "feat(preferanser): varige datapreferanser + landruting i data-ruten"
```

---

### Task 12: Sluttsjekk, push og live-smoke

**Files:** ingen nye — verifisering + push.

- [ ] **Step 1: Full testsuite alle tre miljøer**

```bash
cd /Users/hom/Documents/GitHub/askstat && node --test tests/js/ && python3 -m pytest -q
cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/
```

Expected: alt grønt.

- [ ] **Step 2: Vent på baseline (Task 3)**

Sjekk at `docs/eval/2026-08-baseline.md` har innhold (Hans' kjøring). Har den ikke det: spør Hans om baseline skal kjøres nå eller bevisst hoppes over (hans beslutning — noter valget i fila).

- [ ] **Step 3: Push askstat**

```bash
cd /Users/hom/Documents/GitHub/askstat && git push
```

(Netlify autodeployer. Anvil-endepunktet krever Hans' pull i Anvil-editoren — minn om det hvis det ikke alt er gjort.)

- [ ] **Step 4: Live-smoke (Hans eller browser-verktøy, ETT spørsmål)**

På https://ask.melberg.app: still ett data-rute-spørsmål som FEILER bevisst (f.eks. «bruk SSB-tabell 99999 til å vise arbeidsledighet») og verifiser: (a) feilmeldingen i prosess-sporet inneholder oppstrøms-tekst, (b) det dukker opp en rad i Anvils feilrapporter-tabell, (c) et normalt spørsmål gir svar som før. Preferansefeltet: lagre «standardland Norge», still et tvetydig spørsmål, se at SSB velges.

- [ ] **Step 5: Rapporter**

Meld: hva som er pushet og live, at fase 3 (kildene) har egen plan, og eventuelle avvik fra baseline-målingen.

---

## Self-review (utført ved skriving)

- **Spec-dekning fase 1+2:** 1a telemetri → Task 1+2; 1b spike → Task 4; 2.1 feilkropper → Task 5; 2.2 hint-må-parse → Task 9; 2.3 guider → Task 10; 2.4 dekningssjekk/tomt-vakter → Task 6+8; 2.5 budsjetter → Task 7; 2.6 preferanser/ruting → Task 11; testing/eval → Task 3+12. Fase 3 bevisst i egen plan.
- **Ingen plassholdere:** all kode er utskrevet; de to menneskestegene (Task 3/4) er eksplisitte checkpoints, ikke TBD-er.
- **Typekonsistens:** `byggFeilrapport`/`sendFeilrapport`, `httpFeilMedKropp`, `assertHarDatarader`, `coercePreferences` brukes med samme navn og signaturer på tvers av tasks; feilprefikser matcher er400-regexen; probe-notene bruker konsistent «0 DATARADER».
