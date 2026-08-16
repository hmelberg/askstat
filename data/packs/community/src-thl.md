---
id: src-thl
name: THL — Finnish Institute for Health and Welfare
registers: [Hilmo (hospital discharge), Cause of Death, Medical Birth, Infectious Diseases]
open_data: https://thl.fi/en/research/open-data
apis: [Sotkanet REST (https://sotkanet.fi/rest/1.1/indicators, keyless JSON/CSV), sampo.thl.fi pivot cubes (e.g. https://sampo.thl.fi/pivot/prod/api/hilmokokonaisuus/kuutio01.json)]
gotcha: thl.fi restructured in 2026 — the old /statistics-and-data/... open-API paths 404; the live open-data page is /en/research/open-data (verified 2026-08-16)
---

# THL — Finnish Institute for Health and Welfare

Runs Finland's core health registers — Hilmo, Cause of Death, Medical
Birth and Infectious Diseases — and publishes open data via two APIs.



The Sotkanet indicator bank (2000+ welfare/health indicators since 1990)
has a keyless REST API: `https://sotkanet.fi/rest/1.1/indicators` for
metadata, data in CSV/JSON (R package `sotkanet` on ropengov wraps it).
Register-derived cube data is served by the sampo pivot API
(`https://sampo.thl.fi/pivot/prod/api/<subject>/<cube>.json`). Both
verified live 2026-08-16. Note: thl.fi restructured in 2026 — old
`/statistics-and-data/...` paths 404; the open-data landing page is
`https://thl.fi/en/research/open-data`.
