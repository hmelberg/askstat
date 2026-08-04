import { type DatasetHit, loadStaticCatalog, queryWords, scoreSubstring } from "./static-catalog.ts";

interface OwidCatalog {
  charts: { slug: string; title: string; subtitle: string | null }[];
}

const MAX = 8;

// Step 1-måling (2026-08-04, curl mot ourworldindata.org/grapher):
//   MED  csvType=filtered&country=NOR~SWE&time=2000..2024  → 200, 1182 bytes
//        (48 linjer: header + Norge/Sverige 2000–2024 — faktisk filtrert)
//   UTEN csvType=filtered (samme country/time)              → 200, 605252 bytes
//   HELT uten parametre (kun useColumnShortNames)            → 200, 605252 bytes
// Uten csvType=filtered ignoreres country/time helt — svaret er byte-likt det
// uparametrerte hele datasettet. csvType=filtered er derfor PÅKREVD for at
// filtrene skal virke; hintet under bruker den formen.
export async function owidSearch(
  query: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const cat = await loadStaticCatalog<OwidCatalog>(origin, "/data/owid-catalog.json", fetchImpl);
  const words = queryWords(query);
  if (!words.length) return [];
  const scored = cat.charts
    .map((c) => ({ c, score: scoreSubstring(`${c.title} ${c.subtitle ?? ""}`, words) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX).map(({ c }) => ({
    source: "owid",
    id: c.slug,
    title: c.title,
    description: c.subtitle ?? undefined,
    geo: "global",
    access: "open",
    how_to_read:
      `Åpen GET-CSV — ren pandas (INTET direktiv):\n` +
      `df = pd.read_csv("https://ourworldindata.org/grapher/${c.slug}.csv?useColumnShortNames=true&csvType=filtered&country=NOR~SWE&time=2000..2024")\n` +
      `country=NOR~SWE (~ skiller land), time=2000..2024 eller time=latest; probe URL-en før bruk`,
  }));
}
