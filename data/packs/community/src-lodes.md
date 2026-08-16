---
id: src-lodes
name: LEHD Origin-Destination Employment Statistics
provider: US Census Bureau
unit: Census-block-pair job counts, plus residence/workplace-area characteristics
years: 2002-2023
access: open, no key
url_pattern: https://lehd.ces.census.gov/data/lodes/LODES8/{state}/{od|wac|rac}/{state}_{od|wac|rac}_main_JT00_{year}.csv.gz
packages: "{r: [lehdr]}"
gotcha: workers commuting cross-state appear in the home state's 'aux' file, not 'main'. Use LODES8 (2020 census blocks, years 2002-2023, verified 2026-08-16); the older LODES7 folder (2010 blocks) stops at 2019 — block-level vintages are not directly comparable.
---

# LEHD Origin-Destination Employment Statistics (LODES)

US Census Bureau census-block-pair job-flow data — where people live vs.
where they work, plus workplace/residence-area characteristics. Open, no
key, part of the openly-downloadable US labour set.



Workers commuting cross-state appear in the home state's `aux` file, not
`main`. Use the LODES8 folder — it enumerates on 2020 census blocks and
covers 2002-2023 (verified 2026-08-16: LODES7 stops at 2019, a 2021 fetch
there 404s). Block-level vintages (LODES7 = 2010 blocks) are not directly
comparable. An R package (`lehdr`) wraps the download.

