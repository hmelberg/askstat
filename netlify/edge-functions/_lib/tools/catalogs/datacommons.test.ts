import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DC_SCORE_THRESHOLD, dcSearch } from "./datacommons.ts";

// Responsform verifisert mot docs.datacommons.org/api/rest/v2/resolve
// (Task 6 Step 1, 2026-08-04 — INGEN live nøkkel ennå, se rapporten):
// GET /v2/resolve?key=…&nodes=<fritekst>&resolver=indicator →
//   { entities: [{ node, candidates: [{ dcid, metadata: { score: "0.xxxx", sentence }, typeOf: [...] }] }] }
// OBS: score er en STRENG i den dokumenterte responsen, ikke et tall.
// typeOf: undefined (felt ikke gitt i testkallet) -> defaulter til
// ["StatisticalVariable"] (bakoverkompatibelt med eksisterende tester som
// ikke bryr seg om typeOf). typeOf: null -> feltet er HELT FRAVÆRENDE i
// mock-responsen (den ekte "ingen typeOf-info"-formen, fix-runde 2) —
// skiller seg fra typeOf: [] (feltet TIL STEDE, men tomt).
function resolveFetch(
  candidates: { dcid: string; score: string; sentence?: string; typeOf?: string[] | null }[],
): typeof fetch {
  return ((url: string) => {
    const u = new URL(String(url));
    assertEquals(u.pathname, "/v2/resolve");
    assertEquals(u.searchParams.get("resolver"), "indicator");
    assert(u.searchParams.get("key"), "key-param skal være med");
    assert(u.searchParams.get("nodes"), "nodes-param skal være med");
    const body = {
      entities: [{
        node: u.searchParams.get("nodes"),
        candidates: candidates.map((c) => {
          const entry: Record<string, unknown> = { dcid: c.dcid, metadata: { score: c.score, sentence: c.sentence } };
          if (c.typeOf !== null) entry.typeOf = c.typeOf ?? ["StatisticalVariable"];
          return entry;
        }),
      }],
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as unknown as typeof fetch;
}

Deno.test("DC_SCORE_THRESHOLD er 0,9 (Workbench-målt: 0,9999=ekte, 0,755=temadrift)", () => {
  assertEquals(DC_SCORE_THRESHOLD, 0.9);
});

Deno.test("dcSearch: kun kandidat over terskelen overlever (0.99 vs 0.75)", async () => {
  const f = resolveFetch([
    { dcid: "Count_Person", score: "0.9999", sentence: "population count" },
    { dcid: "Count_TobaccoUser", score: "0.755", sentence: "tobacco users" },
  ]);
  const hits = await dcSearch("unemployment rate", "TESTKEY", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].source, "datacommons");
  assertEquals(hits[0].id, "Count_Person");
  assertEquals(hits[0].access, "open");
});

Deno.test("dcSearch: how_to_read nevner table_metadata FØR datacommons.read (dekningssjekk-kontrakten)", async () => {
  const f = resolveFetch([{ dcid: "Count_Person", score: "0.99" }]);
  const hits = await dcSearch("population", "TESTKEY", f);
  const htr = hits[0].how_to_read;
  assert(htr.includes(`table_metadata('datacommons', 'Count_Person'`), `mangler table_metadata-kall: ${htr}`);
  assert(htr.includes(`datacommons.read("Count_Person"`), `mangler datacommons.read-direktiv: ${htr}`);
  assert(
    htr.indexOf("table_metadata") < htr.indexOf("datacommons.read"),
    "table_metadata skal komme FØR datacommons.read (dekningssjekk FØR lasting)",
  );
  assert(htr.includes("countries="), "hintet skal vise countries=-formen");
});

Deno.test("dcSearch: score nøyaktig 0.9 overlever (≥, ikke >)", async () => {
  const f = resolveFetch([{ dcid: "X", score: "0.9" }]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits.length, 1);
});

Deno.test("dcSearch: score 0.8999 faller (rett under terskelen)", async () => {
  const f = resolveFetch([{ dcid: "X", score: "0.8999" }]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits.length, 0);
});

Deno.test("dcSearch: alle under terskel → tom liste (stillhet slår feil treff — tobacco-for-cannabis-fellen)", async () => {
  const f = resolveFetch([
    { dcid: "A", score: "0.5" },
    { dcid: "B", score: "0.1" },
  ]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits, []);
});

Deno.test("dcSearch: maks 5 treff selv med flere kandidater over terskel", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ dcid: `V${i}`, score: "0.99" }));
  const f = resolveFetch(many);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits.length, 5);
});

Deno.test("dcSearch: tom entities/candidates → tom liste (ikke kast)", async () => {
  const f = (() =>
    Promise.resolve(new Response(JSON.stringify({ entities: [] }), { status: 200 }))) as unknown as typeof fetch;
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits, []);
});

Deno.test("dcSearch: HTTP-feil kaster (arm-nivå — søkes ikke stille i seg selv, kun fravær-uten-nøkkel er stille)", async () => {
  const f = (() => Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
  await assertRejects(() => dcSearch("q", "TESTKEY", f));
});

// ── typeOf-filter (fix-runde 2, live-verifisert 2026-08-04): resolve-svar
// inneholder OGSÅ Topic-noder (dc/topic/UnemploymentRate…) blant kandidatene
// — ikke lastbare med datacommons.read(). Behold kun StatisticalVariable;
// kandidater UTEN typeOf-felt beholdes konservativt. ───────────────────────

Deno.test("dcSearch: Topic-node over terskelen filtreres ut, StatisticalVariable beholdes", async () => {
  const f = resolveFetch([
    { dcid: "UnemploymentRate_Topic", score: "0.99", typeOf: ["Topic"] },
    { dcid: "UnemploymentRate_Person", score: "0.98", typeOf: ["StatisticalVariable"] },
  ]);
  const hits = await dcSearch("unemployment rate", "TESTKEY", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "UnemploymentRate_Person");
});

Deno.test("dcSearch: kandidat UTEN typeOf-felt i det hele tatt beholdes (konservativt)", async () => {
  const f = resolveFetch([{ dcid: "X", score: "0.99", typeOf: null }]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "X");
});

Deno.test("dcSearch: kandidat med typeOf=[] (til stede, men tomt) filtreres ut — skiller seg fra typeOf-felt fraværende", async () => {
  const f = resolveFetch([{ dcid: "X", score: "0.99", typeOf: [] }]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits.length, 0);
});

Deno.test("dcSearch: kun Topic-treff → tom liste, ikke kast", async () => {
  const f = resolveFetch([{ dcid: "SomeTopic", score: "0.99", typeOf: ["Topic"] }]);
  const hits = await dcSearch("q", "TESTKEY", f);
  assertEquals(hits, []);
});
