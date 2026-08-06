# Mikrodata-oppdagelse: NADA-adapter + høstet katalogregister + CESSDA/Zenodo-armer

Status: implementert 2026-08-06 (samme økt som spec-en; Hans' bestilling
«lag spec og implementer punkt 3, deretter punkt 2 og så 1» — dette
dokumentet dekker punkt 3 og 2; punkt 1 = e2e-smoke av
mikrodata-eksemplene, rapporteres separat).

Bakgrunn: mikrodatakilder-runden (docs/2026-08-mikrodatakilder-research.md)
la inn wbmicro/cessda m.fl. som registerkilder med guider, men UTEN
adapterkode — modellen måtte kjenne kildene fra registerblokka, og
`search_datasets` research-scope hadde bare datacite + dataeuropa.
Denne runden gjør mikrodata OPPDAGBART.

## Mål

1. **Én generisk NADA-søkeadapter** (kind `nada`) — samme API kjører hos
   World Bank, IHSN, FAO og ~130 nasjonale statistikkbyrå-kataloger
   (live-verifisert WB/IHSN/FAO 2026-08-06).
2. **Byggetids-høstet institusjonsregister** `data/nada-catalog.json` fra
   commondataio/dataportals-registry (MIT-lisens, verifisert) — apd-
   mønsteret: statisk fil på eget origin, ingen live GitHub-kall.
3. **CESSDA- og Zenodo-armer** i `search_datasets` research-scope +
   søkbar cessda via `search_catalog`.

## Beslutninger

- **IHSN er langhale-dekningen, ikke 130 parallelle søk.** IHSN Central
  Data Catalog aggregerer de nasjonale arkivenes metadata (~5 400
  studier). De nasjonale katalogene nås målrettet via nada-catalog.json +
  direkteformen (guidedrevet, null kode) — aldri vifte ut 130 kall per
  spørsmål.
- **IHSN-TLS-funnet (endret design under implementasjon):**
  catalog.ihsn.org serverer en TLS-kjede med ECDSA-SHA512-signatur som
  Deno/rustls IKKE støtter (målt 2026-08-06; bypass-flagget hjelper ikke)
  — search_catalog, table_metadata OG /api/hent feiler alle server-side.
  ihsn er derfor registerkilde UTEN kind og UTEN research-arm: kun
  nettleser-direkte ost.read (CORS-åpen, verifisert), dokumentert i
  guiden. Konsekvens for nasjonale kataloger: foretrekk direkte ost.read
  (CORS-åpne), /api/hent som fallback — en python-probet vert kan likevel
  feile i Deno.
- **Probe ved høsting, ikke ved kjøring.** Registry-dumpen har døde
  oppføringer (microdata.who.int: DNS-død, verifisert 2026-08-06) —
  høsteren beholder kun endepunkter som svarer 200 med parseable
  `result`-JSON på et 1-treffs søk. Provenance + tellinger i fila.
- **NADA-treff er ALDRI access:"open".** Datafiler er login-gated i
  praksis (selv «open»-klassede studier, målt i research-runden) —
  armene merker `access:"landing-page"` slik at probe-✅-regelen i
  META_SEARCH stopper lasting, og how_to_read sier eksplisitt at
  metadata ikke er data (E17).
- **table_metadata for nada = variabelordboka.** `catalog/{IDNO}` +
  `catalog/{IDNO}/variables` (kan være 363+ variabler): find-filtrert,
  capped (60), med `variabler_totalt` og proxy-form-peker til
  per-variabel-detalj (`variables/{vid}` = spørsmålstekst +
  verdietiketter). Verdilister hentes IKKE per variabel (ett kall per
  vid — for dyrt); det er et bevisst kutt.
- **Zenodo-armen foretrekker tabulære filer.** Treff med csv/tsv/parquet/
  xlsx/json-fil → access:"open" + direkte fil-URL (CORS-åpen, verifisert);
  ellers landing-page. `access_status=open`-filter i søket.
- **viaSearchCatalog får access-parameter** — den hardkodet "open", som
  er usant for nada-armene.
- **fao får INGEN registeroppføring** (lav verdi for målgruppen) — dekkes
  av guiden + nada-catalog.json. WHO: død DNS, utelatt til dumpen viser
  et levende endepunkt.

## Design

### A. Høsting (`tools/harvest_nada_catalog.py`)

Kilde: `raw.githubusercontent.com/commondataio/dataportals-registry/main/data/datasets/full.jsonl`
(31,6 MB, MIT). Filter: `catalog_type == "Microdata catalog"`,
`software.id == "nada"`, `api == true`, status active. Endepunkt: fra
`endpoints[type="nada:catalog-search"]`, ellers konstruert
`<link>/index.php/api/catalog/search`. Hver kandidat probes
(`?sk=health&ps=1&format=json`, 10 s timeout, User-Agent
askstat-harvester); kun 200 + `result`-JSON beholdes. Ut:
`data/nada-catalog.json` `{v:1, _provenance{source,license,fetched_at,
kandidater,levende}, catalogs:[{uid,name,country,search_url}]}` — sortert
på land, kompakt JSON.

### B. Adapter (kind `nada`)

- `catalogs/nada.ts`: `nadaSearch(src, query, f)` → GET
  `${base_url}catalog/search?sk=<q>&ps=15&format=json` →
  CatalogHit{id=idno, title=`<title> (<nation> <year_start>–<year_end>)`,
  url=landingsside}. Tall-som-strenger tåles (FAO-formen). `sk` OR-er
  ordene — dokumentert i guidene, ikke «fikset» i adapteren.
- `nadaMetadata(src, idno, f, find)` → TableMeta med find-filtrert,
  60-capped variabelliste (code=varnavn, label=labl, values=[]),
  `variabler_totalt`, `datatilgang` (form_model/data_access_type) og
  `merknad` (proxy-form for per-variabel-detalj + login-forbehold).
- Wiring: `SEARCHABLE_KINDS += "nada"`, search-catalog case, table-metadata
  case. Registeret: wbmicro får `kind:"nada"`; NY kilde `ihsn` (kind nada,
  etablert, cors:true, guide) — kort guide som peker på wbmicro-guiden
  for API-formene.

### C. CESSDA + Zenodo

- `catalogs/cessda.ts`: `cessdaSearch(query, f, limit)` mot
  `/api/DataSets/v2/search?q=&limit=&metadataLanguage=en` →
  DatasetHit{access:"landing-page", url=studyUrl, geo=land, time=år,
  how_to_read: web_fetch/probe + tilgang hos arkivet}. Gjenbrukes av BÅDE
  research-armen (limit 8) og search_catalog kind `cessda` (limit 20,
  CatalogHit-form). cessda-registeroppføringen får `kind:"cessda"`.
- `catalogs/zenodo.ts`: `zenodoSearch(query, f)` mot
  `/api/records?q=&type=dataset&access_status=open&size=8`; første
  tabulære fil (csv/tsv/parquet/xlsx/json på filnavn) → access:"open" +
  fil-URL i how_to_read (CORS-åpen → vanlig pd.read_*); ellers
  landing-page mot record-siden. 30 søk/min-raten tåles (én per kall).
- `search_datasets` research-scope: datacite, dataeuropa + NYE cessda,
  zenodo, wbmicro (viaSearchCatalog, landing-page), ihsn (samme).

### D. Prompt/guider

- ROUTING «DATATYPE styrer scope»-linjen nevner at research-scope nå
  søker CESSDA/Zenodo/WB-IHSN-mikrodatakatalogene (én linje, svar.md
  speiles).
- wbmicro/cessda-guidene oppdateres (søkbar via search_catalog); ny kort
  ihsn-guide; wbmicro-guiden peker på data/nada-catalog.json for
  nasjonale kataloger.

## Kutt (bevisst)

- Ingen per-instans-arm for nasjonale NADA-kataloger (IHSN dekker
  metadataene; målrettet søk går guidedrevet via proxy-formen).
- Ingen per-variabel verdilister i nadaMetadata (ett API-kall per vid).
- Ingen zenodo-registerkilde (arm-only, som datacite/dataeuropa).
- Dateno-armen fortsatt utsatt (kvote 500/mnd — se research-memoet).

## Tester

- nada/cessda/zenodo-adaptertester med mock-fetch (inkl. FAO
  tall-som-strenger, find-filter+cap, zenodo fil-vs-landing).
- registry: nada/cessda søkbare kinds; drift-testen dekker ihsn-guiden.
- search-datasets: research-scope inneholder de nye armene.
- Live-verifisering før push: deno-script kjører hver ny adapter mot
  ekte API (WB, IHSN, CESSDA, Zenodo) + harvest-kjøring med probe-logg.
