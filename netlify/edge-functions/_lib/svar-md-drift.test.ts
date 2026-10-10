// B10 (review 2026-10-10): prompts/svar.md hevdet å være kilden til sannhet,
// men hadde drevet fra TS-konstantene som faktisk sendes til modellen
// (DEPTH_STANDARD-budsjetter 4/2/1/3 mot 8/3/2/4, RUN uten
// REPARASJONSRESERVE-avsnittet, ROUTING/MIKRO_MAKRO uten markør). Nå er TS
// sannheten, og denne testen låser at hver `<!-- NAVN -->`-blokk i .md-fila
// er byte-lik (etter trim) med SVAR_BLOKKER[NAVN] — og at ingen blokk mangler.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SVAR_BLOKKER } from "./svar-prompt.ts";

const MD_URL = new URL("../prompts/svar.md", import.meta.url);

/** Blokkene mellom «# svar — prompt-blokker» og «## Montering per rute»
 *  (filhodet er en kommentar, ikke en blokk), nøklet på navn. */
function parseSvarMd(md: string): Map<string, string> {
  const start = md.indexOf("\n# svar — prompt-blokker");
  const slutt = md.indexOf("\n## Montering per rute");
  if (start < 0 || slutt < 0) throw new Error("svar.md mangler ankeroverskriftene");
  const kropp = md.slice(start, slutt);
  const re = /^<!-- ([A-Z_]+)\b[\s\S]*?-->\n/gm;
  const treff = [...kropp.matchAll(re)];
  const ut = new Map<string, string>();
  for (let i = 0; i < treff.length; i++) {
    const start = treff[i].index! + treff[i][0].length;
    const end = i + 1 < treff.length ? treff[i + 1].index! : kropp.length;
    ut.set(treff[i][1], kropp.slice(start, end).trim());
  }
  return ut;
}

Deno.test("svar.md speiler hver SVAR_BLOKKER-konstant byte-likt", async () => {
  const md = await Deno.readTextFile(MD_URL);
  const blokker = parseSvarMd(md);
  for (const [navn, tekst] of Object.entries(SVAR_BLOKKER)) {
    if (!blokker.has(navn)) throw new Error(`svar.md mangler <!-- ${navn} -->-blokk`);
    assertEquals(blokker.get(navn), tekst.trim(), `blokken ${navn} har drevet fra svar-prompt.ts`);
  }
  for (const navn of blokker.keys()) {
    if (!(navn in SVAR_BLOKKER)) throw new Error(`svar.md har ukjent blokk <!-- ${navn} -->`);
  }
});
