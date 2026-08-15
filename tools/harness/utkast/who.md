# UTKAST: who (generert av tools/harness/utforsk.py 2026-08-16)
> Råmateriale for data/sources/who.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-16, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad

## Guide (hentelaget — eksempel først)
### GHO OData m/$filter (WHOSIS_000001 = forventet levealder)
```python
pd.read_json(".../api/WHOSIS_000001?$filter=SpatialDim eq 'NOR'") — value-lista er radene
```
66 rader, kolonner: Id, IndicatorCode, SpatialDimType, SpatialDim, ParentLocationCode, TimeDimType, ParentLocation, Dim1Type


## Kjente feller (målt i denne utforskningen)
Fil-/katalogkilde uten strukturert metadata-endepunkt — kunnskapen bor i URL-mønstrene over (alle KJØRT).

## Økosystem (pakker — for PORTABLE skript; i appen gjelder adapterne)

- R (dokumentert, ikke testet her): `WHO (CRAN, GHO-API)`

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
