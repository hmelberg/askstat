// Generisk NADA-adapter (spec 2026-08-06-mikrodata-oppdagelse §B): samme
// API kjører hos World Bank, IHSN, FAO og ~130 nasjonale kataloger
// (data/nada-catalog.json). Søk + variabelordbok er åpne og nøkkelfrie;
// DATAFILENE er login-gated i praksis — metadata er aldri data (E17).
import type { DataSource } from "../../registry.ts";
import type { CatalogHit } from "../search-catalog.ts";
import type { TableMeta, TableVariable } from "../table-metadata.ts";

const MAX_SEARCH = 15;
const MAX_VARS = 60;

// FAO-formen serverer tall som strenger ("found":"649") — tåles her.
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

interface NadaRow {
  idno?: string; id?: unknown; title?: string; nation?: string;
  year_start?: unknown; year_end?: unknown; url?: string; form_model?: string;
}

export async function nadaSearch(
  src: DataSource,
  query: string,
  f: typeof fetch = fetch,
): Promise<CatalogHit[]> {
  const url = new URL("catalog/search", src.base_url);
  url.searchParams.set("sk", query);
  url.searchParams.set("ps", String(MAX_SEARCH));
  url.searchParams.set("format", "json");
  const res = await f(url.toString());
  if (!res.ok) throw new Error(`nada-søk mot ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json() as { result?: { rows?: NadaRow[] } };
  const rows = Array.isArray(json?.result?.rows) ? json.result!.rows! : [];
  return rows.slice(0, MAX_SEARCH).map((r) => {
    const y0 = num(r.year_start), y1 = num(r.year_end);
    const nation = (r.nation ?? "").trim();
    const extra = [nation, y0 ? `${y0}${y1 && y1 !== y0 ? `–${y1}` : ""}` : ""]
      .filter(Boolean).join(" ");
    return {
      source: src.id,
      id: String(r.idno ?? r.id ?? ""),
      title: `${(r.title ?? "").trim()}${extra ? ` (${extra})` : ""}`,
      period: y0 ? `${y0}–${y1 ?? ""}` : undefined,
      url: String(r.url ?? ""),
    };
  }).filter((h) => h.id && h.title);
}

interface NadaVariable { vid?: string; name?: string; labl?: string; }

export async function nadaMetadata(
  src: DataSource,
  idno: string,
  f: typeof fetch = fetch,
  find?: string,
): Promise<TableMeta> {
  // Metadata-endepunktene krever IDNO-strengen (numerisk id gir NOT-FOUND).
  const encId = encodeURIComponent(idno);
  const studyRes = await f(new URL(`catalog/${encId}?format=json`, src.base_url).toString());
  if (!studyRes.ok) throw new Error(`nada-metadata for ${idno} hos ${src.id} feilet: HTTP ${studyRes.status} — bruk IDNO-strengen fra søketreffet, ikke numerisk id`);
  const study = (await studyRes.json() as { dataset?: Record<string, unknown> }).dataset ?? {};

  let all: NadaVariable[] = [];
  const varsRes = await f(new URL(`catalog/${encId}/variables`, src.base_url).toString());
  if (varsRes.ok) {
    const vj = await varsRes.json() as { variables?: NadaVariable[] };
    if (Array.isArray(vj?.variables)) all = vj.variables;
  } // variabelordbok mangler for rene metadata-pekere (remote-studier) — ikke en feil

  const needle = (find ?? "").trim().toLowerCase();
  const filtered = needle
    ? all.filter((v) =>
      String(v.name ?? "").toLowerCase().includes(needle) ||
      String(v.labl ?? "").toLowerCase().includes(needle))
    : all;
  const variables: TableVariable[] = filtered.slice(0, MAX_VARS).map((v) => ({
    code: String(v.name ?? v.vid ?? ""),
    label: String(v.labl ?? ""),
    time: false,
    values: [],
    valuesTruncated: false,
  }));

  const tilgang = String(study.data_access_type ?? "") ||
    String((study as Record<string, unknown>).form_model ?? "");
  return {
    source: src.id,
    id: idno,
    title: String(study.title ?? idno),
    variables,
    variabler_totalt: all.length,
    variabler_vist: variables.length,
    datatilgang: tilgang || undefined,
    merknad:
      `Variabelordbok (${all.length} variabler${needle ? `, find-filtrert til ${filtered.length}` : ""}); ` +
      `verdietiketter + spørsmålstekst per variabel: proxy-formen mot ${src.base_url}catalog/${encId}/variables/{vid}. ` +
      `DATAFILENE er som regel login-gated hos utgiveren — metadata er ikke data: bygg ALDRI tallsvar herfra uten probe-✅ på en faktisk fil-URL.`,
  };
}
