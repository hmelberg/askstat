# Mikrodatakilder-runden: research, evaluering og leveranse (2026-08-06)

Bestilling (Hans): askstat har få mikrodatakilder — søk bredt (web +
live-testing), vurder hva som skal inn i **default-registeret**, hva som
skal bli **pakker**, og hva som skal droppes. Startlista (upgini, HF
datasets, kaggle-cli, dataportals-registry, dateno) var et utgangspunkt,
ikke en grense.

Metode: fire parallelle research-agenter (US-mikrodata, søkemotorer/
kataloger, dataplattformer, internasjonale surveyprogrammer), alle med
live curl-verifisering inkl. CORS-sjekk mot `https://ask.melberg.app`.
Alt merket «verifisert» under er faktisk probet 2026-08-05/06; UVERIFISERT
er markert i kildeguidene.

## Levert i denne runden

**8 nye registerkilder** (alle etter ipums-mønsteret: registeroppføring +
kildeguide, INGEN adapterkode — all tilgang via generisk `/api/hent`-form
eller CORS-direkte):

| id | hva | nøkkel | CORS |
|---|---|---|---|
| ess | ESS survey-mikrodata via NY åpen REST-API (parquet/csv per fil-DOI) | gratis bruker-ID (sporings-ID, ikke hemmelig) | nei → proxy |
| census | ACS/CPS PUMS — ekte personnivå-rader som REST-JSON, kodebok + 80 replikatvekter maskinlesbart | `CENSUS_API_KEY` (site, gratis) | ja (metadata); data via proxy for nøkkel |
| nchs | NHANES XPT (0,5–15 MB) + NHIS års-CSV — åpne helse-mikrodata uten registrering | ingen | nei → proxy |
| wbmicro | World Bank Microdata Library (NADA): søk + FULL variabelordbok åpent; datafiler login-gated | ingen | ja |
| cessda | 40k+ europeiske studier (inkl. Sikt/NSD) — studiesøk/metadata | ingen | ja |
| dhs | DHS-indikatorer, 374 surveys / 92 land (aggregert) | ingen | ja |
| cdc | data.cdc.gov Socrata — 1078 datasett (BRFSS/PLACES, dødelighet) | ingen | ja |
| hf | Hugging Face: søk + typet preview + auto-parquet + size-sjekk | ingen (gated støttes ikke) | ja |

**Kaggle-oppgradering** (quirks): katalogsøket
`GET /api/v1/datasets/list?search=` virker nå nøkkelfritt og CORS-åpent
(verifisert) — brukes FØR web_search; fil-liste-endepunktet er dødt (404).

**`synligeKilder` generalisert** (registry.ts + svar.ts + tester):
filtrerer nå ENHVER auth.env-kilde ut av promptblokka når nøkkelen
mangler (før: kun datacommons). Dermed er census trygg å shippe før
`CENSUS_API_KEY` er satt i Netlify-miljøet — den er stille fraværende til
nøkkelen finnes. NB: fred forsvinner nå også fra prompten hvis
`FRED_API_KEY` mangler i miljøet (ønsket adferd etter samme prinsipp).

**6 community-pakker** (data/packs/community/): europe-surveys,
global-surveys, us-social-surveys, education-skills,
research-repositories + oppdatert us-health-surveys (nchs/cdc/MEPS-
direktefiler).

## Handling som trengs fra Hans

1. **Skaff `CENSUS_API_KEY`** (gratis: api.census.gov/data/key_signup.html)
   og legg den i Netlify-miljøet — før det er census usynlig i prompten.
2. **Sjekk at `FRED_API_KEY` faktisk står i Netlify-miljøet** — etter
   synligeKilder-generaliseringen skjules fred hvis den mangler.
3. ESS: vurder å registrere en egen ESS-bruker-ID og legge den i en pakke/
   profil for uttesting (ID-en er en sporings-ID, ikke en hemmelighet).

## Evaluering — det som IKKE ble default, og hvorfor

### Discovery-armer i search_datasets (krever adapterkode — anbefalt oppfølging)

- **cessda** er den beste kandidaten til en ny `research`-arm ved siden
  av datacite/dataeuropa: ett GET-endepunkt, JSON, nøkkelfri, CORS-åpen,
  rike DDI-felter. Liten adapter (à la dataciteSearch).
- **Zenodo**: CORS-åpen, nøkkelfri, direkte fil-URL-er i treffene —
  billigste arm av alle; kvalitet varierer (filtrer på filendelse).
- **Dataverse (Harvard)**: beste replikasjonsdata-katalogen, men ingen
  CORS (server-side arm går fint) og hyppige 403 på filer.
- **Dateno**: virker med nøkkelen i .env (`DATENO_API_KEY`), MEN planen
  er 200 kall/dag og **500 kall/måned** (verifisert i rate-limit-headere)
  — for lite for en default-arm. Riktig bruk: eksplisitt «søk bredt»-
  fallback med `filters="source.catalog_type"="Microdata catalog"` (uten
  filteret er rankingen svak — geoportal-støy). Endepunkt:
  `GET https://api.dateno.io/search/0.2/query?apikey=…&q=…` (den gamle
  /index/0.1-stien er død). Treffene bærer landingssider, ikke fil-URL-er
  (full post: `/search/0.1/entry/{id}`). Har også en egen statsdb-under-
  API (indikator-tidsserier) som kan være verdt en egen titt senere.

### Byggetids-ressurs (anbefalt oppfølging)

- **commondataio/dataportals-registry** (datagrunnlaget bak Dateno):
  14 470 katalogoppføringer som YAML/parquet-dump på GitHub, hvorav
  **136 mikrodatakataloger** (nesten alle NADA med ferdig
  `endpoints`-felt: eksakt søke-URL per nasjonalt statistikkbyrå) og 333
  indikatorkataloger. Samme mønster som apd-catalog.json: høst dumpen
  ved byggetid → «hvilken katalog for hvilket land»-fil + én generisk
  NADA-adapter gir ~130 nasjonale mikrodatakataloger gratis (IHSN, FAO,
  WHO, UNHCR bruker samme API — verifisert på IHSN/FAO). Sjekk lisensen
  i repoet før shipping.

### Pakke-territorium (levert som pakker, ikke register)

- **GSS**: åpne direktefiler, men NORC-CDN-en svarer periodisk 204-med-
  tom-kropp (retry-felle), ingen CORS, ingen metadata-API → pakke.
- **SHARE / GESIS / WVS / UKDS / LIS / Pew / Eurobarometer / ISSP**:
  login-/søknads-gated uten API-er (GESIS' søk er bot-403-vegget; «API»-
  pakkene i R er credential-scraping askstat ikke skal replikere).
  Pakkene beskriver ærlig hva som finnes + åpne kodebøker/spørreskjema.
  UKDS-bonus: åpen OAI-PMH (DDI 2.5) — pakkeinnhold kan genereres
  maskinelt senere.
- **PIAAC**: åpne per-land-CSV-er (Norge cy2: 32 MB, verifisert) → i
  education-skills-pakka; **PISA/TALIS**: åpne men 192–682 MB SPSS-zips
  (+ DEFLATE64-felle) → ærlig «for tungt»-merking.
- **Afrobarometer**: åpen merged .sav (70 MB) — .sav-parsing + størrelse
  gjør den til pakke-stoff.
- **OpenML**: helt CORS-åpen med parquet + variabelmetadata, men kun
  eksakt-navn-oppslag (fritekstsøket er stengt, 412/403) og nesten null
  ikke-ML-innhold → research-repositories-pakka.

### Droppet (med grunn)

- **upgini**: feature-enrichment for ML-modeller (last opp treningsdata
  til deres servere) — feil verktøykategori for spørsmål-og-svar, ingen
  åpen katalog, ingen REST/browser-vei.
- **data.world**: token-krav på ALT (selv offentlige tutorials-datasett
  gir 401), innholdet er stort sett speilet offentlig data askstat
  allerede har primærkilder for.
- **ICPSR**: Cloudflare-bot-vegg på hele søket; metadata-API krever
  tildelte credentials. openICPSR-DOI-er dekkes indirekte av eksisterende
  datacite-arm.
- **BRFSS-/NVSS-mikrodata**: åpne, men 93–166 MB zip (BRFSS-XPT ~1 GB) —
  utenfor nettleser-taket; cdc-kilden dekker aggregatene.
- **Figshare**: manglende ACAO på søket (POST-only), 10-sekunders signerte
  URL-er, supplement-tungt innhold — nevnt i pakka, ikke integrert.

## Feller verifisert i runden (gjentatt her for synlighet)

1. **NHANES soft-404**: gammel sti gir 200-med-HTML — sjekk content-type.
2. **NORC 204**: tom 204 på første kall, 200 på retry.
3. **datasets-server 200-med-feilkropp**: `{"error": ...}` med HTTP 200.
4. **Census-nøkkelkravet er nytt** (~2025): datakall uten nøkkel → 302
   til missing_key.html; metadata fortsatt åpen.
5. **Kaggles nøkkelfrihet er ny og udokumentert** — kan trekkes tilbake;
   Basic-auth-proxyveien er beholdt som fallback.
6. **NADA `sk`-søket OR-er ordene** — søk smalt, filtrer klientside.
7. **CDC-verter er CORS-inkonsistente** (www: ja; wwwn/ftp: nei) — alle
   NCHS-filer går via proxy uansett.

## Ikke gjort (bevisst)

- Ingen nye search_datasets-armer eller NADA-adapter (kodearbeid — se
  anbefalingene over).
- ROUTING-blokka i svar-prompten er ikke utvidet med de nye kildene —
  registerblokka genereres automatisk; vurder en kort ess/census/nchs-
  linje i «DATATYPE styrer scope» når bruken har satt seg.
- Ingen HF-brukernøkkel-støtte for gated datasett (ville krevd
  Bearer-prefiks-avklaring i hent-core).
