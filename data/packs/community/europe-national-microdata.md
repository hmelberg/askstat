# European national statistics microdata (per country)

Use this pack when a question needs **individual-level official-statistics
microdata for a specific European country** — richer or faster than the
Eurostat harmonised route (EU-SILC/EU-LFS/EHIS, 3-6 months, deliberately
coarsened). It never returns values directly: every route here ends in an
application, a registration, or (for Spain/Italy) a direct download. Say
which tier applies and be honest about turnaround; never fabricate a number
while "waiting" for an application to clear.

## The label vocabulary (same words, different content per country)

| Tier name | Meaning | Typical gate |
|---|---|---|
| Public Use File (PUF) | strongly anonymised | none or free registration |
| Campus/Teaching File | reduced PUF for coursework | free registration |
| Scientific Use File (SUF) | factually anonymous, delivered to your institution | institutional contract |
| Secure Use File | non-anonymised | on-site or accredited remote access |
| Remote execution | you send code, get vetted output | institutional contract |

Treat the label as indicative, never a guarantee of comparable content
across countries. Two facts decide feasibility fast: **a domestic partner
institution is the norm** for anything above a PUF (Germany, France,
Netherlands, Finland, Poland, Czechia, Portugal, Austria all require it);
**Spain and Italy are the exceptions** — both publish substantial
anonymised microdata as direct downloads, no application at all.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **CROS / CIMES country pages** (id: src-cros-cimes) — European Commission
  index of national microdata-access rules, one page per EU/EEA country;
  open, navigational, not a data source itself.
- **Administrative Data Research UK** (id: src-adr-uk) — UK research-data
  linkage initiative split across four separate national governance
  regimes (ONS SRS, NISRA, eDRIS, SAIL Databank).

## Other sources (no separate pack)

### Germany

Germany is a network, not one door: social/economic official statistics →
Destatis FDZ; labour-market administrative → IAB; pensions → FDZ-RV; use
GESIS/MISSY as the documentation layer regardless of source.

- FDZ der Statistischen Ämter des Bundes und der Länder — free registration
  for Public Use Files/Campus Files (direct download); Scientific Use
  File/Remote Scientific Use File/On-Site tiers need an applying scientific
  institution. Covers 90+ official statistics: Mikrozensus, census,
  structural business stats, VAT, earnings, DRG hospital stats.
- FDZ-BA/IAB (Research Data Centre of the Federal Employment Agency) —
  Scientific Use File, On-Site (Nuremberg + guest workplaces in the
  US/Canada/UK), Remote Data Access, or Remote Execution via JoSuA (usable
  from abroad without extra anonymisation — the best route for
  non-resident researchers). Covers IEB/SIAB/LIAB/BHP; see the
  labour-firms pack for the SIAB/LIAB/BHP content itself.
- FDZ der Rentenversicherung — Scientific Use File, on-site, or off-site on
  own device, for insured-person pension records (Versicherungskonto,
  pension access/stock, rehabilitation).
- GESIS German Microdata Lab (MISSY) — a documentation and distribution
  layer, not the data custodian: German Mikrozensus (incl. 1970 census +
  GDR microdata) plus EU-SILC/EU-LFS/AES/HBS/EHIS documentation. The best
  microdata metadata portal in Europe — worth using even when the data
  itself comes from elsewhere.

### France

- CASD — Centre d'accès sécurisé aux données — ~580 sources (INSEE, DGFiP
  tax data, Justice, Education, Agriculture, hospital-stay PMSI/ATIH, some
  private data); access via a proprietary SD-Box secure terminal requiring
  one in-person biometric enrolment trip to France. Open to French and
  EU/associated-country researchers, North American researchers via an
  ICPSR partnership; not directly downloadable.
- ADISP / Quetelet-Progedo Diffusion — public statistical survey data plus
  FPR (Fichiers de Production et de Recherche), an intermediate tier
  between public files and CASD-level confidential data; explicitly open
  to French AND foreign researchers, doctoral students, post-docs, via
  institutional-email account → project description → signed forms (FPR
  needs Comité du Secret Statistique authorisation). Some standard/
  aggregated files are directly downloadable after account creation.
- INSEE rolling-census "fichiers détail" — openly downloadable, no
  application — see the demography-migration-housing pack.

### Netherlands

- CBS Microdata Services — remote access into a CBS-controlled
  environment, no raw data leaves; covers population, income, health,
  education, business registers, tax and labour, linkable via CBS internal
  keys. Two-stage access (institutional authorisation by the CBS
  Director-General, valid up to 3 years, then a project-level
  application) — only through an authorised institution, individuals
  cannot apply alone, though foreign institutions can be authorised;
  ODISSEI member institutions get a materially faster route.

### United Kingdom

- ONS Secure Research Service — Accredited Researcher status (Digital
  Economy Act 2017) + Safe Researcher Training + panel approval, remote
  secure environment, no download; primarily UK-based, international
  applicants generally need an accredited UK partner. The SRS→IDS
  migration has been troubled — re-check status before relying on it.
- UK Data Service — four tiers: open (no registration, direct download,
  OGL/CC-BY), safeguarded/EUL (free registration + End User Licence),
  special licence (extra forms for detailed geography), and
  controlled/SecureLab (Accredited Researcher status, remote SecureLab, no
  download). Non-UK researchers can register; overseas access to
  safeguarded data is EEA-restricted for some studies.

### Italy and Spain — the open ones (start here for speed)

- ISTAT microdata programme — Public Use Files and Standard Files are
  directly downloadable, free, for study/research; Scientific Use Files
  (MFR) need Laboratorio ADELE access, restricted to Comstat/Eurostat-
  recognised institutions with a qualifying PI (professor, research
  scientist, grantee, institute director, or scientific-society member).
- INE — Instituto Nacional de Estadística — many major surveys (incl. the
  Encuesta de Población Activa/EPA) have anonymised microdata as direct
  downloads, no application; this is INE's distinguishing feature.
  ~25+ operations with detailed occupation/wage-decile/cause-of-death/
  nationality detail require application; ES DataLab is a newer joint
  secure-access infrastructure across 9 institutions (incl. INE, the tax
  agency, Banco de España) for cross-linking confidential microdata.

### Austria, Switzerland, Ireland

- Austrian Micro Data Center (AMDC) — remote access only via virtual
  desktop, no on-site option, no download; two-stage (institutional
  accreditation, 5-year validity, then a project-specific access request);
  ~1 month project review + ~1 month formal offer.
- Swiss Federal Statistical Office (BFS/FSO) — Public Use Files are
  directly downloadable; Scientific Use File and Secure Use File tiers are
  open to students, PhD students, researchers AND foreign researchers for
  all three tiers; turnaround 1 week (well-documented request) to 3
  months (if clarification is needed).
- CSO Researcher Microdata Files (RMF) — 50+ datasets: LFS, Structure of
  Earnings, Household Budget, SILC, HFCS, Growing Up in Ireland, Sexual
  Violence Survey. ISSDA (UCD) is a parallel, long-standing academic
  distribution channel for many of the same files — check both.

### Belgium, Portugal, Poland, Czechia, Greece (condensed)

- Belgium (Statbel) — public administrations, universities, study
  departments and international orgs may apply (individuals effectively
  cannot; PhD students need an institutional guarantor); consult Statbel
  statisticians, then formal application, approval in 2-3 weeks.
- Portugal (INE) — Public Use Files free download, Scientific Use Files
  for accredited researchers, Secure Use Files at 4 physical safe centres;
  turnaround ~1 week excluding safe-centre use, free.
- Poland (GUS) — Scientific Use Files via TransGUS, Secure Use Files
  on-site; turnaround ~1 month, can extend.
- Czechia (CZSO) — Scientific Use Files only, on-site SafeCentre or
  secure-repository remote download; PhD students, researchers and
  foreign researchers eligible, undergraduate theses not eligible unless
  part of funded research.
- Greece (ELSTAT) — Public Use Files, Scientific Use Files, custom
  anonymised requests; online form → select theme → accept use
  declarations.

### EU-level infrastructure

- Eurostat Safe Centres — Scientific Use File (partially anonymised, via
  S-CIRCABC), Secure Use on-site (non-anonymised, Eurostat Safe Centre
  Luxembourg only), or Secure Use remote (non-anonymised, accredited
  remote-access points limited to EU/EEA/Switzerland/EC-adequacy
  countries); entity recognition ~4 weeks, request via the Microdata
  Access Portal ~8 weeks incl. national consultation, total realistically
  3-6 months.
- CESSDA — registry source, see the cessda source guide; federates
  national social-science archives (incl. UKDS/GESIS/Sikt/DANS) into a
  discovery layer — access still routes through the national archive.
- IZA International Data Service Center — secure remote analysis tooling
  for sensitive labour-market datasets; often a redistribution/tooling
  layer — check the underlying custodian's rules too (e.g. IAB).
- European Health Data Space — Regulation (EU) 2025/327 — in force since
  ~March 2025, but SECONDARY-USE provisions NOT yet operative (most EHR
  categories March 2029, genomic data March 2031). Do NOT present EHDS as
  a current access route — national precursors (Findata, Health Data Hub
  France, Helsedataservice Norway) are the real channels today.

## Nordic countries

Full treatment lives in the `nordic-microdata` pack. Summary: Denmark
(Forskermaskinen + Sundhedsdatastyrelsen, remote enclave, Danish host
required), Norway (microdata.no self-service remote execution **and** SSB
data lending — two parallel routes), Sweden (MONA, Windows remote desktop),
Finland (FIONA + Findata, Finnish organisation required for foreign
researchers).

## Practical decision tree

1. **Cross-national and harmonisation matters more than depth?** → Eurostat
   SUF (3-6 months), or faster: SHARE/ESS/EU-SILC PUF (see `europe-surveys`).
2. **Single country, need it now?** → Spain (INE) or Italy (Standard Files)
   first, then Germany Campus Files, Switzerland PUF, Portugal PUF, Greece PUF.
3. **Have a domestic partner institution?** → the national SUF/remote-access
   route is almost always richer than Eurostat's version of the same survey.
4. **Outside the country, no partner?** → look for **remote execution**
   (IAB JoSuA, Norway microdata.no) — designed for exactly this case.
5. **Health data?** → don't wait for EHDS; use the current national permit
   authority.
