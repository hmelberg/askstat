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
  const registry = [{ id: "worldbank", navn: "WB", utgiver: "WB", tillit: "etablert",
    tilgang: "rest", kind: "worldbank", base_url: "https://api.worldbank.org/v2/", cors: true }];
  const fetchImpl = (() => Promise.resolve(new Response(
    JSON.stringify([{ page: 1, pages: 1, total: 0 }, []]),
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  await assertRejects(
    () => DL.resolveAndFetchLoads('# x = worldbank.read("country/NOR/indicator/SP.POP.TOTL")',
      { fetchImpl, registry }),
    Error, "TOMT");
});
