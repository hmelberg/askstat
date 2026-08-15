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

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
