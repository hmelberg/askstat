import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearStaticCatalogCache } from "./static-catalog.ts";
import { owidSearch } from "./owid.ts";

const CATALOG = JSON.stringify({
  charts: [
    { slug: "life-expectancy", title: "Life expectancy at birth", subtitle: null },
  ],
  _provenance: { source_url: "https://datasette-public.owid.io/owid.json", fetched_at: "2026-08-04T00:00:00Z" },
});

Deno.test("owidSearch: substring-treff og ren-pandas how_to_read", async () => {
  clearStaticCatalogCache();
  const f = (() => Promise.resolve(new Response(CATALOG, { status: 200 }))) as unknown as typeof fetch;
  const hits = await owidSearch("life expectancy", "https://app.test", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "life-expectancy");
  assertEquals(hits[0].access, "open");
  assert(hits[0].how_to_read.includes(
    'pd.read_csv("https://ourworldindata.org/grapher/life-expectancy.csv',
  ));
});

Deno.test("owidSearch: tulleord gir tomt treff", async () => {
  clearStaticCatalogCache();
  const f = (() => Promise.resolve(new Response(CATALOG, { status: 200 }))) as unknown as typeof fetch;
  const hits = await owidSearch("xyzzyxyzzy", "https://app.test", f);
  assertEquals(hits.length, 0);
});
