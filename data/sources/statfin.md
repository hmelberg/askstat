---
id: statfin
navn: Statistikcentralen StatFin
utgiver: Tilastokeskus
tillit: offisiell
tilgang: rest
kind: statfin
base_url: https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/
cors: false
join_nokler: [Vuosi (år), Alue (region)]
tags: [makro, finland]
order: 14
---

# Statistikcentralen StatFin

## Kort

Verifisert 2026-07-23: ingen PxWebApi 2 finnes (pxdata.stat.fi/api/v2, api.stat.fi/v2 osv. gir alle 404) — kun v1 (PXWeb) finnes, derfor ingen sok_endepunkt/pxweb-adapter; mappenavigasjon er GET/JSON, f.eks. .../StatFin/ og .../StatFin/tyti/ (tyti=arbeidskraftsundersøkelsen) lister tabeller ({id,type,text,updated}); tabell-metadata (variabelkoder) hentes med GET på tabell-URLen (f.eks. .../StatFin/tyti/135y.px), MEN selve datauttrekket krever POST med JSON-body {query:[{code,selection:{filter:'item',values:[...]}}, ...],response:{format:'csv'}}; navigasjon+metadata (GET) sender Access-Control-Allow-Origin: *, men datauttrekket (POST) sender INGEN CORS-header — må derfor alltid gå via /api/hent-proxy; mønster: POST-uttrekk GET-innpakkes via proxyens body-param, f.eks. GET /api/hent?url=<url-enkodet https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/tyti/135y.px>&body=<url-enkodet {"query":[{"code":"timeperiod_m","selection":{"filter":"item","values":["2026M05"]}}],"response":{"format":"csv"}}> as tabell; finn tabell-id og variabelkoder ved å navigere mappestrukturen (web_search + probe) og lese metadata før uttrekk.

## Om kilden

Statistics Finland (StatFin) — official Finnish statistics: population, economy, labour, and other topics by region.

