# UTKAST: statfin (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/statfin.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad
- **tyti/11pk.px** — Employees aged 15-74 by type of employment relationship
  - tidsspenn (fra Tid-dimensjonens kodeliste): 2009 – 2013
  - `timeperiod_y` (rolle: time) — 17 kode(r) [OBLIGATORISK] — eksempler: 2009, 2010, 2011, 2012, 2013
  - `sukupuoli_9_20180101` — 3 kode(r) [eliminerbar] — eksempler: SSS=Total, 1=Males, 2=Females
  - `contentscode` — 17 kode(r) [OBLIGATORISK] — eksempler: tyti-Palkansaajat_yht=Employees total, 1000 persons, tyti-Jva_kokoaikatyo=Employees, permanent full-time work, 1000 persons, tyti-Jva_osaaikatyo=Employees, permanent part-time work, 1000 persons, Jva_tyo=Employees, permanent work total, 1000 persons, tyti-Ma_kokoaikatyo=Employees, temporary (fixed-term) full-time work, 1000 persons
  - _PxWeb v1: metadata via GET på tabell-URLen; UTTREKK krever POST (ingen CORS på POST — i appen alltid via /api/hent?url=…&body=…)._

## Guide (hentelaget — eksempel først)
### PxWeb v1 POST-uttrekk (tyti/11pk.px)
```python
# load /api/hent?url=<enkodet https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/tyti/11pk.px>&body=<enkodet {"query": [{"code": "contentscode", "selection": {"filter": "item", "values": ["tyti-Palkansaajat_yht"]}}, {"code": "timeperiod_y", "selection": {"filter": "item", "values": ["2013"]}}], "response": {"format": "csv"}}> as df
```
1 rad, kolonner: ﻿"Year", "Employees total,  1000 persons"


## Kjente feller (målt i denne utforskningen)
Uttrekk er POST u/CORS-header — appen MÅ bruke /api/hent-proxyens body-param (GET-metadata/navigasjon har CORS * og kan gå direkte).

## Økosystem (pakker — for PORTABLE skript; i appen gjelder adapterne)

- Python `pyjstat` — verifisert: 4 rader fra delt json-stat2-fixture (offline)
- R (dokumentert, ikke testet her): `pxweb (rOpenGov)`

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
