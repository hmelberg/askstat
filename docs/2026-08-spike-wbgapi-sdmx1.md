# Spike: wbgapi/sdmx1 i Pyodide (ROADMAP «DSL vs. LLM-vaner» pkt 2)

**Hvordan:** åpne https://ask.melberg.app/?view=editor (python-modus). De tre
scriptene ligger i EKSEMPELMENYEN under gruppa «Libraries»
(examples/python/lib01–lib03) — velg dem derfra og trykk Kjør, ETT AV GANGEN
(de er også gjengitt under). Noter utfall i tabellen.
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
import wbgapi as wb   # appen auto-installerer manglende imports — ingen micropip-linje
df = wb.data.DataFrame("SH.XPD.CHEX.GD.ZS", ["NOR", "SWE"], time=range(2015, 2023))
print(df.head())
print("WBGAPI OK, form:", df.shape)
```

## Script 3 — sdmx1

```python
import sdmx   # PyPI-pakken heter sdmx1 — appens PYPI_ALIAS-tabell oversetter
oecd = sdmx.Client("OECD")
fl = oecd.dataflow()
print("SDMX1 OK, antall dataflows:", len(fl.dataflow))
```

## Resultater

| Script | Install ok? | Nettkall ok? | Resultat/feilmelding |
|--------|-------------|--------------|----------------------|
| 1 requests | (forhåndsinstallert) | JA i Chromium; NEI i Hans' nettleser | Stakken VIRKER ende-til-ende (bevist av script 3 i Chromium: JSPI-vei, `send_jspi_request`). Hans' nettleser ga «NetworkError when attempting to fetch resource» på ALT (Firefox-ordlyd — trolig ETP/utvidelse/nettleservalg, IKKE appen: samme origin ga 200 på ren fetch i Chromium). Åpent: identifiser Hans' nettleser + re-test fra prod. |
| 2 wbgapi   | JA (auto-install) | NEI — WBs egen skyld | ROTÅRSAK FUNNET (Chromium-konsoll): wbgapis FØRSTE interne kall er metadata-endepunktet `/v2/en/sources/2/concepts` — som IKKE sender ACAO-header, mens dataendepunktene (`/v2/country/...`) er CORS-åpne (målt 200 samme økt). Per-endepunkt-CORS-splitt på samme vert (Eurostat-katalog-mønsteret fra Workbench-utredningen). Biblioteket dør på sitt eget URL-valg og kan ikke pekes mot /api/hent → wbgapi er UBRUKELIG browser-side uten requests-nivå proxy-shim. (Første forsøk m/ `await micropip.install` ga SyntaxError — harness-funn 1 under.) |
| 3 sdmx1    | JA (PYPI_ALIAS sdmx→sdmx1) | **JA — FULL PASS (Chromium, localhost)** | `SDMX1 OK, antall dataflows: 1540` — install, JSPI-fetch mot sdmx.oecd.org, full SDMX-ML-parse. Kun kosmetiske stderr-advarsler (forward references, deprecation provider=→agency_id). OECDs REST-flate er gjennomgående CORS-åpen — derfor virker biblioteket der wbgapi ikke gjør det. I Hans' nettleser: samme NetworkError som alt annet (nettleser-spesifikt). |

## Harness-funn underveis (2026-08-04, fikset samme dag)

1. **Toppnivå-`await` støttes ikke i python-kjøringen** (blokkene exec-es
   synkront inne i den ytre korutinen) — `await micropip.install(...)` gir
   `SyntaxError: 'await' outside function`. MODE_PY-prompten LÆRTE BORT
   nettopp denne formen (intern inkonsistens, augustklassen) — fikset:
   prompten sier nå «bare `import <modul>`» og forbyr toppnivå-await
   eksplisitt (låst med test i svar-prompt-budsjett.test.ts).
2. **Auto-install brukte modulnavnet som PyPI-navn 1:1** — `import sdmx`
   ville installert feil pakke. Fikset: `PYPI_ALIAS`-tabell i index.html
   (sdmx→sdmx1, bs4, PIL, yaml, skimage).
3. requests-funnet fra script 1 står uavhengig av dette: Emscripten-
   backenden er aktiv, men selve nettkallet feilet fra localhost — re-test
   fra ask.melberg.app etter push.

## Kjennelse

- [x] **NYANSERT — mekanikken virker, adopsjon er per-bibliotek:**
      **(a)** for selve stakken: auto-install + requests/urllib3 via JSPI +
      full XML-parse virker (sdmx1 mot OECD: 1540 dataflows, full pass).
      **(b)** for wbgapi spesifikt: ubrukelig browser-side — dens
      obligatoriske metadata-kall treffer et ikke-CORS-endepunkt hos WB, og
      bibliotekets interne URL-valg kan ikke rutes via /api/hent.

Begrunnelse (2026-08-04, målt i Chromium på localhost:8899 + Hans' kjøringer):
1. Transportlaget er IKKE lenger argumentet mot biblioteker — JSPI +
   urllib3-emscripten leverer. Argumentet som STÅR er kontroll over
   ENDEPUNKTVALG: biblioteker velger sine egne URL-er, og CORS gjelder per
   endepunkt, ikke per vert. `ost`/adapterne velger CORS-verifiserte
   endepunkter; det kan ikke et bibliotek instrueres til.
2. Oppfølging verdt et eget løp: **sdmx1 som motor for SDMX-familien**
   (OECD/ECB/NB) — kan pensjonere håndrullet nøkkelbygging
   (sdmxKeyDims/sdmxKeyPath) HVIS kildenes strukturendepunkter er like
   CORS-åpne som OECDs (må måles per kilde, fra prod-origin).
3. Videre oppfølging (fase 3+, valgfri): requests-nivå proxy-shim
   (ROADMAP-retning 1b) ville gjort wbgapi-klassen brukbar — policy-
   diskusjonen fra ROADMAP gjelder uendret.
4. Uavklart bihøst: Hans' nettleser blokkerer ALLE cross-origin-fetch fra
   localhost (Firefox-ordlyd i feilene) — identifiser nettleser/utvidelse
   og re-test fra ask.melberg.app etter push. Påvirker ikke kjennelsen
   (Chromium-målingene er kontrollen).
