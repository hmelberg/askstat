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
