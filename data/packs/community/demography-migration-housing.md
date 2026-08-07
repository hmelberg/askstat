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

**European census caveat.** Eurostat's Population and Housing Census portal
is a publication/metadata catalogue only — member states send Eurostat
aggregated outputs. Person-level European census microdata comes from
national institutes (see `europe-national-microdata`) or IPUMS
International, never from Eurostat directly.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

### Mortality, fertility and life tables

- **Human Mortality Database** (id: src-hmd) — aggregate period/cohort life tables, death counts and exposure for ~41 countries, free registration.
- **Short-Term Mortality Fluctuations** (id: src-stmf) — weekly all-cause deaths, open, no login; excess-mortality and mortality-shock monitoring.
- **UN World Population Prospects** (id: src-un-wpp) — aggregate population estimates and projections 1950-2100, open API/bulk files.

### Census and population microdata

- **IPUMS International** (id: src-ipums-international) — harmonised individual/household census microdata for 90+ countries, registration required.
- **INSEE fichiers détail** (id: src-insee-fichiers-detail) — France's open individual/household census extracts, freely downloadable.
- **US decennial post-differential-privacy microdata** (id: src-us-decennial-post-dp) — the PPMF successor to decennial PUMS, access tier unverified.

### Migration

- **MIGNEX** (id: src-mignex) — household survey on migration drivers/aspirations, open Zenodo variant.
- **IOM Displacement Tracking Matrix** (id: src-iom-dtm) — displacement tracking, open via API/HDX, mostly site-level aggregate.

### Housing, consumption and wealth

- **ECB Household Finance and Consumption Survey** (id: src-hfcs) — household wealth/debt/income/consumption microdata, application required, multiply imputed.
- **American Housing Survey** (id: src-ahs) — housing-unit/household-level microdata, open, no registration.
- **Residential Energy Consumption Survey** (id: src-recs) — household energy-use microdata, open, replicate weights.
- **Consumer Expenditure Survey PUMD** (id: src-ce-pumd) — BLS household expenditure microdata, open.
- **HM Land Registry Price Paid Data** (id: src-land-registry-ppd) — individual property transaction records, England & Wales, open.

### Time use

- **Harmonised European Time Use Surveys** (id: src-hetus) — European time-diary microdata, application required for Scientific Use Files.

### Population grids and geography

- **NHGIS** (id: src-nhgis) — aggregate US summary tables + GIS boundaries, 1790-present, registration.

## Other sources (no separate pack)

### Mortality, fertility and life tables

- Human Fertility Database — aggregate period/cohort fertility rates, births and exposure for 30+ countries, most from the 1950s; free registration with SEPARATE credentials from HMD.

### Census and population microdata

- UK census microdata — three tiers: open teaching sample (UKDS study 9202, 2021, OGL), safeguarded individual/household samples at Region/Grouped-LA level (registration), and a secure ~9% sample via ONS SecureLab only.
- Spain — INE census microdata — open for public-use files, application for detailed files; a 2021 public sample analogous to 2011 is UNVERIFIED, check IPUMS International as a fallback.
- American Community Survey PUMS — registry source, see the census source guide; the ongoing open US person/household workhorse (weights PWGTP/WGTP, needs CENSUS_API_KEY) — full detail in the us-social-surveys pack.

### Migration

- OECD DIOC / DIOC-E — open aggregate cross-tabs on emigration rates by skill level, education x occupation x country of birth/destination, derived from census/register microdata, not individual records.
- Eurostat `migr_*` tables — registry source, see the eurostat source guide; open aggregate immigration/emigration/stock/asylum statistics by citizenship, not microdata.
- EU-LFS migration modules — true microdata (ad-hoc modules); public-use files are open but training/methods only, NOT valid for population inference — scientific-use files need application (estat-microdata-access@ec.europa.eu).
- UNHCR Microdata Library — surveys, needs assessments and registration-linked data on forcibly displaced/stateless populations; access is mixed per dataset (public, public-use, or licensed) — always read the specific study's Access Policy field.
- MAFE (Migrations between Africa and Europe) — matched sending/receiving-country survey (Senegal, DR Congo, Ghana ↔ France, Spain, Italy, UK, Netherlands, Belgium), fieldwork ~2008-2010, legacy with no updates; access via INED's catalogue (registration and terms of use, exact tier UNVERIFIED per dataset).

### Housing, consumption and wealth

- Eurostat Household Budget Survey — true microdata on household consumption expenditure, reference years 2010 (26 countries)/2015 (26)/2020 (27); access needs application (Scientific Use Files, recognised research entities), though the open `hbs_*` tables in the Eurostat Data Browser cover summary statistics.
- Nordic house prices — UNVERIFIED / likely NOT openly available: Norway publishes only an aggregate house price index (Boligprisindeksen) via SSB, with transaction-level data behind Kartverket's Grunnboken (fee-based) or commercial resellers; use Eurostat's `prc_hpi_*` aggregate series as the safe cross-Nordic fallback.

### Time use

- Multinational Time Use Study (MTUS) — harmonised time diaries across many countries, access via a registered IPUMS MTUS account; related to AHTUS (American Heritage Time Use Study).
- American Time Use Survey (ATUS) — open single-year files 2003-2025; IPUMS ATUS-X is the harmonised alternative, preferred for multi-year work.

### Population grids and geography

- Global Human Settlement Layer (GHSL) — gridded population, built-up surface and settlement typology, open, no registration.
- WorldPop — gridded population counts/density, age/sex structured, 100m and 1km resolution; open.
- GEOSTAT population grid (Eurostat) — 1km² cells, ETRS89/LAEA, open (click-through terms, no account).
- US Census TIGER/Line — vector geography, boundaries only, join via GEOID; open.
- NASA SEDAC — gridded population, urban extent and environmental-exposure data (Gridded Population of the World); open (free NASA Earthdata Login for programmatic download).

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
