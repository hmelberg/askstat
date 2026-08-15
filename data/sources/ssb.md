---
id: ssb
navn: Statistisk sentralbyrå (PxWebApi 2)
utgiver: SSB
tillit: offisiell
tilgang: pxweb
kind: pxweb
styrt: true
base_url: https://data.ssb.no/api/pxwebapi/v2/
sok_endepunkt: https://data.ssb.no/api/pxwebapi/v2/tables?query={q}&lang=no
cors: true
join_nokler: [kommunenummer, fylkesnummer, år]
sporrings_url_mal: https://data.ssb.no/api/pxwebapi/v2/tables/{id}/data?valueCodes[{var}]={koder}&outputFormat=csv
tags: [makro, norge]
order: 0
---

# Statistisk sentralbyrå (PxWebApi 2)

## Kort

PxWebApi v2 — svarer json-stat2 (tidy, koder som verdier) via
`<alias>.read(...)`; kjente tabellnumre for befolkning: 07459/11342,
for KPI/inflasjon: 14706 (vekstrater)/14710 (indeksnivå).

## Guide

# SSB (Statistisk sentralbyrå) — PxWebApi v2

kilde: SSBs api-eksempler (janbrus), destillert 2026-07-31

## Komplett eksempel (Oslos folkemengde, tabell 11342)

```
# ssb = ost.connect("ssb")
# oslo = ssb.read("11342", regions=["0301"], indicators=["Folkemengde"], years="2015:2024")
```

Verifisert 2026-07-31: `Region=0301` (Oslo kommune) sammen med
`ContentsCode=Folkemengde` gir data uten 400. Fant du ikke riktig
regionkode i kodelisten? Bruk `find="Oslo"` i `table_metadata` fremfor å
gjette koder — `table_metadata` gir også en ferdig `lese_linje` for
valgt tabell: kopier og juster kun parameterverdiene. Lese-linjen er
ferdig verifisert — `ssb.read` trenger aldri probe (probe avviser
uansett alle rå SSB-URL-er).

## Mandatory-regelen

En FILTRERT spørring MÅ oppgi verdier for ALLE dimensjoner som har
`elimination: false` i tabellens metadata. To dimensjoner er ALLTID
obligatoriske — `ContentsCode` (hva som måles, `indicators=`) og `Tid`
(tid, `years=`) — selv i tabeller med bare ett innholdsalternativ:
`indicators=["<koden>"]` skal med likevel. Mangler én: SSB svarer `400
Bad Request` med `title`-feltet `"Missing selection for mandantory
variable"` (ja, SSBs egen stavefeil — «mandantory»); responsen ellers
er bare `type`/`title`/`status` — INGEN liste over hvilke koder som
mangler. Sjekk `mandatory`-flagget per dimensjon i
`table_metadata`-svaret FØR du bygger spørringen — ikke gjett hvilke
som trengs.

## Tidsuttrykk (Tid-dimensjonen)

Funksjonsfiltre brukes ALENE i valueCodes for Tid (ikke sammen med
eksplisitte koder):

- `top(n)` — de n nyeste periodene
- `from(år)` — fra og med gitt periode

`range(fra,til)` finnes IKKE i PxWeb v2 — SSB svarer `400 Bad Request`
(`"Illegal selection expression"`) på den, verifisert 2026-07-31. Skal
du ha et lukket intervall, enumerer eksplisitte tidskoder i stedet.

Eksplisitte tidskoder må matche tabellens `timeUnit` (årlig: `"2024"`;
kvartalsvis: `"2024K2"`). I `<alias>.read(...)` skrives et lukket
intervall som `years="2015:2024"` — adapteren enumererer dette til
`valueCodes[Tid]=2015,2016,...,2024` (aldri `range()`). Et åpent
intervall (`years="2015:"`) oversettes til `valueCodes[Tid]=from(2015)`.

## Codelists (aggregering/utvalg)

Region- og andre dimensjonskoder kan komme i to typer kodelister
(`dimension.<variabel>.extension.codeLists` i metadata): `agg_`-prefiks
er en AGGREGERING (mange koder summeres til én, f.eks. kommune →
fylke), `vs_`-prefiks er et VALUESET (et alternativt, ofte kortere
utvalg av koder). Koder fra ulike codelists må ikke blandes.

## Kjente feller

- **PxWebApi v1 (= `/api/v0/`) er stengt i appen** — bruk PxWeb v2 via
  `ssb.read(...)`; rå URL-er mot SSB avvises uansett av verktøyene
  (styrt kilde).
- **`/tables/{id}/variables` finnes ikke i v2** (404) — dimensjoner og
  koder bor i `table_metadata`.
- **`range(fra,til)` finnes ikke** — bruk `top(n)`/`from(år)`, eller
  enumerer eksplisitte tidskoder for et lukket intervall.
- **Tolvmånedersvekst i KPI: bruk 14706 (avledede serier,
  `indicators=["Tolvmanedersendring"]`) — 14710 er indeksNIVÅET, ikke
  veksten.** Fritekstsøket viser sjelden 14706 (målt: aldri i topp-3 for
  naturlige fraser); modellen brant 5+ runder på 14710-omveien i
  inflasjons-runden 2026-08-15. Tabellen live-verifiseres av
  kildeharnessen (tools/harness/utforsk.py).
- Ukjent variabel-/verdikode, feil tidsformat, for mange celler og
  manglende obligatorisk dimensjon gir alle `400` — `title`-feltet i
  responsen forteller hvilken (ingen kodeliste følger med).

## Om kilden

Statistics Norway — official Norwegian statistics: population, economy, labour, health, education, and more, down to municipality level.

