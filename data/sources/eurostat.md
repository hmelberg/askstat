---
id: eurostat
navn: Eurostat (dissemination API)
utgiver: Eurostat
tillit: offisiell
tilgang: rest
base_url: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/
cors: true
join_nokler: [geo (NUTS/ISO2), time]
sporrings_url_mal: https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{dataset}/?format=SDMX-CSV&{dim}={kode}
kind: eurostat
styrt: true
tags: [makro]
order: 1
---

# Eurostat (dissemination API)

## Kort

kind(eurostat): json-stat2 via statistics/1.0/data/<kode>?format=JSON&lang=en + direkte dimensjonsfiltre (geo=NO&na_item=B1GQ — ikke valueCodes); sinceTimePeriod/untilTimePeriod for tid; katalog-proben bruker lastTimePeriod=1 og 400-er kombinert med brukerens tidsfiltre (strippes av proben). base_url endret 2026-07-25 til data-endepunktet (før: dissemination-roten) så «connect eurostat» virker uten full URL.

## Guide

# Eurostat — kildeguide

- Kanonisk vei: `# e = eurostat.read("<datasettkode>", years="2015:2024", filters={"geo": "NO", "unit": "PC_GDP"})` — kildens EGNE dimensjoner (geo, unit, na_item, sex, age, siec …) kan gis i filters={} ELLER skrives direkte som egne parametre på direktivlinja (f.eks. `geo="NO", unit="PC_GDP"`) — de oversettes automatisk til filters. indicators= finnes IKKE for eurostat (velg med filters); countries=/regions= aksepteres og oversettes til geo=-parametre — men foretrekk filters={"geo": "..."} så utvalget står samlet ett sted.
- geo-koder er Eurostats egne: "NO" (ikke NOR), EU-aggregat "EU27_2020". Sjekk kodene med table_metadata(find="Norway") — aldri gjett.
- Norge ER med i de fleste datasett (EFTA-rapportering), ofte også regionalt (NUTS: NO0…-koder).
- years="2015:2024" oversettes til sinceTimePeriod/untilTimePeriod. Kvartals-/månedsdata: filtrer heller med kildens egne tidskoder via filters.
- Datasettkoder er små bokstaver (nama_10_gdp, hlth_sha11_hf) — store bokstaver 404-er.
- Uttrekk uten filters kan bli enorme — velg alltid geo + de sentrale dimensjonene eksplisitt.

## Om kilden

Eurostat — official EU/EFTA statistics (incl. Norway): economy, population, health, environment, and other harmonized European indicators.

