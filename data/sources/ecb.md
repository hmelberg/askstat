---
id: ecb
navn: ECB Data Portal (SDMX)
utgiver: Den europeiske sentralbanken
tillit: offisiell
tilgang: sdmx
kind: sdmx
base_url: https://data-api.ecb.europa.eu/service/data/
cors: true
join_nokler: [TIME_PERIOD]
tags: [makro]
order: 8
---

# ECB Data Portal (SDMX)

## Kort

SDMX 2.1; ressurssti = <flow>/<nøkkel> (f.eks. EXR/D.USD.EUR.SP00.A); komma-formen fra search_catalog (ECB,EXR) virker også (målt 2026-08-01). Tid og utvalg skrives med det kanoniske vokabularet (years=/countries=/filters={}) — ALDRI startPeriod= som kwarg (parseren avviser den; years= oversettes til den). Verifisert 2026-07-25: 406 på sdmx-csv-Accept — adapterens format=csvdata-fallback tar den. CORS *.

## Om kilden

European Central Bank Data Portal — euro-area and EU monetary, financial, and exchange-rate time series via SDMX.

