import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSvarSystem, coercePacks, coercePreferences, demoteHeadings } from "./svar-prompt.ts";

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

Deno.test("packs-blokk: flere pakker rendres i rekkefølge m/felles intro", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [{ name: "Norway", text: "## Preferred\nssb first" },
            { name: "ESS", text: "ess api" }],
  });
  assert(sys.includes("## Aktive kildepakker (valgt av brukeren)"));
  assert(sys.indexOf("### Kildepakke: Norway") < sys.indexOf("### Kildepakke: ESS"));
  assert(sys.includes("#### Preferred")); // demotert
});

Deno.test("coercePacks: caps — navn 60, tekst 8000, maks 20, søppel filtreres", () => {
  const packs = coercePacks([
    { name: "N".repeat(80), text: "t".repeat(9000) },
    { name: "", text: "x" }, null, "streng",
    ...Array.from({ length: 25 }, (_, i) => ({ name: "p" + i, text: "t" })),
  ]);
  assert(packs.length <= 20);
  assert(packs[0].name.length === 60 && packs[0].text.length === 8000);
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
