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

- **Dimension-endepunktets kategorier er hierarkiske** `{label, value,
  children}`-objekter — `value`-feltet er koden (verifisert 2026-08-15:
  2-åringer = `"2_2"`, år = `"2002_2002"`, hele landet = `"0"`); bruk
  aldri label-teksten som kode. Verifisert også nokkel/394
  (barnevaksinasjon) i tillegg til daar/754.

## Oppskrift: barnevaksinasjon (nokkel/394, verifisert 2026-08-16)

Meslingdekning ved 2-årsalder, hele landet, siste år (96,2/95,8/95,9 %
for 2022–2024): POST mot
`https://statistikk-data.fhi.no/api/open/v1/nokkel/table/394/data` med
kropp `{"dimensions": [{"code": "GEO", "filter": "item", "values":
["0"]}, {"code": "AAR", "filter": "item", "values":
["2022_2022","2023_2023","2024_2024"]}, {"code": "KJONN", "filter":
"item", "values": ["0"]}, {"code": "ALDER", "filter": "item", "values":
["2_2"]}, {"code": "VAKSINE", "filter": "item", "values":
["Meslinger"]}, {"code": "MEASURE_TYPE", "filter": "item", "values":
["RATE"]}], "response": {"format": "json-stat2"}}` (via
`/api/hent?url=…&body=…`-direktivet). ALLE dimensjoner MÅ filtreres
(400 ellers). NB: tabell 394 er NASJONAL (GEO har kun kode 0) —
fylkesvariasjon krever en annen tabell; si det ærlig i stedet for å
lete lenge.

## Om kilden

Norwegian Institute of Public Health (FHI) — Norwegian public-health registry statistics (e.g. cardiovascular disease, infectious disease, vaccination), mostly at national level.

