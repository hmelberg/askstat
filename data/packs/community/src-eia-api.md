# EIA API v2

The US Energy Information Administration's aggregate time-series API for
energy production, prices, consumption and generation — open with a free
key.

```yaml
- id: src-eia-api
  name: EIA API v2
  kind: AGGREGATE time series — production, prices, consumption, generation
  access: open, free key
  base: https://api.eia.gov/v2/
  ⚠: "does NOT carry RECS/CBECS respondent-level microdata (see the demography-migration-housing pack) — that is flat-file only. A common confusion point."
```

This API does NOT carry RECS/CBECS respondent-level microdata (see the
demography-migration-housing pack) — those are flat-file only. A common
confusion point.
