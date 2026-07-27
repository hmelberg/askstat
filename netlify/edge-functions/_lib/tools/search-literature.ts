// search_literature tool: forskningslitteratur via OpenAlex (api.openalex.org).
// Nøkkelfri; `mailto` (valgfri, fra env OPENALEX_MAILTO ved kallstedet) gir
// OpenAlex' "polite pool". Formålet er FABRIKASJONSVERN for forsknings-
// syntese-svar: hvert treff bærer DOI-URL, så siteringer blir mekanisk
// verifiserbare — prompten krever at siterte studier står i et treff herfra
// (eller er web_fetch-lest), ellers merkes de «fra modellkunnskap».
import { fetchGuarded } from "../ssrf.ts";

export interface LiteratureHit {
  title: string;
  year: number | null;
  authors: string[]; // inntil 4; "m.fl." når kuttet
  doi: string | null; // full https://doi.org/…-URL (OpenAlex-formen)
  venue: string | null;
  cited_by: number;
  oa_url: string | null; // åpen fulltekst når den finnes
}

export interface LiteratureResult {
  ok: boolean;
  count: number; // totaltreff hos OpenAlex (ikke antall returnerte)
  hits: LiteratureHit[];
  note?: string;
}

export interface LiteratureDeps {
  mailto?: string;
  fetchImpl?: typeof fetch;
}

const MAX_HITS = 8;
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 10_000;
const SELECT = "doi,display_name,publication_year,authorships,cited_by_count,primary_location,open_access";

export async function searchLiterature(
  query: string,
  fromYear: number | undefined,
  deps: LiteratureDeps = {},
): Promise<LiteratureResult> {
  const q = query.trim();
  if (!q) return { ok: false, count: 0, hits: [], note: "tomt søk" };
  const u = new URL("https://api.openalex.org/works");
  u.searchParams.set("search", q);
  u.searchParams.set("per-page", String(MAX_HITS));
  u.searchParams.set("select", SELECT);
  if (fromYear && Number.isInteger(fromYear) && fromYear > 1000 && fromYear < 3000) {
    u.searchParams.set("filter", `from_publication_date:${fromYear}-01-01`);
  }
  if (deps.mailto) u.searchParams.set("mailto", deps.mailto);

  let res;
  try {
    res = await fetchGuarded(u.toString(), {
      maxBytes: MAX_BYTES,
      timeoutMs: TIMEOUT_MS,
      fetchImpl: deps.fetchImpl,
    });
  } catch (e) {
    return { ok: false, count: 0, hits: [], note: `openalex feilet: ${String(e).slice(0, 200)}` };
  }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, count: 0, hits: [], note: `HTTP ${res.status} fra OpenAlex` };
  }
  let json: { meta?: { count?: number }; results?: Record<string, unknown>[] };
  try {
    json = JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    return { ok: false, count: 0, hits: [], note: "OpenAlex-svaret kunne ikke parses" + (res.truncated ? " (trunkert)" : "") };
  }
  const hits = (json.results ?? []).map(toHit);
  return { ok: true, count: json.meta?.count ?? hits.length, hits };
}

function toHit(w: Record<string, unknown>): LiteratureHit {
  const authorships = Array.isArray(w.authorships) ? w.authorships : [];
  const names = authorships
    .map((a) => (a as { author?: { display_name?: string } })?.author?.display_name)
    .filter((n): n is string => typeof n === "string");
  const authors = names.slice(0, 4);
  if (names.length > 4) authors.push("m.fl.");
  const loc = (w.primary_location ?? {}) as { source?: { display_name?: string } };
  const oa = (w.open_access ?? {}) as { oa_url?: string };
  return {
    title: typeof w.display_name === "string" ? w.display_name : "(uten tittel)",
    year: typeof w.publication_year === "number" ? w.publication_year : null,
    authors,
    doi: typeof w.doi === "string" ? w.doi : null,
    venue: typeof loc.source?.display_name === "string" ? loc.source.display_name : null,
    cited_by: typeof w.cited_by_count === "number" ? w.cited_by_count : 0,
    oa_url: typeof oa.oa_url === "string" ? oa.oa_url : null,
  };
}
