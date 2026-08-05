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
