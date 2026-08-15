---
id: scb
navn: Statistikmyndigheten SCB (PxWebApi 2)
utgiver: SCB
tillit: offisiell
tilgang: pxweb
kind: pxweb
sprak: en
base_url: https://api.scb.se/ov0104/v2beta/api/v2/
sok_endepunkt: https://api.scb.se/ov0104/v2beta/api/v2/tables?query={q}&lang=sv
cors: true
join_nokler: [region, år, kön]
sporrings_url_mal: https://api.scb.se/ov0104/v2beta/api/v2/tables/{id}/data?valueCodes[{var}]={koder}&outputFormat=csv&lang=sv
tags: [makro, sverige]
order: 13
---

# Statistikmyndigheten SCB (PxWebApi 2)

## Kort

Verifisert 2026-07-23: søk (GET .../tables?query={q}&lang=sv|en) gir {"tables":[{id,label,firstPeriod,lastPeriod,...}]} — adapter-kompatibel; i motsetning til SSB virker /data på SAMME v2beta-sti (ingen v2/v2-beta-splitt); outputFormat=csv gir CSV direkte uten filter, og med valueCodes[dim]=kode når man vil begrense; dataendepunktet sender Access-Control-Allow-Origin: * (CORS OK, verifisert med curl -sI mot .../data); valueCodes-nøkler må være metadata-dimensjonskoder (f.eks. 'Alder', 'Kon', 'Tid' — fra /tables/{id}/metadata), IKKE søkeresultatets variableNames-etiketter (som er små bokstaver, f.eks. 'region', 'år', 'kön'); mangler obligatorisk dimensjon gir HTTP 400 'Missing selection for mandantory variable'.

## Om kilden

Statistics Sweden — official Swedish statistics: population, economy, labour, and other topics by region.

