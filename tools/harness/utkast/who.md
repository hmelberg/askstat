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

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- R (dokumentert, ikke testet her): [`WHO`](https://cran.r-project.org/package=WHO)


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
