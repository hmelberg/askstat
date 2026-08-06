import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cessdaSearch } from "./cessda.ts";

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
}

Deno.test("cessdaSearch: Results → DatasetHit m/ landing-page, land, DOI-id", async () => {
  const f = mockFetch({ Results: [{
    id: "abc", titleStudy: "Levekårsundersøkelsen 2021",
    abstract: "<p>Health &amp; welfare</p>",
    publisher: { publisher: "Sikt" },
    studyAreaCountries: [{ country: "Norway" }],
    dataCollectionYear: 2021,
    // Live-formen 2026-08-06: pid er FULL URL, studyUrl mangler ofte.
    pidStudies: [{ pid: "https://doi.org/10.18712/NSD-NSD1234" }],
    dataAccess: "Restricted",
  }] });
  const hits = await cessdaSearch("health", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "10.18712/NSD-NSD1234");
  assertEquals(hits[0].url, "https://doi.org/10.18712/NSD-NSD1234");
  assertEquals(hits[0].access, "landing-page");
  assertEquals(hits[0].geo, "Norway");
  assertEquals(hits[0].time, "2021");
  assertStringIncludes(hits[0].description ?? "", "Sikt");
  assertStringIncludes(hits[0].how_to_read, "Restricted");
  assertStringIncludes(hits[0].how_to_read, "metadata er ikke data");
});

Deno.test("cessdaSearch: tomt svar → tom liste; HTTP-feil kaster", async () => {
  assertEquals(await cessdaSearch("q", mockFetch({ Results: [] })), []);
  try {
    await cessdaSearch("q", mockFetch({}, 502));
    throw new Error("skulle kastet");
  } catch (e) {
    assertStringIncludes(String(e), "502");
  }
});

Deno.test("cessdaSearch: limit-parameter styrer URL og kutter treff", async () => {
  let seenUrl = "";
  const f = ((url: string | URL) => {
    seenUrl = String(url);
    return Promise.resolve(new Response(JSON.stringify({
      Results: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, titleStudy: `S${i}` })),
    }), { status: 200 }));
  }) as typeof fetch;
  const hits = await cessdaSearch("x", f, 20);
  assertStringIncludes(seenUrl, "limit=20");
  assertStringIncludes(seenUrl, "metadataLanguage=en");
  assertEquals(hits.length, 20);
});
