import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { zenodoSearch } from "./zenodo.ts";

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
}

Deno.test("zenodoSearch: tabulær fil → open + fil-URL; ellers landing-page", async () => {
  const f = mockFetch({ hits: { hits: [
    {
      id: 1, doi: "10.5281/zenodo.1",
      metadata: { title: "Survey CSV", description: "<b>desc</b>", publication_date: "2024-05-01" },
      files: [
        { key: "readme.pdf", links: { self: "https://z/api/records/1/files/readme.pdf/content" } },
        { key: "data.csv", size: 1234, links: { self: "https://z/api/records/1/files/data.csv/content" } },
      ],
      links: { self_html: "https://zenodo.org/records/1" },
    },
    {
      id: 2, doi: "10.5281/zenodo.2",
      metadata: { title: "Only zip" },
      files: [{ key: "arkiv.zip", links: { self: "https://z/x.zip" } }],
      links: { self_html: "https://zenodo.org/records/2" },
    },
  ] } });
  const hits = await zenodoSearch("survey", f);
  assertEquals(hits.length, 2);
  assertEquals(hits[0].access, "open");
  assertEquals(hits[0].url, "https://z/api/records/1/files/data.csv/content");
  assertEquals(hits[0].time, "2024");
  assertStringIncludes(hits[0].how_to_read, "pd.read_");
  assertStringIncludes(hits[0].how_to_read, "lisens");
  assertEquals(hits[1].access, "landing-page");
  assertEquals(hits[1].url, "https://zenodo.org/records/2");
  assertStringIncludes(hits[1].how_to_read, "PDF/zip");
});

Deno.test("zenodoSearch: HTTP-feil kaster; treff uten tittel/url filtreres", async () => {
  try {
    await zenodoSearch("q", mockFetch({}, 429));
    throw new Error("skulle kastet");
  } catch (e) {
    assertStringIncludes(String(e), "429");
  }
  const hits = await zenodoSearch("q", mockFetch({ hits: { hits: [{ id: 3 }] } }));
  assertEquals(hits, []);
});
