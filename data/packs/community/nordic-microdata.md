# Nordic and Norwegian registry microdata

Use this pack when a question needs **individual-level Norwegian, Danish,
Swedish, Finnish or Icelandic register data** — beyond what SSB/StatFin
aggregate tables answer. Nordic countries have near-complete population
registries linked by a personal ID number, which makes them the best
registry-research environment in the world — and *none* of that microdata
is downloadable. Access is always one of: (a) an open aggregate API with no
application, (b) remote execution where only anonymised output leaves, or
(c) a formal application ending in delivery to a secure enclave. If asked to
"download" Nordic registry data, reframe honestly into one of these three —
never fabricate register values.

## Norway: three access philosophies, routinely confused

| Route | What you get | Application? | Time |
|---|---|---|---|
| **microdata.no** | Remote execution over SSB registers; auto-anonymised output only | No per-project application (institutional agreement) | Hours |
| **SSB "utlån av data til forskere"** | A real record-level file delivered to a secure enclave (e.g. TSD) | Yes — full project application | Months |
| **Helsedata.no** | Health-registry microdata delivered to TSD/SAFE/HUNT Cloud | Yes — REK ethics + DPIA + legal basis | 3–6 months |

```yaml
id: microdata_no
name: microdata.no
kind: remote-execution platform over SSB administrative registers
provider: Sikt + Statistics Norway, funded by the Research Council of Norway
landing: https://www.microdata.no/en/
variable_catalog: https://www.microdata.no/discovery
content: "unmanipulated SSB register microdata — population, education, income/tax, social security (FD-Trygd), employment, family/household, criminal justice; some series back to 1964. Health registries (NPR/MFR/Kreftregisteret) are NOT here — that is Helsedata.no's domain."
access: institutional agreement; no per-project ethics application
export: "NONE — no bulk export. Only aggregated tables and model output leave the platform (automatic on-the-fly anonymisation: rounding, cell suppression, hexbin scatterplots)."
foreign_researcher_eligibility: UNVERIFIED — historically required a Norwegian institutional affiliation
```

The query language is Stata-like and executes server-side — by far the
fastest way to a defensible answer from Norwegian register data (hours, not
months), at the cost of never seeing a row:

```
require no.ssb.fdb:15 as db
import db/BEFOLKNING_KJOENN as gender
import db/INNTEKT_WYRKINNT 2019-01-01 as income
generate age = 2015 - int(birth_year_month/100)
keep if age >= 18
tabulate gender, summarize(income) p50
regress workincome male high_edu_father high_edu_mother
```

Verbs: `require`, `create-dataset`, `import`/`import-event`/`import-panel`,
`generate`, `replace`, `recode`, `collapse`, `merge`, `tabulate`,
`summarize`, `regress`, `logit`, `regress-panel`. If the user's question is
answerable this way, you can draft the script even without running it.

**SSB StatBank / PxWebApi** is the open aggregate counterpart — no
microdata, no key, `pyjstat`-ready. Prefer it for denominators, population
structure and published series alongside microdata work; see the `norway`
pack for the canonical `ssb` source.

## Helsedata.no — the Norwegian health registry application portal

```yaml
id: helsedata_no
name: Helsedata.no / Helsedataservice
provider: Helsedataservice, part of FHI
landing: https://helsedata.no/
registry_catalog: https://helsedata.no/no/datakilder/
delivery: "secure enclave — TSD (UiO), SAFE (UiB), or HUNT Cloud (NTNU). Never a raw file by email."
timelines: {anonymous_aggregated: "official max 30 working days, realistic 3-4 months", personally_identifiable: "official max 60 working days (linked/multi-register), realistic ~6 months — requires REK approval, GDPR Art.6+Art.9 legal basis, a DPIA"}
pricing: {base_fee: "NOK 1,500 excl. VAT single source / NOK 3,000 multiple sources", hourly: "NOK 1,155/hour excl. VAT (2024 rate, UNVERIFIED for 2026)", typical_totals: "NOK 10,000-30,000 single source; NOK 25,000-60,000 complex linkage"}
foreign_researchers: "a Norwegian institutional data controller and legal basis are effectively required — UNVERIFIED exact wording"
```

Registries reachable through this one portal (each keeps its own coverage
years and quirks — quote the specifics, do not assume uniformity):

```yaml
- id: npr
  name: Norsk pasientregister (Norwegian Patient Registry)
  content: "specialist health services — somatic hospitals, psychiatry, TSB substance-abuse treatment, waiting times; ICD-10 diagnoses, NCMP/NCSP procedures, DRG"
  coverage: "identifiable 2008-present; de-identified 1997-2007"
  excludes: privately/insurance-financed care
- id: kuhr
  name: KUHR (primary-care reimbursement claims, ICPC-2 diagnoses)
  coverage: 2006-present
  ⚠: "NOT part of the common Helsedata.no form since 15 March 2023 — apply directly to Helsedirektoratet"
- id: reseptregisteret
  name: Reseptregisteret / NorPD
  content: pharmacy-dispensed prescriptions, ATC-coded, individual level
- id: legemiddelregisteret
  name: Legemiddelregisteret (LMR)
  content: "broader medicine-use register incl. hospital/institutional use beyond pharmacy dispensing"
- id: mfr
  name: Medisinsk fødselsregister (Medical Birth Registry)
  coverage: 1967-present
- id: dodsarsaksregisteret
  name: Dødsårsaksregisteret (Cause of Death Registry)
  content: "underlying + contributing causes (ICD-10), date, place, incl. deaths abroad"
- id: kreftregisteret
  name: Kreftregisteret (Cancer Registry of Norway)
  note: "independent institution; also runs disease-specific quality registries, each listed separately on helsedata.no"
- id: hjerte_kar
  name: Hjerte- og karregisteret (Cardiovascular Disease Registry)
- id: moba
  name: MoBa — Norwegian Mother, Father and Child Cohort Study
  content: "pregnancy cohort 1999-2008: ~114,500 children, ~95,200 mothers, ~75,200 fathers; questionnaires pregnancy→adolescence; genotype + biobank; linkable to MFR/NPR"
- id: conor
  name: CONOR — Cohort of Norway
  content: "pooled county health-survey cohort, ~170,000+ participants, ~1994-2003"
```

## Other Norwegian sources

```yaml
- id: hunt
  name: HUNT — Trøndelag Health Study
  content: "~250,000 participants, HUNT1-4: questionnaires, clinical measures, accelerometry, biological samples, genomics"
  requires: [HUNT Data Access Committee approval, REK approval]
  caveat: "participant withdrawal triggers full data deletion — relevant for longitudinal design"
- id: tromso
  name: Tromsøundersøkelsen (The Tromsø Study)
  content: "population-based repeated survey, 7 waves since 1974 (Tromsø7 2015-16, ~21,000 participants)"
  access: application via UiT — exact portal UNVERIFIED
- id: sikt
  name: Sikt (formerly NSD) — Forskningsdatabanken / Surveybanken
  content: "freely downloadable survey data from recurring Norwegian surveys, SSB, research institutes and individual deposits, much of it WITHOUT application"
  landing: https://sikt.no/en/find-data
  also: "hosts and distributes ESS — see the europe-surveys pack"
- id: ssb_microdata_loan
  name: SSB "utlån av data til forskere" (incl. FD-Trygd)
  content: "genuine record-level files delivered to a secure enclave (typically TSD), distinct from microdata.no's output-only model. FD-Trygd = linked social-security/labour-market event history (NAV benefit spells, unemployment, sick leave, disability)."
- id: data_norge_no
  name: data.norge.no
  role: "national open-data catalog (DCAT-AP-NO); useful as a METADATA source even where the data itself is gated — NPR/MFR/NorPD dataset pages are indexed here"
```

## DENMARK

```yaml
- id: dst_forskningsservice
  name: Danmarks Statistik — Forskningsservice
  model: "genuine microdata access inside a controlled environment (Forskermaskinen) — richer than microdata.no's anonymised-output-only model"
  foreign_researchers: "requires collaboration with/sponsorship by a Danish research institution"
- id: sundhedsdatastyrelsen
  name: Sundhedsdatastyrelsen (Danish Health Data Authority) — Forskerservice
  platform: "Secure Research Platform — remote access, no local download"
  foreign_researchers: "must collaborate with a Danish institution that assumes data responsibility and provides MitID credentials — no independent foreign access"
  linkage_key: CPR-nummer
  key_registers: [Landspatientregisteret/LPR (hospital, 1977-2019), LPR3 (2019-present), CPR (civil registration, the linkage backbone), Dødsårsagsregisteret, Cancerregisteret, Lægemiddelstatistikregisteret]
```

## SWEDEN

```yaml
- id: scb_mona
  name: MONA — Statistics Sweden's Microdata Online Access
  model: "Windows remote-desktop environment; microdata stays in MONA, only approved results export"
  process: "order a microdata release (SCB confidentiality assessment) → approved project's administrator assigns MONA users"
  foreign_researchers: UNVERIFIED — expect a Swedish host-institution requirement, as in DK/NO
- id: socialstyrelsen
  name: Socialstyrelsen registers
  registers: [National Patient Register (inpatient from 1964, full national 1987; outpatient from 2001), Cause of Death, Prescribed Drug, Cancer, Medical Birth]
  access: "apply directly; ethics approval from Etikprövningsmyndigheten required"
- id: snd
  name: Swedish National Data Service (SND)
  role: "national research-data infrastructure and catalog, Sweden's analogue to Sikt; hosts some directly downloadable social-science datasets"
```

## FINLAND

```yaml
- id: findata
  name: Findata — Health and Social Data Permit Authority
  role: "one-stop permit for secondary use combining public + private + Kanta (national EHR/prescription) data in ONE application"
  secure_environment: "Kapseli® remote analysis environment"
  foreign_researchers: "generally available given a valid legal basis and R&D purpose — UNVERIFIED exact wording"
- id: thl
  name: THL — Finnish Institute for Health and Welfare
  registers: [Hilmo (hospital discharge), Cause of Death, Medical Birth, Infectious Diseases]
  open_apis: https://thl.fi/en/statistics-and-data/data-and-services/open-data/open-apis
```

StatFin PxWeb (aggregate, open, keyless) is covered in the `finland` pack —
`statfin` source.

## ICELAND

```yaml
- id: statice
  name: Statistics Iceland (Hagstofa Íslands)
  platform: PxWeb — same tooling as SSB/SCB/StatFin
- id: landlaeknir
  name: Directorate of Health (Embætti landlæknis) health registers
  access: UNVERIFIED — expect an application model analogous to other Nordic health-data authorities; linkage via kennitala
```

## Nordic Commons (cross-country) — do not oversell

```yaml
id: nordic_commons
name: Nordic Commons / NordForsk register-research initiatives
status_2026: "UNVERIFIED — appears to remain a policy vision and funded-pilot stage rather than an operational cross-border query platform"
practical_implication: "for a real cross-Nordic linked-register study, expect to negotiate SEPARATELY with each national authority and run harmonised federated scripts. Do not promise a single unified cross-country dataset."
```

## Cross-cutting notes

- **Open aggregate statistics need no application anywhere in the Nordics**
  (SSB/SCB/StatFin/Statistics Iceland PxWeb, FHI Statistikk) — start there
  for anything that does not strictly need individual records.
- **Personal-ID linkage is the backbone everywhere**: fødselsnummer/D-nummer
  (NO), CPR (DK), personnummer (SE), henkilötunnus (FI), kennitala (IS) —
  always pseudonymised before delivery.
- **Foreign researchers need a domestic host institution** for
  individual-level data in every Nordic country. Open aggregate APIs are
  usable by anyone.
- **If speed matters more than granularity**, microdata.no gets a defensible
  answer from SSB registers in hours — nothing else in the Nordics comes
  close on turnaround.
