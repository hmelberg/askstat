import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRegistry } from "./registry.ts";

const registry = parseRegistry(JSON.parse(await Deno.readTextFile(
  new URL("../../../data/data-sources.json", import.meta.url))));

Deno.test("guide:true ↔ guidefil finnes, ikke-tom, ≤ 8000 tegn", async () => {
  for (const s of registry) {
    let text: string | null = null;
    try {
      text = await Deno.readTextFile(new URL(`../../../data/source-guides/${s.id}.md`, import.meta.url));
    } catch { /* mangler */ }
    if (s.guide) {
      assert(text !== null && text.trim().length > 0, `${s.id}: guide:true men fil mangler/tom`);
      assert(text!.length <= 8000, `${s.id}: guide over attacher-taket (8000 tegn)`);
    } else {
      assert(text === null, `${s.id}: guidefil finnes men guide-flagget mangler i registeret`);
    }
  }
});

Deno.test("fase 2-guidene finnes (spec fase 2.3)", () => {
  for (const id of ["ssb", "eurostat", "oecd", "worldbank", "dbnomics"]) {
    assert(registry.find((s) => s.id === id)?.guide === true, `${id}: skal ha guide:true`);
  }
});
