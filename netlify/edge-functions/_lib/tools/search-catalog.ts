// search_catalog tool: per-source-type adapters over live catalog APIs.
// Adapters exist for pxweb (SSB & friends), ckan (Felles datakatalog), og
// apd (lokal, forhåndshøstet katalog — se
// docs/superpowers/specs/2026-07-25-apd-catalog-design.md). Andre tilgang-
// verdier nås via web_search + probe (prompt-regel).
import { findSource, isSearchableSource, type DataSource } from "../registry.ts";

export interface CatalogHit {
  source: string;
  id: string;
  title: string;
  period?: string;
  url: string;
}

export interface CatalogDeps {
  registry: DataSource[];
  origin: string;
  fetchImpl?: typeof fetch;
}

const MAX_HITS = 20;

export async function searchCatalog(
  sourceId: string,
  query: string,
  deps: CatalogDeps,
): Promise<CatalogHit[]> {
  const src = findSource(deps.registry, sourceId);
  if (!src) throw new Error(`ukjent kilde '${sourceId}' — bruk en id fra kilderegisteret`);
  const f = deps.fetchImpl ?? fetch;
  if (!isSearchableSource(src)) {
    throw new Error(`kilden '${sourceId}' er ikke søkbar — bruk web_search + probe i stedet`);
  }
  switch (src.tilgang) {
    case "pxweb": return pxwebSearch(src, query, f);
    case "ckan": return fdkSearch(src, query, f);
    default:
      if (src.kind === "apd") return apdSearch(query, deps.origin, f);
      throw new Error(`ingen søkeadapter for tilgang='${src.tilgang}' (kilde '${sourceId}') — bruk web_search + probe`);
  }
}

async function pxwebSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const url = src.sok_endepunkt!.replace("{q}", encodeURIComponent(query));
  const res = await f(url);
  if (!res.ok) throw new Error(`katalogsøk mot ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const tables = Array.isArray(json?.tables) ? json.tables : [];
  return tables.slice(0, MAX_HITS).map((t: Record<string, unknown>) => ({
    source: src.id,
    id: String(t.id ?? ""),
    title: String(t.label ?? ""),
    period: t.firstPeriod ? `${t.firstPeriod}–${t.lastPeriod ?? ""}` : undefined,
    url: new URL(`tables/${t.id}`, src.base_url).toString(),
  }));
}

async function fdkSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  // Live API quirk (verified 2026-07-03): the query param is "q" (not "query"),
  // and without filters.type the search spans concepts/informationmodels/services
  // too — restrict to datasets or hits are dominated by CONCEPT entries.
  const res = await f(src.sok_endepunkt!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: query, filters: { type: { value: "datasets" } } }),
  });
  if (!res.ok) throw new Error(`katalogsøk mot ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  return hits.slice(0, MAX_HITS).map((h: Record<string, unknown>) => {
    const title = h.title as Record<string, string> | string | undefined;
    return {
      source: src.id,
      id: String(h.id ?? ""),
      title: typeof title === "object" ? (title?.nb ?? Object.values(title ?? {})[0] ?? "") : String(title ?? ""),
      url: String(h.uri ?? ""),
    };
  });
}

interface ApdCatalogEntry {
  identifier: string;
  name: string;
  description: string;
  url: string;
  keywords: string[];
  category: string;
}

let _apdCache: ApdCatalogEntry[] | null = null;
export function clearApdCatalogCache(): void { _apdCache = null; }

async function loadApdCatalog(origin: string, f: typeof fetch): Promise<ApdCatalogEntry[]> {
  if (_apdCache) return _apdCache;
  const res = await f(new URL("/data/apd-catalog.json", origin).toString());
  if (!res.ok) throw new Error(`kunne ikke hente apd-katalog: HTTP ${res.status}`);
  _apdCache = await res.json() as ApdCatalogEntry[];
  return _apdCache;
}

async function apdSearch(query: string, origin: string, f: typeof fetch): Promise<CatalogHit[]> {
  const catalog = await loadApdCatalog(origin, f);
  const q = query.toLowerCase();
  const hits = catalog.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.category.toLowerCase().includes(q) ||
    e.keywords.some((k) => k.toLowerCase().includes(q))
  );
  return hits.slice(0, MAX_HITS).map((e) => ({
    source: "apd",
    id: e.identifier,
    title: e.name,
    url: e.url,
  }));
}
