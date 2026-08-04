import type { DatasetHit } from "./static-catalog.ts";

// Responsform verifisert mot docs.datacommons.org/api/rest/v2/resolve
// (Task 6 Step 1, 2026-08-04 — INGEN live DATACOMMONS_API_KEY tilgjengelig
// ennå, se task-6-report.md for kilde-sitat). Adapteren er bygget mot den
// DOKUMENTERTE formen; live-verifisering med ekte nøkkel er UTESTÅENDE
// (Task 11):
//   GET https://api.datacommons.org/v2/resolve
//       ?key=<nøkkel>&nodes=<fritekst>&resolver=indicator
//   → { entities: [{ node, candidates: [
//         { dcid, metadata: { score: "0.xxxx", sentence? }, typeOf?: string[] }
//       ] }] }
// resolver=indicator er nødvendig for å få StatisticalVariable-kandidater
// (default-resolveren "place" gir stedstreff, ikke variabler).
// OBS: score er en STRENG i den dokumenterte responsen (ikke et tall) —
// parseFloat før terskelsammenligning.
const RESOLVE = "https://api.datacommons.org/v2/resolve";
const MAX = 5;

// Workbench-målt 2026-08-02 (Task 5-forarbeid, se plan-loggen): et ekte treff
// scorer 0,9999+, temadrift (feil emne — f.eks. tobakk for cannabis) scorer
// rundt 0,755. Terskelen ligger MELLOM disse med god margin. Under terskelen:
// returner INGENTING — en stille tom liste slår et feil treff, fordi modellen
// ellers ikke har noen måte å oppdage at treffet er søppel (se how_to_read-
// dekningssjekk-kontrakten i samme fil for det ANDRE laget av samme vern).
export const DC_SCORE_THRESHOLD = 0.9;

interface DcCandidate {
  dcid: string;
  metadata?: { score?: string; sentence?: string };
  typeOf?: string[];
}
interface DcEntity {
  node?: string;
  candidates?: DcCandidate[];
}
interface DcResolveResponse {
  entities?: DcEntity[];
}

export async function dcSearch(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const url = `${RESOLVE}?key=${encodeURIComponent(apiKey)}&nodes=${encodeURIComponent(query)}&resolver=indicator`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`datacommons resolve ${resp.status}`);
  const json = await resp.json() as DcResolveResponse;
  const candidates = (json.entities ?? []).flatMap((e) => e.candidates ?? []);
  const scored = candidates
    .map((c) => ({ c, score: parseFloat(c.metadata?.score ?? "0") }))
    .filter(({ score }) => score >= DC_SCORE_THRESHOLD)
    .slice(0, MAX);
  return scored.map(({ c, score }) => ({
    source: "datacommons",
    id: c.dcid,
    title: c.metadata?.sentence ?? c.dcid,
    description: `score ${score.toFixed(4)}${c.typeOf?.length ? ` — ${c.typeOf.join(", ")}` : ""}`,
    access: "open",
    // Kontrakt (Task 6 Step 3, brief): dekningssjekk FØR lasting — søketreff
    // (et resolve-treff på dcid) er IKKE det samme som at det finnes
    // observasjoner for geografien man faktisk vil ha. table_metadata må
    // kalles FØRST; landkoden fylles inn av modellen (placeholder her).
    how_to_read:
      `table_metadata('datacommons', '${c.dcid}', find='<landkode>') → ` +
      `SJEKK DEKNING for geografien FØR bruk (søketreff ≠ observasjoner) → ` +
      `# x = datacommons.read("${c.dcid}", countries=["NOR"])`,
  }));
}
