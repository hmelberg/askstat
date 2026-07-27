import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { searchLiterature } from "./search-literature.ts";

const WORK = {
  doi: "https://doi.org/10.2139/ssrn.3608520",
  display_name: "Cash-for-Care, or Caring for Cash?",
  publication_year: 2020,
  authorships: [
    { author: { display_name: "A. En" } },
    { author: { display_name: "B. To" } },
    { author: { display_name: "C. Tre" } },
    { author: { display_name: "D. Fire" } },
    { author: { display_name: "E. Fem" } },
  ],
  cited_by_count: 4,
  primary_location: { source: { display_name: "SSRN" } },
  open_access: { oa_url: "https://example.org/fulltext.pdf" },
};

function fakeFetch(status: number, body: unknown, capture?: { url?: string }): typeof fetch {
  return ((input: string | URL | Request) => {
    if (capture) capture.url = String(input);
    return Promise.resolve(new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status, headers: { "content-type": "application/json" } },
    ));
  }) as typeof fetch;
}

Deno.test("searchLiterature: kompakte treff m/ DOI, forfatterkutt og venue", async () => {
  const cap: { url?: string } = {};
  const r = await searchLiterature("cash-for-care maternal employment", 2000, {
    mailto: "test@example.org",
    fetchImpl: fakeFetch(200, { meta: { count: 306 }, results: [WORK] }, cap),
  });
  assertEquals(r.ok, true);
  assertEquals(r.count, 306);
  assertEquals(r.hits.length, 1);
  const h = r.hits[0];
  assertEquals(h.doi, "https://doi.org/10.2139/ssrn.3608520");
  assertEquals(h.year, 2020);
  assertEquals(h.authors, ["A. En", "B. To", "C. Tre", "D. Fire", "m.fl."]);
  assertEquals(h.venue, "SSRN");
  assertEquals(h.oa_url, "https://example.org/fulltext.pdf");
  // forespørselen bærer mailto + fra-år-filter + select (kompakt payload)
  const u = new URL(cap.url!);
  assertEquals(u.hostname, "api.openalex.org");
  assertEquals(u.searchParams.get("mailto"), "test@example.org");
  assertEquals(u.searchParams.get("filter"), "from_publication_date:2000-01-01");
  if (!u.searchParams.get("select")?.includes("doi")) throw new Error("select mangler doi");
});

Deno.test("searchLiterature: uten mailto/fromYear utelates parametrene", async () => {
  const cap: { url?: string } = {};
  await searchLiterature("x", undefined, { fetchImpl: fakeFetch(200, { results: [] }, cap) });
  const u = new URL(cap.url!);
  assertEquals(u.searchParams.get("mailto"), null);
  assertEquals(u.searchParams.get("filter"), null);
});

Deno.test("searchLiterature: manglende felter blir null/tomt, aldri kast", async () => {
  const r = await searchLiterature("x", undefined, {
    fetchImpl: fakeFetch(200, { results: [{ display_name: "Uten DOI" }] }),
  });
  assertEquals(r.ok, true);
  assertEquals(r.hits[0].doi, null);
  assertEquals(r.hits[0].year, null);
  assertEquals(r.hits[0].authors, []);
  assertEquals(r.hits[0].venue, null);
  assertEquals(r.hits[0].cited_by, 0);
});

Deno.test("searchLiterature: tomt søk, HTTP-feil og råtten JSON rapporteres, ikke kastes", async () => {
  const tom = await searchLiterature("  ", undefined, {});
  assertEquals(tom.ok, false);
  if (!tom.note?.includes("tomt")) throw new Error("ventet tomt-søk-notat");
  const e503 = await searchLiterature("x", undefined, { fetchImpl: fakeFetch(503, "nede") });
  assertEquals(e503.ok, false);
  if (!e503.note?.includes("503")) throw new Error("ventet HTTP 503-notat");
  const rot = await searchLiterature("x", undefined, { fetchImpl: fakeFetch(200, "{ikke json") });
  assertEquals(rot.ok, false);
  if (!rot.note?.includes("parses")) throw new Error("ventet parse-notat");
});
