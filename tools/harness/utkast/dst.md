# UTKAST: dst (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/dst.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad
- **FOLK1A** — Befolkningen den 1. i kvartalet
  - tidsspenn (fra Tid-dimensjonens kodeliste): 2008K1 – 2009K1
  - `OMRÅDE` — 105 kode(r) [eliminerbar] — eksempler: 000=Hele landet, 084=Region Hovedstaden, 101=København, 147=Frederiksberg, 155=Dragør
  - `KØN` — 3 kode(r) [eliminerbar] — eksempler: TOT=I alt, 1=Mænd, 2=Kvinder
  - `ALDER` — 127 kode(r) [eliminerbar] — eksempler: IALT=Alder i alt, 0=0 år, 1=1 år, 2=2 år, 3=3 år
  - `CIVILSTAND` — 5 kode(r) [eliminerbar] — eksempler: TOT=I alt, U=Ugift, G=Gift/separeret, E=Enke/enkemand, F=Fraskilt
  - `Tid` (rolle: time) — 75 kode(r) [OBLIGATORISK] — eksempler: 2008K1, 2008K2, 2008K3, 2008K4, 2009K1

## Guide (hentelaget — eksempel først)
### GET CSV (FOLK1A)
```python
pd.read_csv("https://api.statbank.dk/v1/data/FOLK1A/CSV?Tid=2009K1", sep=";")
```
1 rad, kolonner: ﻿TID, INDHOLD


## Kjente feller (målt i denne utforskningen)
CSV bruker ; som skilletegn (sep=';' i pandas). /tables?format=JSON er katalogen.

## Økosystem (pakker — for PORTABLE skript; i appen gjelder adapterne)

- R (dokumentert, ikke testet her): `danstat (CRAN)`, `dkstat`

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
