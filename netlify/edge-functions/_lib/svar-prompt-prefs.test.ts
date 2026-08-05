import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSvarSystem, coercePreferences } from "./svar-prompt.ts";

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
