import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeGuideAttacher, medGuideVedFeil } from "./source-guides.ts";
import type { DataSource } from "./registry.ts";

function fakeFetch(status: number, body: string): typeof fetch {
  let calls = 0;
  const f = ((_u: string) => { calls++; return Promise.resolve(new Response(body, { status })); }) as typeof fetch;
  (f as unknown as { calls: () => number }).calls = () => calls;
  return f;
}

Deno.test("attach: guide første gang, IKKE andre gang; én fetch totalt", async () => {
  const f = fakeFetch(200, "# SSB-guide");
  const attach = makeGuideAttacher("https://app.example", f);
  const r1: Record<string, unknown> = {};
  const r2: Record<string, unknown> = {};
  await attach("ssb", r1);
  await attach("ssb", r2);
  assertEquals(r1.guide, "# SSB-guide");
  assertEquals(r2.guide, undefined);
  assertEquals((f as unknown as { calls: () => number }).calls(), 1);
});

Deno.test("attach: skip-settet fortrenger guiden uten fetch (guides_off, spec §8)", async () => {
  let kalt = 0;
  const f = ((..._args: unknown[]) => { kalt++; return Promise.resolve(new Response("# guide", { status: 200 })); }) as typeof fetch;
  const attach = makeGuideAttacher("https://o", f, new Set(["ssb"]));
  const r1: Record<string, unknown> = {};
  await attach("ssb", r1);
  assertEquals(r1.guide, undefined);
  assertEquals(kalt, 0);              // aldri fetch for fortrengte
  const r2: Record<string, unknown> = {};
  await attach("oecd", r2);           // andre kilder upåvirket
  assertEquals(r2.guide, "# guide");
});

Deno.test("attach: 404 → stille no-op, resultatet urørt", async () => {
  const attach = makeGuideAttacher("https://app.example", fakeFetch(404, ""));
  const r: Record<string, unknown> = { hits: [] };
  await attach("oecd", r);
  assertEquals(r.guide, undefined);
  assert("hits" in r);
});

// medGuideVedFeil: eurostat/ipums har guide:true men INGEN søke-/metadata-
// adapter (se search-catalog.ts/table-metadata.ts default-grenene) — fn()
// kaster derfor alltid for dem. Testene under mocker attachGuide direkte
// (ikke fetch) siden det er kontrakten mot medGuideVedFeil som testes her.

function fakeSource(id: string, guide: boolean): DataSource {
  return {
    id,
    navn: id,
    utgiver: "test",
    beskrivelse: "test",
    tillit: "etablert",
    tilgang: "rest",
    base_url: "https://example.test/",
    cors: true,
    guide,
  };
}

Deno.test("medGuideVedFeil: kastende fn + guide-kilde → {feil, guide} returneres (ikke kastet)", async () => {
  const registry = [fakeSource("eurostat", true)];
  let calledWith: string | undefined;
  const attachGuide = async (sourceId: string, result: Record<string, unknown>) => {
    calledWith = sourceId;
    result.guide = "# eurostat-guide";
  };
  const feilmelding = "ingen søkeadapter for tilgang='rest' (kilde 'eurostat') — bruk web_search + probe";
  async function fn(): Promise<Record<string, unknown>> { throw new Error(feilmelding); }

  const r = await medGuideVedFeil("eurostat", registry, attachGuide, fn);
  assertEquals(r.feil, feilmelding); // norsk feiltekst bevart ordrett
  assertEquals(r.guide, "# eurostat-guide");
  assertEquals(calledWith, "eurostat");
});

Deno.test("medGuideVedFeil: kastende fn + kilde UTEN guide → kaster samme feil uendret", async () => {
  const registry = [fakeSource("ssb", false)];
  const attachGuide = async (_sourceId: string, result: Record<string, unknown>) => {
    result.guide = "skal aldri nås"; // ville bevist en feil hvis dette ble kalt og respektert
  };
  const original = new Error("HTTP 500");
  async function fn(): Promise<Record<string, unknown>> { throw original; }

  await assertRejects(() => medGuideVedFeil("ssb", registry, attachGuide, fn), Error, "HTTP 500");
});

Deno.test("medGuideVedFeil: kastende fn + guide-kilde, men attachGuide klarer ikke feste guiden → kaster originalfeilen (ikke et guideløst {feil}-objekt)", async () => {
  const registry = [fakeSource("eurostat", true)];
  // simulerer 404/nett-feil i attach(): result urørt, ingen .guide satt
  const attachGuide = async (_sourceId: string, _result: Record<string, unknown>) => {};
  const original = new Error("ingen søkeadapter for tilgang='rest' (kilde 'eurostat')");
  async function fn(): Promise<Record<string, unknown>> { throw original; }

  await assertRejects(
    () => medGuideVedFeil("eurostat", registry, attachGuide, fn),
    Error,
    "ingen søkeadapter",
  );
});

Deno.test("medGuideVedFeil: ikke-kastende fn → resultatet passerer urørt, guide festet som før", async () => {
  const registry = [fakeSource("ssb", true)];
  const attachGuide = async (_sourceId: string, result: Record<string, unknown>) => {
    result.guide = "# ssb-guide";
  };
  async function fn(): Promise<Record<string, unknown>> { return { hits: [{ id: "t1" }] }; }

  const r = await medGuideVedFeil("ssb", registry, attachGuide, fn);
  assertEquals(r.hits, [{ id: "t1" }]);
  assertEquals(r.guide, "# ssb-guide");
  assertEquals(r.feil, undefined);
});
