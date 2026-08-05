import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSvarSystem, coercePack, coercePreferences, demoteHeadings } from "./svar-prompt.ts";

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

Deno.test("coercePack: navn+tekst m/caps, null ved tomt/ugyldig", () => {
  assertEquals(coercePack(undefined), null);
  assertEquals(coercePack("streng"), null);
  assertEquals(coercePack({ name: "Norway", text: "" }), null);
  assertEquals(coercePack({ name: "", text: "x" }), null);
  const p = coercePack({ name: "N".repeat(80), text: "t".repeat(9000) })!;
  assertEquals(p.name.length, 60);
  assertEquals(p.text.length, 8000);
});

Deno.test("demoteHeadings: +2 nivåer, tak 6, rører ikke ikke-headinger", () => {
  assertEquals(demoteHeadings("## Mine kilder\ntekst # ikke-heading"),
    "#### Mine kilder\ntekst # ikke-heading");
  assertEquals(demoteHeadings("###### Dypest"), "###### Dypest");
  assertEquals(demoteHeadings("#uten-mellomrom"), "#uten-mellomrom");
});

Deno.test("pack-blokk: rendres m/navn etter preferansene, headinger demoteres i begge", () => {
  const s = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x", {
    preferences: "## Mine regler\nforetrekk SSB",
    pack: { name: "Norway", text: "## Preferred sources\nssb first" },
  });
  assert(s.includes("## Aktiv kildepakke: Norway"));
  assert(s.includes("#### Preferred sources"));         // pakke demotert
  assert(s.includes("#### Mine regler"));               // preferanser demotert
  assert(!s.includes("\n## Preferred sources"));
  assert(s.indexOf("Aktiv kildepakke") > s.indexOf("Brukerens datapreferanser"),
    "pakka står ETTER preferansene");
  const uten = buildSvarSystem("data", "python", "", { pack: { name: "", text: "" } });
  assert(!uten.includes("Aktiv kildepakke"));
  assert(!buildSvarSystem("utforsk", "python", "", { pack: { name: "N", text: "t" } })
    .includes("Aktiv kildepakke"));                     // kun data-ruten
});
