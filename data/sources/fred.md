---
id: fred
navn: FRED (St. Louis Fed)
utgiver: Federal Reserve
tillit: etablert
tilgang: rest
base_url: https://api.stlouisfed.org/fred/
cors: false
join_nokler: [date]
sporrings_url_mal: https://api.stlouisfed.org/fred/series/observations?series_id={id}&file_type=json
auth:
  type: api_key
  env: FRED_API_KEY
  plassering: query:api_key
tags: [makro]
order: 6
---

# FRED (St. Louis Fed)

## Kort

krever api_key (injiseres av /api/hent); file_type=json

## Om kilden

FRED (Federal Reserve Bank of St. Louis) — US and international macroeconomic and financial time series.

