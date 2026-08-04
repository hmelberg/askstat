// Kildeguider (spec 2026-07-31-ssb-mandatory-variabler §fiks 4):
// skills-mønsteret internt — per-kilde-referanse levert i FØRSTE
// search_catalog-/table_metadata-svar for kilden, hentet som statisk
// asset fra egen origin (Deno Deploy bundler ikke .md ved kjøretid).
// Feil (404/nett) → stille no-op: verktøysvaret er ellers uendret.
import { findSource, type DataSource } from "./registry.ts";

const MAX_GUIDE_CHARS = 8_000;

export function makeGuideAttacher(origin: string, fetchImpl: typeof fetch = fetch) {
  const sent = new Set<string>();
  return async function attach(sourceId: string, result: Record<string, unknown>): Promise<void> {
    if (!sourceId || sent.has(sourceId)) return;
    sent.add(sourceId);   // også ved feil: ikke re-fetch en død guide i samme løp
    try {
      const res = await fetchImpl(`${origin}/data/source-guides/${sourceId}.md`);
      if (!res.ok) return;
      const text = (await res.text()).slice(0, MAX_GUIDE_CHARS);
      if (text.trim()) result.guide = text;
    } catch { /* stille — guiden er berikelse, aldri avhengighet */ }
  };
}

export type GuideAttacher = ReturnType<typeof makeGuideAttacher>;

/** Kildens løfte i registerblokka («kildeguide følger med [...] også ved
 *  feil») holdt for søkbare/metadata-adaptere, men var USANT for kilder uten
 *  søk-/metadata-adapter (eurostat: kind uten adapter i search-catalog.ts/
 *  table-metadata.ts; ipums: ingen adapter i det hele tatt) — begge har
 *  guide:true, men fn() KASTER alltid der, så attachGuide (kun kalt på
 *  suksessveien i svar.ts) ble aldri nådd. Denne wrapperen fanger kastet,
 *  bygger et {feil, guide}-svar (norsk feiltekst BEVART ordrett) og forsøker
 *  å feste guiden på DET objektet i stedet. To vakter mot å love noe vi ikke
 *  kan holde: (1) kilden må selv ha guide:true — ellers er det ingen guide å
 *  love, kast uendret; (2) attachGuide må faktisk klare å sette .guide (kan
 *  selv stille no-op'e på 404/nett, se attach() over) — lyktes den ikke,
 *  ville vi returnert et bevisst løgnaktig {feil}-objekt UTEN guide, så da
 *  kastes originalfeilen uendret i stedet. Suksessveien er uendret: fn()
 *  sitt resultat sendes rett til attachGuide (samme rekkefølge som før) og
 *  returneres urørt. */
export async function medGuideVedFeil(
  sourceId: string,
  registry: DataSource[],
  attachGuide: GuideAttacher,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    const result = await fn();
    await attachGuide(sourceId, result);
    return result;
  } catch (e) {
    const src = findSource(registry, sourceId);
    if (!src?.guide) throw e;
    const feil = e instanceof Error ? e.message : String(e);
    const result: Record<string, unknown> = { feil };
    await attachGuide(sourceId, result);
    if (!("guide" in result)) throw e;
    return result;
  }
}
