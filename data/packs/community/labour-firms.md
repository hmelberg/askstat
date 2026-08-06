# Labour market, firm and business microdata

Use this pack when a question concerns **workers, jobs, establishments or
firms at the record level** — job flows, wages, firm demographics, worker
mobility, business registers. A surprising amount here is openly
downloadable with no application — far more than health or social survey
data. The open set: LODES, QWI, BDS, CPS-ORG extracts, QCEW, OEWS, JOLTS,
O*NET, OSHA ITA, H-1B/PERM, GLEIF, UK Companies House, Norway's
Enhetsregisteret, EU-EFIGE. The closed set is everything genuinely linked at
the worker-firm level: LBD, IAB's SIAB/LIAB/BHP, Nordic LEED registers,
EU-LFS/CIS microdata, and all commercial firm databases.

## UNITED STATES — openly downloadable

```yaml
- id: lodes
  name: LEHD Origin-Destination Employment Statistics
  provider: US Census Bureau
  unit: Census-block-pair job counts, plus residence/workplace-area characteristics
  years: 2002-2023
  access: open, no key
  url_pattern: "https://lehd.ces.census.gov/data/lodes/LODES7/{state}/{od|wac|rac}/{state}_{od|wac|rac}_main_JT00_{year}.csv.gz"
  packages: {r: [lehdr]}
  gotcha: "workers commuting cross-state appear in the home state's 'aux' file, not 'main'. LODES7 uses 2020 census blocks — not directly comparable to earlier vintages at block level."
- id: qwi
  name: Quarterly Workforce Indicators
  unit: establishment × demographic-group CELL, not individual records
  api_endpoints: {sex_age: "https://api.census.gov/data/timeseries/qwi/sa", sex_education: "…/qwi/se", race_ethnicity: "…/qwi/rh"}
  auth: Census API key (free)
  gotcha: "cells suppressed/noise-infused when small; state coverage start years differ"
- id: bds
  name: Business Dynamics Statistics
  unit: establishment/firm counts and flows by age, size, industry, state/metro
  years: 1978-2023
  access: open — public derivative of the restricted LBD
  gotcha: "firm age topcoded; NAICS revision breaks at 1997/2002/2007/2012/2017"
- id: lbd
  name: Longitudinal Business Database
  unit: establishment (longitudinally linked) and firm — the restricted universe behind BDS
  access: enclave (FSRDC) — approved project, Special Sworn Status, ~6-12 month turnaround via researchdatagov.org
- id: cps_org
  name: CPS Outgoing Rotation Group
  unit: individual worker-month
  access: open — CEPR uniform extracts, updated monthly, 1979-present
  gotcha: "earnings top-coded; occupation/industry coding changed 2002/03 and again 2020"
- id: qcew
  name: Quarterly Census of Employment and Wages
  unit: establishment (near-census from UI wage records, ~95% of US jobs)
  access: open — CSV slices by industry/area/size at data.bls.gov/cew/data/api/
  gotcha: "excludes self-employed, some agricultural/railroad/most military workers; small county cells suppressed"
- id: oews
  name: Occupational Employment and Wage Statistics
  unit: occupation × industry × area cell
  access: open — https://www.bls.gov/oes/special-requests/oesm{YY}all.zip
  gotcha: "SOC revision years (2010, 2018) and OMB metro redefinitions break the series"
- id: jolts
  name: Job Openings and Labor Turnover Survey
  unit: establishment survey, published as aggregate series
  access: open, monthly since 2000
  gotcha: "state-level estimates are modelled/experimental with wide intervals"
- id: bls_api
  name: BLS Public Data API v2
  base: https://api.bls.gov/publicAPI/v2/timeseries/data/
  auth: "registrationkey in the POST body (free)"
  limits: "500 queries/day, 50 series/request, 20 years of history"
- id: onet
  name: O*NET Database
  unit: occupation (SOC) — skill/ability/knowledge/task descriptors
  access: open; O*NET Web Services free developer account for the API
  use: "the standard crosswalk for attaching task/skill content to occupation codes in any labour-market microdata"
- id: osha_ita
  name: OSHA Injury Tracking Application
  unit: establishment (Form 300A summary) and case (Forms 300/301)
  access: open, 2016-present
  gotcha: "only establishments above size/industry thresholds; no stable establishment ID across years — name/address matching needed"
- id: h1b_perm
  name: OFLC disclosure data (H-1B LCA, PERM, H-2A, H-2B)
  unit: individual case/application — employer, worksite, offered wage, SOC, visa class
  access: open, FY2008-present
  gotcha: "field names/schema change across years; employer names unstandardised; LCA ≠ PERM ≠ actual visa issuance"
- id: indeed_hiring_lab
  access: "open — aggregate indices only, not raw postings; CSV in GitHub"
- id: soii_cfoi
  name: Survey of Occupational Injuries and Illnesses / Census of Fatal Occupational Injuries
  access: "open for published tables; case-level CFOI microdata requires application to BLS"
```

```python
import requests
r = requests.post("https://api.bls.gov/publicAPI/v2/timeseries/data/",
    json={"seriesid": ["CES0000000001"], "startyear": "2020", "endyear": "2026",
          "registrationkey": "YOUR_KEY"}, timeout=60)
```

**Closed/commercial in the US:** Lightcast job postings (OAuth2, contracted,
no free tier) — mention it exists, do not promise access.

## EUROPE

```yaml
- id: iab_leed
  name: IAB linked employer-employee data (Germany) — SIAB/LIAB/BHP
  underlying: "IEB, the universe of German social-security notifications, 1975(West)/1992(East)-present"
  siab: "2% random sample, spell-structured (not fixed panel) — reshape to person-period; wages right-censored at the social-security ceiling, imputation (Card-Heining-Kline/Dustmann) is mandatory for wage-distribution work"
  liab: "worker linked to establishment via the IAB Establishment Panel — the establishment side is a SURVEY sample, weight for establishment-representative statistics"
  bhp: "establishment full-population panel — Betriebsnummer can change on administrative reorganisation even for an economically continuous establishment"
  access_modes: ["On-site at IAB Nuremberg + partner locations", "Controlled Remote Data Processing via JoSuA — write scripts, receive disclosure-checked output, usable from abroad", "Scientific Use Files to registered institutions"]
  open_download: none
  practical_route: "JoSuA for non-resident researchers — budget two iterations, output vetting rejects small cells"
- id: eu_lfs
  name: EU Labour Force Survey
  public_microdata: "open, no registration — but EXPLICITLY restricted to training/methods exploration, NOT population inference"
  scientific_use_file: "application; eligible: universities, research institutes, NSIs, central banks within the EU, plus the ECB"
  gotcha: "ISCO-88→ISCO-08 (~2011) and NACE Rev.1→Rev.2 (~2008) break long series"
- id: sbs
  name: Structural Business Statistics
  aggregate: open
  microdata: "application or national safe centre, unit = enterprise"
- id: cis
  name: Community Innovation Survey
  unit: enterprise, biennial since the 1990s
  microdata: application
  gotcha: "sample survey — weights required; firm-size thresholds and national implementation vary despite a harmonised questionnaire"
```

### Firm registers and identifiers — the open ones

```yaml
- id: gleif
  name: GLEIF Legal Entity Identifier data
  access: open, no key
  api: "https://api.gleif.org/api/v1/lei-records?filter[lei]=<LEI>"
  use: "cross-country firm identifier / linking key, not a firm census"
- id: companies_house
  name: UK Companies House
  access: "open bulk + free registration for the API key"
  bulk: "download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-YYYY-MM-01.zip   # ~5M companies, ~400MB; scheme UNVERIFIED, try https first"
  gotcha: "basic bulk extract excludes officers/PSC data and financial-statement figures — financials need the separate XBRL bulk product"
- id: bronnoysund
  name: Enhetsregisteret (Norway)
  access: open, no key
  api_base: https://data.brreg.no/enhetsregisteret/api
  bulk: ["/api/enheter/lastned (JSON)", "/api/enheter/lastned/csv"]
  gotcha: "search capped at 10,000 results — use bulk endpoints for a full extract; accounting figures live in a separate dataset (Regnskapsregisteret)"
- id: cvr_denmark
  name: CVR — Det Centrale Virksomhedsregister
  access: "free registration (credentials from Erhvervsstyrelsen, not keyless)"
  api: "distribution.virk.dk/cvr-permanent — Elasticsearch REST, HTTP Basic Auth; scheme UNVERIFIED, try https first"
- id: bolagsverket
  name: Bolagsverket (Sweden)
  access: "mixed and in transition — general company-info API still needs customer registration; some high-value sets now fee-free under the EU Open Data Directive"
  status: UNVERIFIED — verify the current fee schedule
- id: orbis
  name: ORBIS / Bureau van Dijk (Moody's)
  access: "commercial licence, typically via a university library or WRDS"
  gotcha: "financial-statement depth varies hugely by country (rich UK/DE/FR, thin elsewhere); bulk extraction is contractually capped"
```

### Firm surveys with an academic access route

```yaml
- id: eu_efige
  name: EU-EFIGE / Bruegel-UniCredit dataset
  unit: manufacturing firm, [AT, FR, DE, HU, IT, ES, UK]
  access: open — https://www.bruegel.org/dataset/efige
  gotcha: "single survey wave (~2008-2010), not a panel on the survey side; stratified by size/country so weights required; manufacturing only"
- id: ecb_safe
  name: ECB Survey on the Access to Finance of Enterprises
  unit: SME/firm, semi-annual/annual since 2009
  access: free registration + user agreement
  gotcha: "repeated cross-section with rotation, not a true firm panel"
- id: ecb_hfcs
  name: ECB Household Finance and Consumption Survey
  unit: household, with individual-level labour/income detail per member
  access: "application — government photo ID, English CV, request form (hfcs.access@ecb.europa.eu)"
  gotcha: "MULTIPLY IMPUTED — 5 implicates per country-wave, needs Rubin's rules; some countries oversample the wealthy (ES, FR)"
- id: oecd_multiprod_dynemp
  name: OECD MultiProd / DynEmp
  kind: "distributed-computation projects — the CODE travels to the data, the data never pools"
  ⚠: "you cannot download firm microdata from this project. Get your country's firm register through its own restricted route and run the OECD's published code to get comparable output."
```

### Nordic linked employer-employee registers (pointer)

Full treatment in the `nordic-microdata` and `europe-national-microdata`
packs. All four below are full-population, personal-ID-linked, and none
permits raw export:

| Country | Register | Access system |
|---|---|---|
| Norway | registerbasert sysselsettingsstatistikk (SSB) | microdata.no or SSB data lending |
| Sweden | RAMS / LISA (SCB) | MONA remote desktop |
| Denmark | IDA / BFL (DST) | Forskermaskinen |
| Finland | FLEED (Statistics Finland) | FIONA |

## Analysis notes

- US administrative data (LODES/QWI/QCEW/BDS) needs no survey weighting —
  it is near-census; European survey-based firm data (LIAB establishment
  side, ECB SAFE) needs weights.
- NAICS/SIC/ISCO/NACE revisions break time series at known dates — flag the
  break rather than pooling silently across it.
- Cite the register/survey name, vintage and (for EU sources) the coverage
  years explicitly — access tiers here change faster than the underlying
  economics.
