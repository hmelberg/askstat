# LEHD Origin-Destination Employment Statistics (LODES)

US Census Bureau census-block-pair job-flow data — where people live vs.
where they work, plus workplace/residence-area characteristics. Open, no
key, part of the openly-downloadable US labour set.

```yaml
- id: src-lodes
  name: LEHD Origin-Destination Employment Statistics
  provider: US Census Bureau
  unit: Census-block-pair job counts, plus residence/workplace-area characteristics
  years: 2002-2023
  access: open, no key
  url_pattern: "https://lehd.ces.census.gov/data/lodes/LODES7/{state}/{od|wac|rac}/{state}_{od|wac|rac}_main_JT00_{year}.csv.gz"
  packages: {r: [lehdr]}
  gotcha: "workers commuting cross-state appear in the home state's 'aux' file, not 'main'. LODES7 uses 2020 census blocks — not directly comparable to earlier vintages at block level."
```

Workers commuting cross-state appear in the home state's `aux` file, not
`main`. LODES7 uses 2020 census blocks — not directly comparable to
earlier vintages at block level. An R package (`lehdr`) wraps the
download.
