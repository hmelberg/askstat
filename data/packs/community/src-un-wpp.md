---
id: src-un-wpp
name: UN World Population Prospects
kind: AGGREGATE — estimates 1950-2023 + projections 2024-2100
access: open
api_base: https://population.un.org/dataportalapi/api/v1/
gotcha: metadata endpoints (indicators/locations) open, but the data endpoints (/data/indicators/...) now require auth (measured 2026-08-16); CSV responses begin with a 'sep=|' header line to skip; bulk gzip files are CORS-blocked in browsers
---

# UN World Population Prospects (WPP)

Aggregate population estimates 1950-2023 plus projections to 2100 via
API or bulk files.



The metadata endpoints (indicators, locations) are open, but the data
endpoints (`/data/indicators/{id}/locations/{id}/`) now require
authentication (measured 2026-08-16 — anonymous calls are rejected).
CSV responses begin with a `sep=|` header line to skip. The bulk gzip
files under population.un.org/wpp/ are CORS-blocked in browsers. Open
machine-readable alternatives that carry the WPP projections: OWID's
`population-with-un-projections` grapher CSV (the plain `population-unwpp`
dataset is historical only, to 2023) or the `wpp2024` R package.

