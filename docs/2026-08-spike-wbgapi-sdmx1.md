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
