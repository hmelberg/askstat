---
id: owid
navn: Our World in Data (grapher-CSV)
utgiver: OWID
tillit: etablert
tilgang: fil
base_url: https://ourworldindata.org/grapher/
cors: true
join_nokler: [Entity/Code (land), Year]
sporrings_url_mal: https://ourworldindata.org/grapher/{slug}.csv?csvType=filtered
tags: [makro]
order: 5
---

# Our World in Data (grapher-CSV)

## Kort

enhver grapher-side har .csv; kolonner Entity, Code, Year, verdi; UTEN csvType=filtered IGNORERES country=/time= STILLE — svaret blir byte-likt hele datasettet (målt 2026-08-04); note: ikke alle slug-ID-er eksisterer (e.g. co2 != 404, life-expectancy OK) — probe før bruk

## Om kilden

Our World in Data — curated long-run global datasets (health, economy, environment, and more) as downloadable CSV files compiled from many primary sources.

