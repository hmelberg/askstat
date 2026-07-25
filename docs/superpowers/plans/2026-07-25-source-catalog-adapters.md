# Kildekatalog-adaptere (sdmx/statfin/dst/fhi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi `search_catalog`/`table_metadata` ekte adaptere for statfin, dst, fhi og sdmx (norgesbank+oecd — ECB utsatt), slik at modellen får gyldige kolonnenavn OG koder for disse kildene i stedet for å måtte gjette fra web_search/egen kunnskap.

**Architecture:** Utvider den to-nivås dispatchen (`tilgang` for delte protokoller, `kind` for bespoke) som apd-katalog-økten allerede innførte i `search_catalog`. En delt `isSearchableSource()`-funksjon i `registry.ts` fjerner koblingsfaren mellom søkbarhets-hintet i prompten og selve dispatch-vakten (flagget av helhets-reviewen av apd-katalog-økten). `table_metadata` får sin FØRSTE to-nivås dispatch (i dag en flat `if`).

**Tech Stack:** TypeScript/Deno edge-funksjoner (`netlify/edge-functions/_lib/`), samme mønster som eksisterende pxweb/ckan/apd-adaptere.

## Global Constraints

- **ECB er UTENFOR denne planen** — mangler JSON-støtte for SDMX-strukturspørringer (kun XML). `SDMX_STRUCTURE_ACCEPT`-kartet skal IKKE ha en `ecb`-oppføring; `sdmxSearch`/`sdmxMetadata` skal kaste en tydelig feil («ikke støttet ennå») for kilder som ikke er i kartet, ikke prøve og få en kryptisk 406.
- **Alle URL-er/JSON-fasonger under er verifisert LIVE 2026-07-25** (curl mot ekte endepunkter under planleggingen) — ikke gjett andre fasoner enn det som står i hver oppgave.
- **SDMX strukturrot ≠ data-rot:** strukturspørringer (dataflow/datastructure) ligger IKKE under `<base_url>` (som peker på data-endepunktet) — strip det siste `data/`-segmentet for å få strukturroten. Verifisert for norgesbank og oecd.
- **SDMX Accept-header er per kilde:** `application/vnd.sdmx.structure+json;version=1.0.0` for norgesbank, `application/vnd.sdmx.structure+json;version=1.0` for oecd (IKKE samme versjonsstreng — 406 ellers).
- **SDMX DSD+kodelister løses i ÉTT kall** (`?references=all` på dataflow-spørringen) — ALDRI et gjettet `datastructure/{agencyID}/{id}`-kall, siden dataflow-ID og DSD-ID kan avvike (f.eks. NBs `EXR`-dataflow → `DSD_EXR`-DSD).
- **SDMX tidsdimensjon ligger i `dimensionList.timeDimensions`**, IKKE i `dimensionList.dimensions` — begge arrayer må slås sammen ved bygging av `TableVariable[]`.
- **MAX_HITS = 20** (allerede definert i `search-catalog.ts`, IKKE redefiner) og **MAX_VALUES = 40** (allerede definert i `table-metadata.ts`, IKKE redefiner) — begge gjenbrukes av alle nye adaptere.
- **StatFin folder-walk cap:** `MAX_FOLDER_FETCHES = 50` — hardt tak på antall undermappe-kall per søk, for å ikke hamre APIet på brede spørringer. Loggbart/kommentert i koden, ikke et stille kutt.
- **StatFin tabell-ID inkluderer allerede `.px`**-endelsen fra API-et (f.eks. `"11pk.px"`) — ALDRI legg til `.px` en gang til.
- **DST `time`-flagget kommer DIREKTE per variabel** fra `tableinfo`-responsen — ingen egen `role.time`-liste å slå opp (ulikt PxWeb v2).
- **FHI har FLERE registre** (daar, nokkel, npr, msis, sysvak, …) — søk MÅ gå over alle registrene fra `Common/source`, ikke ett fast register.
- **ALDRI live nettverk i automatiske tester** — `fetchImpl`-injeksjon overalt, fixture-JSON bygget fra de VERIFISERTE ekte responsene i hver oppgave under.
- **Ingen prompt-tekst-endringer** — INTRO/DELIVERY-blokkene i `data-svar-prompt.ts` beskriver `table_metadata`/`search_catalog` generisk allerede; ingen kildespesifikk tekst å oppdatere (ulikt apd-katalog-planens Task 5).
- Test-kommandoer (fra repo-roten `/Users/hom/Documents/GitHub/openstat`): `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`.
- **Commit lokalt kun — ALDRI push.** (Etablert norm for openstat fra 2026-07-25, se memory `feedback-openstat-no-autopush`.)

---

### Task 1: Delt `isSearchableSource()` — fjern koblingsfaren mellom prompt-hint og dispatch-vakt

**Files:**
- Modify: `netlify/edge-functions/_lib/registry.ts`
- Modify: `netlify/edge-functions/_lib/registry.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`

**Interfaces:**
- Produces: `isSearchableSource(src: DataSource): boolean` (eksportert fra `registry.ts`), `SDMX_STRUCTURE_ACCEPT: Record<string, string>` (eksportert fra `registry.ts`, brukt av Task 5s sdmx-adapter).
- Consumes: eksisterende `DataSource`-interface (`kind?: string` finnes fra apd-katalog-økten).

Dette er en REN refaktorering — ingen ny funksjonalitet, ingen endring i observerbar oppførsel for eksisterende kilder. De to eksisterende, hardkodede `s.kind === "apd"`-sjekkene (én i `renderRegistryBlock`, én i `searchCatalog`s vakt) samles i én funksjon.

- [ ] **Step 1: Skriv feilende tester for `isSearchableSource`**

Legg til i `netlify/edge-functions/_lib/registry.test.ts`:

```ts
Deno.test("isSearchableSource: sok_endepunkt, kjent kind, eller sdmx+id i SDMX_STRUCTURE_ACCEPT", () => {
  const reg = parseRegistry([
    { id: "ssb", navn: "SSB", utgiver: "SSB", tillit: "offisiell", tilgang: "pxweb",
      base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/",
      sok_endepunkt: "https://data.ssb.no/api/pxwebapi/v2-beta/tables?query={q}&lang=no", cors: true },
    { id: "apd", navn: "APD", utgiver: "apd-core", tillit: "funnet", tilgang: "fil",
      kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false },
    { id: "norgesbank", navn: "Norges Bank", utgiver: "Norges Bank", tillit: "offisiell",
      tilgang: "sdmx", kind: "sdmx", base_url: "https://data.norges-bank.no/api/data/", cors: true },
    { id: "ecb", navn: "ECB", utgiver: "ECB", tillit: "offisiell", tilgang: "sdmx", kind: "sdmx",
      base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
    { id: "owid", navn: "OWID", utgiver: "OWID", tillit: "etablert", tilgang: "fil",
      base_url: "https://ourworldindata.org/grapher/", cors: true },
  ]);
  assertEquals(isSearchableSource(reg[0]), true);  // sok_endepunkt
  assertEquals(isSearchableSource(reg[1]), true);  // kind apd
  assertEquals(isSearchableSource(reg[2]), true);  // sdmx + norgesbank i SDMX_STRUCTURE_ACCEPT
  assertEquals(isSearchableSource(reg[3]), false); // sdmx men ecb er IKKE i SDMX_STRUCTURE_ACCEPT
  assertEquals(isSearchableSource(reg[4]), false); // verken sok_endepunkt, kjent kind, eller sdmx
});
```

(Legg til `isSearchableSource` i import-linjen øverst i testfilen.)

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: kompileringsfeil — `isSearchableSource` finnes ikke ennå.

- [ ] **Step 3: Implementer `isSearchableSource` og `SDMX_STRUCTURE_ACCEPT` i `registry.ts`**

Legg til FØR `renderRegistryBlock`-funksjonen:

```ts
/** Accept-header for SDMX-strukturspørringer (dataflow-liste/DSD), PER
 *  KILDE-ID — versjonsstrengen avviker mellom leverandører (406 ellers).
 *  ECB er BEVISST UTELATT: mangler JSON-støtte for strukturspørringer,
 *  kun XML — se docs/superpowers/specs/2026-07-25-source-catalog-adapters-design.md §1a. */
export const SDMX_STRUCTURE_ACCEPT: Record<string, string> = {
  norgesbank: "application/vnd.sdmx.structure+json;version=1.0.0",
  oecd: "application/vnd.sdmx.structure+json;version=1.0",
};

const SEARCHABLE_KINDS = new Set(["apd", "statfin", "dst", "fhi"]);

/** Én kilde til sannhet for "er denne kilden søkbar via search_catalog?" —
 *  brukt BÅDE av renderRegistryBlock (prompt-hintet) og av search_catalog
 *  sin dispatch-vakt, slik at de to ikke kan drifte fra hverandre. */
export function isSearchableSource(src: DataSource): boolean {
  if (src.sok_endepunkt) return true;
  if (src.tilgang === "sdmx" && src.id in SDMX_STRUCTURE_ACCEPT) return true;
  if (src.kind && SEARCHABLE_KINDS.has(src.kind)) return true;
  return false;
}
```

Endre `renderRegistryBlock`s søkbar-sjekk fra:
```ts
    if (s.sok_endepunkt || s.kind === "apd") bits.push("søkbar via search_catalog");
```
til:
```ts
    if (isSearchableSource(s)) bits.push("søkbar via search_catalog");
```

- [ ] **Step 4: Bruk `isSearchableSource` i `search-catalog.ts`s vakt**

I `netlify/edge-functions/_lib/tools/search-catalog.ts`, endre importen øverst fra:
```ts
import { findSource, type DataSource } from "../registry.ts";
```
til:
```ts
import { findSource, isSearchableSource, type DataSource } from "../registry.ts";
```

Endre vakt-sjekken i `searchCatalog` fra:
```ts
  if (!src.sok_endepunkt && src.kind !== "apd") {
    throw new Error(`kilden '${sourceId}' er ikke søkbar — bruk web_search + probe i stedet`);
  }
```
til:
```ts
  if (!isSearchableSource(src)) {
    throw new Error(`kilden '${sourceId}' er ikke søkbar — bruk web_search + probe i stedet`);
  }
```

- [ ] **Step 5: Kjør ALLE eksisterende tester, bekreft null regresjon**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle tester PASS (inkludert den nye) — dette er en ren refaktorering, ingen eksisterende test skal endre oppførsel.

- [ ] **Step 6: Commit**

```bash
git add netlify/edge-functions/_lib/registry.ts netlify/edge-functions/_lib/registry.test.ts netlify/edge-functions/_lib/tools/search-catalog.ts
git commit -m "$(cat <<'EOF'
refactor: delt isSearchableSource() — fjern koblingsfare mellom prompt og dispatch

Helhets-reviewen av apd-katalog-økten flagget at de to hardkodede
kind==="apd"-sjekkene (renderRegistryBlock + search_catalog-vakten) måtte
holdes i synk manuelt. Én delt funksjon i registry.ts løser det, og
forbereder sdmx/statfin/dst/fhi-adapterne (egen, uavhengig spec) uten
funksjonell endring for eksisterende kilder.
EOF
)"
```

---

### Task 2: FHI-adapter (search + table_metadata)

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.test.ts`
- Modify: `data/data-sources.json`

**Interfaces:**
- Consumes: `isSearchableSource` (Task 1, allerede oppdatert til å telle `kind==="fhi"` som søkbar).
- Produces: `fhiSearch(src, query, f)`, `fhiMetadata(src, tableId, f)`. `table_metadata`s dispatch blir FØRSTE gang to-nivås (tilgang→kind) — samme struktur `search_catalog` allerede har.

Verifisert live 2026-07-25 (se plan-hodets Global Constraints + spec §3):
- Register-liste: `GET Common/source` → `[{id, title, description, aboutUrl, publishedBy}]` (id = registerkode: daar, nokkel, npr, msis, sysvak, …).
- Tabell-liste per register: `GET {register}/table` → `[{tableId: <tall>, title, publishedAt, modifiedAt}]` — MERK feltnavn `tableId`/`title`, ikke `id`/`text`.
- Dimensjoner: `GET {register}/table/{tableId}/dimension` → `{dimensions: [{code, label, categories: [{label, value, children}]}]}` — kode er `categories[].value`.

- [ ] **Step 1: Legg `"kind": "fhi"` til fhi-oppføringen i `data/data-sources.json`**

Finn den eksisterende `fhi`-oppføringen (id: "fhi", base_url: "https://statistikk-data.fhi.no/api/open/v1/") og legg til feltet `"kind": "fhi",` (f.eks. rett etter `"tilgang": "rest",`).

- [ ] **Step 2: Skriv feilende tester for `fhiSearch`/`fhiMetadata`**

Legg til i `netlify/edge-functions/_lib/tools/search-catalog.test.ts` (etter eksisterende `REG`-fixture — legg `fhi` til i samme `REG`-array):

```ts
// I REG-arrayet, legg til:
// { id: "fhi", navn: "FHI", utgiver: "FHI", tillit: "offisiell", tilgang: "rest",
//   kind: "fhi", base_url: "https://statistikk-data.fhi.no/api/open/v1/", cors: true },

function fakeFhiFetch(): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("Common/source")) {
      return Promise.resolve(new Response(JSON.stringify([
        { id: "daar", title: "Dødsårsaksregisteret (DÅR)", description: "...", aboutUrl: "https://www.fhi.no/op/dodsarsaksregisteret/", publishedBy: "FHI" },
        { id: "nokkel", title: "Folkehelsestatistikk", description: "...", aboutUrl: "https://www.fhi.no/op/nokkel/", publishedBy: "FHI" },
      ]), { status: 200 }));
    }
    if (url.endsWith("daar/table")) {
      return Promise.resolve(new Response(JSON.stringify([
        { tableId: 754, title: "D5c_hjertekar_rater", publishedAt: "2026-04-27T05:00:00Z", modifiedAt: "2026-05-26T13:25:14Z" },
        { tableId: 868, title: "D6a_kreft_krg", publishedAt: "2026-04-27T05:00:00Z", modifiedAt: "2026-04-22T11:17:35Z" },
      ]), { status: 200 }));
    }
    if (url.endsWith("nokkel/table")) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    if (url.includes("daar/table/754/dimension")) {
      return Promise.resolve(new Response(JSON.stringify({
        dimensions: [
          { code: "DAAR", label: "Dødsår", categories: [{ label: "2020", value: "2020", children: [] }, { label: "2021", value: "2021", children: [] }] },
          { code: "KJONN", label: "Kjønn", categories: [{ label: "Menn", value: "1", children: [] }, { label: "Kvinner", value: "2", children: [] }] },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}

Deno.test("fhiSearch: søker over alle registre, treffer på tittel", async () => {
  const hits = await searchCatalog("fhi", "hjertekar", { registry: REG, origin: "https://app.test", fetchImpl: fakeFhiFetch() });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "daar/754");
  assertEquals(hits[0].source, "fhi");
});

Deno.test("fhiSearch: ingen treff gir tom liste", async () => {
  const hits = await searchCatalog("fhi", "zzznomatch", { registry: REG, origin: "https://app.test", fetchImpl: fakeFhiFetch() });
  assertEquals(hits, []);
});
```

Legg til i `netlify/edge-functions/_lib/tools/table-metadata.test.ts` (legg `fhi` til `REG`-fixturen der også):

```ts
Deno.test("fhi metadata: kode fra categories[].value, ingen tids-flagg", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("daar/table/754/dimension")) {
      return Promise.resolve(new Response(JSON.stringify({
        dimensions: [
          { code: "DAAR", label: "Dødsår", categories: [{ label: "2020", value: "2020", children: [] }] },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("fhi", "daar/754", { registry: REG, fetchImpl });
  const daar = meta.variables.find((v) => v.code === "DAAR")!;
  assertEquals(daar.time, false);
  assertEquals(daar.values[0], { code: "2020", label: "2020" });
});
```

- [ ] **Step 3: Kjør testene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/`
Expected: `fhiSearch`/`fhiMetadata` finnes ikke ennå — kompileringsfeil eller "ingen søkeadapter"/"støtter ikke"-feil.

- [ ] **Step 4: Implementer `fhiSearch` i `search-catalog.ts`**

Legg til (etter `apdSearch`):

```ts
interface FhiRegister { id: string; title: string; }
interface FhiTable { tableId: number; title: string; }

async function fhiSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const registersRes = await f(new URL("Common/source", src.base_url).toString());
  if (!registersRes.ok) throw new Error(`fhi registerliste feilet: HTTP ${registersRes.status}`);
  const registers = await registersRes.json() as FhiRegister[];
  const q = query.toLowerCase();
  const hits: CatalogHit[] = [];
  for (const reg of registers) {
    const tablesRes = await f(new URL(`${reg.id}/table`, src.base_url).toString());
    if (!tablesRes.ok) continue; // ett register feiler ikke søket i de andre
    const tables = await tablesRes.json() as FhiTable[];
    for (const t of tables) {
      if (t.title.toLowerCase().includes(q)) {
        hits.push({
          source: src.id,
          id: `${reg.id}/${t.tableId}`,
          title: t.title,
          url: new URL(`${reg.id}/table/${t.tableId}/data`, src.base_url).toString(),
        });
        if (hits.length >= MAX_HITS) return hits;
      }
    }
  }
  return hits;
}
```

Legg til `case "fhi": return fhiSearch(src, query, f);` i den nøstede `switch (src.kind)` i `searchCatalog`s `default`-gren (sammen med den eksisterende `case "apd"`).

- [ ] **Step 5: Implementer `fhiMetadata` og to-nivås dispatch i `table-metadata.ts`**

Full ny versjon av `netlify/edge-functions/_lib/tools/table-metadata.ts`:

```ts
// table_metadata tool: variable-level lookup for a catalog hit, so the model
// can build a MINIMAL query URL (spec: build datasets from variables).
import { findSource, type DataSource } from "../registry.ts";

export interface TableVariable {
  code: string;
  label: string;
  time: boolean;
  values: { code: string; label: string }[];
  valuesTruncated: boolean;
}

export interface TableMeta {
  source: string;
  id: string;
  title: string;
  variables: TableVariable[];
  queryUrlTemplate?: string;
}

const MAX_VALUES = 40;

export async function tableMetadata(
  sourceId: string,
  tableId: string,
  deps: { registry: DataSource[]; fetchImpl?: typeof fetch },
): Promise<TableMeta> {
  const src = findSource(deps.registry, sourceId);
  if (!src) throw new Error(`ukjent kilde '${sourceId}'`);
  const f = deps.fetchImpl ?? fetch;
  switch (src.tilgang) {
    case "pxweb": return pxwebMetadata(src, tableId, f);
    default:
      switch (src.kind) {
        case "fhi": return fhiMetadata(src, tableId, f);
        default:
          throw new Error(
            `table_metadata støtter ikke '${sourceId}' ennå — bruk probe på data-URL-en for å se kolonner`,
          );
      }
  }
}

async function pxwebMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(`tables/${tableId}/metadata?lang=no`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`metadata for ${src.id}/${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json();

  const dims = (json?.dimension ?? {}) as Record<string, {
    label?: string;
    category?: { index?: Record<string, number>; label?: Record<string, string> };
  }>;
  const timeDims = new Set<string>((json?.role?.time ?? []) as string[]);
  const variables: TableVariable[] = Object.entries(dims).map(([code, d]) => {
    const labels = d.category?.label ?? {};
    const codes = Object.keys(d.category?.index ?? labels);
    const values = codes.slice(0, MAX_VALUES).map((c) => ({ code: c, label: labels[c] ?? c }));
    return {
      code,
      label: d.label ?? code,
      time: timeDims.has(code),
      values,
      valuesTruncated: codes.length > MAX_VALUES,
    };
  });

  return {
    source: src.id,
    id: tableId,
    title: String(json?.label ?? tableId),
    variables,
    queryUrlTemplate: src.sporrings_url_mal?.replace("{id}", tableId),
  };
}

interface FhiDimensionCategory { label: string; value: string; }
interface FhiDimension { code: string; label: string; categories: FhiDimensionCategory[]; }

async function fhiMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  // tableId kommer som "<register>/<tallId>" fra fhiSearch (search-catalog.ts)
  const [register, id] = tableId.split("/");
  if (!register || !id) throw new Error(`fhi table_id må være '<register>/<tallId>', fikk '${tableId}'`);
  const url = new URL(`${register}/table/${id}/dimension`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`fhi metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { dimensions?: FhiDimension[] };
  const dims = json.dimensions ?? [];
  const variables: TableVariable[] = dims.map((d) => ({
    code: d.code,
    label: d.label,
    time: false, // FHI gir ikke et pålitelig tids-signal (se spec §3) — ærlig forenkling
    values: d.categories.slice(0, MAX_VALUES).map((c) => ({ code: c.value, label: c.label })),
    valuesTruncated: d.categories.length > MAX_VALUES,
  }));
  return { source: src.id, id: tableId, title: tableId, variables };
}
```

- [ ] **Step 6: Kjør testene på nytt, bekreft at alt passerer**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle tester PASS, ingen regresjon i eksisterende pxweb/ckan/apd-tester (`pxwebMetadata` er en ren utvinning av gammel kode — ingen atferdsendring).

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts data/data-sources.json
git commit -m "$(cat <<'EOF'
feat: fhi-adapter for search_catalog/table_metadata

Søker over ALLE FHI-registre (Common/source), ikke bare ett. table_metadata
får sin første to-nivås dispatch (tilgang→kind) — pxwebMetadata er en ren
utvinning av eksisterende kode, ingen atferdsendring der.
EOF
)"
```

---

### Task 3: DST-adapter (search + table_metadata)

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.test.ts`
- Modify: `data/data-sources.json`

**Interfaces:**
- Produces: `dstSearch(src, query, f)`, `dstMetadata(src, tableId, f)`. Legger `case "dst"` til begge steders `switch (src.kind)`.

Verifisert live 2026-07-25:
- Tabell-liste: `GET /v1/tables?format=JSON` → `[{id, text, unit, updated, active, firstPeriod, lastPeriod, variables}]` — ingen søkeparameter, filtrer client-side på `text`.
- Metadata: `GET /v1/tableinfo/{tabell}?format=JSON` → `{text, variables: [{id, text, elimination, time, values: [{id, text}]}]}` — `time` er et DIREKTE boolsk felt per variabel.

- [ ] **Step 1: Legg `"kind": "dst"` til dst-oppføringen i `data/data-sources.json`**

- [ ] **Step 2: Skriv feilende tester for `dstSearch`/`dstMetadata`**

I `search-catalog.test.ts` (legg `dst` til `REG`, base_url `"https://api.statbank.dk/v1/"`):

```ts
function fakeDstFetch(): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("tables?format=JSON")) {
      return Promise.resolve(new Response(JSON.stringify([
        { id: "FOLK1A", text: "Befolkningen den 1. i kvartalet", firstPeriod: "2008K1", lastPeriod: "2026K2", variables: ["område", "køn", "alder", "civilstand", "tid"] },
        { id: "BEFOLK3", text: "Befolkningen 1. januar", firstPeriod: "2007", lastPeriod: "2026", variables: ["område", "tid"] },
      ]), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}

Deno.test("dstSearch: filtrerer tabellisten på tittel", async () => {
  const hits = await searchCatalog("dst", "kvartalet", { registry: REG, origin: "https://app.test", fetchImpl: fakeDstFetch() });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "FOLK1A");
});
```

I `table-metadata.test.ts` (legg `dst` til `REG`):

```ts
Deno.test("dst metadata: time-flagg direkte per variabel", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("tableinfo/FOLK1A")) {
      return Promise.resolve(new Response(JSON.stringify({
        text: "Befolkningen den 1. i kvartalet",
        variables: [
          { id: "OMRÅDE", text: "område", elimination: true, time: false, values: [{ id: "000", text: "Hele landet" }] },
          { id: "Tid", text: "tid", time: true, values: [{ id: "2024K1", text: "2024K1" }] },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("dst", "FOLK1A", { registry: REG, fetchImpl });
  assertEquals(meta.variables.find((v) => v.code === "Tid")!.time, true);
  assertEquals(meta.variables.find((v) => v.code === "OMRÅDE")!.time, false);
});
```

- [ ] **Step 3: Kjør testene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/`

- [ ] **Step 4: Implementer `dstSearch` i `search-catalog.ts`** (legg til etter `fhiSearch`)

```ts
interface DstTable { id: string; text: string; }

async function dstSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const res = await f(new URL("tables?format=JSON", src.base_url).toString());
  if (!res.ok) throw new Error(`dst tabelliste feilet: HTTP ${res.status}`);
  const tables = await res.json() as DstTable[];
  const q = query.toLowerCase();
  return tables
    .filter((t) => t.text.toLowerCase().includes(q))
    .slice(0, MAX_HITS)
    .map((t) => ({
      source: src.id,
      id: t.id,
      title: t.text,
      url: new URL(`data/${t.id}/CSV`, src.base_url).toString(),
    }));
}
```

Legg til `case "dst": return dstSearch(src, query, f);` i `searchCatalog`s nøstede switch.

- [ ] **Step 5: Implementer `dstMetadata` i `table-metadata.ts`** (legg til etter `fhiMetadata`)

```ts
interface DstVariableValue { id: string; text: string; }
interface DstVariable { id: string; text: string; time?: boolean; values: DstVariableValue[]; }

async function dstMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(`tableinfo/${tableId}?format=JSON`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`dst metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { text?: string; variables?: DstVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => ({
    code: v.id,
    label: v.text,
    time: !!v.time,
    values: v.values.slice(0, MAX_VALUES).map((c) => ({ code: c.id, label: c.text })),
    valuesTruncated: v.values.length > MAX_VALUES,
  }));
  return { source: src.id, id: tableId, title: json.text ?? tableId, variables };
}
```

Legg til `case "dst": return dstMetadata(src, tableId, f);` i `tableMetadata`s nøstede switch.

- [ ] **Step 6: Kjør alle tester på nytt**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts data/data-sources.json
git commit -m "feat: dst-adapter for search_catalog/table_metadata"
```

---

### Task 4: StatFin-adapter (search + table_metadata)

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.test.ts`
- Modify: `data/data-sources.json`

**Interfaces:**
- Produces: `statfinSearch(src, query, f)`, `statfinMetadata(src, tableId, f)`. Legger `case "statfin"` til begge steders `switch (src.kind)`.

Verifisert live 2026-07-25:
- Mappenavigasjon: `GET <base>/<sti>/` (rekursiv) → `[{id, type, text, updated?}]`, `type: "l"` = mappe, `type: "t"` = tabell (id inkluderer ALLEREDE `.px`).
- Metadata: `GET <base>/<sti>/<tabell-id>` → `{title, variables: [{code, text, values: [...koder...], valueTexts: [...labels, samme rekkefølge...], time?, elimination?}]}` — PARALLELLE arrayer, IKKE `{code,label}`-objekter som PxWeb v2.

- [ ] **Step 1: Legg `"kind": "statfin"` til statfin-oppføringen i `data/data-sources.json`**

- [ ] **Step 2: Skriv feilende tester for `statfinSearch`/`statfinMetadata`**

I `search-catalog.test.ts` (legg `statfin` til `REG`, base_url `"https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/"`):

```ts
function fakeStatfinFetch(): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("StatFin/")) {
      return Promise.resolve(new Response(JSON.stringify([
        { id: "tyti", type: "l", text: "Labour force survey" },
        { id: "synt", type: "l", text: "Births" },
      ]), { status: 200 }));
    }
    if (url.endsWith("StatFin/tyti/")) {
      return Promise.resolve(new Response(JSON.stringify([
        { id: "11pk.px", type: "t", text: "Employees aged 15-74 by type of employment relationship and sex, 2009-2025", updated: "2026-07-01T18:34:06" },
      ]), { status: 200 }));
    }
    if (url.endsWith("StatFin/synt/")) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}

Deno.test("statfinSearch: rekurserer inn i mapper, treffer på tabelltittel", async () => {
  const hits = await searchCatalog("statfin", "employment", { registry: REG, origin: "https://app.test", fetchImpl: fakeStatfinFetch() });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "tyti/11pk.px");
});
```

I `table-metadata.test.ts` (legg `statfin` til `REG`):

```ts
Deno.test("statfin metadata: parallelle values/valueTexts-arrayer", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("tyti/11pk.px")) {
      return Promise.resolve(new Response(JSON.stringify({
        title: "Employees by sex",
        variables: [
          { code: "sukupuoli", text: "Sex", values: ["1", "2"], valueTexts: ["Men", "Women"], elimination: true },
          { code: "timeperiod_m", text: "Month", values: ["2025M01"], valueTexts: ["2025M01"], time: true },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("statfin", "tyti/11pk.px", { registry: REG, fetchImpl });
  const sex = meta.variables.find((v) => v.code === "sukupuoli")!;
  assertEquals(sex.values, [{ code: "1", label: "Men" }, { code: "2", label: "Women" }]);
  assertEquals(meta.variables.find((v) => v.code === "timeperiod_m")!.time, true);
});
```

- [ ] **Step 3: Kjør testene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/`

- [ ] **Step 4: Implementer `statfinSearch` i `search-catalog.ts`** (legg til etter `dstSearch`)

```ts
interface StatfinEntry { id: string; type: string; text: string; }

const MAX_FOLDER_FETCHES = 50; // hardt tak — unngå å hamre StatFin på brede søk

async function statfinSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const q = query.toLowerCase();
  const hits: CatalogHit[] = [];
  let folderFetches = 0;
  async function walk(path: string): Promise<void> {
    if (hits.length >= MAX_HITS || folderFetches >= MAX_FOLDER_FETCHES) return;
    folderFetches++;
    const res = await f(new URL(path, src.base_url).toString());
    if (!res.ok) return; // én feilet undermappe stopper ikke resten av søket
    const entries = await res.json() as StatfinEntry[];
    for (const e of entries) {
      if (hits.length >= MAX_HITS) return;
      if (e.type === "t" && e.text.toLowerCase().includes(q)) {
        hits.push({
          source: src.id,
          id: `${path}${e.id}`,
          title: e.text,
          url: new URL(`${path}${e.id}`, src.base_url).toString(),
        });
      } else if (e.type === "l" && folderFetches < MAX_FOLDER_FETCHES) {
        await walk(`${path}${e.id}/`);
      }
    }
  }
  await walk("");
  return hits;
}
```

Legg til `case "statfin": return statfinSearch(src, query, f);` i `searchCatalog`s nøstede switch.

- [ ] **Step 5: Implementer `statfinMetadata` i `table-metadata.ts`** (legg til etter `dstMetadata`)

```ts
interface StatfinVariable { code: string; text: string; values: string[]; valueTexts?: string[]; time?: boolean; }

async function statfinMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(tableId, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`statfin metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { title?: string; variables?: StatfinVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => {
    const codes = v.values ?? [];
    const labels = v.valueTexts ?? codes;
    return {
      code: v.code,
      label: v.text,
      time: !!v.time,
      values: codes.slice(0, MAX_VALUES).map((c, i) => ({ code: c, label: labels[i] ?? c })),
      valuesTruncated: codes.length > MAX_VALUES,
    };
  });
  return { source: src.id, id: tableId, title: json.title ?? tableId, variables };
}
```

Legg til `case "statfin": return statfinMetadata(src, tableId, f);` i `tableMetadata`s nøstede switch.

- [ ] **Step 6: Kjør alle tester på nytt**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts data/data-sources.json
git commit -m "$(cat <<'EOF'
feat: statfin-adapter for search_catalog/table_metadata

Rekursiv mappenavigasjon (PXWeb v1, ikke v2) med et hardt MAX_FOLDER_FETCHES
=50-tak for å ikke hamre APIet på brede søk. Metadata bruker parallelle
values/valueTexts-arrayer (eldre PXWeb v1-fasong, ulikt v2s {code,label}).
EOF
)"
```

---

### Task 5: SDMX-adapter (search + table_metadata) — norgesbank + oecd

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.test.ts`

**Interfaces:**
- Consumes: `SDMX_STRUCTURE_ACCEPT` (Task 1, fra `registry.ts`).
- Produces: `sdmxSearch(src, query, f)`, `sdmxMetadata(src, dataflowKey, f)`. Legger `case "sdmx"` til det ØVERSTE nivået av begge dispatch-switchene (delt protokoll, ikke en `kind`-gren) — ECB (også `tilgang: sdmx`) treffer samme kode, som kaster en tydelig "ikke støttet ennå"-feil for kilder utenfor `SDMX_STRUCTURE_ACCEPT`.

Ingen `data-sources.json`-endring nødvendig — oecd/norgesbank har allerede `"kind": "sdmx"` fra api-kinds-økten (ECB også, men er bevisst utelatt fra `SDMX_STRUCTURE_ACCEPT`).

Verifisert live 2026-07-25 (norgesbank OG oecd, se plan-hodets Global Constraints):
- Strukturrot = `base_url` med siste `data/`-segment fjernet.
- `GET <strukturrot>dataflow/all/all/latest?references=none` (med kilde-spesifikk Accept) → `{data: {dataflows: [{id, agencyID, name, structure}]}}`.
- `GET <strukturrot>dataflow/{agencyID}/{dataflowId}/latest?references=all` → `{data: {dataStructures: [{name, dataStructureComponents: {dimensionList: {dimensions: [...], timeDimensions: [...]}}}], codelists: [{id, codes: [{id, name}]}]}}`.
- Kodeliste kobles til dimensjon via `dimension.localRepresentation.enumeration`-URN-en (f.eks. `"urn:sdmx:...Codelist=NB:CL_CURRENCY(1.0)"` → kodeliste-ID `"CL_CURRENCY"`).
- Tidsdimensjonen (`TIME_PERIOD`) ligger i `dimensionList.timeDimensions`, IKKE i `dimensions` — har ingen kodeliste (åpent tidsintervall).

- [ ] **Step 1: Skriv feilende tester for `sdmxSearch`/`sdmxMetadata`**

I `search-catalog.test.ts` (legg `norgesbank` og `ecb` til `REG`; norgesbank: `tilgang: "sdmx", kind: "sdmx", base_url: "https://data.norges-bank.no/api/data/"`; ecb: samme form, `base_url: "https://data-api.ecb.europa.eu/service/data/"`):

```ts
const NB_DATAFLOW_FIXTURE = {
  data: {
    dataflows: [
      { id: "EXR", agencyID: "NB", name: "Exchange rates" },
      { id: "ANN_FX_SPU", agencyID: "NB", name: "Announcement of foreign exchange transactions on behalf of SPU" },
    ],
  },
};

function fakeSdmxFetch(payload: unknown, capture: string[] = []): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    capture.push(String((init?.headers as Record<string, string> | undefined)?.Accept ?? ""));
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  }) as typeof fetch;
}

Deno.test("sdmxSearch: filtrerer dataflow-navn, bruker kilde-spesifikk Accept-versjon", async () => {
  const calls: string[] = [];
  const hits = await searchCatalog("norgesbank", "exchange", { registry: REG, origin: "https://app.test", fetchImpl: fakeSdmxFetch(NB_DATAFLOW_FIXTURE, calls) });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "NB/EXR");
  assertEquals(calls[0], "application/vnd.sdmx.structure+json;version=1.0.0");
});

Deno.test("sdmxSearch: ecb (utenfor SDMX_STRUCTURE_ACCEPT) kaster tydelig feil", async () => {
  let threw = "";
  try { await searchCatalog("ecb", "exchange", { registry: REG, origin: "https://app.test", fetchImpl: fakeSdmxFetch(NB_DATAFLOW_FIXTURE) }); }
  catch (e) { threw = String(e); }
  if (!threw.includes("ikke støttet")) throw new Error("ventet 'ikke støttet'-feil for ecb: " + threw);
});
```

I `table-metadata.test.ts` (legg `norgesbank` til `REG`, samme form):

```ts
const NB_EXR_DSD_FIXTURE = {
  data: {
    dataStructures: [{
      name: "Exchange rates",
      dataStructureComponents: {
        dimensionList: {
          dimensions: [
            { id: "BASE_CUR", localRepresentation: { enumeration: "urn:sdmx:org.sdmx.infomodel.codelist.Codelist=NB:CL_CURRENCY(1.0)" } },
          ],
          timeDimensions: [
            { id: "TIME_PERIOD", localRepresentation: { textFormat: { textType: "ObservationalTimePeriod" } } },
          ],
        },
      },
    }],
    codelists: [
      { id: "CL_CURRENCY", codes: [{ id: "NOK", name: "Norwegian krone" }, { id: "USD", name: "US dollar" }] },
    ],
  },
};

Deno.test("sdmx metadata: kodeliste koblet via enumeration-URN, tidsdimensjon fra timeDimensions", async () => {
  const meta = await tableMetadata("norgesbank", "NB/EXR", { registry: REG, fetchImpl: fakeSdmxFetch(NB_EXR_DSD_FIXTURE) });
  const baseCur = meta.variables.find((v) => v.code === "BASE_CUR")!;
  assertEquals(baseCur.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);
});
```

(`fakeSdmxFetch` trengs også importert/definert i `table-metadata.test.ts` — samme lille helper som over, kun brukt for å returnere payload uansett URL siden testen kun sjekker parsing.)

- [ ] **Step 2: Kjør testene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/`

- [ ] **Step 3: Implementer `sdmxSearch` i `search-catalog.ts`**

Endre importen øverst i `search-catalog.ts` til å også hente `SDMX_STRUCTURE_ACCEPT`:
```ts
import { findSource, isSearchableSource, SDMX_STRUCTURE_ACCEPT, type DataSource } from "../registry.ts";
```

Legg til (etter `statfinSearch`):

```ts
function sdmxStructureBase(baseUrl: string): string {
  // base_url peker på data-endepunktet (f.eks. .../api/data/); strukturroten
  // er et søsken-nivå — strip siste "data/"-segment. Verifisert 2026-07-25
  // for norgesbank og oecd.
  return baseUrl.replace(/data\/$/, "");
}

async function sdmxSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  const url = `${sdmxStructureBase(src.base_url)}dataflow/all/all/latest?references=none`;
  const res = await f(url, { headers: { Accept: accept } });
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

Legg til `case "sdmx": return sdmxSearch(src, query, f);` i `searchCatalog`s ØVERSTE `switch (src.tilgang)` (sammen med `pxweb`/`ckan`, IKKE i den nøstede kind-switchen).

- [ ] **Step 4: Implementer `sdmxMetadata` i `table-metadata.ts`**

Endre importen øverst til:
```ts
import { findSource, SDMX_STRUCTURE_ACCEPT, type DataSource } from "../registry.ts";
```

Legg til (etter `statfinMetadata`):

```ts
function sdmxCodelistIdFromUrn(urn: string): string | null {
  const m = urn.match(/Codelist=[^:]+:([^(]+)\(/);
  return m ? m[1] : null;
}

async function sdmxMetadata(src: DataSource, dataflowKey: string, f: typeof fetch): Promise<TableMeta> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  const [agencyID, dataflowId] = dataflowKey.split("/");
  if (!agencyID || !dataflowId) throw new Error(`sdmx table_id må være '<agencyID>/<dataflowId>', fikk '${dataflowKey}'`);
  const url = `${src.base_url.replace(/data\/$/, "")}dataflow/${agencyID}/${dataflowId}/latest?references=all`;
  const res = await f(url, { headers: { Accept: accept } });
  if (!res.ok) throw new Error(`sdmx metadata for ${dataflowKey} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const dsd = json?.data?.dataStructures?.[0];
  if (!dsd) throw new Error(`fant ingen datastruktur for ${dataflowKey}`);
  const codelists = (json?.data?.codelists ?? []) as Record<string, unknown>[];
  const dimList = dsd.dataStructureComponents?.dimensionList ?? {};
  const plainDims = (dimList.dimensions ?? []) as Record<string, unknown>[];
  const timeDims = (dimList.timeDimensions ?? []) as Record<string, unknown>[];

  const codesFor = (d: Record<string, unknown>) => {
    const enumUrn = String((d.localRepresentation as Record<string, unknown> | undefined)?.enumeration ?? "");
    const clId = sdmxCodelistIdFromUrn(enumUrn);
    const cl = codelists.find((c) => c.id === clId);
    return (cl?.codes as Record<string, unknown>[] | undefined) ?? [];
  };

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const codes = codesFor(d);
      return {
        code: String(d.id ?? ""),
        label: String(d.id ?? ""), // ingen egen "name" utover concept-referansen — koden ER labelen
        time: false,
        values: codes.slice(0, MAX_VALUES).map((c) => ({ code: String(c.id ?? ""), label: String(c.name ?? c.id ?? "") })),
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
  return { source: src.id, id: dataflowKey, title: String(dsd.name ?? dataflowKey), variables };
}
```

Legg til `case "sdmx": return sdmxMetadata(src, tableId, f);` i `tableMetadata`s ØVERSTE `switch (src.tilgang)` (sammen med `pxweb`, IKKE i den nøstede kind-switchen).

- [ ] **Step 5: Kjør alle tester på nytt**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts
git commit -m "$(cat <<'EOF'
feat: sdmx-adapter for norgesbank+oecd (ecb utsatt — kun XML-støtte)

Strukturrot er et søsken-nivå til data-endepunktet (strip data/), per-
kilde Accept-versjonsstreng (NB: 1.0.0, OECD: 1.0), dataflow+DSD løst i
ÉTT kall (references=all) siden dataflow-ID og DSD-ID kan avvike.
Tidsdimensjonen hentes fra dimensionList.timeDimensions, ikke dimensions.
ECB kaster en tydelig "ikke støttet ennå"-feil (mangler JSON for
strukturspørringer) i stedet for å prøve og få en kryptisk 406.
EOF
)"
```

---

### Task 6: Live sanity-sjekk + full-suite-verifisering

**Files:** Ingen kodeendringer — kun verifisering.

**Interfaces:** Ingen nye.

Alle adaptere er testet mot FIXTURE-data hittil (aldri live nettverk i den automatiske suiten, per Global Constraints). Denne oppgaven bekrefter at de virkelige API-ene fortsatt oppfører seg som antatt PÅ IMPLEMENTERINGSTIDSPUNKTET — offentlige API-er kan endre seg, og fixture-testene ville ikke fanget det.

- [ ] **Step 1: Kjør full type-sjekk + testsuite**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: alle tester PASS (fhi/dst/statfin/sdmx + alle eksisterende).

- [ ] **Step 2: Live sanity-sjekk mot ekte API-er (IKKE en del av testsuiten — engangsverifisering)**

Kjør disse fem curl-kallene og bekreft at responsformen fortsatt matcher det testene antar (samme sjekk som ble gjort under planleggingen 2026-07-25):

```bash
curl -s "https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/tyti/" | head -c 300
curl -s "https://api.statbank.dk/v1/tables?format=JSON" | head -c 300
curl -s "https://statistikk-data.fhi.no/api/open/v1/daar/table" | head -c 300
curl -s -H "Accept: application/vnd.sdmx.structure+json;version=1.0.0" "https://data.norges-bank.no/api/dataflow/all/all/latest?references=none" | head -c 300
curl -s -A "openstat" -H "Accept: application/vnd.sdmx.structure+json;version=1.0" "https://sdmx.oecd.org/public/rest/dataflow/all/all/latest?references=none" | head -c 300
```

Forvent: JSON-svar som matcher fasongen i hver oppgaves fixture (feltnavn `id`/`type`/`text` for statfin, `id`/`text` for dst, `tableId`/`title` for fhi, `data.dataflows[].id/agencyID/name` for begge sdmx-kallene). Avvik her betyr at et API har endret seg siden planleggingen — rapporter som DONE_WITH_CONCERNS med detaljer, ikke som en feil i implementeringen.

- [ ] **Step 3: Rapporter**

Ingen commit i denne oppgaven (ingen filendringer) — bare bekreftelse i rapporten om at live-sjekken i Step 2 stemte overens med fixture-antakelsene.

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §1/§1a (omfang, ECB utsatt) → alle tasks respekterer dette; §2 (dispatch) → Task 1 (delt helper) + hver tasks bidrag til begge switch-strukturene; §3 (per-kilde) → Task 2-5, hver med feltnavn verifisert live; §4 (feilhåndtering) → uendret filosofi, ingen egen task trengs (arvet fra eksisterende `throw`-mønster); §5 (testing) → hver task har fixture-baserte tester per adapter; §6 (rekkefølge fhi→dst→statfin→sdmx) → Task 2-5 følger nøyaktig denne rekkefølgen; §7 (bevisst utenfor) → ingen tasks trengs (eksklusjoner).
- **Plassholder-skann:** ingen TBD/TODO; komplett kode i hvert steg.
- **Type-konsistens:** `SDMX_STRUCTURE_ACCEPT` (Task 1, registry.ts) brukes identisk i Task 5s `sdmxSearch`/`sdmxMetadata`; `isSearchableSource` (Task 1) dekker `kind`-verdiene `apd`/`statfin`/`dst`/`fhi` som legges til i Task 2-4 (settet i `SEARCHABLE_KINDS` i Task 1 er allerede fullstendig — ingen senere task trenger å utvide det, siden alle fire var kjent på planleggingstidspunktet); `TableVariable`/`CatalogHit`-feltnavn brukt konsekvent på tvers av alle fem nye adaptere, identisk med de eksisterende pxweb/ckan/apd-adapterne.
