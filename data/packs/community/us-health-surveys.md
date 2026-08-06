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

## ⚠ Standing caveat: CDC/NCHS data systems (2025-2026)

Following the 2025 HHS/CDC restructuring, several CDC systems had outages or
suspended collection. As of Aug 2026, NHANES/NHIS/BRFSS/WONDER download
infrastructure is confirmed live, but: **PRAMS has been suspended since
January 2025** (treat as unavailable); **NAMCS/NHAMCS were discontinued**
(archived to `archive.cdc.gov`); **NSFG status is unclear** — verify the
current cycle before promising it. `restoredcdc.org` is a volunteer archive
of pre-2025 page snapshots — a frozen fallback when a `cdc.gov` page 404s,
not a live mirror. Check liveness before promising a download from any
CDC-hosted file.

## More US health microdata

Beyond NHIS/MEPS, several other surveys and registries are worth knowing —
some directly usable, several application-gated (say so honestly rather
than substituting a fabricated number):

```yaml
- id: brfss
  name: Behavioral Risk Factor Surveillance System
  provider: CDC
  unit: person (adult), state-representative
  n_per_year: "~400,000+ (2024: 457,670)"
  access: open, no key
  data_url_pattern: "https://www.cdc.gov/brfss/annual_data/{YEAR}/files/LLCP{YEAR}XPT.zip"
  weight_vars: [_LLCPWT]
  design_vars: [_PSU, _STSTR]
  use: "the only US source giving reliable state-level (and via SMART, some county/MSA) chronic-disease prevalence — cdc source's PLACES/BRFSS tables give the aggregate shortcut; this is the microdata behind them"
  gotcha: "states add optional modules — variable availability varies by state x year; weighting changed to raking + cell phones added in 2011, don't cross that break naively"
- id: nsduh
  name: National Survey on Drug Use and Health (SAMHDA)
  provider: SAMHSA
  unit: person aged 12+
  access: "open (public-use, click-through); application for restricted-use with finer geography"
  formats: [spss, sas, stata]
  weight_vars: [ANALWT_C]
  use: "substance use, SUD, serious psychological distress, major depressive episode, suicidality"
  gotcha: "the public-use file has NO state identifier; 2020-21 fieldwork disrupted by COVID, not cleanly comparable to earlier years"
- id: nvss
  name: National Vital Statistics System (natality/mortality public-use files)
  provider: CDC/NCHS
  unit: "one record per birth (~3.6M/yr) or death (~3.3M/yr)"
  access: "open (public micro files); application for identified/geo-detailed"
  mirror: https://www.nber.org/research/data/vital-statistics-natality-birth-data
  note: "genuine record-level data, distinct from CDC WONDER (below) which returns tabulated cells only"
- id: cdc_wonder
  name: CDC WONDER
  kind: "query API returning AGGREGATED/TABULATED cells (suppressed <10), NOT microdata"
  api_method: "POST only, entire query as an XML document in a request_xml field, response as XML"
  api_base: "https://wonder.cdc.gov/controller/datarequest/{DATABASE_ID}"
  rate_limit: "recommended max 1 query / 2 minutes for automated use"
  gotcha: "no OpenAPI spec, no structured registry of database IDs — confirm the current mortality DB id at wonder.cdc.gov/ucd-icd10.html before querying"
- id: hrs
  name: Health and Retirement Study
  provider: NIA + SSA, University of Michigan ISR
  unit: person aged 50+ and spouses, biennial since 1992
  access: "free-registration (public files); application (restricted biomarker/genetic/geographic)"
  recommended_entry_point: "RAND HRS Longitudinal File — pre-cleaned, harmonized across 15+ waves; using raw core files means hand-merging dozens of wave-specific files"
  sister_studies: "ELSA/SHARE/CHARLS/LASI/MHAS/TILDA and others use harmonised instruments — see the europe-surveys and global-surveys packs; Gateway to Global Aging (g2aging.org) harmonizes variable names across all of them"
- id: seer
  name: SEER cancer registry
  provider: National Cancer Institute
  coverage: "population-based registries covering ~48% of the US population"
  access: application (registration + signed DUA)
  linked_product: "SEER-Medicare (claims-linked) — separate, stricter application"
- id: hcup
  name: Healthcare Cost and Utilization Project (NIS/NEDS/KID/SID)
  provider: AHRQ
  content: "the largest all-payer hospital administrative data in the US — diagnoses, procedures, charges/costs, LOS"
  access: "purchase (account + training + signed DUA + fee) — cost not published, varies by database-year"
  free_aggregate_tool: https://datatools.ahrq.gov/hcupnet/
  weight_vars: [DISCWT, TRENDWT]
  gotcha: "NIS redesigned in 2012 from hospital-level to discharge-level sampling — use TRENDWT for series spanning the break"
- id: cms_synpuf
  name: CMS DE-SynPUF (2008-2010 synthetic Medicare claims)
  access: "open, no registration, safe for any use including LLM ingestion"
  use: "prototype claims-analysis pipelines here; NOT valid for substantive inference about the Medicare population — real inference needs CMS LDS/RIF (application) or the VRDC enclave"
- id: mimic_iv
  name: MIMIC-IV (critical-care EHR)
  provider: MIT Laboratory for Computational Physiology
  access: "application — PhysioNet credentialed access (CITI training + signed DUA + human review)"
  demo_version: "mimic-iv-demo (~100 patients) requires NO credentialing — use for prototyping"
  gotcha: "dates are randomly shifted per patient — intervals within a patient are preserved but absolute calendar time is meaningless; cannot align with external events"
- id: all_of_us
  name: All of Us Research Program
  provider: NIH
  access: "enclave — Researcher Workbench (cloud Jupyter/RStudio). Registered-tier data CANNOT be downloaded locally."
  note: "describe as an enclave, never as a downloadable dataset — outputs pass disclosure review before leaving"
```
