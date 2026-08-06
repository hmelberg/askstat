# Education & skills microdata (PIAAC, PISA, TALIS)

Use this pack when questions concern **adult skills, student performance
or teachers** across countries (OECD studies). All data below are open
and registration-free, but file sizes differ wildly — that decides what
is actually usable in the app.

## PIAAC — the sweet spot (use first)

Adult skills (literacy/numeracy/problem-solving, 16–65). Per-country CSV
files are direct open URLs on webfs.oecd.org (live-verified 2026-08-06,
no CORS → via /api/hent):

- Cycle 1: `https://webfs.oecd.org/piaac/cy1-puf-data/CSV/prg{ccc}p1.csv`
  (Norway: prgnorp1.csv, 18.3 MB)
- Cycle 2 (2022–23): `https://webfs.oecd.org/piaac/cy2-puf-data/CSV/prg{ccc}p2.csv`
  (Norway: prgnorp2.csv, 32.1 MB)
- Codebook (open XLSX): search oecd.org for "International Codebook PIAAC"
  — quote it for variable names/values.

Trap: older documented paths (`/piaac/puf-data/...`) are dead (404) — the
`cy1-`/`cy2-` prefixes are current. Probe before building.

Analysis: skills are **10 plausible values** (PVLIT1–10 etc.) — for simple
answers use the mean of plausible values and say so; weights SPFWT0
(final) exist and should be used for population statements.

## PISA — open but heavy (be honest)

Student performance (15-year-olds). Full SPSS zips are open direct URLs
(webfs.oecd.org/pisa2022/STU_QQQ_SPSS.zip — **682 MB**, 2018: 501 MB;
live-verified) — far beyond the app's ceiling, and 2018+ cognitive files
use DEFLATE64 compression that standard unzip tools reject. Honest paths:

- Aggregate country results: oecd source (registry) or the PISA Data
  Explorer website.
- Curated country-level subsets exist in the R package `learningtower`
  (its GitHub hosts small extracts) — a probe-able alternative for simple
  score questions; label provenance clearly.

## TALIS — teachers survey

Open SPSS zip (webfs.oecd.org/talis/SPSS_2018_international.zip, 192 MB,
live-verified) — also too heavy; use OECD aggregate tables instead.

## Analysis notes

- Always weighted estimates; compare within the same cycle/wave.
- Cite "OECD PIAAC cycle {1|2}" / "OECD PISA {year}" with country list.

## More education microdata: US and TIMSS/PIRLS/ICILS family

Two rules dominate this whole domain: **plausible values** (NAEP, PISA,
PIAAC, TIMSS, PIRLS, ICILS, NEPS all report achievement as *multiple*
plausible values, not one score — averaging them and ignoring the
between-PV variance understates standard errors) and **replicate weights**
(every study here is clustered/stratified — a single weight is not enough).
Use `EdSurvey`, `intsvy`, `RALSA` or `Repest` (Stata), which handle both.

```yaml
- id: naep
  name: National Assessment of Educational Progress
  provider: NCES/IES
  unit: student (grades 4, 8, 12)
  access_tiers: {explorer: "open, cross-tabs only, no extraction", primer: "open — NAEPprimer R package bundles a real reduced 1994-2000 sample, zero licensing, for development", restricted: "application — NCES restricted-use data licence for full respondent-level records"}
  packages: {r: [EdSurvey, NAEPprimer]}
  note: "code developed against the primer transfers directly to the licensed restricted file via the same readNAEP() entry point"
- id: nces_longitudinal
  name: "NCES longitudinal studies (ECLS-K:2011, ECLS-B, HSLS:09, ELS:2002, NELS:88, BPS/B&B/NPSAS, HSTS)"
  access: "MOSTLY restricted-use — ECLS-K:2011 base/public rounds are the main OPEN exception (nces.ed.gov/ecls/dataproducts.asp); PowerStats/DataLab web tool is public for BPS/B&B/NPSAS even where microdata is restricted"
  who_can_apply: "ORGANIZATIONS only (universities, agencies) via ResearchDataGov — individuals cannot apply directly; security plan + notarised affidavit + unannounced compliance inspections"
- id: urban_education_data
  name: Urban Institute Education Data Portal
  kind: "unified REST API over CCD, CRDC, IPEDS, College Scorecard, SAIPE, NHGIS"
  access: "open, licence ODC-By v1.0"
  base: "https://educationdata.urban.org/api/v1/{topic}/{source}/{endpoint}/{year}/"
  note: "the practical programmatic entry point for US education admin data — prefer it over any single raw NCES interface"
- id: ipeds
  name: Integrated Postsecondary Education Data System
  unit: institution (~6,000+ Title IV), NOT student-level
  access: open
  gotcha: "merge on UNITID; no official queryable REST API — use the Urban Institute portal above instead"
- id: college_scorecard
  name: College Scorecard
  unit: institution-year and field-of-study-year
  content: "cost, admissions, completion, post-completion earnings 1/4/10yr by field, debt/repayment — largely IRS/NSLDS administrative match"
  access: open
  api: "https://api.data.gov/ed/collegescorecard/v1/schools — free key"
- id: seda
  name: Stanford Education Data Archive
  kind: "AGGREGATE — district/school/county achievement estimates on a common NAEP scale, empirical-Bayes linked across heterogeneous state tests. NOT primary microdata."
  access: open
- id: uk_cohorts_npd
  name: "England — National Pupil Database and linked cohorts (NCDS, BCS70, Next Steps, MCS)"
  npd_itself: "ONS Secure Research Service or DfE Data Sharing Service — project- and variable-specific, no open microdata; months to approve"
  cohorts: "the UK birth cohorts themselves (via UK Data Service, Centre for Longitudinal Studies) are mostly Open/EUL or Safeguarded — only the NPD- or NHS-linked variables within them need Secure Lab"
  gotcha: "attrition is substantial by later cohort sweeps — apply the supplied longitudinal/attrition weights matched to your analytic sample"
- id: neps
  name: National Educational Panel Study (Germany)
  provider: LIfBi Bamberg
  starting_cohorts: "SC1 newborns through SC6 adults 23-64 (linked to the German PIAAC sample)"
  access: "direct SUF download after signing a Data Use Agreement — materially easier than the NCES restricted-use equivalent"
  gotcha: "version numbering matters (e.g. 13-0-0) — always cite and pin the exact SUF version"
- id: timss_pirls_icils_iccs
  provider: IEA, Boston College
  content: "TIMSS (maths/science, grades 4&8, 4-yearly), PIRLS (reading, grade 4, 5-yearly), ICILS (computer/info literacy grade 8), ICCS (civic/citizenship)"
  access: "open — free registration + per-study disclaimer at the IEA Data Repository"
  weights: "TOTWGT total student weight + jackknife zone/replicate variables"
  ⚠: "naive analysis in raw SPSS gives wrong standard errors — use the IEA IDB Analyzer, RALSA, or intsvy"
- id: eurostat_aes
  name: Eurostat Adult Education Survey
  note: "the one Eurostat education product that IS genuine microdata (unlike UOE, which is aggregate ministry submissions) — scientific-use access via the standard Eurostat SUF route"
```
