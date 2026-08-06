# Crime, transport, energy, environment and political behaviour

Use this pack for **crime/justice, transport safety, energy/environment
exposure, and political-behaviour** questions at the record level. This is
where the most openly-downloadable microdata in the whole collection lives:
FARS is a complete census of US fatal crashes since 1975, free; NIBRS is
incident-level crime data for most US agencies, free; the FJC Integrated
Database is every federal court case since 1970, free; Stanford Open
Policing is 200M+ traffic stops, free; CES is 50,000+ respondents/year on
Harvard Dataverse, free. For methods development and teaching this domain
beats health and official statistics by a wide margin. Second warning: **US
federal data portals became politically unstable in 2025-26** — EJScreen
and CEJST were removed from government sites. Fail loudly with a fallback
when a `.gov` tool in this space 404s; do not silently invent a number.

## Crime and justice

```yaml
- id: ncvs
  name: National Crime Victimization Survey
  unit: household, person, incident (three linked files)
  coverage: "US national, 1992-2024 redesigned series; legacy to 1973"
  access: "open (public-use); some supplements need ICPSR restricted agreement"
  gotcha: "excludes homicide; replicate weights required; redesigned 2016 — do not pool naively across the break; merge household/person on YEARQ+IDHH"
- id: nibrs
  name: FBI NIBRS / UCR via Crime Data Explorer
  unit: incident, with offense/victim/offender/arrestee segments
  coverage: "~18,000 agencies; national transition completed ~2021; legacy SRS back to the 1930s"
  access: "open bulk downloads, no login; developer API needs a free api.data.gov key"
  ⚠_gotcha: "agency coverage was NOT complete before ~2021 — pre-2021 national totals undercount large agencies that reported only SRS. Records multiple offenses per incident (no hierarchy rule) — totals won't match legacy UCR index-crime counts."
- id: ncrp
  name: National Corrections Reporting Program
  unit: individual prison admission/release/year-end custody record
  coverage: "1991/2000-2021, annual, state DOCs"
  access: open (ICPSR public-use)
  gotcha: "state participation and variable completeness vary by year"
- id: fjc_idb
  name: Federal Judicial Center Integrated Database
  unit: case (docket level) — civil, criminal, bankruptcy, appellate
  coverage: "1970/1979-present depending on case type"
  access: OPEN
  gotcha: "nature-of-suit codes changed over decades — use the Research Guide crosswalks; docket-level only, no document text"
- id: open_policing
  name: Stanford Open Policing Project
  unit: individual traffic/pedestrian stop
  coverage: "~2000-2020, varies by jurisdiction"
  access: OPEN
  gotcha: "standardisation quality varies, some states lack race; the project appears dormant since ~2020 — verify currency before claiming recent coverage"
- id: csew
  name: Crime Survey for England and Wales
  unit: household, person, incident
  coverage: "1982-2024/25, annual"
  access: "free registration (UKDS EUL); Special Licence for finer geography"
  gotcha: "fraud/computer misuse only entered the headline series from ~2017 — a real break in comparability"
- id: eu_safety_survey
  name: EU Safety Survey (successor to EU-ICS)
  status: "first EU-wide harmonised victimisation instrument, fielded ~2023; microdata release status UNVERIFIED, aggregate results only as of this check"
  related: "FRA Fundamental Rights Survey has a crime/victimisation module WITH scientific-use microdata via GESIS"
```

## Transport and mobility

```yaml
- id: nhts
  name: National Household Travel Survey
  unit: household, person, vehicle, trip (four linked files)
  coverage: "US national + state add-ons; NextGen 2022 latest; prior waves 2001/2009/2017"
  access: OPEN
  gotcha: "2022 NextGen GPS-assisted redesign is not fully comparable with earlier waves; jackknife replicate weights required"
- id: fars
  name: Fatality Analysis Reporting System
  unit: crash / vehicle / person (three linked files per year)
  kind: CENSUS of fatal motor-vehicle crashes, not a sample
  coverage: "50 states + DC + PR, 1975-2024"
  access: OPEN
  packages: {r: [rfars, crashapi]}
  gotcha: "fatal crashes only — pair with CRSS for non-fatal severity; coding schemes change across years, use the year-specific manual"
- id: crss
  name: Crash Report Sampling System
  kind: "nationally representative SAMPLE of police-reported crashes, all severities"
  coverage: "2016-2023 (latest public year UNVERIFIED for 2026)"
  access: OPEN
  gotcha: "WEIGHT variable required — never pool FARS (census) and CRSS (weighted sample) counts without adjustment"
- id: bts_airline
  name: BTS airline on-time performance and DB1B ticket data
  units: {on_time: flight segment, db1b: "10% sample of airline tickets"}
  access: OPEN
  gotcha: "DB1B is a 10% sample — weight for market-share estimates; BTS appears to be renaming DB1B→DB1C circa 2025/26"
- id: uk_nts
  name: UK National Travel Survey
  unit: household, person, trip, stage
  coverage: "England, 1988-2024"
  access: "free registration (UKDS EUL)"
- id: rvu_norway
  name: Reisevaneundersøkelsen (Norwegian national travel survey)
  provider: TØI / Statistics Norway, archived via Sikt
  cadence: "roughly every 4 years, latest ~2021-22"
  access: UNVERIFIED — likely Sikt Surveybanken registration
  ⚠: "microdata.no by design does NOT return individual rows for this — remote execution only, do not expect a downloadable file"
- id: open_mobility
  gtfs: "Mobility Database / GTFS feeds — OPEN, free API token for the feed-query API; static schedule data only, not ridership"
  openstreetmap: "OPEN, no key — Overpass API (overpass-api.de/api/interpreter) or bulk extracts (download.geofabrik.de)"
```

## Energy, environment and exposure

```yaml
- id: eia_api
  name: EIA API v2
  kind: AGGREGATE time series — production, prices, consumption, generation
  access: open, free key
  base: https://api.eia.gov/v2/
  ⚠: "does NOT carry RECS/CBECS respondent-level microdata (see the demography-migration-housing pack) — that is flat-file only. A common confusion point."
- id: epa_aqs
  name: EPA Air Quality System
  unit: monitor-day/hour reading
  coverage: "US, 1957 (sparse) - present, dense from the 1980s"
  access: "open pre-generated files; free email-registered API"
  gotcha: "the AQS key is issued to an email by an EPA process, not an instant self-service token"
- id: eea_air_quality
  name: EEA Air Quality Download Service
  coverage: "EU/EEA, ~2013-present"
  access: OPEN, no login
  ⚠: "EEA has restructured this portal's hostname repeatedly — resolve the current URL via eea.europa.eu/en/datahub rather than hardcoding"
- id: cams
  name: Copernicus Atmosphere Monitoring Service
  kind: GRIDDED reanalysis/forecast (NO2, PM2.5, PM10, O3)
  access: open, free registration
- id: era5
  name: ERA5 / Copernicus Climate Data Store
  kind: GRIDDED hourly climate reanalysis, 1940-present
  access: open, free registration
  use: "the standard exposure layer for linking temperature/weather to health or economic microdata"
- id: ejscreen
  name: EPA EJScreen
  ⚠_status: "REMOVED from the official EPA website (v2.3 released mid-2024, then taken down; a lawsuit over the removal was dismissed 13 March 2026). As of Aug 2026 there is NO official EPA URL. CEQ's CEJST was also removed."
  fallback: "community mirrors exist (e.g. screening-tools.com/epa-ejscreen) — flag the non-official provenance to the user explicitly"
```

## Political behaviour and elections

```yaml
- id: anes
  name: American National Election Studies
  unit: respondent, pre/post-election
  coverage: "US, 1948-2024"
  access: "open after free instant registration"
  gotcha: "requires a login step, not a bare URL fetch; weight variable names change every wave — read the current codebook"
- id: ces
  name: Cooperative Election Study (formerly CCES)
  unit: respondent, ~50-60k+/year
  coverage: "US, 2006-2024, annual"
  access: "OPENLY DOWNLOADABLE — Harvard Dataverse, click-through terms may appear"
  gotcha: "pick the right file — Common Content vs team modules vs the cumulative file; weight variable names differ by year"
- id: medsl
  name: MIT Election Data and Science Lab precinct returns
  unit: precinct × office × candidate × year
  access: OPENLY DOWNLOADABLE (Harvard Dataverse)
  gotcha: "precinct boundaries change — match to the election-year vintage of the boundary shapefile"
- id: cses
  name: Comparative Study of Electoral Systems
  unit: respondent, post-election, harmonised cross-national modules
  coverage: "~50 countries, Modules 1-5 spanning 1996-2021+"
  access: "open after free registration (CSES or GESIS)"
  gotcha: "module-to-module harmonisation is imperfect — check each module's codebook for variable availability by country-year"
- id: manifesto_project
  name: Manifesto Project (MARPOR)
  unit: party-election manifesto, quasi-sentence coded, aggregated to party-year
  coverage: "50+ countries, 1945-present"
  access: "open after free instant registration (API key)"
  api_base: https://manifesto-project.wzb.eu/api/v1/
  keyless_endpoints: [list_core_versions, get_core_codebook, get_core_citation]
- id: national_election_studies
  bes: "British Election Study — UK Data Service, free registration"
  norwegian: "Norwegian Election Study — Institute for Social Research/SSB, archived at Sikt Surveybanken, waves back to 1957, free registration"
- id: legislative_data
  parlspeech: "6.3M parliamentary speeches, 9 democracies — OPENLY DOWNLOADABLE (Harvard Dataverse); snapshot as of ~2020, not continuously updated"
  parlgov: "party/election/cabinet composition database — OPENLY DOWNLOADABLE, no registration"
  comparative_agendas: "policy-issue-coded datasets, harmonised topic codes, ~20 countries + EU/US states — OPENLY DOWNLOADABLE"
- id: voter_files
  status: "NOT openly downloadable. Raw state voter files are public records in most US states but need a per-state request and fee, with heavy legal variation in permitted use. Vendor-enhanced files are commercial."
```

## Digital trace — mostly closed since 2023

```yaml
still_available:
  - {id: pullpush, name: "Reddit archive (Pushshift successor)", api_base: "https://api.pullpush.io", auth: none, caveat: "unofficial third-party mirror of unclear long-term stability post-API-lockdown — flag provenance"}
  - {id: common_crawl, access: "OPEN, no key", storage: "s3://commoncrawl/"}
  - {id: wikimedia_dumps, access: "OPEN, no key", dumps: "https://dumps.wikimedia.org/"}
  - {id: gdelt, access: "OPEN, no key for most endpoints", doc_api: "https://api.gdeltproject.org/api/v2/doc/doc"}
closed:
  - {id: twitter_x_academic_api, status: "fully discontinued — Academic Research track eliminated; current API is paid/tiered, prohibitive for academic bulk collection"}
  - {id: crowdtangle, status: "shut down 14 Aug 2024; nominal replacement Meta Content Library is researcher-application-only, far more restrictive. Treat Meta post-level data as effectively closed for agentic access."}
```

## Cross-cutting notes

- **"Openly downloadable" does not always mean "no account."** ANES, CSES,
  Manifesto Project, UKDS series and Sikt Surveybanken all need free,
  instant, self-service registration — handle the login step, don't assume
  a bare URL works.
- **Weights matter everywhere.** NCVS, NHTS, RECS, CBECS, CRSS, ANES and CES
  all require survey or replicate weights.
- **Census vs sample.** FARS is a census of fatal crashes; CRSS is a
  weighted sample of all crashes; DB1B is a 10% ticket sample; NIBRS is a
  near-census with incomplete historical agency coverage. Mixing them
  without adjustment produces nonsense.
- **API-key friction varies.** EIA and Manifesto Project are instant
  self-service. EPA AQS requires an email round-trip with a human in the
  loop — build in a "credentials pending" state rather than failing silently.
