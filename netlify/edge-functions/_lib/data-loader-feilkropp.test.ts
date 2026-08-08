import { assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

for (const f of ["directive-parser.js", "data-directives.js", "api-kinds.js", "pxweb.js", "data-loader.js", "enc-crypto.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const DL = (globalThis as any).DataLoader;

Deno.test("lastefeil tar med oppstrøms feilkropp", async () => {
  DL._resetCacheForTests();
  const fetchImpl = (() => Promise.resolve(new Response(
    "Missing selection for mandatory variable Tid", { status: 400 }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = ost.read("https://kilde.example/tab.csv")',
      { fetchImpl, registry: [] }),
    Error, "oppstrøms svar: Missing selection");
});

Deno.test("fetchRawUrl tar med oppstrøms feilkropp", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("ukjent tabell", { status: 404 }))) as typeof fetch;
  await assertRejects(
    () => DL.fetchRawUrl("https://kilde.example/x.csv", { fetchImpl }),
    Error, "oppstrøms svar: ukjent tabell");
});

Deno.test("prefikset for pxweb-400-oversettelsen består", async () => {
  DL._resetCacheForTests();
  const fetchImpl = (() => Promise.resolve(new Response("detaljer", { status: 400 }))) as typeof fetch;
  const err = await DL.resolveAndFetchLoads('# x = ost.read("https://kilde.example/t.csv")',
    { fetchImpl, registry: [] }).then(() => null, (e: Error) => e);
  if (!err || !/HTTP 400 for x /.test(err.message)) {
    throw new Error("prefikset «HTTP 400 for x » mangler: " + (err && err.message));
  }
});

Deno.test("tomt worldbank-uttrekk kaster i stedet for å binde tom ramme", async () => {
  DL._resetCacheForTests();
  const registry = [{ id: "worldbank", navn: "WB", utgiver: "WB", beskrivelse: "test", tillit: "etablert",
    tilgang: "rest", kind: "worldbank", base_url: "https://api.worldbank.org/v2/", cors: true }];
  const fetchImpl = (() => Promise.resolve(new Response(
    JSON.stringify([{ page: 1, pages: 1, total: 0 }, []]),
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = worldbank.read("country/NOR/indicator/SP.POP.TOTL")',
      { fetchImpl, registry }),
    Error, "TOMT");
});

Deno.test("fetchRawUrl: CSV med 0 datarader kaster (OWID-slug-feil-klassen)", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("entity,year,value\n",
    { status: 200, headers: { "content-type": "text/csv" } }))) as typeof fetch;
  await assertRejects(() => DL.fetchRawUrl("https://owid.example/x.csv", { fetchImpl }),
    Error, "TOMT");
});

Deno.test("fetchRawUrl: én-linjes ikke-CSV kaster IKKE", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("{\"a\":1}",
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  const r = await DL.fetchRawUrl("https://api.example/x", { fetchImpl });
  if (!r.bytes.length) throw new Error("skulle levert bytes");
});

// ── datacommons (spec fase 3c, task 8): flatener + tomt-vakt langs samme
// kind-sti som sdmx/worldbank/dbnomics over. Registeroppføringen har auth →
// viaProxy=true (verifisert i data-directives-apikinds.test.js, node-siden);
// mock-fetchImpl her ignorerer selve URL-en/proxy-formen, akkurat som
// worldbank-testen over — poenget er flateneren og tomt-vakten, ikke
// nøkkelinjeksjonen (den er hent-core.ts sitt eget testeddomene).
const DC_REGISTRY = [{
  id: "datacommons", navn: "Google Data Commons", utgiver: "Google", beskrivelse: "test", tillit: "etablert",
  tilgang: "rest", kind: "datacommons", base_url: "https://api.datacommons.org/v2/", cors: true,
  auth: { type: "api_key", env: "DATACOMMONS_API_KEY", plassering: "query:key" },
}];

Deno.test("datacommons: to fasetter → CSV har facet_kilde-kolonne; orderedFacets[0] er verdi-raden, kilden navngis alltid", async () => {
  DL._resetCacheForTests();
  const body = JSON.stringify({
    byVariable: { Count_Person: { byEntity: { "country/NOR": { orderedFacets: [
      { facetId: "f1", observations: [{ date: "2020", value: 5000000 }, { date: "2021", value: 5100000 }] },
      { facetId: "f2", observations: [{ date: "2020", value: 4990000 }] },
    ] } } } },
    facets: { f1: { importName: "World Bank" }, f2: { importName: "OECD" } },
  });
  const fetchImpl = (() => Promise.resolve(new Response(body,
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  const { loads } = await DL.resolveAndFetchLoads(
    '# x = datacommons.read("Count_Person", countries=["NOR"])', { fetchImpl, registry: DC_REGISTRY });
  const csv = new TextDecoder().decode(loads[0].bytes);
  const rows = csv.trim().split("\n");
  const header = rows[0].split(",");
  if (!header.includes("facet_kilde")) throw new Error("mangler facet_kilde-kolonne:\n" + csv);
  if (rows.length !== 3) throw new Error("forventet header + 2 datarader (fra orderedFacets[0] alene):\n" + csv);
  if (!csv.includes("World Bank")) throw new Error("facet_kilde skal navngi den valgte fasetten (World Bank):\n" + csv);
  if (csv.includes("OECD")) throw new Error("rader fra den IKKE-valgte fasetten (f2/OECD) skal ikke være med:\n" + csv);
});

Deno.test("tomt datacommons-uttrekk kaster i stedet for å binde tom ramme", async () => {
  DL._resetCacheForTests();
  const fetchImpl = (() => Promise.resolve(new Response(
    JSON.stringify({ byVariable: {}, facets: {} }),
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = datacommons.read("Count_Person", countries=["NOR"])',
      { fetchImpl, registry: DC_REGISTRY }),
    Error, "TOMT");
});
