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

## Tillegg samme dag: katalog-liveness

- **apd-katalogen (868 poster):** stikkprøve på 40 (hver 21. indeks,
  subagent — rå funn i funn-apd.json) ga 27 OK / 6 DØD / 6 DNS-død /
  1 gatet ≈ 30 % unåelig → full probe av alle 868 kjørt med nytt
  gjenkjørbart verktøy `tools/probe_apd_catalog.py` (fjerner KUN
  bekreftet døde: 404/410 ×2 eller NXDOMAIN ×2; gatede/transiente
  beholdes; kjøres etter hver harvest). Resultat i commit-meldingen.
  Sidefunn: `Economics/prop-metrics-real-estate-data` har prosatekst i
  distributionUrl-feltet (strukturfeil; skriptet faller tilbake til url).
- **nada-katalogen (40 portaler):** egen-probet — 39/40 svarer 200 på
  search_url; eneste avvik er African Development Bank (403 = WAF/gating,
  ikke råte). Ingen endring.

### Fullprobe-resultatet (apd, alle 868)

Tre kjøringer var nødvendige — hver feil var et EKTE datafunn:
(1) bool i url-feltet (YAML-fella «yes») krasjet probingen; (2) 98
«døde» viste seg å inneholde en falsk-død-klasse — gamle http://-URL-er
som 404-er mens https-siden lever (målt: ucdp.uu.se) → https-
oppgraderingsforsøk lagt i skriptet. Endelig: **74 av 868 bekreftet døde
og fjernet** (42×404 + 1×410 + 31×NXDOMAIN, alle dømt på to uavhengige
forsøk; full liste i apd-dodsliste.txt) → 794 poster igjen. 33×403 og
transiente 5xx/NETT BEHOLDT. I tillegg ble 11 strukturfeil rettet
(prosatekst/bool i URL-felt) og samme vask lagt inn i
tools/harvest_apd_catalog.py sin normalize_entry så neste høsting ikke
gjeninnfører dem. Merk: github.com/JeffSackmann/tennis_atp/-wta 404-er
reelt (curl-bekreftet) — repoene ser ut til å være fjernet oppstrøms.

## Kilderunde 3 (samme dag): prosa-pakkene + oppskrifts-drift-testeren

- **Prosa-pakkene innholdsverifisert (57 filer, 2 subagenter — tjeneste-
  nivå, ikke lenkeliv):** 53 OK, 4 RÅTE fikset: src-bts-airline
  (DB1B→DB1C BEKREFTET fullført: DB1C månedlig 40 %-utvalg), src-cps-org
  (CEPR-ekstraktene stanser ved 2019/v2.5 — «updated monthly» var råtnet),
  src-ecb-safe (kvartalsvis fra 2024 Q1), src-us-decennial-post-dp
  (PPMF er ÅPEN nedlasting — pakken UNDERDREV tilgangen; motsatt
  råteretning av vanlig). Rå funn i funn-prosa-a/b.json.
- **NY: oppskrifts-drift-testeren** (`utforsk.py --oppskrifter`, gratis):
  re-kjører ALLE guide-oppskrifter maskinelt (alias-forhåndsbinding,
  /api/hent-oversettelse, nøkkel-shim for appens injeksjonskilder,
  mal-/app-verktøy-hopp). Første fulle kjøring: **21 OK, 0 FEIL,
  5 HOPPET** — og på veien fanget den tre EKTE oppskriftsbugs av
  hf-fellens klasse (census/ihsn/wbmicro manglet kind="json" →
  CSV-gjetting; fikset). Kjøres som ferskhetsport før eval-runder.
- owid-katalog-stikkprøven (40): 0 døde; IHME/GBD-slugs 403 på CSV
  (lisens) → dokumentert som felle i owid-guiden.
