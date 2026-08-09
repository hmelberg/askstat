---
id: fhi
navn: Folkehelseinstituttet (statistikk-data.fhi.no åpne API)
utgiver: Folkehelseinstituttet
tillit: offisiell
tilgang: rest
kind: fhi
base_url: https://statistikk-data.fhi.no/api/open/v1/
cors: true
join_nokler: [AAR (år), GEO]
sporrings_url_mal: https://statistikk-data.fhi.no/api/open/v1/{register}/table/{tabell}/data
tags: [makro, norge]
order: 16
---

# Folkehelseinstituttet (statistikk-data.fhi.no åpne API)

## Kort

Verifisert 2026-07-23: Common/source lister registre (daar, nokkel, npr, msis, sysvak, ...); {reg}/table lister tabeller; {reg}/table/{id}/dimension gir dimensjonskoder+kategorier; uttrekk=POST .../table/{id}/data — ALLE dimensjoner må filtreres (400 ellers), kun format 'json-stat2' (csv avvist); geo-nivå ofte kun nasjonalt (GEO=1 kategori i stikkprøve), kommunenivå ubekreftet; POST innpakkes via proxy, verifisert eksempel: # load /api/hent?url=<url-enkodet https://statistikk-data.fhi.no/api/open/v1/daar/table/754/data>&body=<url-enkodet {"dimensions":[{"code":"DAAR","filter":"item","values":["2020","2021"]},{"code":"KJONN","filter":"item","values":["Total"]},{"code":"HJERTEKAR","filter":"item","values":["Total"]},{"code":"MEASURE_TYPE","filter":"item","values":["RATE_NO"]}],"response":{"format":"json-stat2"}}> as fhi_raw

## Om kilden

Norwegian Institute of Public Health (FHI) — Norwegian public-health registry statistics (e.g. cardiovascular disease, infectious disease, vaccination), mostly at national level.

