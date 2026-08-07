# Global development surveys (DHS, World Bank Microdata, barometers)

Use this pack when questions concern **households and individuals in low-
and middle-income countries** — health, demography, living standards,
attitudes.

## Machine-reachable (use these first)

1. **dhs** (registry source) — DHS Program indicator API: 374 surveys, 92
   countries, keyless and CORS-open. Fertility, child mortality,
   vaccination, nutrition, maternal health — with
   breakdown=background for wealth-quintile/education/urban-rural splits
   (answers many "inequality in X" questions without microdata).
2. **wbmicro** (registry source) — World Bank Microdata Library: search
   7,100+ surveys (LSMS, Findex, enterprise surveys) and read FULL
   variable dictionaries (question text, value labels) without a key.
   Data files themselves need a free WB login — metadata is never data
   (say what exists, don't invent values). Same API family: IHSN
   (catalog.ihsn.org), FAO (microdata.fao.org).
3. **worldbank / who / owid** (registry sources) — aggregate fallbacks
   that answer most cross-country development questions directly.

## Partly open

- **Afrobarometer** — African attitudes/governance surveys, 39 countries.
  The merged Round 9 SPSS file is a direct open URL (~70 MB .sav from
  afrobarometer.org, live-verified 2026-08-06) — but .sav parsing and the
  size make it borderline in the app; their online analysis tool covers
  quick shares. Geocoded/early-access data are application-gated.
- **DHS microdata** (the recode files) — free account + per-project
  approval on dhsprogram.com; cannot be automated here. Say so; the
  indicator API above usually suffices.
- **Global Findex microdata** — behind the standard World Bank Microdata
  light registration; aggregate Findex indicators are in the worldbank
  source.

## Form-gated (describe, don't fetch)

- **Latinobarómetro** — free downloads after accepting an agreement;
  online analysis without registration.
- **Arab Barometer** — short form before download (no account).
- **Asian Barometer** — signed agreement per wave; most restrictive.
- **Gallup World Poll** — proprietary/licensed; mention it exists, don't
  promise access.

## Analysis notes

- DHS indicator values are official weighted survey estimates tied to a
  SurveyYear — don't interpolate between surveys silently.
- For any microdata that a user downloads and uploads themselves: look
  for the weight variables (DHS: v005/1e6) and document weighting in the
  answer.
- Cite the survey program, country and survey year in answers.

## Other sources (no separate pack)

Beyond DHS/wbmicro and the barometers above, a few more sources round out
this domain — mostly free after registration, one (HAALSI) fully open, and
one (GBD) a trap worth naming explicitly:

- **MICS** (UNICEF Multiple Indicator Cluster Surveys) — free-registration,
  manually mediated by UNICEF and can be slow; SPSS files. The complement
  to DHS — same style of household survey, often covering countries/years
  DHS does not; strong on child protection, ECD, WASH, education. IPUMS
  MICS (mics.ipums.org) is a faster harmonized alternative once approved,
  but needs BOTH a UNICEF approval and an IPUMS account.
- **WHO SAGE** (Study on Global AGEing and adult health) — free microdata
  request form (sagesurvey@who.int); covers China, Ghana, India, Mexico,
  Russia, South Africa across Wave 0 (2002-04) through Wave 3 (2018/19).
  Distinct from the `who` registry source's aggregate GHO indicators — this
  is individual-level ageing/health microdata; some country-years are also
  mirrored in the World Bank Microdata Library.
- **WHO STEPS** (STEPwise approach to NCD risk factor surveillance) —
  access mixed by country-year: open, registration, or on request from the
  national ministry. Genuine individual-level microdata (NOT the aggregate
  WHO GHO covered by the `who` registry source) from a 3-step protocol —
  behavioural questionnaire, physical measurement, biochemical measurement
  (BP, anthropometry, glucose, lipids, tobacco, alcohol). Same NADA catalog
  software as wbmicro — real individual-level NCD risk-factor data for many
  countries with no other national health-exam survey.
- **HAALSI** (Health and Aging in Africa, Agincourt, South Africa) — OPEN
  public-use via ICPSR 36633, free account, NO institutional affiliation
  needed. Baseline N=5,059 aged 40+, waves 2014-15/2018-19/2021-22; the
  most openly accessible study in the whole HRS/ageing-panel family — good
  for testing harmonized-analysis code before applying elsewhere.
- **Gateway to Global Aging Data — LMIC sister studies** (g2aging_lmic) —
  covers CHARLS (China), LASI (India), MHAS (Mexico), KLoSA (Korea), JSTAR
  (Japan), HAALSI (South Africa); see the europe-surveys pack for the
  harmonisation-hub description and the European sister studies (ELSA,
  SHARE, TILDA).
- **World Values Survey (WVS)** — free registration, direct download
  (SPSS/Stata/CSV), no API; ~100 countries across 7 waves since 1981.
- **IHME GHDx / Global Burden of Disease (GBD)** — GHDx is a discovery
  index; GBD outputs are MODELLED ESTIMATES, not microdata. GBD outputs
  are modelled burden estimates by location-age-sex-year — cite them for
  burden comparisons, never present them as observations; for records, use
  the GBD Data Input Sources Tool to find the cited source survey (usually
  DHS/MICS/a census/vital registration), then go there.
- **Global.health** — open browse, account required for the bulk curator
  portal; open COVID-era line-list microdata with per-case
  age/gender/symptoms/diagnostics/outcome. UNVERIFIED whether curation is
  still active in 2026 — treat as a historical archive unless confirmed.
