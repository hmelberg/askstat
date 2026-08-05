# US health surveys (NHIS / MEPS)

Use this pack when questions concern **individual-level US health data** —
health status, insurance coverage, healthcare use and expenditure.

## Preferred sources

1. **ipums** (registry source, user key required) — IPUMS Health Surveys
   harmonizes the two key surveys:
   - **NHIS** — National Health Interview Survey: annual household survey
     on health status, conditions, insurance and behaviors.
   - **MEPS** — Medical Expenditure Panel Survey: healthcare use and
     **expenditure** panels; the go-to for cost questions.
   The ipums source guide (attached on first catalog call) describes the
   stateless extract flow. A user API key must be registered in the AI
   settings; without it, say so honestly and fall back to aggregate sources.
2. **nchs** (registry source, no key needed) — direct open files:
   - NHANES XPT per 2-year cycle (exam/lab data: BMI, blood pressure,
     biomarkers) — small files, instant, no extract queue.
   - NHIS one-year CSV (adult{yy}csv.zip) — fastest path for a single
     recent NHIS year; use IPUMS for multi-year harmonized series.
   The nchs source guide has the URL patterns and the soft-404 trap.
3. **MEPS direct files** when IPUMS lags a year: open Stata zips at
   meps.ahrq.gov (e.g. h243dta.zip = 2022 consolidated, 5.8 MB zip /
   58 MB .dta — heavy but loadable; no registration, no CORS → proxy).
4. **Aggregate fallbacks** when microdata is not needed:
   - **cdc** (registry source) — data.cdc.gov SODA: BRFSS/PLACES
     prevalence, mortality, chronic disease indicators (keyless,
     CORS-open, SoQL filters).
   - MEPS summary tables: https://meps.ahrq.gov/mepsweb/
   - worldbank/oecd/dbnomics for internationally comparable US health
     indicators.

## Analysis notes (survey data)

- Both surveys need **weights** for population estimates — look for weight
  and strata variables and say in the answer whether estimates are weighted.
- Check special missing codes (7/8/9, 97/98/99 patterns = don't know /
  refused / not ascertained) before computing.
- Documentation: NHIS https://www.cdc.gov/nchs/nhis/documentation/index.html
  and MEPS https://meps.ahrq.gov/mepsweb/data_stats/download_data_files.jsp
  — quote the codebook lines that matter rather than guessing.
