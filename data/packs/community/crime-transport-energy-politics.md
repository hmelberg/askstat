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

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

### Crime and justice

- **NCVS** (id: src-ncvs) — household/person/incident victimization survey, open public-use (restricted supplements via ICPSR); excludes homicide.
- **NIBRS** (id: src-nibrs) — incident-level crime data for ~18,000 US agencies, open bulk downloads; pre-2021 national totals undercount agencies that reported only legacy SRS.
- **NCRP** (id: src-ncrp) — individual prison admission/release/custody records, open (ICPSR); state participation varies by year.
- **FJC Integrated Database** (id: src-fjc-idb) — docket-level federal court cases since 1970, fully open; civil/criminal/bankruptcy/appellate.
- **Stanford Open Policing Project** (id: src-open-policing) — 200M+ individual traffic/pedestrian stops, open; appears dormant since ~2020.
- **CSEW** (id: src-csew) — England & Wales victimization survey, free UKDS registration; fraud/computer misuse only since ~2017.

### Transport and mobility

- **NHTS** (id: src-nhts) — US household/person/vehicle/trip travel survey, open; 2022 NextGen redesign breaks comparability with earlier waves.
- **FARS** (id: src-fars) — census of US fatal motor-vehicle crashes since 1975, open; fatal crashes only, pair with CRSS for non-fatal severity.
- **CRSS** (id: src-crss) — weighted sample of police-reported crashes, all severities, open; never pool with FARS (a census) without adjustment.
- **BTS airline / DB1B** (id: src-bts-airline) — on-time flight-segment data plus a 10% sample of airline tickets, open; weight DB1B for market-share estimates.

### Energy, environment and exposure

- **EIA API v2** (id: src-eia-api) — aggregate energy time series (production, prices, consumption, generation), open with free key; does not carry RECS/CBECS microdata.
- **EPA Air Quality System** (id: src-epa-aqs) — monitor-day/hour air-quality readings, US since 1957; open pre-generated files, API key issued via email (not instant).

### Political behaviour and elections

- **ANES** (id: src-anes) — pre/post-election respondent survey, US 1948-2024, open after free instant registration; needs a login step, not a bare fetch.
- **CES** (id: src-ces) — ~50-60k+ respondents/year, US 2006-2024, openly downloadable (Harvard Dataverse); pick the right file (Common Content vs modules vs cumulative).
- **MEDSL** (id: src-medsl) — precinct×office×candidate×year US election returns, openly downloadable; match to the election-year boundary vintage.
- **CSES** (id: src-cses) — harmonised cross-national post-election survey, ~50 countries, open after free registration; module-to-module harmonisation is imperfect.
- **Manifesto Project (MARPOR)** (id: src-manifesto-project) — party-election manifestos coded to party-year, 50+ countries since 1945, open after free registration; some endpoints work keyless.

## Other sources (no separate pack)

### Crime and justice

- EU Safety Survey (successor to EU-ICS) — first EU-wide harmonised victimisation instrument, fielded ~2023; microdata release status unverified, aggregate results only as of this check. The related FRA Fundamental Rights Survey has a crime/victimisation module with scientific-use microdata via GESIS.

### Transport and mobility

- UK National Travel Survey — free registration (UK Data Service, End User Licence); household/person/trip/stage travel diary data, England 1988-2024.
- Norwegian National Travel Survey (Reisevaneundersøkelsen) — access unverified, likely Sikt Surveybanken registration; microdata.no does not return individual rows for this survey, remote execution only, no downloadable file.
- Mobility Database / GTFS feeds and OpenStreetMap — both open; GTFS needs a free API token for the feed-query API (static schedules only, not ridership), OSM needs no key (Overpass API or bulk Geofabrik extracts).

### Energy, environment and exposure

- EEA Air Quality Download Service — open, no login; covers EU/EEA air quality from ~2013. The portal hostname has been restructured repeatedly — resolve the current URL via eea.europa.eu/en/datahub rather than hardcoding.
- Copernicus Atmosphere Monitoring Service (CAMS) — open, free registration; gridded reanalysis/forecast for NO2, PM2.5, PM10 and O3.
- ERA5 / Copernicus Climate Data Store — open, free registration; gridded hourly climate reanalysis from 1940-present, the standard exposure layer for linking temperature/weather to health or economic microdata.
- EPA EJScreen — removed from the official EPA website (v2.3 released mid-2024, then taken down; a lawsuit over the removal was dismissed 13 March 2026; CEQ's CEJST was also removed). Community mirrors exist (e.g. screening-tools.com/epa-ejscreen) but flag the non-official provenance explicitly.

### Political behaviour and elections

- British Election Study and Norwegian Election Study — both free registration; BES via UK Data Service, Norwegian Election Study via Institute for Social Research/SSB archived at Sikt Surveybanken with waves back to 1957.
- ParlSpeech (6.3M parliamentary speeches, 9 democracies) — openly downloadable via Harvard Dataverse, snapshot as of ~2020, not continuously updated; ParlGov (party/election/cabinet composition database) — openly downloadable, no registration; Comparative Agendas Project (harmonised policy-issue-coded datasets, ~20 countries + EU/US states) — openly downloadable.
- US voter files — not openly downloadable; raw state files are public records in most states but need a per-state request and fee, with heavy legal variation in permitted use, and vendor-enhanced files are commercial.

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
