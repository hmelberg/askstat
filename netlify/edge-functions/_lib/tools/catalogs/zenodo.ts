// Zenodo (spec 2026-08-06-mikrodata-oppdagelse §C): ~670k åpne
// forskningsdatasett, nøkkelfri + CORS-åpen INKLUDERT fil-nedlasting —
// billigste research-arm. Kvalitet varierer (mange treff er PDF/zip):
// armen foretrekker første TABULÆRE fil og merker resten landing-page.
// Rate ~30 søk/min — én spørring per kall, godt innenfor.
import type { DatasetHit } from "./static-catalog.ts";

const MAX = 8;
const TABULAR = /\.(csv|tsv|parquet|xlsx|json)$/i;

interface ZenodoFile { key?: string; size?: number; links?: { self?: string } }
interface ZenodoRecord {
  id?: unknown;
  doi?: string;
  title?: string;
  metadata?: { title?: string; description?: string; publication_date?: string };
  files?: ZenodoFile[];
  links?: { self_html?: string; html?: string };
}

export async function zenodoSearch(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const url = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}` +
    `&type=dataset&access_status=open&size=${MAX}`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`zenodo-søk ${resp.status}`);
  const json = await resp.json() as { hits?: { hits?: ZenodoRecord[] } };
  const rows = Array.isArray(json?.hits?.hits) ? json.hits!.hits! : [];
  return rows.map((r) => {
    const meta = r.metadata ?? {};
    const title = meta.title ?? r.title ?? String(r.id ?? "");
    const landing = r.links?.self_html ?? r.links?.html ??
      (r.doi ? `https://doi.org/${r.doi}` : "");
    const tab = (r.files ?? []).find((f0) => TABULAR.test(f0.key ?? "") && f0.links?.self);
    const desc = (meta.description ?? "").replace(/<[^>]+>/g, "").slice(0, 180);
    return {
      source: "zenodo",
      id: r.doi ?? String(r.id ?? ""),
      title,
      description: desc || undefined,
      time: meta.publication_date ? meta.publication_date.slice(0, 4) : undefined,
      access: tab ? "open" as const : "landing-page" as const,
      url: tab ? tab.links!.self! : (landing || undefined),
      how_to_read: tab
        ? `Åpen ${(tab.key ?? "").split(".").pop()}-fil (${tab.size ?? "?"} B, CORS-åpen) — probe ${tab.links!.self} og les med pd.read_*; forskerdeponi: sjekk lisens/proveniens og siter DOI`
        : `Landingsside — web_fetch/probe ${landing || "record-siden"} for å finne en fil-URL; mange Zenodo-treff er PDF/zip uten tabulære data`,
    };
  }).filter((h) => h.title && h.url);
}
