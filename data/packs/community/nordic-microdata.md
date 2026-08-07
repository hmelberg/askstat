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

Full access details, URLs and the microdata.no query-language example are
in the individual source packs below (id: src-microdata-no,
src-ssb-microdata-loan, src-helsedata-no).

SSB StatBank / PxWebApi is the open aggregate counterpart — no
microdata, no key, `pyjstat`-ready. Prefer it for denominators, population
structure and published series alongside microdata work; see the `norway`
pack for the canonical `ssb` source.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **microdata.no** (id: src-microdata-no) — remote-execution platform over SSB administrative registers, institutional agreement, no per-project ethics application; no bulk export, output-only.
- **Helsedata.no** (id: src-helsedata-no) — the Norwegian health-registry application portal, delivery to a secure enclave (TSD/SAFE/HUNT Cloud), REK ethics + DPIA required.
- **Sikt (formerly NSD)** (id: src-sikt) — Forskningsdatabanken/Surveybanken, freely downloadable Norwegian survey data, much of it without application.
- **SSB "utlån av data til forskere"** (id: src-ssb-microdata-loan) — genuine record-level files delivered to a secure enclave via full project application, incl. FD-Trygd.
- **Danmarks Statistik — Forskningsservice** (id: src-dst-forskningsservice) — genuine microdata access inside the Forskermaskinen controlled environment, richer than microdata.no's anonymised-output-only model.
- **THL** (id: src-thl) — Finnish Institute for Health and Welfare registers (Hilmo, Cause of Death, Medical Birth, Infectious Diseases), open-data API.
- **Nordic Commons** (id: src-nordic-commons) — NordForsk cross-Nordic register-research initiative; UNVERIFIED, appears to remain a policy vision/funded-pilot stage rather than an operational platform.

## Other sources (no separate pack)

### Registries reachable via Helsedata.no

Reachable via the Helsedata.no portal (id: src-helsedata-no) — each keeps
its own coverage years and quirks; quote the specifics, do not assume
uniformity.

- Norsk pasientregister (NPR) — specialist health services (somatic hospitals, psychiatry, TSB substance-abuse treatment, waiting times; ICD-10 diagnoses, NCMP/NCSP procedures, DRG); identifiable 2008-present, de-identified 1997-2007; excludes privately/insurance-financed care.
- KUHR (primary-care reimbursement claims, ICPC-2 diagnoses) — coverage 2006-present; NOT part of the common Helsedata.no form since 15 March 2023, apply directly to Helsedirektoratet.
- Reseptregisteret / NorPD — pharmacy-dispensed prescriptions, ATC-coded, individual level.
- Legemiddelregisteret (LMR) — broader medicine-use register incl. hospital/institutional use beyond pharmacy dispensing.
- Medisinsk fødselsregister (Medical Birth Registry) — coverage 1967-present.
- Dødsårsaksregisteret (Cause of Death Registry) — underlying + contributing causes (ICD-10), date, place, incl. deaths abroad.
- Kreftregisteret (Cancer Registry of Norway) — independent institution; also runs disease-specific quality registries, each listed separately on helsedata.no.
- Hjerte- og karregisteret (Cardiovascular Disease Registry).
- MoBa — Norwegian Mother, Father and Child Cohort Study: pregnancy cohort 1999-2008 (~114,500 children, ~95,200 mothers, ~75,200 fathers); questionnaires pregnancy→adolescence, genotype + biobank, linkable to MFR/NPR.
- CONOR — Cohort of Norway: pooled county health-survey cohort, ~170,000+ participants, ~1994-2003.

### Norway — other sources

- HUNT — Trøndelag Health Study — ~250,000 participants, HUNT1-4: questionnaires, clinical measures, accelerometry, biological samples, genomics; requires HUNT Data Access Committee approval and REK approval. Participant withdrawal triggers full data deletion — relevant for longitudinal design.
- Tromsøundersøkelsen (The Tromsø Study) — population-based repeated survey, 7 waves since 1974 (Tromsø7 2015-16, ~21,000 participants); application via UiT, exact portal UNVERIFIED.
- data.norge.no — registry source, see the datanorge source guide; national open-data catalog (DCAT-AP-NO), useful as a METADATA source even where the data itself is gated — NPR/MFR/NorPD dataset pages are indexed here.

### Denmark

- Sundhedsdatastyrelsen (Danish Health Data Authority) — Forskerservice — Secure Research Platform, remote access, no local download; foreign researchers must collaborate with a Danish institution that assumes data responsibility and provides MitID credentials, no independent foreign access. Key registers: Landspatientregisteret/LPR (hospital, 1977-2019), LPR3 (2019-present), CPR (civil registration, the linkage backbone via CPR-nummer), Dødsårsagsregisteret, Cancerregisteret and Lægemiddelstatistikregisteret.

### Sweden

- MONA — Statistics Sweden's Microdata Online Access — Windows remote-desktop environment, microdata stays in MONA, only approved results export; order via an SCB confidentiality assessment, then the approved project's administrator assigns MONA users. Foreign-researcher access is UNVERIFIED — expect a Swedish host-institution requirement, as in DK/NO.
- Socialstyrelsen registers — National Patient Register (inpatient from 1964, full national 1987; outpatient from 2001), Cause of Death, Prescribed Drug, Cancer and Medical Birth; apply directly, ethics approval from Etikprövningsmyndigheten required.
- Swedish National Data Service (SND) — national research-data infrastructure and catalog, Sweden's analogue to Sikt; hosts some directly downloadable social-science datasets.

### Finland

- Findata — Health and Social Data Permit Authority — one-stop permit for secondary use combining public + private + Kanta (national EHR/prescription) data in ONE application, secure analysis in the Kapseli® remote environment. Foreign-researcher access is generally available given a valid legal basis and R&D purpose — UNVERIFIED exact wording.

StatFin PxWeb (aggregate, open, keyless) is covered in the `finland` pack —
`statfin` source.

### Iceland

- Statistics Iceland (Hagstofa Íslands) — PxWeb platform, same tooling as SSB/SCB/StatFin.
- Directorate of Health (Embætti landlæknis) health registers — access UNVERIFIED, expect an application model analogous to other Nordic health-data authorities; linkage via kennitala.

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
