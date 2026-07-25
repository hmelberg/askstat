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
- `sdmx` (oecd, norgesbank — se §1a, ECB er UTSATT) — delt adapter, ekte SDMX 2.1.
- `statfin`, `dst`, `fhi` — hver sin bespoke adapter.

### §1a ECB utsatt — verifisert 2026-07-25 (implementering)

Live-verifisering ved implementeringstidspunktet avdekket at struktur-
spørringer (dataflow-liste OG DSD/kodelister) ligger på et SØSKEN-nivå til
data-endepunktet, ikke under `<base_url>/dataflow/...` som først antatt —
dette gjelder alle tre (strip `data/` fra slutten av `base_url`). Norges
Bank og OECD støtter SDMX-JSON for disse spørringene (ulik versjonsstreng i
Accept-headeren: NB vil ha `version=1.0.0`, OECD vil ha `version=1.0`).
**ECB støtter derimot IKKE JSON for strukturspørringer i det hele tatt**
(kun `application/vnd.sdmx.structure+xml`) — verken for dataflow-liste
(søk) eller DSD/kodelister (metadata). Hans besluttet 2026-07-25: bygg for
Norges Bank+OECD nå (JSON-basert); ECB fortsetter på web_search+probe som i
dag. XML-parsing for ECB er en egen, senere oppfølging — ingen XML-parser
finnes i kodebasen i dag, og det er en annen type kompleksitet enn resten
av denne økten.

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
  tre oppføringene (de mangler `kind` i dag; oecd/ecb/norgesbank har
  allerede `"kind": "sdmx"` fra api-kinds-økten).
- Siden apd-katalog-økten (levert samme dag) allerede innførte to-nivås
  dispatchen i `search_catalog` (tilgang→kind, med kun en `apd`-gren i
  `default`), UTVIDES den — ikke gjenoppfinnes:

```ts
const SDMX_STRUCTURE_ACCEPT: Record<string, string> = {
  norgesbank: "application/vnd.sdmx.structure+json;version=1.0.0",
  oecd: "application/vnd.sdmx.structure+json;version=1.0",
  // ecb bevisst UTELATT — kun XML for strukturspørringer, se §1a. Egen
  // oppfølging senere; sdmxSearch/sdmxMetadata kaster en tydelig feil for
  // kilder som ikke er i dette kartet, i stedet for å prøve og få 406.
};

switch (src.tilgang) {
  case "pxweb": return pxwebSearch(src, query, f);
  case "ckan":  return fdkSearch(src, query, f);
  case "sdmx":  return sdmxSearch(src, query, f);  // kaster internt for ukjente ider (se over)
  default:
    switch (src.kind) {
      case "apd":      return apdSearch(query, deps.origin, f);   // uendret fra apd-katalog-økten
      case "statfin":  return statfinSearch(src, query, f);
      case "dst":      return dstSearch(src, query, f);
      case "fhi":      return fhiSearch(src, query, f);
      default: throw new Error(`ingen søkeadapter for '${src.id}' — bruk web_search + probe`);
    }
}
```

- **Søkbarhets-sjekken samles i ÉN delt funksjon** (helhets-reviewen av
  apd-katalog-økten pekte allerede på dette som en fremtidig koblings-fare):
  `isSearchableSource(src): boolean` i `registry.ts`, brukt BÅDE av
  `renderRegistryBlock` (prompt-hintet) OG av `search_catalog`s vakt-sjekk
  (i dag to separate, hardkodede `s.kind === "apd"`-uttrykk) — slik at de
  to stedene ikke kan drifte fra hverandre. Logikk: `sok_endepunkt` til
  stede, ELLER `tilgang === "sdmx"` OG `id` er i `SDMX_STRUCTURE_ACCEPT`
  (altså IKKE ecb), ELLER `kind` er i `{apd, statfin, dst, fhi}`.
- `table_metadata`s harde `if (src.tilgang !== "pxweb") throw` (i dag i
  `table-metadata.ts:30`) erstattes med samme to-nivås dispatch (uten
  apd-grenen — apd støtter ikke table_metadata, se apd-katalog-spec-en).

Returtypene endres IKKE: alle nye adaptere returnerer `CatalogHit[]`
(sok) / `TableMeta` (metadata) — nøyaktig samme form pxweb bruker i dag.
Promptlaget (`renderRegistryBlock`, `progressLabel`, INTRO-blokken) trenger
derfor ingen endring utover søkbarhets-sjekken over.

## §3 Per-kilde-adaptere

### SDMX (oecd, norgesbank — ECB utsatt, se §1a) — delt, `tilgang: sdmx`

Alt nedenfor er verifisert LIVE 2026-07-25 (curl mot ekte endepunkter),
ikke antatt fra spec-en sin første versjon.

- **Struktur-rot ≠ data-rot:** dataflow-/DSD-spørringer ligger IKKE under
  `<base_url>/dataflow/...` — `base_url` peker på data-endepunktet
  (f.eks. NBs `https://data.norges-bank.no/api/data/`). Strukturroten er
  et søsken-nivå: strip det siste `data/`-segmentet
  (`https://data.norges-bank.no/api/`), deretter `dataflow/…`/`datastructure/…`
  derfra. Samme mønster hos OECD (`.../public/rest/data/` → `.../public/rest/`).
- **search:** `GET <strukturrot>/dataflow/all/all/latest?references=none`
  med header `Accept: application/vnd.sdmx.structure+json;version=X` —
  **X er PER KILDE**: Norges Bank vil ha `1.0.0`, OECD vil ha `1.0` (406
  ellers, med feilmeldingen som lister akseptable verdier — gjenbruk det
  mønsteret om en tredje kilde legges til senere). Svar:
  `{data: {dataflows: [{id, agencyID, name, names, structure: "urn:…DataStructure=<agency>:<dsdId>(<v>)"}]}}`.
  Ingen fritekst-søk finnes i SDMX 2.1 selv — filtrer på delstreng mot
  `name` i adapteren. Cache i minnet UTEN TTL (samme mønster som
  `registry.ts:loadRegistry`) — Norges Bank (~20 flows) er trivielt lite;
  OECD (~1000+) er fortsatt ett HTTP-kall.
- **metadata:** ÉTT kall løser BÅDE dimensjoner og kodelister —
  `GET <strukturrot>/dataflow/{agencyID}/{dataflowId}/latest?references=all`
  (samme Accept-header som over). Responsen inneholder
  `data.dataStructures[0].dataStructureComponents.dimensionList.dimensions[]`
  (hver med `id` og `localRepresentation.enumeration` = en URN,
  f.eks. `urn:sdmx:…Codelist=NB:CL_CURRENCY(1.0)`) OG `data.codelists[]`
  (hver `{id, codes: [{id, name, names}]}`). Match dimensjon→kodeliste ved
  å trekke kodeliste-ID-en ut av URN-en (regex på `Codelist=[^:]+:([^(]+)\(`)
  og slå opp i `data.codelists` på `id`. Dette ER den nye informasjonen
  spec-en sikter til i §0 — dataflow-ID-en alene forteller IKKE hvilken
  DSD-ID den bruker (f.eks. NBs `EXR`-dataflow → `DSD_EXR`), derfor trengs
  dataflow-spørringen med `references=all`, ikke et gjetta
  `datastructure/{agencyID}/{id}`-kall.
- **Gjenkjente quirks:** OECD krever User-Agent-header for datauttrekket
  (`js/api-kinds.js`) — verifiser om samme UA trengs for struktur-kallene
  (ikke bekreftet ennå, billig å teste under implementering).
- **`TableMeta.queryUrlTemplate`:** sdmx-kildene har ikke
  `sporrings_url_mal` i registeret i dag (query bygges av
  `js/api-kinds.js` kjøretid via `sdmxKeyPath`) — la feltet stå tomt/utelatt
  for sdmx, som i dag.

### StatFin (`kind: statfin`)

Verifisert live 2026-07-25:

- **search:** `GET <base>/<mappe>/` (rekursivt), JSON-liste
  `{id, type, text, updated?}`; `type: "l"` = mappe (rekurser), `type: "t"` =
  tabell (kandidat, `updated` til stede). Filtrer på delstreng mot `text`.
  MERK: tabell-`id` inneholder ALLEREDE `.px`-endelsen (f.eks. `"11pk.px"`)
  — ikke legg til `.px` en gang til ved bygging av metadata-URL-en.
- **metadata:** `GET <base>/<mappe>/<tabell-id-med-.px>` → PXWeb v1-metadata
  (samme `variables[].values`/`valueTexts`-form som v2, strukturen er
  eldre men konseptuelt lik — gjenbruk parsing-logikken fra
  `tableMetadata` der formen matcher, egne felt-navn der den ikke gjør).

### DST (`kind: dst`)

Verifisert live 2026-07-25:

- **search:** `GET /v1/tables?format=JSON` → hele tabellisten
  (`{id, text, unit, updated, active, firstPeriod, lastPeriod, variables}`)
  — ingen søkeparameter finnes; filtrer på delstreng mot `text` i adapteren.
- **metadata:** `GET /v1/tableinfo/{tabell}?format=JSON` →
  `{variables: [{id, text, elimination, time, map?, values: [{id, text}]}]}`
  — MERK: `time`-flagget er DIREKTE til stede per variabel (ingen behov for
  en separat `role.time`-liste som i PxWeb v2); `values[].id`/`.text` er
  kode/label akkurat som ventet.

### FHI (`kind: fhi`)

Verifisert live 2026-07-25 — skjemaet er IKKE identisk med statfin/dst
(egen bespoke API, ikke PxWeb-slektning):

- **search:** `GET Common/source` → registerliste
  `{id, title, description, aboutUrl, publishedBy}` (id = registerkode,
  f.eks. `daar`, `nokkel`, `npr`, `msis`, `sysvak`, …). Deretter
  `GET {register}/table` PER register →
  `{tableId: <number>, title, publishedAt, modifiedAt}` — MERK: feltnavn er
  `tableId` (tall) og `title`, IKKE `id`/`text` som statfin/dst. Søket må gå
  over ALLE registre (ikke bare ett), filtrert på delstreng mot `title`.
- **metadata:** `GET {register}/table/{tableId}/dimension` →
  `{dimensions: [{code, label, categories: [{label, value, children}]}]}`
  — MERK: kode er `categories[].value` (ikke `.id`/`.code`), label er
  `.label`. Ingen eksplisitt tids-flagg i responsen (ulikt DST) — sett
  `time: false` for alle FHI-dimensjoner inntil et pålitelig signal finnes
  (ærlig forenkling, ikke en gjetting forkledd som sikker).
- NB fra quirks: FHI avviser CSV, kun `json-stat2` — gjelder selve
  dataeksporten (uendret av denne økten), ikke metadata-endepunktet.

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

- ~~**ECB**~~ — LEVERT i en oppfølgingsøkt samme dag, se §8.
- Statisk snarveisliste (fase C) — vent på bruksdata.
- worldbank/who/fred/kaggle/dbnomics/owid/githubraw/wikipedia-adaptere.
- Langhale-oppdagelse (awesome-public-datasets) — egen spec.
- `<dim>_label`-kolonner i dataeksporten.
- Eurostats DCAT-AP-katalog / CKAN-generalisering utover datanorge — ingen
  konkret kilde i registeret trenger det i dag.

## §8 ECB (oppfølgingsøkt samme dag): XML-støtte

Alt under er verifisert LIVE 2026-07-25 (curl + faktisk Deno-parsing), ikke antatt.

### Hvorfor XML nå

§1a utsatte ECB fordi strukturspørringer (dataflow-liste, DSD/kodelister)
KUN svarer XML (`Acceptable representations: [application/xml,
application/vnd.sdmx.structure+xml;version=2.1]`) — ingen JSON-variant,
ulikt norgesbank/oecd. Kodebasen hadde ingen XML-parser. Løsningen: en
lettvekts, velprøvd XML→JS-parser i stedet for en håndrullet parser.

### Bibliotek: `fast-xml-parser` via esm.sh

Verifisert å fungere i Deno mot ekte ECB-XML (214 dataflows parset
korrekt). Kodebasen har allerede presedens for esm.sh-hostede avhengigheter
i produksjon (`_lib/rate-limit.ts` importerer `@netlify/blobs` derfra) —
dette er IKKE en ny type avhengighet arkitektonisk sett.

```ts
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
```

### Verifiserte XML-fasonger

**Dataflow-liste** (`GET <strukturrot>dataflow/all/all/latest?references=none`,
`Accept: application/xml`, INGEN Accept-Language nødvendig for ECB — det
var kun en OECD/JSON-kvirk):

```
doc["mes:Structure"]["mes:Structures"]["str:Dataflows"]["str:Dataflow"]
  → array (eller ett objekt hvis kun ett treff — sjekk Array.isArray)
  → per flow: { id, agencyID, version, "com:Name": {"#text": "...", "xml:lang": "en"},
                "str:Structure": { Ref: { agencyID, id, version, package: "datastructure" } } }
```

VIKTIG forskjell fra JSON-sporet: DSD-referansen (`str:Structure.Ref.id`/
`.agencyID`) er ALLEREDE på selve dataflow-elementet — ingen behov for et
eget `references=all`-kall bare for å finne DSD-ID-en (JSON-sporet trengte
det siden dataflow-ID og DSD-ID kan avvike der òg, men XML-svaret gir
begge deler i samme respons som søket).

**DSD + kodelister** (`GET <strukturrot>dataflow/{agencyID}/{dataflowId}/latest?references=all`):

```
doc["mes:Structure"]["mes:Structures"]["str:DataStructures"]["str:DataStructure"]
  → { id, agencyID,
      "str:DataStructureComponents": {
        "str:DimensionList": {
          "str:Dimension": [ { id, "str:LocalRepresentation": {
              "str:Enumeration": { Ref: { id: "<kodeliste-ID>", agencyID, version } } } }, ... ],
          "str:TimeDimension": { id, ... }  // ALDRI i samme array som str:Dimension
        }
      }
    }

doc["mes:Structure"]["mes:Structures"]["str:Codelists"]["str:Codelist"]
  → array, per kodeliste: { id, "str:Code": [ { id, "com:Name": {"#text": "...", "xml:lang": "en"} }, ... ] }
```

Kodeliste-kobling er ENKLERE enn JSON-sporet: `Dimension.str:LocalRepresentation
.str:Enumeration.Ref.id` gir kodeliste-ID-en DIREKTE som et attributt —
ingen URN-regex-parsing nødvendig (JSON-sporet må parse en URN-streng for
samme informasjon).

### Arkitektur: `ecbSearch`/`ecbMetadata` som egne funksjoner

`sdmxSearch`/`sdmxMetadata` (fra Task 5) blir "familie-rutere": sjekker
`SDMX_STRUCTURE_ACCEPT[src.id]` (JSON-kilder) FØRST, faller til en ny
`SDMX_XML_SOURCES`-sjekk (foreløpig kun `{"ecb"}`) og delegerer til
`ecbSearch`/`ecbMetadata` — IKKE dual JSON/XML-logikk inni selve
sdmx-funksjonene (for mye forgrening i én funksjon). Samme `CatalogHit`/
`TableMeta`-returformer som alle andre adaptere — ingen endring i
promptlaget.

`isSearchableSource` (registry.ts) utvides: `tilgang === "sdmx" &&
(id in SDMX_STRUCTURE_ACCEPT || SDMX_XML_SOURCES.has(id))`.

### Bevisst utenfor denne oppfølgingsøkten

- Andre XML-only SDMX-kilder enn ECB — ingen kjent i registeret i dag.
- Concept-scheme-oppslag for pen dimensjons-label (koden brukes som label,
  samme forenkling som for norgesbank/oecd i Task 5).
