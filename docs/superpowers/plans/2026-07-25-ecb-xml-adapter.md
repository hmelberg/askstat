# ECB XML-adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi `search_catalog`/`table_metadata` ekte støtte for ECB (mangler JSON for SDMX-strukturspørringer, kun XML), som var bevisst utsatt i `2026-07-25-source-catalog-adapters-design.md` §1a.

**Architecture:** `fast-xml-parser` (via esm.sh, samme presedens som `_lib/rate-limit.ts`s `@netlify/blobs`-import) parser ECBs SDMX-ML-XML. `sdmxSearch`/`sdmxMetadata` (fra den forrige planen) blir "familie-rutere": JSON-kilder (`SDMX_STRUCTURE_ACCEPT`) først, deretter en ny `SDMX_XML_SOURCES`-sjekk som delegerer til nye `ecbSearch`/`ecbMetadata`-funksjoner. Samme `CatalogHit`/`TableMeta`-returformer som alle andre adaptere.

**Tech Stack:** TypeScript/Deno edge-funksjoner, `fast-xml-parser@4` (ny ekstern avhengighet, esm.sh).

## Global Constraints

- **Alle XML-fasoner under er verifisert LIVE 2026-07-25** (curl + faktisk `fast-xml-parser`-parsing mot ekte ECB-endepunkter under planleggingen) — se `docs/superpowers/specs/2026-07-25-source-catalog-adapters-design.md` §8 for full research-dokumentasjon.
- **`fast-xml-parser` importeres fra `https://esm.sh/fast-xml-parser@4`** — IKKE en annen versjon/kilde. Konfigureres med `{ ignoreAttributes: false, attributeNamePrefix: "" }`.
- **Enkelt-vs-array-tvetydighet:** `fast-xml-parser` returnerer et BART OBJEKT når et element forekommer én gang, og et ARRAY når det forekommer flere ganger. En `asArray()`-hjelpefunksjon MÅ brukes overalt (dataflows, dimensions, timeDimensions, codelists, codes) — ALDRI anta array uten sjekk.
- **`com:Name`-tekst** kommer som `{"#text": "...", "xml:lang": "en"}` (siden `xml:lang` alltid er til stede i ECBs respons) — bruk en `xmlText()`-hjelpefunksjon, IKKE anta bare streng.
- **Kodeliste-kobling for ECB er ENKLERE enn for norgesbank/oecd**: `Dimension["str:LocalRepresentation"]["str:Enumeration"].Ref.id` gir kodeliste-ID-en DIREKTE som attributt — INGEN URN-regex-parsing (det JSON-sporet trenger).
- **Tidsdimensjonen ligger i `dimensionList["str:TimeDimension"]`**, en EGEN nøkkel, IKKE i `["str:Dimension"]`-arrayet — samme mønster som JSON-sporets `dimensionList.timeDimensions`.
- **ECB trenger IKKE `Accept-Language`** (det var en OECD/JSON-spesifikk kvirk) — bare `Accept: application/xml`.
- **Compound-nøkkel `agencyID/dataflowId`** for `CatalogHit.id`/`table_metadata`-oppslag, SAMME konvensjon som den JSON-baserte sdmx-adapteren (ikke bruk søke-tidens embeddede DSD-referanse som en snarvei — hent DSD på nytt i `ecbMetadata` for konsistens med resten av kodebasen).
- **`MAX_HITS` (20) og `MAX_VALUES` (40)** gjenbrukes, ikke redefineres.
- **`sdmxStructureBase()`-duplisering** (navngitt helper i search-catalog.ts, inline i table-metadata.ts) er et KJENT, akseptert mønster fra forrige plan — ikke faktorer ut nå, ikke scope for denne planen.
- **ALDRI live nettverk i automatiske tester** — fixture-XML-strenger (trimmede, strukturelt tro kopier av de ekte verifiserte responsene), `fetchImpl`-injeksjon.
- Test-kommandoer (fra repo-roten `/Users/hom/Documents/GitHub/openstat`): `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`.
- **Commit lokalt kun — ALDRI push** (etablert norm, se memory `feedback-openstat-no-autopush`) — push skjer i Task 2, som en eksplisitt, separat, kontrollør-utført handling, ikke noe subagenten selv gjør.

---

### Task 1: ECB-adapter (search + table_metadata)

**Files:**
- Modify: `netlify/edge-functions/_lib/registry.ts`
- Modify: `netlify/edge-functions/_lib/registry.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.test.ts`

**Interfaces:**
- Produces: `SDMX_XML_SOURCES: Set<string>` (registry.ts, eksportert — inneholder `"ecb"`), `isSearchableSource` utvidet til å telle XML-sdmx-kilder som søkbare, `ecbSearch(src, query, f)` og `ecbMetadata(src, dataflowKey, f)` (interne funksjoner i hver sin fil), `sdmxSearch`/`sdmxMetadata` utvidet til å delegere til disse når kilden ikke er i `SDMX_STRUCTURE_ACCEPT`.

- [ ] **Step 1: Skriv feilende tester for `isSearchableSource` (ecb blir nå søkbar)**

Legg til/endre i `netlify/edge-functions/_lib/registry.test.ts` (finn den eksisterende `isSearchableSource`-testen fra forrige plan og oppdater `ecb`-forventningen fra `false` til `true`):

```ts
Deno.test("isSearchableSource: ecb blir søkbar etter XML-støtte (SDMX_XML_SOURCES)", () => {
  const reg = parseRegistry([
    { id: "ecb", navn: "ECB", utgiver: "ECB", tillit: "offisiell", tilgang: "sdmx", kind: "sdmx",
      base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
  ]);
  assertEquals(isSearchableSource(reg[0]), true);
});
```

(NB: den EKSISTERENDE testen fra forrige plan, `"isSearchableSource: sok_endepunkt, kjent kind, eller sdmx+id i SDMX_STRUCTURE_ACCEPT"`, har en linje `assertEquals(isSearchableSource(reg[3]), false); // sdmx men ecb er IKKE i SDMX_STRUCTURE_ACCEPT` — denne MÅ oppdateres til `true` med en ny kommentar, siden ecb nå er søkbar via `SDMX_XML_SOURCES`. Ikke la den gamle assertionen stå og feile.)

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: FAIL — `isSearchableSource(ecb)` er fortsatt `false` (SDMX_XML_SOURCES finnes ikke ennå).

- [ ] **Step 3: Legg til `SDMX_XML_SOURCES` og utvid `isSearchableSource` i `registry.ts`**

Rett under den eksisterende `SDMX_STRUCTURE_ACCEPT`-konstanten, legg til:

```ts
/** SDMX-kilder som KUN støtter XML for strukturspørringer (ingen JSON) —
 *  ecbSearch/ecbMetadata (search-catalog.ts/table-metadata.ts) håndterer
 *  disse via fast-xml-parser. Verifisert 2026-07-25, se spec §8. */
export const SDMX_XML_SOURCES = new Set(["ecb"]);
```

Endre `isSearchableSource` fra:
```ts
  if (src.tilgang === "sdmx" && src.id in SDMX_STRUCTURE_ACCEPT) return true;
```
til:
```ts
  if (src.tilgang === "sdmx" && (src.id in SDMX_STRUCTURE_ACCEPT || SDMX_XML_SOURCES.has(src.id))) return true;
```

- [ ] **Step 4: Kjør testen på nytt, bekreft at den passerer**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Fjern den utdaterte ecb-avvisnings-testen, skriv feilende tester for `ecbSearch`**

`ecb` finnes ALLEREDE i `REG`-fixturen med `kind: "sdmx"` (ingen endring
trengs der). MEN: den eksisterende testen
`"sdmxSearch: ecb (utenfor SDMX_STRUCTURE_ACCEPT) kaster tydelig feil"`
(rundt linje 296) asserter at `searchCatalog("ecb", …)` KASTER "ikke
støttet" — det er nettopp premisset denne oppgaven fjerner. SLETT denne
testen (den er ugyldig etter denne oppgaven, ikke bare utdatert) og
erstatt med testene under.

Legg til:

```ts
const ECB_DATAFLOW_XML = `<?xml version='1.0' encoding='UTF-8'?><mes:Structure xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:str="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:com="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><mes:Structures><str:Dataflows><str:Dataflow agencyID="ECB" id="EXR" version="1.0"><com:Name xml:lang="en">Exchange Rates</com:Name><str:Structure><Ref agencyID="ECB" id="ECB_EXR1" version="1.0" package="datastructure"/></str:Structure></str:Dataflow><str:Dataflow agencyID="ECB" id="AGR" version="1.0"><com:Name xml:lang="en">AGR</com:Name><str:Structure><Ref agencyID="ECB" id="ECB_BCS1" version="1.0" package="datastructure"/></str:Structure></str:Dataflow></str:Dataflows></mes:Structures></mes:Structure>`;

function fakeEcbXmlFetch(xml: string, capture: { url: string; accept: string }[] = []): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    capture.push({ url: String(input), accept: String((init?.headers as Record<string, string> | undefined)?.Accept ?? "") });
    return Promise.resolve(new Response(xml, { status: 200 }));
  }) as typeof fetch;
}

Deno.test("ecbSearch: parser XML-dataflow-liste, filtrerer på navn, bruker application/xml (ingen Accept-Language)", async () => {
  const calls: { url: string; accept: string }[] = [];
  const hits = await searchCatalog("ecb", "exchange", { registry: REG, origin: "https://app.test", fetchImpl: fakeEcbXmlFetch(ECB_DATAFLOW_XML, calls) });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "ECB/EXR");
  assertEquals(hits[0].title, "Exchange Rates");
  assertEquals(hits[0].source, "ecb");
  assertEquals(calls[0].accept, "application/xml");
});

Deno.test("ecbSearch: ingen treff gir tom liste", async () => {
  const hits = await searchCatalog("ecb", "zzznomatch", { registry: REG, origin: "https://app.test", fetchImpl: fakeEcbXmlFetch(ECB_DATAFLOW_XML) });
  assertEquals(hits, []);
});
```

- [ ] **Step 6: Legg `ecb` til `REG`-fixturen, skriv feilende test for `ecbMetadata` i `table-metadata.test.ts`**

`table-metadata.test.ts`s `REG`-fixture (linje 5-19) har INGEN `ecb`-oppføring ennå (ulikt `search-catalog.test.ts`). Legg til, som siste element før den avsluttende `]);` (linje 19):

```ts
  { id: "ecb", navn: "ECB", utgiver: "ECB", tillit: "offisiell",
    tilgang: "sdmx", kind: "sdmx", base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
```

```ts
const ECB_EXR_DSD_XML = `<?xml version='1.0' encoding='UTF-8'?><mes:Structure xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:str="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:com="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><mes:Structures><str:DataStructures><str:DataStructure agencyID="ECB" id="ECB_EXR1"><com:Name xml:lang="en">Exchange Rates</com:Name><str:DataStructureComponents><str:DimensionList><str:Dimension id="CURRENCY"><str:LocalRepresentation><str:Enumeration><Ref agencyID="ECB" id="CL_CURRENCY" version="1.0" package="codelist"/></str:Enumeration></str:LocalRepresentation></str:Dimension><str:TimeDimension id="TIME_PERIOD"/></str:DimensionList></str:DataStructureComponents></str:DataStructure></str:DataStructures><str:Codelists><str:Codelist id="CL_CURRENCY"><str:Code id="NOK"><com:Name xml:lang="en">Norwegian krone</com:Name></str:Code><str:Code id="USD"><com:Name xml:lang="en">US dollar</com:Name></str:Code></str:Codelist></str:Codelists></mes:Structures></mes:Structure>`;

function fakeEcbXmlMetaFetch(xml: string, capture: string[] = []): typeof fetch {
  return ((input: string | URL | Request) => {
    capture.push(String(input));
    return Promise.resolve(new Response(xml, { status: 200 }));
  }) as typeof fetch;
}

Deno.test("ecb metadata: kodeliste koblet via Ref.id (ingen URN-parsing), tidsdimensjon fra TimeDimension", async () => {
  const calls: string[] = [];
  const meta = await tableMetadata("ecb", "ECB/EXR", { registry: REG, fetchImpl: fakeEcbXmlMetaFetch(ECB_EXR_DSD_XML, calls) });
  const currency = meta.variables.find((v) => v.code === "CURRENCY")!;
  assertEquals(currency.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);
  assertEquals(calls[0], "https://data-api.ecb.europa.eu/service/dataflow/ECB/EXR/latest?references=all");
});
```

(`REG`-fixturen i `table-metadata.test.ts` trenger en `ecb`-oppføring — legg til om den mangler, samme form som i `search-catalog.test.ts`.)

- [ ] **Step 7: Kjør begge testfilene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/`
Expected: FAIL — `ecbSearch`/`ecbMetadata` finnes ikke, og `sdmxSearch`/`sdmxMetadata` kaster fortsatt "ikke støttet" for ecb.

- [ ] **Step 8: Implementer `ecbSearch` + utvid `sdmxSearch` i `search-catalog.ts`**

Endre importen øverst fra:
```ts
import { findSource, isSearchableSource, SDMX_STRUCTURE_ACCEPT, type DataSource } from "../registry.ts";
```
til:
```ts
import { findSource, isSearchableSource, SDMX_STRUCTURE_ACCEPT, SDMX_XML_SOURCES, type DataSource } from "../registry.ts";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";
```

Legg til rett under `sdmxStructureBase`:

```ts
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function xmlText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
```

Endre `sdmxSearch` fra:
```ts
async function sdmxSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  const url = `${sdmxStructureBase(src.base_url)}dataflow/all/all/latest?references=none`;
  const res = await f(url, { headers: { Accept: accept, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`sdmx dataflow-liste for ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const flows = (json?.data?.dataflows ?? []) as Record<string, unknown>[];
  const q = query.toLowerCase();
  return flows
    .filter((d) => String(d.name ?? "").toLowerCase().includes(q))
    .slice(0, MAX_HITS)
    .map((d) => ({
      source: src.id,
      id: `${d.agencyID}/${d.id}`,
      title: String(d.name ?? ""),
      url: new URL(`${d.agencyID}/${d.id}`, src.base_url).toString(),
    }));
}
```
til (legger inn XML-delegering FØR den gamle "ikke støttet"-feilen):
```ts
async function sdmxSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) {
    if (SDMX_XML_SOURCES.has(src.id)) return ecbSearch(src, query, f);
    throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  }
  const url = `${sdmxStructureBase(src.base_url)}dataflow/all/all/latest?references=none`;
  const res = await f(url, { headers: { Accept: accept, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`sdmx dataflow-liste for ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const flows = (json?.data?.dataflows ?? []) as Record<string, unknown>[];
  const q = query.toLowerCase();
  return flows
    .filter((d) => String(d.name ?? "").toLowerCase().includes(q))
    .slice(0, MAX_HITS)
    .map((d) => ({
      source: src.id,
      id: `${d.agencyID}/${d.id}`,
      title: String(d.name ?? ""),
      url: new URL(`${d.agencyID}/${d.id}`, src.base_url).toString(),
    }));
}

async function ecbSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const url = `${sdmxStructureBase(src.base_url)}dataflow/all/all/latest?references=none`;
  const res = await f(url, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new Error(`sdmx (xml) dataflow-liste for ${src.id} feilet: HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const flows = asArray(doc?.["mes:Structure"]?.["mes:Structures"]?.["str:Dataflows"]?.["str:Dataflow"]) as Record<string, unknown>[];
  const q = query.toLowerCase();
  return flows
    .filter((d) => xmlText(d["com:Name"]).toLowerCase().includes(q))
    .slice(0, MAX_HITS)
    .map((d) => ({
      source: src.id,
      id: `${d.agencyID}/${d.id}`,
      title: xmlText(d["com:Name"]),
      url: new URL(`${d.agencyID}/${d.id}`, src.base_url).toString(),
    }));
}
```

- [ ] **Step 9: Implementer `ecbMetadata` + utvid `sdmxMetadata` i `table-metadata.ts`**

Endre importen øverst fra:
```ts
import { findSource, SDMX_STRUCTURE_ACCEPT, type DataSource } from "../registry.ts";
```
til:
```ts
import { findSource, SDMX_STRUCTURE_ACCEPT, SDMX_XML_SOURCES, type DataSource } from "../registry.ts";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";
```

Legg til de samme tre hjelpefunksjonene som i `search-catalog.ts` (`xmlParser`, `xmlText`, `asArray` — duplisert, IKKE delt mellom filene, samme mønster som eksisterende `sdmxStructureBase`-duplisering):

```ts
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function xmlText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
```

Endre `sdmxMetadata`s guard fra:
```ts
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
```
til:
```ts
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) {
    if (SDMX_XML_SOURCES.has(src.id)) return ecbMetadata(src, dataflowKey, f);
    throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  }
```

Legg til `ecbMetadata` (etter `sdmxMetadata`):

```ts
async function ecbMetadata(src: DataSource, dataflowKey: string, f: typeof fetch): Promise<TableMeta> {
  const [agencyID, dataflowId] = dataflowKey.split("/");
  if (!agencyID || !dataflowId) throw new Error(`sdmx table_id må være '<agencyID>/<dataflowId>', fikk '${dataflowKey}'`);
  const url = `${src.base_url.replace(/data\/$/, "")}dataflow/${agencyID}/${dataflowId}/latest?references=all`;
  const res = await f(url, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new Error(`sdmx (xml) metadata for ${dataflowKey} feilet: HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const structures = doc?.["mes:Structure"]?.["mes:Structures"];
  const dsds = asArray(structures?.["str:DataStructures"]?.["str:DataStructure"]) as Record<string, unknown>[];
  const dsd = dsds[0];
  if (!dsd) throw new Error(`fant ingen datastruktur for ${dataflowKey}`);
  const codelists = asArray(structures?.["str:Codelists"]?.["str:Codelist"]) as Record<string, unknown>[];
  const dimList = (dsd["str:DataStructureComponents"] as Record<string, unknown> | undefined)?.["str:DimensionList"] as Record<string, unknown> | undefined ?? {};
  const plainDims = asArray(dimList["str:Dimension"]) as Record<string, unknown>[];
  const timeDims = asArray(dimList["str:TimeDimension"]) as Record<string, unknown>[];

  const codesFor = (d: Record<string, unknown>) => {
    const localRep = d["str:LocalRepresentation"] as Record<string, unknown> | undefined;
    const enumeration = localRep?.["str:Enumeration"] as Record<string, unknown> | undefined;
    const ref = enumeration?.Ref as Record<string, unknown> | undefined;
    const clId = ref?.id;
    const cl = codelists.find((c) => c.id === clId);
    return asArray(cl?.["str:Code"]) as Record<string, unknown>[];
  };

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const codes = codesFor(d);
      return {
        code: String(d.id ?? ""),
        label: String(d.id ?? ""),
        time: false,
        values: codes.slice(0, MAX_VALUES).map((c) => ({ code: String(c.id ?? ""), label: xmlText(c["com:Name"]) || String(c.id ?? "") })),
        valuesTruncated: codes.length > MAX_VALUES,
      };
    }),
    ...timeDims.map((d) => ({
      code: String(d.id ?? ""),
      label: String(d.id ?? ""),
      time: true,
      values: [] as { code: string; label: string }[],
      valuesTruncated: false,
    })),
  ];
  return { source: src.id, id: dataflowKey, title: xmlText(dsd["com:Name"]) || dataflowKey, variables };
}
```

- [ ] **Step 10: Kjør alle tester på nytt, bekreft at alt passerer**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle tester PASS (inkludert de oppdaterte fra forrige plan og de nye ecb-testene). Merk: `deno check`/`deno test` laster `fast-xml-parser` fra esm.sh over nettverk første gang — dette krever nettverkstilgang under CI/lokal kjøring (samme som `@netlify/blobs` allerede krever for `rate-limit.ts`).

- [ ] **Step 11: Commit (LOKALT)**

```bash
git add netlify/edge-functions/_lib/registry.ts netlify/edge-functions/_lib/registry.test.ts netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts
git commit -m "$(cat <<'EOF'
feat: ecb-adapter via XML (fast-xml-parser) for search_catalog/table_metadata

ECB mangler JSON for SDMX-strukturspørringer (kun XML) — sdmxSearch/
sdmxMetadata blir familie-rutere: JSON-kilder (SDMX_STRUCTURE_ACCEPT)
først, SDMX_XML_SOURCES (kun ecb) deretter, delegert til ecbSearch/
ecbMetadata. Kodeliste-kobling er enklere enn JSON-sporet (Ref.id
direkte attributt, ingen URN-regex). isSearchableSource utvidet.
EOF
)"
```

---

### Task 2: Live verifisering (mot ekte ECB) + push

**Files:** Ingen kodeendringer.

**Interfaces:** Ingen nye.

- [ ] **Step 1: Kjør full type-sjekk + testsuite**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle tester PASS.

- [ ] **Step 2: Live smoke-test mot EKTE ECB (ingen mocks) — direkte kall til de faktiske funksjonene**

Skriv et lite, midlertidig Deno-script (IKKE en del av testsuiten, kun til denne verifiseringen — kan slettes etterpå) som importerer `searchCatalog`/`tableMetadata` fra de faktiske filene og kaller dem mot det ekte, urørte `data/data-sources.json`-registeret, uten `fetchImpl` (bruker ekte `fetch`):

```ts
import { parseRegistry } from "file:///Users/hom/Documents/GitHub/openstat/netlify/edge-functions/_lib/registry.ts";
import { searchCatalog } from "file:///Users/hom/Documents/GitHub/openstat/netlify/edge-functions/_lib/tools/search-catalog.ts";
import { tableMetadata } from "file:///Users/hom/Documents/GitHub/openstat/netlify/edge-functions/_lib/tools/table-metadata.ts";

const registry = parseRegistry(JSON.parse(await Deno.readTextFile("/Users/hom/Documents/GitHub/openstat/data/data-sources.json")));
const hits = await searchCatalog("ecb", "exchange rates", { registry, origin: "https://openstat.app" });
console.log("search hits:", JSON.stringify(hits, null, 2));
if (hits.length === 0) throw new Error("forventet minst ett treff for 'exchange rates'");
const meta = await tableMetadata("ecb", hits[0].id, { registry });
console.log("metadata:", JSON.stringify({ title: meta.title, nVars: meta.variables.length, sample: meta.variables[0] }, null, 2));
if (meta.variables.length === 0) throw new Error("forventet minst én variabel i metadata");
console.log("OK: ecb search + metadata fungerer mot ekte API");
```

Skriv scriptet til en fil i scratchpad (IKKE i repoet) og kjør med
`deno run --allow-net --allow-read <scriptpath>` — absolutte `file://`-
importer unngår tvetydighet om hvilken mappe scriptet kjøres fra.

Expected: et treff for "EXR" (Exchange Rates), og metadata med flere variabler (inkludert `TIME_PERIOD` med `time: true`, tom `values`).

- [ ] **Step 3: Hvis Step 2 avdekker et avvik fra fixture-antakelsene**

Rapporter som DONE_WITH_CONCERNS med konkrete detaljer (ikke fiks stille) — ECBs faktiske respons kan ha driftet siden research-fasen (samme dag, så usannsynlig, men sjekk).

- [ ] **Step 4: Push til origin/main**

Dette steget er BEVISST kontrollørens/Hans' eksplisitte handling, ikke noe en subagent gjør selv:

```bash
git push origin main
```

- [ ] **Step 5: Rapporter**

Bekreft push lyktes (`git log --oneline origin/main..HEAD` skal være tomt etterpå).

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §8 (research/design) → Task 1s hele struktur; ingen andre XML-kilder i scope (kun ecb, jf. "Bevisst utenfor denne oppfølgingsøkten" i spec §8).
- **Plassholder-skann:** ingen TBD; komplett kode i hvert steg.
- **Type-konsistens:** `SDMX_XML_SOURCES` (Task 1, registry.ts) brukes identisk i både search-catalog.ts og table-metadata.ts sine `sdmxSearch`/`sdmxMetadata`-familie-rutere; `ecbSearch`/`ecbMetadata` returnerer nøyaktig samme `CatalogHit`/`TableMeta`-former som alle andre adaptere; `xmlText`/`asArray`/`xmlParser`-hjelperne er bevisst duplisert (ikke delt) mellom de to filene, konsistent med eksisterende `sdmxStructureBase`-duplisering fra forrige plan.
