# Påstandsprobe 2026-08-16 — community-pakker + mikrodata-guider

Oppfølgeren til lenkeproben (som kun sjekket lenke-LIV): fire parallelle
subagenter verifiserte PÅSTANDENE — access («open, no key»), api_base,
URL-mønstre, formater — i 43 community-pakker med probebare URL-er og
alle 10 mikrodata-guider i data/sources/ (de nøkkelkrevende med ekte
nøkler via skall-miljø, aldri printet). Probe-etikette: Range-GET,
nettleser-UA, maks 3 URL-er/fil, 0.3 s pause. Rå funn i funn-*.json.

## Resultat (53 filer, ~90 prober)

- **46 filer helt OK** — påstandene stemmer med virkeligheten, inkl.
  Zenodo/OpenML/QWI/PIAAC/RECS/Sikt/UCI/Socrata/Urban-Ed/MEPS/GLEIF/
  data-europa/Dateno/EIA/Manifesto (nøkkelfrie armer), og alle 10
  mikrodata-guider (ESS- og Census-nøkkelflyten bekreftet i drift;
  CESSDA-tallet 77 studier for Norge+helse; NCHS soft-404-fella
  reprodusert nøyaktig som dokumentert; IHSN nåbar direkte, kun
  Deno-TLS-fella består).
- **RÅTE fikset (2):**
  - `src-lodes.md`: url_pattern pekte på LODES7-mappen som stopper i
    2019 (2021-fil 404-er, katalog-listing bekrefter) mens frontmatter
    lover 2002–2023 → LODES8 (som faktisk dekker 2002–2023, 2020-blokker).
  - `src-ckan.md`: catalog.data.gov svarer ikke lenger på klassisk
    CKAN-API (`/api/3/action/*` 404) — deployment-lista og brødteksten
    omskrevet; data.gov.uk virker (redirect til
    ckan.publishing.service.gov.uk, 200, 1350 treff).
- **Faktarettelse (1):** `data/sources/ihsn.md` sa «ECDSA-SHA512»;
  openssl viser ecdsa-with-SHA384 — rettet (endrer ikke TLS-fellens
  konklusjon).
- **NETT/WAF-støy (6, INGEN endring):** cdc.gov/bls.gov/www.cdc.gov-
  forsider gir 403 mot probemiljøets IP (Akamai-klasse-WAF) mens
  data.cdc.gov gir 200 — samme klasse som lenkeprobens BRFSS-notat;
  reverifiseres i ekte nettleser ved anledning. dataverse: transient.
- **Egenverifisert i samme runde:** datacommons v2/observation (200,
  4 fasetter for Count_Person/NOR — multi-fasett-fella reell; anker
  lagt i guiden).
