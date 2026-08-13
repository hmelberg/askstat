// Kildeguider (spec 2026-07-31-ssb-mandatory-variabler §fiks 4):
// skills-mønsteret internt — per-kilde-referanse levert i FØRSTE
// search_catalog-/table_metadata-svar for kilden, hentet som statisk
// asset fra egen origin (Deno Deploy bundler ikke .md ved kjøretid).
// Feil (404/nett) → stille no-op: verktøysvaret er ellers uendret.
import { findSource, type DataSource } from "./registry.ts";

const MAX_GUIDE_CHARS = 8_000;

const OVERRIDE_ID_RE = /^[a-z0-9_-]{1,32}$/;
const OVERRIDE_MAX = 40;

/** guides_override (kort/lang-splitt §2): brukerens kopi-Guide per kilde-id.
 *  Ukjent JSON fra klienten — samme stille filter-toleranse som
 *  coerceSourcesOff. */
export function coerceGuidesOverride(v: unknown): Map<string, string> {
  const ut = new Map<string, string>();
  if (!v || typeof v !== "object" || Array.isArray(v)) return ut;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (ut.size >= OVERRIDE_MAX) break;
    if (!OVERRIDE_ID_RE.test(k) || typeof val !== "string" || !val.trim()) continue;
    ut.set(k, val.slice(0, MAX_GUIDE_CHARS));
  }
  return ut;
}

export function makeGuideAttacher(origin: string, fetchImpl: typeof fetch = fetch, override?: Map<string, string>) {
  const sent = new Set<string>();
  return async function attach(sourceId: string, result: Record<string, unknown>): Promise<void> {
    if (!sourceId || sent.has(sourceId)) return;
    sent.add(sourceId);   // også ved feil: ikke re-fetch en død guide i samme løp
    // Kopi-Guide (kort/lang-splitt §2): brukerens tekst overtar guiderollen
    // på nøyaktig samme late tidspunkt — aldri fetch når override finnes.
    const egen = override?.get(sourceId);
    if (egen) { result.guide = egen; return; }
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
 *  søk-/metadata-adapter — historisk eurostat (kind uten adapter i
 *  search-catalog.ts/table-metadata.ts, FØR Task 4/2026-08-04 la til
 *  eurostatMetadata — eurostat går nå suksessveien under, se
 *  table-metadata.test.ts) og fortsatt ipums (ingen adapter i det hele
 *  tatt). Begge har guide:true, men fn() KASTER alltid for kilder uten
 *  adapter, så attachGuide (kun kalt på suksessveien i svar.ts) ble aldri
 *  nådd. Denne wrapperen fanger kastet,
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
