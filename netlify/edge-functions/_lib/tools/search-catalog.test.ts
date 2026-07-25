import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { searchCatalog, clearApdCatalogCache } from "./search-catalog.ts";
import { parseRegistry } from "../registry.ts";

const ORIGIN = "https://app.test";

const REG = parseRegistry([
  { id: "ssb", navn: "SSB", utgiver: "SSB", tillit: "offisiell", tilgang: "pxweb",
    base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/",
    sok_endepunkt: "https://data.ssb.no/api/pxwebapi/v2-beta/tables?query={q}&lang=no", cors: true },
  { id: "datanorge", navn: "data.norge.no", utgiver: "Digdir", tillit: "offisiell", tilgang: "ckan",
    base_url: "https://data.norge.no/",
    sok_endepunkt: "https://search.api.fellesdatakatalog.digdir.no/search", cors: true },
  { id: "apd", navn: "Awesome Public Datasets", utgiver: "apd-core", tillit: "funnet",
    tilgang: "fil", kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false },
  { id: "owid", navn: "OWID", utgiver: "OWID", tillit: "etablert", tilgang: "fil",
    base_url: "https://ourworldindata.org/grapher/", cors: true },
]);

// PxWebApi v2 /tables response shape (subset)
const PXWEB_FIXTURE = {
  tables: [
    { id: "07459", label: "Befolkning, etter region, år og alder", firstPeriod: "1986", lastPeriod: "2026" },
    { id: "05839", label: "Arbeidsledige (AKU)", firstPeriod: "1996", lastPeriod: "2026" },
  ],
};

// Felles datakatalog /search response shape (subset)
const FDK_FIXTURE = {
  hits: [
    { id: "abc-123", title: { nb: "Drivstoffpriser" }, uri: "https://data.norge.no/datasets/abc-123" },
  ],
};

function fakeFetch(payload: unknown, capture: string[], bodies?: string[]): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    capture.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (bodies) bodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  }) as typeof fetch;
}

Deno.test("pxweb adapter: builds search URL, maps hits", async () => {
  const calls: string[] = [];
  const hits = await searchCatalog("ssb", "arbeidsledighet", { registry: REG, origin: ORIGIN, fetchImpl: fakeFetch(PXWEB_FIXTURE, calls) });
  assertEquals(calls[0], "GET https://data.ssb.no/api/pxwebapi/v2-beta/tables?query=arbeidsledighet&lang=no");
  assertEquals(hits.length, 2);
  assertEquals(hits[1], {
    source: "ssb", id: "05839", title: "Arbeidsledige (AKU)", period: "1996–2026",
    url: "https://data.ssb.no/api/pxwebapi/v2-beta/tables/05839",
  });
});

Deno.test("ckan/fdk adapter: POSTs query, maps hits", async () => {
  const calls: string[] = [];
  const bodies: string[] = [];
  const hits = await searchCatalog("datanorge", "drivstoff", { registry: REG, origin: ORIGIN, fetchImpl: fakeFetch(FDK_FIXTURE, calls, bodies) });
  assertEquals(calls[0].startsWith("POST https://search.api.fellesdatakatalog"), true);
  // Live API quirk (verified 2026-07-03): param is "q" (not "query"), and
  // filters.type must be restricted to "datasets" or results are dominated
  // by CONCEPT/other entity types.
  assertEquals(JSON.parse(bodies[0]), { q: "drivstoff", filters: { type: { value: "datasets" } } });
  assertEquals(hits[0].title, "Drivstoffpriser");
  assertEquals(hits[0].url, "https://data.norge.no/datasets/abc-123");
});

Deno.test("unknown and unsearchable sources throw clear errors", async () => {
  for (const [id, msg] of [["nope", "ukjent kilde"], ["owid", "ikke søkbar"]] as const) {
    let threw = "";
    try { await searchCatalog(id, "x", { registry: REG, origin: ORIGIN }); } catch (e) { threw = String(e); }
    if (!threw.includes(msg)) throw new Error(`${id}: ventet '${msg}', fikk: ${threw}`);
  }
});

// --- apd adapter (local pre-harvested catalog, Task 4) ---

function fakeCatalogFetch(entries: unknown[]): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))) as typeof fetch;
}

const APD_FIXTURE = [
  { identifier: "Agriculture/Lemon-Dataset", name: "Lemons quality control dataset",
    description: "Fruit quality control dataset with annotated images.",
    url: "https://github.com/softwaremill/lemon-dataset", keywords: ["fruit", "quality"], category: "Agriculture" },
  { identifier: "Economics/GDP-Panel", name: "Global GDP panel",
    description: "Country-year GDP series.", url: "https://example.com/gdp",
    keywords: ["gdp", "economics"], category: "Economics" },
];

Deno.test("apdSearch: matches by name/description/keywords/category, case-insensitive", async () => {
  clearApdCatalogCache();
  const hits = await searchCatalog("apd", "FRUIT", { registry: REG, origin: ORIGIN, fetchImpl: fakeCatalogFetch(APD_FIXTURE) });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "Agriculture/Lemon-Dataset");
  assertEquals(hits[0].source, "apd");
  assertEquals(hits[0].url, "https://github.com/softwaremill/lemon-dataset");
  clearApdCatalogCache();
});

Deno.test("apdSearch: no match returns empty array", async () => {
  clearApdCatalogCache();
  const hits = await searchCatalog("apd", "zzznomatch", { registry: REG, origin: ORIGIN, fetchImpl: fakeCatalogFetch(APD_FIXTURE) });
  assertEquals(hits, []);
  clearApdCatalogCache();
});

Deno.test("apdSearch: caps at 20 hits", async () => {
  clearApdCatalogCache();
  const many = Array.from({ length: 25 }, (_, i) => ({
    identifier: `Cat/item-${i}`, name: `Matching item ${i}`, description: "", url: "https://x", keywords: [], category: "Cat",
  }));
  const hits = await searchCatalog("apd", "matching", { registry: REG, origin: ORIGIN, fetchImpl: fakeCatalogFetch(many) });
  assertEquals(hits.length, 20);
  clearApdCatalogCache();
});

Deno.test("source without sok_endepunkt or apd-kind is not searchable", async () => {
  let threw = "";
  try { await searchCatalog("owid", "co2", { registry: REG, origin: ORIGIN }); } catch (e) { threw = String(e); }
  if (!threw.includes("ikke søkbar")) throw new Error("ventet 'ikke søkbar': " + threw);
});
