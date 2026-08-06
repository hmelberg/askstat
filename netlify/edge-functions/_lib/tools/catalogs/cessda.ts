// CESSDA Data Catalogue (spec 2026-08-06-mikrodata-oppdagelse §C):
// 40k+ europeiske samfunnsvitenskapelige studier (inkl. Sikt/NSD),
// nøkkelfri + CORS-åpen. Studienivå-metadata + landingssider — data
// hentes hos arkivet (ofte gratis registrering). Metadata er aldri data.
import type { DatasetHit } from "./static-catalog.ts";

const BASE = "https://datacatalogue.cessda.eu/api/DataSets/v2/search";
const MAX_ARM = 8;

interface CessdaResult {
  id?: string;
  titleStudy?: string;
  abstract?: string;
  studyUrl?: string;
  publisher?: { publisher?: string } | string;
  studyAreaCountries?: { country?: string; searchField?: string }[];
  dataCollectionYear?: number;
  // Live-form 2026-08-06: startdato-feltet heter dataCollectionPeriodStartdate.
  dataCollectionPeriodStartdate?: string;
  // Live-form 2026-08-06: pid er ofte FULL URL ("https://doi.org/10.…"),
  // ikke naken DOI — landing bygges derfra når studyUrl mangler.
  pidStudies?: { pid?: string }[];
  dataAccess?: string;
}

export async function cessdaSearch(
  query: string,
  fetchImpl: typeof fetch = fetch,
  limit: number = MAX_ARM,
): Promise<DatasetHit[]> {
  const url = `${BASE}?q=${encodeURIComponent(query)}&limit=${limit}&metadataLanguage=en`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`cessda-søk ${resp.status}`);
  const json = await resp.json() as { Results?: CessdaResult[] };
  const rows = Array.isArray(json?.Results) ? json.Results : [];
  return rows.slice(0, limit).map((r) => {
    const pid = r.pidStudies?.map((p) => p.pid).find(Boolean);
    const land = (r.studyAreaCountries ?? [])
      .map((c) => c.country ?? c.searchField).filter(Boolean).slice(0, 4).join(", ");
    const publisher = typeof r.publisher === "object" ? r.publisher?.publisher : r.publisher;
    const year = r.dataCollectionYear ??
      (r.dataCollectionPeriodStartdate ? r.dataCollectionPeriodStartdate.slice(0, 4) : undefined);
    const landing = r.studyUrl ||
      (pid?.startsWith("http") ? pid : pid?.startsWith("10.") ? `https://doi.org/${pid}` : "");
    const tilgang = (r.dataAccess ?? "").trim();
    return {
      source: "cessda",
      id: pid ? pid.replace(/^https?:\/\/doi\.org\//, "") : String(r.id ?? ""),
      title: r.titleStudy ?? String(r.id ?? ""),
      description: [publisher, (r.abstract ?? "").replace(/<[^>]+>/g, "").slice(0, 180)]
        .filter(Boolean).join(" — ") || undefined,
      time: year ? String(year) : undefined,
      geo: land || undefined,
      access: "landing-page" as const,
      url: landing || undefined,
      how_to_read:
        `Studiebeskrivelse (DDI) — data hos arkivet${tilgang ? ` (tilgang: ${tilgang})` : ""}, ` +
        `ofte gratis registrering: web_fetch/probe ${landing || "landingssiden"} for fil-URL og kodebok; ` +
        `metadata er ikke data — probe-✅ kreves før tallsvar`,
    };
  }).filter((h) => h.title);
}
