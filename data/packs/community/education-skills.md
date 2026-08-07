# Education & skills microdata (PIAAC, PISA, TALIS)

Use this pack when questions concern **adult skills, student performance
or teachers** across countries (OECD studies). All data below are open
and registration-free, but file sizes differ wildly — that decides what
is actually usable in the app.

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

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **PIAAC** (id: src-piaac) — OECD adult skills survey, ages 16–65, open per-country CSV downloads, no registration; the recommended first stop in this domain.
- **PISA** (id: src-pisa) — OECD 15-year-old student performance study; full microdata is open but very heavy (500–682 MB zips with a DEFLATE64 trap) — usually better served by aggregate results or the learningtower R package.
- **TALIS** (id: src-talis) — OECD teachers survey; open SPSS zip (192 MB) but too heavy for this app — use OECD aggregate tables instead.
- **Urban Institute Education Data Portal** (id: src-urban-education-data) — unified open REST API over CCD/CRDC/IPEDS/College Scorecard/SAIPE/NHGIS; the practical entry point for US education admin data.
- **IPEDS** (id: src-ipeds) — institution-level (~6,000+ Title IV) US postsecondary data, open, merge on UNITID; no official REST API of its own — use the Urban Institute portal.
- **College Scorecard** (id: src-college-scorecard) — institution-year and field-of-study-year cost/admissions/completion/earnings/debt data (IRS/NSLDS match), open, free-key API.
- **England — NPD and linked cohorts** (id: src-uk-cohorts-npd) — National Pupil Database plus NCDS/BCS70/Next Steps/MCS; NPD itself needs Secure Research Service/DfE approval (months), the cohorts themselves are mostly Open/EUL/Safeguarded.
- **NEPS** (id: src-neps) — German National Educational Panel Study, cohorts newborn through adult 23–64; direct SUF download after a Data Use Agreement, easier than the NCES restricted-use route.

## Other sources (no separate pack)

- NAEP (National Assessment of Educational Progress, NCES/IES) — US student assessment (grades 4/8/12); the explorer tool is open cross-tabs only, the NAEPprimer R package bundles an open reduced 1994-2000 sample for development, and full respondent-level records need an NCES restricted-use licence — code developed against the primer transfers directly to the licensed file via the same readNAEP() entry point (EdSurvey).
- NCES longitudinal studies (ECLS-K:2011, ECLS-B, HSLS:09, ELS:2002, NELS:88, BPS/B&B/NPSAS, HSTS) — mostly restricted-use; ECLS-K:2011 base/public rounds are the main open exception, and the PowerStats/DataLab web tool is public for BPS/B&B/NPSAS even where microdata is restricted. Only organizations (universities, agencies) can apply, via ResearchDataGov — individuals cannot — requiring a security plan, notarised affidavit and unannounced compliance inspections.
- SEDA (Stanford Education Data Archive) — aggregate district/school/county achievement estimates on a common NAEP scale via empirical-Bayes linking across heterogeneous state tests, NOT primary microdata; open.
- TIMSS/PIRLS/ICILS/ICCS (IEA, Boston College) — TIMSS (maths/science, grades 4&8, 4-yearly), PIRLS (reading, grade 4, 5-yearly), ICILS (computer/info literacy, grade 8), ICCS (civic/citizenship); open with free registration plus a per-study disclaimer at the IEA Data Repository. Weight with TOTWGT (total student weight) plus jackknife zone/replicate variables — naive analysis in raw SPSS gives wrong standard errors, so use the IEA IDB Analyzer, RALSA, or intsvy.
- Eurostat Adult Education Survey — the one Eurostat education product that is genuine microdata (unlike UOE, which is aggregate ministry submissions); scientific-use access via the standard Eurostat SUF route.
