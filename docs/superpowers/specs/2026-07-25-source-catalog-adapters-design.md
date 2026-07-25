# Kildekatalog-adaptere: search_catalog/table_metadata for sdmx/statfin/dst/fhi (design)

*Bestilling 2026-07-25 (Hans): AI-svarene i data-svar (Web-modus) skal finne
gode data raskere. Diskutert med ChatGPT først (variabel-vs-datasett-gapet er
reelt, W3C jobber med det samme); konklusjonen etter å ha lest faktisk kode er
at gapet for 8 av 18 registerkilder ikke krever ny metadata-standard eller
harvesting-pipeline — bare flere grener i verktøy som allerede finnes. Egen
spec for langhale-oppdagelse (awesome-public-datasets) kommer separat.*

## §0 Bakgrunn — hvorfor dette og ikke en ny metadata-standard

`search_catalog`/`table_metadata` (`_lib/tools/search-catalog.ts`,
`_lib/tools/table-metadata.ts`) har i dag adaptere KUN for `tilgang: pxweb`
(ssb, scb) og `tilgang: ckan` (datanorge). For alle andre kilder må modellen
gjette tabell-ID-er/kolonnenavn fra web_search/egen kunnskap og verifisere med
`probe` — som kun viser OBSERVERTE kolonnenavn, aldri gyldige koder.

Gjennomgang av registeret (`data/data-sources.json`) og `quirks`-feltene viste
at tre `tilgang: rest`-kilder allerede har en dokumentert oppskrift for
tabell-liste + variabel/kodeliste-metadata, uten at noen har skrevet
adapterkoden:

- **statfin** — PXWeb v1 (ikke v2): mappenavigasjon (GET) + `.px`-metadata (GET).
- **dst** — StatBank API: `/tables` (GET) + `/tableinfo/{id}` (GET).
- **fhi** — bespoke JSON-stat2-API: `{register}/table` + `{register}/table/{id}/dimension`.

De tre `tilgang: sdmx`-kildene (oecd, ecb, norgesbank) har derimot INGEN
dataflow-liste eller DSD/kodeliste-henting noe sted i kodebasen —
`js/api-kinds.js` bygger nøkler kun fra en CSV-header-probe
(`sdmxKeyDims`), som gir dimensjons-NAVN, aldri gyldige KODER. En ekte
DSD-henting er derfor ny funksjonalitet, ikke en utvidelse av noe som
delvis finnes.

**Bevisst valgt bort:** DCAT/DDI/schema.org/relasjonsdatabase/embeddings
(ChatGPT-forslaget). Openstat har ingen database og ingen harvesting-service —
alt er statiske JSON-filer lest av Deno edge-funksjoner. Åtte kilder er ett
lite steg unna samme kvalitet SSB allerede har; å bygge ny infrastruktur for
det hadde vært disproporsjonalt. Google Dataset Search er også vurdert og
forkastet — ingen offentlig søke-API (kun webgrensesnitt) per juli 2026.

## §1 Omfang

**I denne økten:**
- `sdmx` (oecd, ecb, norgesbank) — delt adapter, ekte SDMX 2.1 hos alle tre.
- `statfin`, `dst`, `fhi` — hver sin bespoke adapter.

**Bevisst utenfor:**
- worldbank/who/fred/kaggle/dbnomics/owid/githubraw/wikipedia — ingen
  dokumentert tabell-metadata-oppskrift i registeret ennå; fortsetter på
  web_search+probe som i dag.
- Statisk snarveisliste (curated shortlist av ~20-50 dataflows bakt rett inn
  i registerblokken, null tool-calls for vanlige spørsmål) — egen, senere
  økt, etter at reelt spørsmålsmønster er observert. IKKE bygg denne blindt nå.
- Langhale-oppdagelse (awesome-public-datasets, vilkårlige GitHub-CSV-er) —
  egen spec.
- Etikett-kolonner (`<dim>_label`) i selve dataeksporten — utenfor denne
  økten, som i `2026-07-24-pxweb-sources-design.md` §3.

## §2 Dispatch: `kind` for bespoke protokoller, `tilgang` for delte

`js/api-kinds.js` bruker allerede `kind` for å velge dataheting-adapter
(eurostat/worldbank/dbnomics/sdmx). Samme felt gjenbrukes her for
konsistens, i stedet for å grene på `id` direkte:

- Registeret får `"kind": "statfin"`, `"kind": "dst"`, `"kind": "fhi"` på de
  tre oppføringene (de mangler `kind` i dag).
- `search_catalog`/`table_metadata` sin switch grener FØRST på `tilgang`
  (pxweb/ckan/sdmx — delt protokoll, flere kilder), deretter på `kind` for
  resten (bespoke, én kilde hver):

```ts
switch (src.tilgang) {
  case "pxweb": return pxwebSearch(src, query, f);
  case "ckan":  return fdkSearch(src, query, f);
  case "sdmx":  return sdmxSearch(src, query, f);
  default:
    switch (src.kind) {
      case "statfin": return statfinSearch(src, query, f);
      case "dst":      return dstSearch(src, query, f);
      case "fhi":      return fhiSearch(src, query, f);
      default: throw new Error(`ingen søkeadapter for '${src.id}' — bruk web_search + probe`);
    }
}
```

- `registry.ts`s `renderRegistryBlock` sin "søkbar via search_catalog"-sjekk
  (i dag `if (s.sok_endepunkt)`) utvides til også å telle kilder med
  `tilgang==="sdmx"` eller kjent `kind` som søkbare — teksten i
  systemprompten må stemme med hva verktøyet faktisk støtter.
- `table_metadata`s harde `if (src.tilgang !== "pxweb") throw` (i dag i
  `table-metadata.ts:30`) erstattes med samme to-nivås dispatch.

Returtypene endres IKKE: alle nye adaptere returnerer `CatalogHit[]`
(sok) / `TableMeta` (metadata) — nøyaktig samme form pxweb bruker i dag.
Promptlaget (`renderRegistryBlock`, `progressLabel`, INTRO-blokken) trenger
derfor ingen endring utover søkbarhets-sjekken over.

## §3 Per-kilde-adaptere

### SDMX (oecd, ecb, norgesbank) — delt, `tilgang: sdmx`

- **search:** `GET <base>/dataflow/all/all/latest` (SDMX-JSON,
  `?references=none` for å slippe tunge cross-refs) → liste av
  `{id, agencyID, name}`. Ingen fritekst-søk finnes i SDMX 2.1 selv —
  filtrer på delstreng mot `name` i adapteren. Cache i minnet UTEN TTL,
  nøyaktig samme mønster som `registry.ts:loadRegistry` (modul-cache til
  eksplisitt clear — dataflow-lister endrer seg sjelden nok til at det er
  riktig avveining) — Norges Bank (~20 flows) og ECB (~90) er trivielt
  små; OECD (~1000+) er fortsatt ett HTTP-kall, bare et større svar å
  filtrere.
- **metadata:** `GET <base>/datastructure/{agencyID}/{id}` (DSD) → dimensjoner
  + tilhørende kodelister (`{code, label}` per dimensjon, values fra
  `Codelist`-delen av responsen). Dette er reelt NY informasjon
  (jf. §0) — gir modellen gyldige koder, ikke bare kolonnenavn.
- **Gjenkjente quirks (gjenbruk fra `js/api-kinds.js`):** OECD krever
  User-Agent-header (403 uten); Norges Bank/ECB Accept-header-fallbacks
  (`SDMX_ACCEPT`/`sdmxFallbackUrl`) gjelder DATAUTTREKKET, ikke
  DSD-hentingen, som er egen kode — men samme UA-fiks kan trengs for OECD.
- **`TableMeta.queryUrlTemplate`:** sdmx-kildene har ikke
  `sporrings_url_mal` i registeret i dag (query bygges av
  `js/api-kinds.js` kjøretid via `sdmxKeyPath`) — la feltet stå tomt/utelatt
  for sdmx, som i dag.

### StatFin (`kind: statfin`)

- **search:** `GET <base>/<mappe>/` (rekursivt), JSON-liste
  `{id, type, text, updated}`; `type: "l"` = mappe (rekurser), `type: "t"` =
  tabell (kandidat). Filtrer på delstreng mot `text`.
- **metadata:** `GET <base>/<mappe>/<tabell>.px` → PXWeb v1-metadata
  (samme `variables[].values`/`valueTexts`-form som v2, strukturen er
  eldre men konseptuelt lik — gjenbruk parsing-logikken fra
  `tableMetadata` der formen matcher, egne felt-navn der den ikke gjør).

### DST (`kind: dst`)

- **search:** `GET /v1/tables?format=JSON` → hele tabellisten
  (`{id, text, firstPeriod, lastPeriod, variables}`) — ingen
  søkeparameter finnes; filtrer på delstreng mot `text` i adapteren.
- **metadata:** `GET /v1/tableinfo/{tabell}?format=JSON` → variabler+koder.

### FHI (`kind: fhi`)

- **search:** kilde-URL-en er allerede register-spesifikk
  (`{register}/table/{tabell}/data` i `sporrings_url_mal`) — hent
  register-liste fra `Common/source`, deretter `{register}/table` per
  register, filtrert på delstreng. NB: FHI har FLERE registre (daar,
  nokkel, npr, msis, sysvak, …) — søket må gå over alle, ikke ett.
- **metadata:** `GET {register}/table/{id}/dimension` → dimensjonskoder +
  kategorier. NB fra quirks: FHI avviser CSV, kun `json-stat2` — gjelder
  selve dataeksporten (uendret av denne økten), ikke metadata-endepunktet.

## §4 Feilhåndtering

Uendret filosofi: adapteren kaster en beskrivende feil (HTTP-status,
"ukjent kilde …", "tomt svar …"); verktøyresultatet i `data-svar.ts`s
`executeTool` blir feilteksten tilbake til modellen. INTRO-blokken
instruerer allerede modellen til å falle tilbake på web_search+probe eller
si ærlig fra («fant ingen fungerende datakilde…») — ingen ny
fallback-logikk trengs i promptlaget.

## §5 Testing

Én test-fil per adapter (`*.test.ts`, samme mønster som
`_lib/data-loader.test.ts`), med fixture-JSON for hvert API-svar (ALDRI
live HTTP i tester — `fetchImpl`-injeksjon som i eksisterende
`search-catalog.ts`/`table-metadata.ts`). Dekning per adapter:
- normalt treff (søk gir minst én kandidat; metadata gir minst én variabel).
- tomt søk (ingen treff → tom liste, ikke kastet feil).
- HTTP-feil (4xx/5xx → beskrivende feil, ikke stille tomt resultat).
- trunkering av store kodelister (samme `MAX_VALUES=40`-cap-mønster som
  `table-metadata.ts` bruker for pxweb i dag — sdmx-kodelister som f.eks.
  landkoder kan være store).
- SDMX-spesifikt: dataflow-liste-filtrering (delstreng-match, case-insensitiv).
- FHI-spesifikt: søk over flere registre.

## §6 Rekkefølge

Matcher "korte sykluser"-arbeidsstilen — én kilde ferdig og testet før
neste, ikke alt i én PR:

1. **fhi** — minst kode, oppskriften mest utfyllende dokumentert i quirks.
2. **dst** — nest minst, ingen søkeparameter å håndtere (enklere enn statfin).
3. **statfin** — mappenavigasjon er mer kode enn dst/fhi.
4. **sdmx** — mest kode, men delt av tre kilder samtidig — størst gevinst
   per linje kode. Sist fordi DSD-parsing er den eneste virkelig nye
   kapabiliteten (ikke bare "koble sammen dokumentert oppskrift").

## §7 Bevisst utenfor økten (oppsummert)

- Statisk snarveisliste (fase C) — vent på bruksdata.
- worldbank/who/fred/kaggle/dbnomics/owid/githubraw/wikipedia-adaptere.
- Langhale-oppdagelse (awesome-public-datasets) — egen spec.
- `<dim>_label`-kolonner i dataeksporten.
- Eurostats DCAT-AP-katalog / CKAN-generalisering utover datanorge — ingen
  konkret kilde i registeret trenger det i dag.
