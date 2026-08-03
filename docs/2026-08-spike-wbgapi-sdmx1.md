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
| 1 requests | (forhåndsinstallert) | NEI (localhost:8899, 2026-08-04) | Emscripten-backenden ER aktiv (`urllib3/contrib/emscripten/connection.py`), men selve browserkallet feilet: `ProtocolError('Connection aborted.', HTTPException('NetworkError when attempting to fetch resource.'))` → requests.ConnectionError. Åpent: sync-XHR-spesifikt eller localhost-origin (CORS/CSP/SW)? Se diagnose-script under; må re-testes fra ask.melberg.app etter push. |
| 2 wbgapi   | —       | —            | Første forsøk (2026-08-04, m/ `await micropip.install`): `SyntaxError: 'await' outside function` — HARNESS-FUNN, se under. Re-test med nytt script (ren `import wbgapi`, auto-install) gjenstår. |
| 3 sdmx1    | —       | —            | Samme SyntaxError som script 2 (toppnivå-await). Re-test med nytt script (`import sdmx` + PYPI_ALIAS sdmx→sdmx1) gjenstår. |

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

- [ ] **(a) virker rent** → egen oppfølging: prompt-tillatelse i python-modus;
      vurder å pensjonere håndrullet SDMX-nøkkelbygging (eget løp).
- [ ] **(b) virker ikke** → ROADMAP-punktet «DSL vs. LLM-vaner» pkt 2 lukkes
      med denne evidensen; `ost` beholder dagens omfang.

Begrunnelse: <fyll inn etter kjøring>
