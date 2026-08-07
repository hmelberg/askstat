# Residential Energy Consumption Survey (RECS)

True microdata on household energy use, appliances and building
characteristics. Latest wave (2020, v7) covers ~18,500 households
representing 123.5M primary residences; open access.

```yaml
- id: src-recs
  name: Residential Energy Consumption Survey
  kind: TRUE MICRODATA — household energy use, appliances, building characteristics
  latest: "2020 (v7), ~18,500 households representing 123.5M primary residences"
  access: open
  csv: https://www.eia.gov/consumption/residential/data/2020/csv/recs2020_public_v7.csv
  ⚠: "96 replicate weights, Fay's BRR — naive weighting misstates standard errors"
  sibling: "CBECS (commercial buildings), latest full wave 2018"
```

Uses 96 replicate weights (Fay's BRR) — naive weighting misstates
standard errors. The sibling survey CBECS covers commercial buildings,
latest full wave 2018.
