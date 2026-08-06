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

## Germany

```yaml
- id: fdz_destatis
  name: FDZ der Statistischen Ämter des Bundes und der Länder
  content: "90+ official statistics — Mikrozensus, census, structural business stats, VAT, earnings, DRG hospital stats"
  tiers: [Public Use File, Campus File, Scientific Use File, Remote Scientific Use File, On-Site Use]
  directly_downloadable: "YES — PUFs and Campus Files after simple registration"
  who_may_apply: "the request form asks for the applying scientific institution's name/address; a Germany-location requirement for SUF/remote access is commonly reported but NOT stated on the current request page — UNVERIFIED, ask FDZ staff"
- id: fdz_iab
  name: FDZ-BA/IAB — Research Data Centre of the Federal Employment Agency
  products: [IEB, SIAB, LIAB, BHP]
  tiers: [Scientific Use File, "On-Site (Nuremberg + guest workplaces in the US/Canada/UK)", Remote Data Access, "Remote Execution via JoSuA"]
  international_note: "JoSuA remote execution is usable from abroad without extra anonymisation — the best route for non-resident researchers"
  detail: "see the labour-firms pack for the SIAB/LIAB/BHP content itself"
- id: fdz_rv
  name: FDZ der Rentenversicherung
  content: "insured-person pension records (Versicherungskonto), pension access/stock, rehabilitation"
  tiers: [Scientific Use File, on-site, off-site on own device]
- id: gesis_gml
  name: GESIS German Microdata Lab (MISSY)
  role: "documentation and distribution layer, NOT the data custodian — German Mikrozensus incl. 1970 census + GDR microdata, plus EU-SILC/EU-LFS/AES/HBS/EHIS documentation"
  note: "MISSY is the best microdata metadata portal in Europe — use it even when you obtain the data elsewhere"
```

Germany is a network, not one door: social/economic official statistics →
Destatis FDZ; labour-market administrative → IAB; pensions → FDZ-RV; use
GESIS/MISSY as the documentation layer regardless of source.

## France

```yaml
- id: casd
  name: CASD — Centre d'accès sécurisé aux données
  content: "~580 sources: INSEE, DGFiP tax data, Justice, Education, Agriculture, hospital-stay (PMSI/ATIH), some private data"
  access_technology: "SD-Box — proprietary secure terminal with biometric authentication, installed at your hosting institution; ONE in-person biometric enrolment trip to France required"
  who_may_apply: "French and EU/associated-country researchers; North American researchers via an ICPSR partnership"
  cross_border: "IDAN network links 6 secure centres across FR/DE/NL/UK"
  directly_downloadable: false
- id: adisp_progedo
  name: ADISP / Quetelet-Progedo Diffusion
  content: "public statistical survey data plus FPR (Fichiers de Production et de Recherche) — an intermediate tier between public files and CASD-level confidential data"
  who_may_apply: "explicitly open to French AND foreign researchers, doctoral students, post-docs"
  steps: "institutional-email account → project description → signed forms; FPR needs Comité du Secret Statistique authorisation"
  directly_downloadable: "some standard/aggregated files after account creation; FPR requires CSS approval"
- id: insee_census
  note: "the rolling-census 'fichiers détail' ARE openly downloadable, no application — see the demography-migration-housing pack"
```

## Netherlands

```yaml
id: cbs_microdata
name: CBS Microdata Services
content: "population, income, health, education, business registers, tax, labour — linkable via CBS internal keys"
access: "remote access into a CBS-controlled environment; no raw data leaves"
two_stage: ["institutional authorisation by the CBS Director-General, valid up to 3 years", "project-level application via the CBS microdata portal"]
who_may_apply: "only through an authorised institution — individuals cannot apply alone; foreign institutions CAN be authorised"
shortcut: "ODISSEI member institutions get a streamlined route (odissei-data.nl/facility/microdata-access) — materially faster than applying to CBS cold"
```

## United Kingdom

```yaml
- id: ons_srs
  name: ONS Secure Research Service
  ⚠_status: "VOLATILE — the SRS→IDS migration has been troubled; SRS remains the route external researchers are directed to. RE-CHECK before relying on this."
  access: "Accredited Researcher status (Digital Economy Act 2017) + Safe Researcher Training + panel approval; remote secure environment, no download"
  who_may_apply: "primarily UK-based; international applicants generally need an accredited UK partner"
- id: uk_data_service
  tiers: {open: "no registration, direct download, OGL/CC-BY", safeguarded_eul: "free registration + End User Licence", special_licence: "extra forms for detailed geography", controlled_securelab: "Accredited Researcher status, remote SecureLab, no download"}
  note: "non-UK researchers CAN register; overseas access to safeguarded data is EEA-restricted for some studies"
- id: adr_uk
  name: Administrative Data Research UK
  tres: {ONS_SRS: "all ONS-held data with sharing agreements", NISRA: "N. Ireland gov+health", eDRIS: "Scotland", SAIL_Databank: "Wales, billions of anonymised person-records"}
  gotcha: "four separate governance regimes under one brand — no single unified application"
```

## Italy and Spain — the open ones (start here for speed)

```yaml
- id: istat
  name: ISTAT microdata programme
  tiers: [Public Use Files, Standard Files, Scientific Use Files (MFR), "Secure Use Files via Laboratorio ADELE"]
  directly_downloadable: "YES — Public Use Files and Standard Files, free, for study/research"
  adele_lab: "for SUF-tier access — applicant institution recognised by Comstat/Eurostat, PI must be a professor, research scientist, grantee, institute director or scientific-society member"
- id: ine_spain
  name: INE — Instituto Nacional de Estadística
  directly_downloadable: "YES — this is INE's distinguishing feature. Anonymised microdata for many major surveys, incl. the Encuesta de Población Activa (EPA), downloads directly."
  restricted_tier: "~25+ operations with detailed occupation/wage-decile/cause-of-death/nationality detail require application"
  es_datalab: "newer joint secure-access infrastructure across 9 institutions (incl. INE, tax agency, Banco de España) for cross-linking confidential microdata"
```

## Austria, Switzerland, Ireland

```yaml
- id: amdc
  name: Austrian Micro Data Center (AMDC)
  access: "remote access only via virtual desktop — no on-site option, no download"
  two_stage: ["institutional accreditation (5-year validity)", "project-specific access request"]
  turnaround: "~1 month project review + ~1 month formal offer"
- id: bfs_switzerland
  name: Swiss Federal Statistical Office (BFS/FSO)
  tiers: [Public Use File, Scientific Use File, Secure Use File]
  who_may_apply: "students, PhD students, researchers AND foreign researchers eligible for ALL THREE tiers"
  turnaround: "1 week (well-documented request) to 3 months (if the request needs clarification)"
  directly_downloadable: "YES — PUFs"
- id: cso_ireland
  name: CSO Researcher Microdata Files (RMF)
  content: "50+ datasets — LFS, Structure of Earnings, Household Budget, SILC, HFCS, Growing Up in Ireland, Sexual Violence Survey"
  parallel_route: "ISSDA (UCD) is the long-standing academic distribution channel for many of the same files — check both"
```

## Belgium, Portugal, Poland, Czechia, Greece (condensed)

```yaml
- {country: Belgium, agency: Statbel, who_may_apply: "public administrations, universities, study departments, international orgs — individuals effectively cannot; PhD students need an institutional guarantor", process: "consult Statbel statisticians → formal application → approval in 2-3 weeks"}
- {country: Portugal, agency: INE, tiers: "Public Use Files (free download), Scientific Use Files (accredited researchers), Secure Use Files (4 physical safe centres)", turnaround: "~1 week excluding safe-centre use", cost: free}
- {country: Poland, agency: GUS, tiers: "Scientific Use Files via TransGUS; Secure Use Files on-site", turnaround: "~1 month, can extend"}
- {country: Czechia, agency: CZSO, tiers: "Scientific Use Files ONLY — on-site SafeCentre or secure-repository remote download", who_may_apply: "PhD students, researchers, foreign researchers; undergraduate theses NOT eligible unless part of funded research"}
- {country: Greece, agency: ELSTAT, tiers: "Public Use Files, Scientific Use Files, custom anonymised requests", process: "online form → select theme → accept use declarations"}
```

## Nordic countries

Full treatment lives in the `nordic-microdata` pack. Summary: Denmark
(Forskermaskinen + Sundhedsdatastyrelsen, remote enclave, Danish host
required), Norway (microdata.no self-service remote execution **and** SSB
data lending — two parallel routes), Sweden (MONA, Windows remote desktop),
Finland (FIONA + Findata, Finnish organisation required for foreign
researchers).

## EU-level infrastructure

```yaml
- id: eurostat_safe_centres
  tiers: {scientific_use_file: "partially anonymised, sent via S-CIRCABC", secure_use_on_site: "non-anonymised, Eurostat Safe Centre Luxembourg only", secure_use_remote: "non-anonymised, via accredited remote-access points — limited to EU/EEA/Switzerland/EC-adequacy countries"}
  entity_recognition: "~4 weeks (main activity must be research, publication record, independence)"
  request: "via the Microdata Access Portal, ~8 weeks incl. national consultation"
  total_realistic: ~3-6 months
- id: cros_cimes
  name: CROS / CIMES country pages
  url_pattern: "https://cros.ec.europa.eu/cimes-<country>"
  why_it_matters: "the single best index of any EU/EEA country's national microdata-access rules not detailed above"
- id: cessda
  built_in: "cessda (search_catalog source='cessda') federates national social-science archives (incl. UKDS/GESIS/Sikt/DANS) into a discovery layer — access still routes through the national archive"
- id: iza_idsc
  name: IZA International Data Service Center
  role: "secure remote analysis tooling for sensitive labour-market datasets; often a redistribution/tooling layer — check the underlying custodian's rules too (e.g. IAB)"
- id: ehds
  name: European Health Data Space — Regulation (EU) 2025/327
  status: "in force since ~March 2025, but SECONDARY-USE provisions NOT yet operative"
  timeline: {most_EHR_categories: "March 2029", genomic_data: "March 2031"}
  ⚠: "do NOT present EHDS as a current access route. National precursors (Findata, Health Data Hub France, Helsedataservice Norway) are the real channels today."
```

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
