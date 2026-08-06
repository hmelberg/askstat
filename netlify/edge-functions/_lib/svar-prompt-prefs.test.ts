import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSvarSystem, coercePacks, coercePreferences, demoteHeadings, GET_PACK_TOOL } from "./svar-prompt.ts";

Deno.test("coercePreferences: streng, trim, tak 8000 (profil-tekster)", () => {
  assertEquals(coercePreferences(undefined), "");
  assertEquals(coercePreferences(42), "");
  assertEquals(coercePreferences("  x  "), "x");
  assertEquals(coercePreferences("a".repeat(9000)).length, 8000);
});

Deno.test("landruting alltid i data-ruten; preferanseblokk kun når satt, sist", () => {
  const uten = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x");
  assert(uten.includes("## Landruting"));
  assert(!uten.includes("Brukerens datapreferanser"));
  const med = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x",
    { preferences: "standardland Norge; foretrekk SSB" });
  assert(med.includes("standardland Norge; foretrekk SSB"));
  assert(med.indexOf("Brukerens datapreferanser") > med.indexOf("## Kilderegister"),
    "preferansene skal stå ETTER registerblokka (mest spesifikke sist)");
  assert(!buildSvarSystem("beregning", "python", "").includes("## Landruting"));
  assert(!buildSvarSystem("utforsk", "python", "", { preferences: "x" }).includes("Brukerens datapreferanser"));
});

Deno.test("packs-blokk: flere pakker rendres i rekkefølge m/felles intro, id i overskriften", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [{ id: "norway", name: "Norway", text: "## Preferred\nssb first", level: "full" },
            { id: "ess", name: "ESS", text: "ess api", level: "full" }],
  });
  assert(sys.includes("## Aktive kildepakker (valgt av brukeren)"));
  assert(sys.indexOf("### Kildepakke: Norway (id: norway)") < sys.indexOf("### Kildepakke: ESS (id: ess)"));
  assert(sys.includes("#### Preferred")); // demotert
});

Deno.test("coercePacks: caps — navn 60, tekst 40000, maks 20, søppel filtreres, id sanert, level validert", () => {
  const packs = coercePacks([
    { id: "a b/c!", name: "N".repeat(80), text: "t".repeat(45000) },
    { name: "", text: "x" }, null, "streng",
    ...Array.from({ length: 25 }, (_, i) => ({ name: "p" + i, text: "t" })),
  ]);
  assert(packs.length <= 20);
  assert(packs[0].name.length === 60 && packs[0].text.length === 40000);
  assertEquals(packs[0].id, "abc"); // [A-Za-z0-9:_-] — mellomrom/skilletegn borte
  assertEquals(packs[0].level, "full"); // ingen level oppgitt → default 'full'
});

Deno.test("coercePacks: id-tak 100 tegn; level-verdier godtas/avvises", () => {
  const packs = coercePacks([
    { id: "x".repeat(150), name: "A", text: "t" },
    { id: "y", name: "B", text: "t", level: "manifest" },
    { id: "z", name: "C", text: "t", level: "summary" },
    { id: "w", name: "D", text: "t", level: "noe-ukjent" },
  ]);
  assertEquals(packs[0].id.length, 100);
  assertEquals(packs[1].level, "manifest");
  assertEquals(packs[2].level, "summary");
  assertEquals(packs[3].level, "full"); // ukjent verdi → default
});

Deno.test("coercePacks: SUM tekst ≤100000 — stopp når taket nås", () => {
  const packs = coercePacks([
    { id: "a", name: "A", text: "t".repeat(40000) },
    { id: "b", name: "B", text: "t".repeat(40000) },
    { id: "c", name: "C", text: "t".repeat(40000) }, // 3×40000 > 100000
    { id: "d", name: "D", text: "t".repeat(100) },   // ville rommet, men stopper likevel
  ]);
  assertEquals(packs.length, 2);
  const sum = packs.reduce((s, p) => s + p.text.length, 0);
  assert(sum <= 100000);
});

Deno.test("renderPacksBlock (via buildSvarSystem): nivåmerker på manifest/summary, ingen på full", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [
      { id: "a", name: "A", text: "fulltekst", level: "full" },
      { id: "b", name: "B", text: "utdrag", level: "manifest" },
      { id: "c", name: "C", text: "kort", level: "summary" },
    ],
  });
  assert(sys.includes("*(maskinutdrag — hent full tekst med get_pack)*"));
  assert(sys.includes("*(kortform — hent full tekst med get_pack)*"));
  // 'A' er full — ingen merke rett etter DENS overskrift.
  const aHeader = sys.indexOf("### Kildepakke: A (id: a)");
  const restEtterA = sys.slice(aHeader, aHeader + 60);
  assert(!restEtterA.includes("hent full tekst"));
});

Deno.test("packs-blokk: get_pack-setningen KUN når minst én pakke ikke er full", () => {
  const alleFull = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "full" }],
  });
  assert(!alleFull.includes("get_pack-verktøyet"));
  const enKort = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "summary" }],
  });
  assert(enKort.includes("get_pack-verktøyet"));
});

Deno.test("GET_PACK_TOOL: navn og input_schema", () => {
  assertEquals(GET_PACK_TOOL.name, "get_pack");
  assertEquals(GET_PACK_TOOL.input_schema.required, ["id"]);
});

Deno.test("demoteHeadings: +2 nivåer, tak 6, rører ikke ikke-headinger", () => {
  assertEquals(demoteHeadings("## Mine kilder\ntekst # ikke-heading"),
    "#### Mine kilder\ntekst # ikke-heading");
  assertEquals(demoteHeadings("###### Dypest"), "###### Dypest");
  assertEquals(demoteHeadings("#uten-mellomrom"), "#uten-mellomrom");
});

Deno.test("packs-blokk: tom liste → ingen blokk; utforsk-ruten får den ikke", () => {
  assert(!buildSvarSystem("data", "python", "", { packs: [] })
    .includes("Aktive kildepakker"));
  assert(!buildSvarSystem("utforsk", "python", "", {
    packs: [{ name: "N", text: "t" }] }).includes("Aktive kildepakker"));
});
