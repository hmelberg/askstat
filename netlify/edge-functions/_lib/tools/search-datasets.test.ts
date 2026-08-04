import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coerceScope, searchDatasets } from "./search-datasets.ts";
import type { DatasetHit } from "./catalogs/static-catalog.ts";

function hit(source: string, n: number): DatasetHit {
  return { source, id: `${source}-${n}`, title: `${source} treff ${n}`, access: "open", how_to_read: "x" };
}

Deno.test("coerceScope: ukjent → stats", () => {
  assertEquals(coerceScope("research"), "research");
  assertEquals(coerceScope("all"), "all");
  assertEquals(coerceScope("stat"), "stats");
  assertEquals(coerceScope(undefined), "stats");
});

Deno.test("searchDatasets: fletter m/diversitet (maks 4 per katalog, 15 totalt), failed-liste", async () => {
  const catalogs = {
    a: () => Promise.resolve([1, 2, 3, 4, 5, 6].map((n) => hit("a", n))),
    b: () => Promise.resolve([1, 2, 3].map((n) => hit("b", n))),
    c: () => Promise.reject(new Error("nede")),
    d: () => new Promise<DatasetHit[]>(() => {}),   // henger → timeout
  };
  const res = await searchDatasets("x", "stats", {
    registry: [], origin: "https://app.test",
    _catalogsForTest: catalogs, _timeoutMs: 50,
  } as never);
  assertEquals(res.failed.sort(), ["c", "d"]);
  assertEquals(res.hits.filter((h) => h.source === "a").length, 4);   // kappet fra 6
  assertEquals(res.hits.filter((h) => h.source === "b").length, 3);
  // Round-robin: første treff fra hver katalog kommer før andres andre-treff
  assertEquals(res.hits[0].id, "a-1");
  assertEquals(res.hits[1].id, "b-1");
  assert(res.hits.length <= 15);
});

Deno.test("dbnomics-armen har hevet tak (ryggrad, spec fase 3a)", async () => {
  const hit_fn = (i: number) => ({ source: "dbnomics", id: "D" + i, title: "t" + i,
    access: "open" as const, how_to_read: "x" });
  const res = await searchDatasets("q", "stats", {
    registry: [], origin: "https://x.example",
    _catalogsForTest: {
      dbnomics: () => Promise.resolve(Array.from({ length: 8 }, (_, i) => hit_fn(i))),
      worldbank: () => Promise.resolve(Array.from({ length: 8 }, (_, i) =>
        ({ ...hit_fn(i), source: "worldbank" }))),
    },
  });
  assertEquals(res.hits.filter((h) => h.source === "dbnomics").length, 6);
  assertEquals(res.hits.filter((h) => h.source === "worldbank").length, 4);
});

Deno.test("datacommons-armen er stille fraværende uten DATACOMMONS_API_KEY (ekte buildCatalogs, ingen _catalogsForTest)", async () => {
  // Nøkkelen kan stå i brukerens .env/skall (fikset 2026-08-04 — testpakken
  // gikk rød når den gjorde) — testen forutsetter fravær, så den fjerner OG
  // gjenoppretter env-variabelen selv (samme mønster som
  // table-metadata.test.ts sin "mangler DATACOMMONS_API_KEY"-test), i stedet
  // for å stole på at miljøet allerede er slik.
  const had = Deno.env.get("DATACOMMONS_API_KEY");
  if (had !== undefined) Deno.env.delete("DATACOMMONS_API_KEY");
  try {
    const failFetch = (() =>
      Promise.resolve(new Response("nope", { status: 404 }))) as unknown as typeof fetch;
    // Ingen _catalogsForTest: dette går via den EKTE buildCatalogs, slik at vi
    // faktisk øver på env-grenen (`if (dcKey) stats.datacommons = …`) i stedet
    // for å teste en mock som aldri ville hatt en datacommons-nøkkel uansett.
    const res = await searchDatasets("population", "stats", {
      registry: [], origin: "https://x.example", fetchImpl: failFetch,
    });
    assertEquals(res.hits.some((h) => h.source === "datacommons"), false);
    assertEquals(res.failed.includes("datacommons"), false, "fraværende arm skal ALDRI havne i failed-listen");
  } finally {
    if (had !== undefined) Deno.env.set("DATACOMMONS_API_KEY", had);
  }
});
