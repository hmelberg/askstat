# European survey microdata (ESS, SHARE, GESIS, WVS/EVS, UKDS)

Use this pack when questions concern **individual-level European survey
data** — attitudes, welfare, health, ageing, values. It maps which sources
are machine-reachable and which are honestly login-walled.

## Machine-reachable (use these first)

1. **ess** (registry source) — European Social Survey, ~30 countries
   2002–2023, health/wellbeing/trust modules. Real REST API with
   parquet/csv per file-DOI; needs the user's free ESS user ID (a
   tracking ID from ess.sikt.no, not a password). No ID given → say so
   and fall back to aggregates. The ess source guide has the full flow.
2. **cessda** (registry source) — search 40k+ European studies (incl.
   Sikt/Norway) with DOIs, abstracts and access labels. Metadata only:
   perfect for "does a study on X exist?", never for values.

## Login-walled (be honest, still be useful)

- **SHARE** — Survey of Health, Ageing and Retirement in Europe (50+,
  panel, health/work/retirement; Sweden/Denmark in, Norway not). Free for
  research but individual registration with a statement of research
  relevance at share-eric.eu; downloads via their portal; no API. The
  questionnaires and wave documentation on share-eric.eu are open — quote
  them to describe what exists. Aggregate fallbacks: eurostat (EU-SILC
  indicators), oecd (health/ageing), dbnomics.
- **GESIS** (Eurobarometer, ISSP incl. Health modules, ALLBUS, EVS) —
  free GESIS account + stated purpose per download (ZA-numbered studies,
  e.g. joint EVS/WVS 2017–2022 = ZA7505). No usable public search API
  (bot-walled); find studies via cessda or web_search, link the GESIS
  study page, and never proxy user passwords.
- **WVS** (World Values Survey) — downloads behind a fill-a-form flow on
  worldvaluessurvey.org (no account, but no stable machine path).
  Questionnaires/codebooks are open PDFs/XLSX — quote them. If the user
  downloads the file themselves, they can upload it into the app.
- **UK Data Service** (Understanding Society, Health Survey for England,
  LFS) — registration + End User Licence for most data (non-UK academics
  can register). Open DDI metadata via OAI-PMH
  (oai.ukdataservice.ac.uk/oai/provider) — usable to describe studies and
  variables honestly.
- **EU-SILC / EHIS microdata** (Eurostat) — research-entity accreditation
  required; the aggregate indicators in the eurostat source cover most
  practical questions — offer those first.
- **LIS** (Luxembourg Income Study) — microdata never leaves their
  servers (LISSY remote execution, approved accounts). Their public Key
  Figures (inequality/poverty indicators) are the honest fallback.

## Analysis notes (survey data)

- Weights: ESS `anweight`; say in the answer whether estimates are
  weighted. Compare countries within the same round/wave.
- Missing codes: ESS 66/77/88/99 families (or use
  recodeMissingValues=true in the API); check codebooks before computing.
- Cite program + round/wave + DOI in answers.

## Other sources (no separate pack)

Beyond ESS/SHARE/GESIS above, these fill out the panel and cross-national
landscape — most need free registration, several are application-gated:

- **easySHARE** — single flat long-format file covering ALL SHARE waves
  with simplified, recoded, partly imputed variables (pushes household
  variables down to individual level). Start here rather than the raw
  per-wave modules — saves about a week of merging work; cite both
  easySHARE and the underlying wave DOIs. Same free registration as SHARE
  (share-eric.eu).
- **Gateway to Global Aging Data (g2aging)** — harmonisation/metadata hub,
  NOT a primary data host: it does not generally redistribute raw source
  data, so register separately with each underlying study (HRS, ELSA,
  SHARE, TILDA, NICOLA + the non-European sister studies — see the
  global-surveys pack). Its value: the same construct (e.g. "difficulty
  with ADLs") gets the same variable name/coding across every harmonised
  study, turning a cross-country analysis into a stacking exercise.
- **ELSA** (English Longitudinal Study of Ageing) — 50+, panel,
  health/work/retirement, the European HRS sister study. UK Data Service,
  series 200011 (EUL/Special Licence/Secure Access tiers) — non-UK
  researchers CAN register.
- **TILDA** (The Irish Longitudinal Study on Ageing) — free registration
  via ISSDA.
- **SOEP** (German Socio-Economic Panel) — provider DIW Berlin,
  1984-present, ~15,000 households / 30,000 individuals per wave.
  Application (SOEP data distribution contract), free for academic use;
  variable search via paneldata.org/soep-core (unusually good, browsable
  structured metadata).
- **Understanding Society (UKHLS + BHPS)** — free-registration (EUL) via
  UK Data Service, Special Licence/Secure Lab for sensitive variants;
  UKHLS 2009-present (~40,000 households wave 1), BHPS 1991-2008
  incorporated.
- **GGP** (Generations and Gender Programme) — provider GGP Consortium,
  hosted at NIDI; cross-national panel on family formation, fertility
  intentions, intergenerational relations across ~20 countries + a macro
  Contextual Database. Free-registration + signed Statement of
  Affiliation/Confidentiality (scientific-institution affiliation
  required); ~1-2 business days turnaround for standard datasets.
- **Eurostat EHIS** (European Health Interview Survey) — wave 1 2006-09
  (17 countries), wave 2 2013-15 (all EU+IS+NO), wave 3 2019 (all
  EU+IS+NO+RS+AL+TR). SCIENTIFIC USE FILE ONLY — no public-use file exists
  for EHIS (unlike EU-SILC 2012/2013); realistic turnaround 3-6 months
  (research-entity recognition ~4wk + proposal ~8wk + national
  consultation ~4wk).

**Faster European health-survey alternative.** If EHIS's 3-6 month wait is
too slow, SHARE (free registration, weeks) or a national statistical
office's own route (see the `europe-national-microdata` pack) usually beats
the central Eurostat SUF process.
