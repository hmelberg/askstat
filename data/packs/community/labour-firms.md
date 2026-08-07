# Labour market, firm and business microdata

Use this pack when a question concerns **workers, jobs, establishments or
firms at the record level** — job flows, wages, firm demographics, worker
mobility, business registers. A surprising amount here is openly
downloadable with no application — far more than health or social survey
data. The open set: LODES, QWI, BDS, CPS-ORG extracts, QCEW, OEWS, JOLTS,
O*NET, OSHA ITA, H-1B/PERM, GLEIF, UK Companies House, Norway's
Enhetsregisteret, EU-EFIGE. The closed set is everything genuinely linked at
the worker-firm level: LBD, IAB's SIAB/LIAB/BHP, Nordic LEED registers,
EU-LFS/CIS microdata, and all commercial firm databases.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

### United States — openly downloadable

- **LODES** (id: src-lodes) — census-block-pair job-flow data, open, no key.
- **QWI** (id: src-qwi) — establishment × demographic-group cell data, free-key API.
- **BDS** (id: src-bds) — establishment/firm entry-exit-and-flow counts, open, public derivative of LBD.
- **CPS-ORG** (id: src-cps-org) — individual worker-month microdata, open CEPR uniform extracts.
- **QCEW** (id: src-qcew) — near-census establishment employment/wages, open.
- **OEWS** (id: src-oews) — occupation × industry × area wage/employment cells, open.
- **JOLTS** (id: src-jolts) — job openings/hires/separations, open aggregate series.
- **BLS Public Data API v2** (id: src-bls-api) — general time-series API behind CPS/QCEW/OEWS, free key.
- **OSHA ITA** (id: src-osha-ita) — establishment-level injury/illness data, open, 2016-present.
- **OFLC disclosure data (H-1B/PERM/H-2A/H-2B)** (id: src-h1b-perm) — individual visa-case disclosure data, open.

**Closed/commercial in the US:** Lightcast job postings (OAuth2, contracted,
no free tier) — mention it exists, do not promise access.

### Europe

- **EU-LFS** (id: src-eu-lfs) — harmonised labour-force microdata; open public-use files are training-only, SUF application needed for population inference.
- **Community Innovation Survey (CIS)** (id: src-cis) — enterprise innovation activity, biennial, microdata via application.

### Firm registers and identifiers — the open ones

- **GLEIF** (id: src-gleif) — cross-country Legal Entity Identifier registry, open, no key.
- **UK Companies House** (id: src-companies-house) — UK company register, open bulk + free-registration API.
- **Enhetsregisteret** (id: src-bronnoysund) — Norway's business register, open API and bulk download.
- **ORBIS / Bureau van Dijk (Moody's)** (id: src-orbis) — commercial global firm financial-statement database.

### Firm surveys with an academic access route

- **EU-EFIGE / Bruegel-UniCredit dataset** (id: src-eu-efige) — manufacturing-firm survey, 7 countries, open, single wave.
- **ECB SAFE** (id: src-ecb-safe) — SME/firm access-to-finance survey, free registration.
- **ECB HFCS** (id: src-hfcs) — household wealth/debt/income/consumption microdata with individual-level labour/income detail per member; application required (government photo ID, English CV, request form to hfcs.access@ecb.europa.eu).

## Other sources (no separate pack)

### United States

- Indeed Hiring Lab — open aggregate indices only (CSV on GitHub), not raw postings.
- SOII / CFOI — open for published tables; case-level CFOI microdata requires application to BLS.
- LBD (Longitudinal Business Database) — enclave access only (FSRDC, approved project + Special Sworn Status, ~6-12 month turnaround via researchdatagov.org); the restricted universe behind BDS, establishment and firm longitudinally linked.
- O*NET Database — open, free developer account for the Web Services API; the standard occupation (SOC) skill/ability/knowledge/task crosswalk for labour-market microdata.

### Europe

- Structural Business Statistics (SBS) — aggregate tables open; enterprise-level microdata via application or national safe centre.
- IAB linked employer-employee data (Germany, SIAB/LIAB/BHP) — no open download; access is on-site at IAB Nuremberg, via Scientific Use Files to registered institutions, or via remote execution (JoSuA, usable from abroad, budget two iterations for disclosure-vetted output). SIAB wages are right-censored at the social-security ceiling and need imputation (Card-Heining-Kline/Dustmann) for wage-distribution work; the establishment side (LIAB) is a survey sample needing weights, and BHP establishment IDs (Betriebsnummer) can change on administrative reorganisation.
- OECD MultiProd/DynEmp — a distributed-computation project, not a downloadable dataset: the code travels to the data and the data never pools, so get your country's firm register through its own restricted route and run the OECD's published code for comparable output.

### Firm registers

- CVR — Det Centrale Virksomhedsregister (Denmark) — free registration (credentials from Erhvervsstyrelsen, not keyless); REST API with HTTP Basic Auth (scheme unverified, try https first).
- Bolagsverket (Sweden) — access mixed and in transition: the general company-info API still needs customer registration, though some high-value sets are now fee-free under the EU Open Data Directive (fee schedule unverified).

### Nordic linked employer-employee registers (pointer)

Full treatment in the `nordic-microdata` and `europe-national-microdata`
packs. All four below are full-population, personal-ID-linked, and none
permits raw export:

| Country | Register | Access system |
|---|---|---|
| Norway | registerbasert sysselsettingsstatistikk (SSB) | microdata.no or SSB data lending |
| Sweden | RAMS / LISA (SCB) | MONA remote desktop |
| Denmark | IDA / BFL (DST) | Forskermaskinen |
| Finland | FLEED (Statistics Finland) | FIONA |

## Analysis notes

- US administrative data (LODES/QWI/QCEW/BDS) needs no survey weighting —
  it is near-census; European survey-based firm data (LIAB establishment
  side, ECB SAFE) needs weights.
- NAICS/SIC/ISCO/NACE revisions break time series at known dates — flag the
  break rather than pooling silently across it.
- Cite the register/survey name, vintage and (for EU sources) the coverage
  years explicitly — access tiers here change faster than the underlying
  economics.
