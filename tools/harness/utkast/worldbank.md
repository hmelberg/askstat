# UTKAST: worldbank (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/worldbank.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): health expenditure, helseutgifter, SHA

## Guide (hentelaget — eksempel først)
### Enkeltland (BNP)
```python
worldbank.read("country/NOR/indicator/NY.GDP.MKTP.CD", years="2015:2024")
```
10 rader, kolonner: indicator, country, countryiso3code, date, value

### Flerland (BNP, ; -separert)
```python
worldbank.read("country/NOR;SWE/indicator/NY.GDP.MKTP.CD", years="2020:2024")
```
10 rader, kolonner: indicator, country, countryiso3code, date, value

### Annen indikator (folketall)
```python
worldbank.read("country/NOR/indicator/SP.POP.TOTL", years="2020:2024")
```
5 rader, kolonner: indicator, country, countryiso3code, date, value


## Kjente feller (målt i denne utforskningen)
Sti-/maskebasert kilde: ingen generisk metadata-probe — dimensjonskunnskapen bor i stien/masken (se lesemønstrene over).

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Python [`wbgapi`](https://github.com/tgherzog/wbgapi) — verifisert: install + import
- R (dokumentert, ikke testet her): [`WDI`](https://cran.r-project.org/package=WDI)


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
