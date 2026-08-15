# UTKAST: fred (generert av tools/harness/utforsk.py 2026-08-16)
> Råmateriale for data/sources/fred.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-16, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad

## Guide (hentelaget — eksempel først)
### Nøkkelfri fredgraph-CSV (EVAL-regel 5; CORS varierer — proxy i appen ved målt cors:false)
```python
pd.read_csv("https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE")
```
943 rader, kolonner: observation_date, UNRATE


## Kjente feller (målt i denne utforskningen)
Fil-/katalogkilde uten strukturert metadata-endepunkt — kunnskapen bor i URL-mønstrene over (alle KJØRT).

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Python [`fredapi`](https://github.com/mortada/fredapi) — verifisert: install + import
- R (dokumentert, ikke testet her): [`fredr`](https://github.com/sboysel/fredr)


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
