import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nadaSearch, nadaMetadata } from "./nada.ts";
import type { DataSource } from "../../registry.ts";

const SRC: DataSource = {
  id: "wbmicro", navn: "WB", utgiver: "WB", beskrivelse: "test", tillit: "offisiell",
  tilgang: "rest", kind: "nada",
  base_url: "https://microdata.worldbank.org/index.php/api/", cors: true,
};

function mockFetch(routes: Record<string, unknown>): typeof fetch {
  return ((url: string | URL) => {
    const s = String(url);
    const hit = Object.keys(routes).find((k) => s.includes(k));
    if (!hit) return Promise.resolve(new Response("nope", { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(routes[hit]), { status: 200 }));
  }) as typeof fetch;
}

Deno.test("nadaSearch: rows → CatalogHit m/ nasjon+år i tittel; FAO-tall-som-strenger tåles", async () => {
  const f = mockFetch({
    "catalog/search": { result: { rows: [
      { idno: "TZA_2019_LSMS", title: "National Panel Survey", nation: "Tanzania", year_start: "2019", year_end: "2020", url: "https://x/catalog/1" },
      { id: 7, title: "Uten idno", nation: "", year_start: null, url: "https://x/catalog/7" },
      { idno: "", title: "" },
    ] } },
  });
  const hits = await nadaSearch(SRC, "health", f);
  assertEquals(hits.length, 2);
  assertEquals(hits[0].id, "TZA_2019_LSMS");
  assertEquals(hits[0].title, "National Panel Survey (Tanzania 2019–2020)");
  assertEquals(hits[0].period, "2019–2020");
  assertEquals(hits[1].id, "7");
});

Deno.test("nadaSearch: HTTP-feil kaster med kilde-id", async () => {
  const f = (() => Promise.resolve(new Response("x", { status: 500 }))) as typeof fetch;
  try {
    await nadaSearch(SRC, "q", f);
    throw new Error("skulle kastet");
  } catch (e) {
    assertStringIncludes(String(e), "wbmicro");
    assertStringIncludes(String(e), "500");
  }
});

Deno.test("nadaMetadata: variabelordbok find-filtrert + capped, merknad bærer login-forbeholdet", async () => {
  const mange = Array.from({ length: 80 }, (_, i) =>
    ({ vid: `V${i}`, name: `VAR${i}`, labl: i < 70 ? `Annet ${i}` : `Income item ${i}` }));
  const f = mockFetch({
    "/variables": { variables: mange },
    "catalog/TZA": { dataset: { title: "NPS 2019", data_access_type: "licensed" } },
  });
  const meta = await nadaMetadata(SRC, "TZA_2019_LSMS", f, "income");
  assertEquals(meta.title, "NPS 2019");
  assertEquals(meta.variabler_totalt, 80);
  assertEquals(meta.variables.length, 10); // find-filtrert (income → 10 treff)
  assertEquals(meta.variables[0].code, "VAR70");
  assertEquals(meta.datatilgang, "licensed");
  assertStringIncludes(String(meta.merknad), "login-gated");
  assertStringIncludes(String(meta.merknad), "variables/{vid}");
});

Deno.test("nadaMetadata: uten find → capped på 60; manglende variabel-endepunkt er ikke feil", async () => {
  const mange = Array.from({ length: 80 }, (_, i) => ({ name: `V${i}`, labl: `L${i}` }));
  const f1 = mockFetch({
    "/variables": { variables: mange },
    "catalog/X": { dataset: { title: "T" } },
  });
  const m1 = await nadaMetadata(SRC, "X1", f1);
  assertEquals(m1.variables.length, 60);
  assertEquals(m1.variabler_totalt, 80);

  const f2 = mockFetch({ "catalog/Y": { dataset: { title: "Peker" } } });
  const m2 = await nadaMetadata(SRC, "Y1", f2);
  assertEquals(m2.variables.length, 0);
  assertEquals(m2.variabler_totalt, 0);
});

Deno.test("nadaMetadata: 404 på studien kaster med IDNO-hint", async () => {
  const f = mockFetch({});
  try {
    await nadaMetadata(SRC, "12345", f);
    throw new Error("skulle kastet");
  } catch (e) {
    assertStringIncludes(String(e), "IDNO-strengen");
  }
});
