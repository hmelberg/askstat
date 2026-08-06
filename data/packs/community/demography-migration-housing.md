# Demography, migration, housing and time use

Use this pack for **population structure, mortality/fertility, migration,
housing, consumption and time-use** questions at the record level. This
domain has the highest density of *aggregate data mistaken for microdata*
anywhere in these packs: the Human Mortality/Fertility Databases, UN WPP,
Eurostat `demo_*`/`migr_*`, OECD DIOC, and every population grid (GHSL,
WorldPop, GEOSTAT, NHGIS) are **tabulated rates and counts, not individual
records**. Say so explicitly whenever handing these downstream — never
present a rate table as if it were a row-level file. True microdata in this
domain: census microdata (IPUMS International, national releases), HFCS,
the American Housing Survey, RECS, the Consumer Expenditure Survey, UK Land
Registry, MTUS/HETUS/ATUS, and the migration surveys MAFE/MIGNEX.

## Mortality, fertility and life tables — aggregate but canonical

```yaml
- id: hmd
  name: Human Mortality Database
  kind: AGGREGATE — period/cohort life tables, death counts, exposure, births
  coverage: "~41 countries; Sweden from 1751, most from the early 1900s"
  access: free registration
  packages: {r: [HMDHFDplus, MortalityLaws]}
  ⚠_gotcha: "login moved ~2022 to mortality.org/Account/Auth — any pre-2022 script will fail. Use HMDHFDplus >= 2.x."
- id: hfd
  name: Human Fertility Database
  kind: AGGREGATE — period/cohort fertility rates, births, exposure
  coverage: "30+ countries, many from the 1950s"
  access: "free registration — SEPARATE credentials from HMD"
- id: stmf
  name: Short-Term Mortality Fluctuations
  kind: AGGREGATE — weekly all-cause deaths by country/sex/broad age group
  access: OPEN, no login (unlike core HMD)
  bulk_csv: https://www.mortality.org/File/GetDocument/Public/STMF/Outputs/stmf.csv
  use: excess-mortality and mortality-shock monitoring
  gotcha: "weekly data provisional and revised; age groups coarse"
- id: un_wpp
  name: UN World Population Prospects
  kind: AGGREGATE — estimates 1950-2023 + projections 2024-2100
  access: open
  api_base: https://population.un.org/dataportalapi/api/v1/
  gotcha: "CSV responses begin with a 'sep=|' header line to skip; prefer the bulk files/wpp2024 package for a vintage-consistent full indicator set"
```

## Census and population microdata — the real thing

```yaml
- id: ipums_international
  name: IPUMS International
  kind: TRUE MICRODATA — harmonised individual/household census records
  coverage: "90+ countries, 1800s-2020 census rounds; most from the 1960s"
  access: registration; some extracts need extra approval
  api: "same extract API as the rest of IPUMS — see the us-health-surveys pack for the flow"
  gotcha: "not every country releases individual-level microdata — some are household-only or sample-restricted; fine geography may be a restricted extract"
- id: uk_census_microdata
  tiers: {open_teaching: "UKDS study 9202, 2021 Public/Teaching sample, OGL", safeguarded: "individual/household samples at Region/Grouped-LA level, registration", secure: "up to ~9% sample, ONS SecureLab only"}
- id: insee_fichiers_detail
  name: France — INSEE census "fichiers détail"
  kind: TRUE MICRODATA
  access: OPEN — freely downloadable from insee.fr
  content: "individual and household extracts from the rolling annual census, aggregated to region/department/canton/city geography"
  weight_var: IPONDI
  gotcha: "counts below ~200 flagged imprecise; zones under 2,000 inhabitants excluded from complementary tables"
- id: ine_census_microdata
  name: Spain — INE census microdata
  access: "open for public-use files; application for detailed files"
  census_2021_status: UNVERIFIED — a public sample analogous to 2011 was not confirmed; check IPUMS International as a fallback
- id: us_decennial_post_dp
  name: US decennial census after differential privacy
  changes: "traditional decennial PUMS was already replaced pre-2020 by the ACS; a new Privacy-Protected Microdata File (PPMF, released 5 Aug 2024) is Census's stated successor — individual-level, differentially private, block-level custom geography"
  ppmf_access_tier: UNVERIFIED — likely restricted/approved-researcher, not a simple open download
  gotcha: "small-area decennial counts have documented accuracy degradation vs pre-2020 products"
- id: acs_pums
  name: American Community Survey PUMS
  note: "the ongoing open US person/household workhorse — see the us-social-surveys pack for the full detail (weights PWGTP/WGTP, CENSUS_API_KEY)"
```

**European census caveat.** Eurostat's Population and Housing Census portal
is a publication/metadata catalogue only — member states send Eurostat
aggregated outputs. Person-level European census microdata comes from
national institutes (see `europe-national-microdata`) or IPUMS
International, never from Eurostat directly.

## Migration

```yaml
- id: oecd_dioc
  name: OECD DIOC / DIOC-E
  kind: AGGREGATE cross-tabs derived from census/register microdata
  use: emigration rates by skill level, education × occupation × country of birth/destination
  access: open
  ⚠: "not individual microdata — for records go to the underlying census programmes"
- id: eurostat_migr
  kind: AGGREGATE — immigration/emigration/stock/asylum by citizenship
  access: open — https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/migr_asyappctza
- id: eu_lfs_migration_modules
  kind: TRUE MICRODATA — ad-hoc migration modules
  public: "open, but training/methods only — NOT valid for population inference"
  scientific_use: application (estat-microdata-access@ec.europa.eu)
- id: unhcr_microdata
  name: UNHCR Microdata Library
  kind: TRUE MICRODATA — surveys, needs assessments, registration-linked data on forcibly displaced/stateless populations
  access: "mixed per dataset — public, public-use, or licensed. ALWAYS read the specific study's Access Policy field — openness is per-dataset, not library-wide."
- id: iom_dtm
  name: IOM Displacement Tracking Matrix
  access: "open via API and HDX — site-level aggregate mostly, some Baseline/Household components approach microdata"
  gotcha: "crisis-driven coverage, not a standing global panel"
- id: mafe
  name: MAFE — Migrations between Africa and Europe
  kind: TRUE MICRODATA — matched sending/receiving-country survey
  countries: "Senegal, DR Congo, Ghana ↔ France, Spain, Italy, UK, Netherlands, Belgium"
  fieldwork: "~2008-2010, legacy, no updates"
  access: "via INED's catalogue — registration and terms of use, exact tier UNVERIFIED per dataset"
- id: mignex
  name: MIGNEX
  kind: TRUE MICRODATA — household survey on migration drivers/aspirations
  access: OPEN — an open-access variant on Zenodo (https://zenodo.org/records/13991767)
  gotcha: "the open variant masks/aggregates some variables (e.g. precise geolocation) relative to the full dataset"
```

## Housing, consumption and wealth

```yaml
- id: hfcs
  name: ECB Household Finance and Consumption Survey
  kind: TRUE MICRODATA — household wealth, debt, income, consumption
  waves: [2010, 2014, 2017, 2021]
  access: "application — government photo ID, English CV, request form"
  ⚠: "5 multiply-imputed implicates per country-wave — variance needs Rubin's rules; several countries oversample wealthy households"
- id: eurostat_hbs
  name: Eurostat Household Budget Survey
  kind: TRUE MICRODATA — household consumption expenditure
  reference_years: [2010 (26 countries), 2015 (26), 2020 (27)]
  access: "application (Scientific Use Files, recognised research entities)"
  aggregate_alternative: "hbs_* tables in the Eurostat Data Browser are open — use if only summary statistics are needed"
- id: ahs
  name: American Housing Survey
  kind: TRUE MICRODATA — housing unit and household level
  access: open, no registration
  content: [housing quality, costs, tenure, mortgages, neighbourhood, climate-risk modules]
  gotcha: "rotating panel with longitudinal housing-unit identifiers — merging across waves needs care with unit-ID continuity"
- id: recs
  name: Residential Energy Consumption Survey
  kind: TRUE MICRODATA — household energy use, appliances, building characteristics
  latest: "2020 (v7), ~18,500 households representing 123.5M primary residences"
  access: open
  csv: https://www.eia.gov/consumption/residential/data/2020/csv/recs2020_public_v7.csv
  ⚠: "96 replicate weights, Fay's BRR — naive weighting misstates standard errors"
  sibling: "CBECS (commercial buildings), latest full wave 2018"
- id: ce_pumd
  name: Consumer Expenditure Survey PUMD
  provider: BLS
  access: open
  url_pattern: "https://www.bls.gov/cex/pumd/data/{sas|stata|csv}/{intrvw|diary}{YY}.zip"
  coverage: "1980-2024 (no PUMD 1982-83); state identifiers for CA/FL/NY/TX from 2016"
- id: land_registry_ppd
  name: HM Land Registry Price Paid Data
  kind: TRUE MICRODATA — individual property transaction records
  coverage: "England & Wales, 1995-present"
  access: OPEN, Open Government Licence v3.0
  downloads: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
  gotcha: "excludes some non-market transfers; Scotland (Registers of Scotland) and Northern Ireland publish separately"
- id: nordic_house_prices
  status: "UNVERIFIED / likely NOT openly available. Norway publishes only an aggregate house price index (Boligprisindeksen) via SSB; transaction-level data sits in Kartverket's Grunnboken (fee-based) or with commercial resellers. Use Eurostat's prc_hpi_* aggregate series as the safe cross-Nordic fallback."
```

## Time use

```yaml
- id: mtus
  name: Multinational Time Use Study
  kind: TRUE MICRODATA — harmonised time diaries across many countries
  access: "registration — an IPUMS MTUS account"
  related: AHTUS (American Heritage Time Use Study)
- id: hetus
  name: Harmonised European Time Use Surveys
  kind: TRUE MICRODATA — household, individual, 10-minute diary records
  round_2: "reference year 2010, 17 countries incl. NO"
  round_3: "HETUS 2020 — microdata not expected before 2027"
  access: "application (Scientific Use Files, recognised research entities)"
  gotcha: "aggregate HETUS tables ARE open in the Eurostat Data Browser — most quick lookups need no application"
- id: atus
  name: American Time Use Survey
  access: open, single-year files 2003-2025
  harmonised_alternative: "IPUMS ATUS-X — preferred for multi-year work"
```

## Population grids and geography (for linking microdata to place — not microdata themselves)

```yaml
- id: ghsl
  name: Global Human Settlement Layer
  kind: GRIDDED — population, built-up surface, settlement typology
  access: open, no registration
- id: worldpop
  kind: GRIDDED — population counts/density, age/sex structured; 100m and 1km resolution
  access: open
- id: geostat
  name: GEOSTAT population grid (Eurostat)
  kind: GRIDDED — 1km² cells, ETRS89/LAEA
  access: open (click-through terms, no account)
- id: tiger
  name: US Census TIGER/Line
  kind: vector geography — boundaries only, join via GEOID
  access: open
- id: nhgis
  name: National Historical Geographic Information System (IPUMS)
  kind: AGGREGATE summary tables + GIS boundaries, US 1790-present
  access: registration
  gotcha: "boundaries redrawn each census — match boundary vintage to your tabulation year"
- id: sedac
  name: NASA SEDAC
  kind: GRIDDED — Gridded Population of the World, urban extent, environmental exposure
  access: "open (free NASA Earthdata Login for programmatic download)"
```

## Cross-cutting notes

- **Aggregate vs microdata is the dominant error here.** HMD, HFD, UN WPP,
  Eurostat `demo_*`/`migr_*`, DIOC and every grid product are aggregate or
  gridded — say so explicitly.
- **The EU-LFS public microdata trap.** Genuinely open, genuinely unusable
  for population inference — training/development only.
- **Multiple imputation appears twice** — HFCS above, and the US Survey of
  Consumer Finances (Federal Reserve, federalreserve.gov/econres/scfindex.htm,
  not otherwise documented in these packs — 5 implicates per household),
  both need Rubin's rules, not naive pooling.
- Platform migrations broke old URLs across this domain (OECD.Stat → Data
  Explorer, GHSL's JRC domain → Copernicus, HMD's login) — treat any
  pre-2023 script as potentially stale and probe before promising a file.
