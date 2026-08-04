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

// Responsform verifisert mot docs.datacommons.org/api/rest/v2/observation
// (Task 7 Step 1, 2026-08-04 — samme situasjon som Task 6: INGEN live
// DATACOMMONS_API_KEY tilgjengelig ennå, kun WebFetch mot dokumentasjonen).
// Adapteren er bygget mot den DOKUMENTERTE formen; live-verifisering med
// ekte nøkkel er UTESTÅENDE (Task 11):
//   GET https://api.datacommons.org/v2/observation
//       ?key=<nøkkel>&variable.dcids=<dcid>&entity.dcids=<entity>
//       &date=LATEST&select=entity&select=variable&select=date&select=value&select=facet
//   → {
//       byVariable: { <dcid>: { byEntity: { <entity>: { orderedFacets: [
//         { facetId, earliestDate, latestDate, obsCount, observations: [{date, value}] }
//       ] } } } },
//       facets: { <facetId>: { importName, provenanceUrl, measurementMethod?,
//                               observationPeriod?, unit?, isDcAggregate? } }
//     }
// Nøkkelinnsikt for dette verktøyet: samme dcid kan ha FLERE fasetter
// (ulike primærkilder — f.eks. Verdensbanken og OECD for samme
// StatisticalVariable) med ulike tall. Verktøyet velger ALDRI stille
// mellom dem — begge listes eksplisitt med kilde, slik at valget forblir
// hos modellen/brukeren (se dcSearch.how_to_read over: "SJEKK DEKNING …
// FØR bruk").
const OBSERVATION = "https://api.datacommons.org/v2/observation";

interface DcObservationValue { date?: string; value?: unknown }
interface DcOrderedFacet {
  facetId?: string;
  earliestDate?: string;
  latestDate?: string;
  obsCount?: number;
  observations?: DcObservationValue[];
}
interface DcFacetMeta {
  importName?: string;
  provenanceUrl?: string;
  measurementMethod?: string;
  observationPeriod?: string;
  unit?: string;
  isDcAggregate?: string;
}
interface DcObservationResponse {
  byVariable?: Record<string, { byEntity?: Record<string, { orderedFacets?: DcOrderedFacet[] }> }>;
  facets?: Record<string, DcFacetMeta>;
}

/** Tolker find som en ISO2/ISO3-landkode → "country/<KODE>" (uppercased,
 *  ingen ISO2→ISO3-konvertering — Data Commons' EGNE landnoder er ISO3-
 *  baserte, så en ISO2-kode kan i praksis gi treff uten dekning; det
 *  fanges av "INGEN observasjoner"-veien under, ikke av denne funksjonen). */
function entityFromFind(find: string): string {
  return `country/${find.trim().toUpperCase()}`;
}

// table_metadata('datacommons', <dcid>, {find}) → dekningssjekk. Egen
// returform (IKKE TableMeta-skjemaet med variables/queryUrlTemplate — samme
// mønster som worldbankMetadata/dbnomicsMetadata: kalleren (table-
// metadata.ts) caster via TableMetas indekssignatur).
export async function dcCoverage(
  dcid: string,
  apiKey: string,
  find: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const kode = (find ?? "").trim();
  if (!kode) {
    return {
      source: "datacommons",
      id: dcid,
      dekning: [],
      råd: "angi find=<landkode> (ISO2/ISO3, f.eks. 'NOR') for å sjekke dekning før lasting",
    };
  }
  const entity = entityFromFind(kode);
  const params = new URLSearchParams({
    key: apiKey,
    "variable.dcids": dcid,
    "entity.dcids": entity,
    date: "LATEST",
  });
  for (const s of ["entity", "variable", "date", "value", "facet"]) params.append("select", s);
  const resp = await fetchImpl(`${OBSERVATION}?${params.toString()}`);
  if (!resp.ok) throw new Error(`datacommons observation ${resp.status} for ${dcid}/${entity}`);
  const json = await resp.json() as DcObservationResponse;
  const facetsMeta = json.facets ?? {};
  const orderedFacets = json.byVariable?.[dcid]?.byEntity?.[entity]?.orderedFacets ?? [];

  // Den målte 0,9999997-uten-data-fellen (Task 6-forarbeid): et resolve-
  // søketreff med nesten perfekt score kan likevel vise seg å ha NULL
  // observasjoner for geografien man faktisk vil ha (variabelen finnes,
  // men ikke for dette landet). Stillhet her ville sendt modellen videre
  // til datacommons.read() på en variabel uten data — rådet må derfor
  // være vanskelig å overse.
  if (!orderedFacets.length) {
    return {
      source: "datacommons",
      id: dcid,
      dekning: [],
      råd: `INGEN observasjoner for ${entity} — velg en annen variabel (eller sjekk at landkoden er riktig)`,
    };
  }

  const fasetter = orderedFacets.map((f) => {
    const meta = facetsMeta[f.facetId ?? ""] ?? {};
    return { kilde: meta.importName ?? f.facetId ?? "ukjent kilde", enhet: meta.unit };
  });
  const datoer = orderedFacets
    .map((f) => f.latestDate)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort();
  const sisteDato = datoer.length ? datoer[datoer.length - 1] : null;

  return {
    source: "datacommons",
    id: dcid,
    dekning: [{
      entity,
      siste_dato: sisteDato,
      antall_fasetter: orderedFacets.length,
      fasetter,
    }],
    råd: orderedFacets.length > 1
      ? `${orderedFacets.length} fasetter (kilder) for ${entity} — velg én eksplisitt ved lasting, ikke anta at de er like`
      : `1 fasett for ${entity} — klar til lasting`,
  };
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
    // typeOf-filter (fix-runde 2, live-verifisert 2026-08-04): resolver=
    // indicator er ment å gi StatisticalVariable-treff (se kommentaren over),
    // men live-svar inneholder OGSÅ Topic-noder (dc/topic/UnemploymentRate…)
    // blant kandidatene — disse er IKKE lastbare med datacommons.read()
    // (ingen observasjoner, andre dcid-form). Behold KUN kandidater der
    // typeOf inkluderer "StatisticalVariable"; kandidater UTEN typeOf-felt
    // beholdes (konservativt — vi vet ikke at de IKKE er variabler, og
    // dekningssjekken i table_metadata fanger opp resten uansett).
    .filter(({ c }) => !c.typeOf || c.typeOf.includes("StatisticalVariable"))
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
