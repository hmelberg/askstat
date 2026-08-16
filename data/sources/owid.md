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

## Typiske spørsmål

- Hvor mye CO2 slipper de nordiske landene ut per innbygger?
- Sammenlign klimagassutslipp mellom Norge og naboland siste tiår.
- Hvordan har utslipp per capita utviklet seg over tid i et land?

## Oppskrift: CO2-utslipp per innbygger, Norden siste tiår (verifisert 2026-08-16)

```
# co2 = ost.read("https://ourworldindata.org/grapher/co-emissions-per-capita.csv?csvType=filtered&country=NOR~SWE~DNK~FIN~ISL&time=2014..2023")
```

50 rader (5 land × 10 år), kolonner `Entity, Code, Year, CO₂ emissions
per capita`; Norge 2023 = 7,04 tonn/innbygger. Slugen
`co-emissions-per-capita` lever (probet 2026-08-16). `country=` tar
OWID-landkoder adskilt med `~`, `time=` et `fra..til`-intervall —
begge kreves sammen med `csvType=filtered` (uten den: stille ignorert,
se Kort).

## Om kilden

Our World in Data — curated long-run global datasets (health, economy, environment, and more) as downloadable CSV files compiled from many primary sources.

