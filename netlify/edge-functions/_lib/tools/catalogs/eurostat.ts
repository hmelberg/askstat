import { type DatasetHit, loadStaticCatalog, queryWords, scoreSubstring } from "./static-catalog.ts";

interface EsCatalog {
  tables: { code: string; title: string; start: string; end: string }[];
}

const MAX = 8;

export async function eurostatSearch(
  query: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const cat = await loadStaticCatalog<EsCatalog>(origin, "/data/eurostat-catalog.json", fetchImpl);
  const words = queryWords(query);
  if (!words.length) return [];
  const scored = cat.tables
    .map((t) => ({ t, score: scoreSubstring(`${t.title} ${t.code}`, words) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX).map(({ t }) => ({
    source: "eurostat",
    id: t.code,
    title: t.title,
    time: t.start && t.end ? `${t.start}–${t.end}` : undefined,
    geo: "EU/EFTA",
    access: "open",
    // Task 4 (2026-08-04): eurostatMetadata finnes nå (table-metadata.ts) —
    // hintet peker dit FØR .read(), samme "table_metadata(...) → # x = …"-form
    // som dbnomics/worldbank (prosa på EGEN linje, se worldbank-hintet over —
    // ikke etter ) på samme linje). probe-henvisningen er fjernet: den var
    // riktig FØR adapteren fantes (kind uten table_metadata-støtte, se
    // source-guides.ts sin medGuideVedFeil-kommentar), men er misvisende nå.
    how_to_read:
      `table_metadata('eurostat', '${t.code}') → # e = eurostat.read("${t.code}", filters={"geo": "NO"}, years=…)\n` +
      `kildens egne parametre (geo, unit, s_adj, indic, …) går i filters={}; kodene kommer fra table_metadata, ikke gjett`,
  }));
}
