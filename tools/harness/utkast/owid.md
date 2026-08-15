# UTKAST: owid (generert av tools/harness/utforsk.py 2026-08-16)
> Råmateriale for data/sources/owid.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-16, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad

## Guide (hentelaget — eksempel først)
### Full grapher-CSV (life-expectancy)
```python
pd.read_csv("https://ourworldindata.org/grapher/life-expectancy.csv")
```
21565 rader, kolonner: Entity, Code, Year, Life expectancy

### Filtrert (csvType=filtered — UTEN den ignoreres country/time STILLE, målt 2026-08-04)
```python
pd.read_csv("https://ourworldindata.org/grapher/life-expectancy.csv?csvType=filtered&country=NOR~SWE&time=2015..2024")
```
18 rader, kolonner: Entity, Code, Year, Life expectancy


## Kjente feller (målt i denne utforskningen)
Fil-/katalogkilde uten strukturert metadata-endepunkt — kunnskapen bor i URL-mønstrene over (alle KJØRT).

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Python [`owid-catalog`](https://pypi.org/project/owid-catalog/) — verifisert: install + import


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
