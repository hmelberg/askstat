// table_metadata tool: variable-level lookup for a catalog hit, so the model
// can build a MINIMAL query URL (spec: build datasets from variables).
import { findSource, SDMX_STRUCTURE_ACCEPT, SDMX_XML_SOURCES, type DataSource } from "../registry.ts";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";
import { worldbankMetadata } from "./catalogs/worldbank.ts";
import { dbnomicsMetadata } from "./catalogs/dbnomics.ts";
import { dcCoverage } from "./catalogs/datacommons.ts";

export interface TableVariable {
  code: string;
  label: string;
  time: boolean;
  values: { code: string; label: string }[];
  valuesTruncated: boolean;
  // pxweb: fra extension.elimination === false (obligatorisk valg ved
  // filtrert spørring — SSB 400-er ellers, målt 2026-07-31). Utelates for
  // adaptere der metadataene ikke bærer informasjonen — aldri gjett.
  mandatory?: boolean;
  // sdmx: true når verdilisten er filtrert til koder som FAKTISK har data i
  // kuben (availableconstraint) — se sdmxAvailability. Utelates ellers.
  kun_befolkede?: boolean;
}

export interface TableMeta {
  source: string;
  id: string;
  title: string;
  variables: TableVariable[];
  queryUrlTemplate?: string;
  // sdmx: satt når availability-berikelsen lyktes — forklarer modellen at
  // verdilistene alt er dekningsfiltrert (målt 2026-08-04: uten dette valgte
  // modellen gyldige-men-tomme kodekombinasjoner og brant kjøringer).
  tilgjengelighet?: string;
  // worldbank/dbnomics-adapterne (Task 5) returnerer en frittstående
  // Record<string, unknown> — ikke det variabel/kode-formede TableMeta-skjemaet
  // (de har ingen dimensjons-katalog å hente). Indekssignaturen gjør TableMeta
  // strukturelt kompatibel med Record<string, unknown> UTEN å svekke typingen
  // av de faste feltene over for de registerbaserte adapterne.
  [key: string]: unknown;
}

const MAX_VALUES = 40;

// find-filter (delstreng i kode ELLER etikett, case-insensitivt) — men KUN
// når hele listen er lengre enn MAX_VALUES. Korte lister (typisk
// obligatoriske dimensjoner som ContentsCode, som gjerne bare har noen få
// koder) returneres derfor KOMPLETTE selv når find er satt: ett
// table_metadata(find="Oslo")-kall gir dermed BÅDE regiontreffet OG de
// fullstendige kodelistene for korte, obligatoriske dimensjoner — uten et
// eget oppfølgingskall (spec 2026-07-31-ssb-mandatory-variabler task 5,
// sluttreview: find skal aldri tømme en mandatory-dimensjon appen uansett
// må ha et valg for). Trunkeringen skjer hos oss, hele listen er i minnet;
// valuesTruncated reflekterer listen ETTER (evt.) filtrering.
export function pickValues(
  all: { code: string; label: string }[],
  find?: string,
): { values: { code: string; label: string }[]; valuesTruncated: boolean } {
  const needle = (find ?? "").trim().toLowerCase();
  const filtered = needle && all.length > MAX_VALUES
    ? all.filter((v) =>
      v.code.toLowerCase().includes(needle) || v.label.toLowerCase().includes(needle))
    : all;
  return { values: filtered.slice(0, MAX_VALUES), valuesTruncated: filtered.length > MAX_VALUES };
}

export async function tableMetadata(
  sourceId: string,
  tableId: string,
  deps: { registry: DataSource[]; fetchImpl?: typeof fetch; find?: string },
): Promise<TableMeta> {
  const f = deps.fetchImpl ?? fetch;
  // Data Commons HAR en oppføring i data-sources.json (Task 8) — denne
  // grenen dispatcher likevel FORTSATT på sourceId FØR registeroppslaget,
  // bevisst, ikke et hull: dcCoverage() returnerer en EGEN returform
  // (dekning/råd, ikke TableMeta-skjemaet med variables/queryUrlTemplate —
  // samme mønster som worldbankMetadata/dbnomicsMetadata under), og
  // DATACOMMONS_API_KEY-sjekken hører hjemme her, ikke i
  // findSource/registry.ts. Rekkefølgen gjør også table_metadata brukbart
  // for 'datacommons' uavhengig av om søkearmen (dcSearch, Task 6) er aktiv
  // i akkurat dette miljøet (den er selv env-gated, se hints-parse.test.ts).
  if (sourceId === "datacommons") {
    const apiKey = Deno.env.get("DATACOMMONS_API_KEY");
    if (!apiKey) throw new Error("datacommons krever site-nøkkel — sett DATACOMMONS_API_KEY");
    return dcCoverage(tableId, apiKey, deps.find, f) as unknown as Promise<TableMeta>;
  }
  const src = findSource(deps.registry, sourceId);
  if (!src) throw new Error(`ukjent kilde '${sourceId}'`);
  switch (src.tilgang) {
    case "pxweb": return pxwebMetadata(src, tableId, f, deps.find);
    case "sdmx": return sdmxMetadata(src, tableId, f, deps.find);
    default:
      switch (src.kind) {
        case "fhi": return fhiMetadata(src, tableId, f, deps.find);
        case "dst": return dstMetadata(src, tableId, f, deps.find);
        case "statfin": return statfinMetadata(src, tableId, f, deps.find);
        // worldbank/dbnomics har et annet metadata-skjema (ingen
        // dimensjonsliste) — TableMetas indekssignatur gjør castet trygt.
        case "worldbank": return worldbankMetadata(tableId, f) as unknown as Promise<TableMeta>;
        // find= gjelder også her: dbnomics-dimensjoner kan ha hundrevis av
        // verdier (weo-country: 196), og uten søk faller landkoden utenfor
        // taket — da kan modellen ikke bygge filters= (målt live 2026-08-01).
        case "dbnomics": return dbnomicsMetadata(tableId, f, deps.find) as unknown as Promise<TableMeta>;
        // eurostat: tilgang="rest" (IKKE "sdmx" — se registeret), men
        // strukturen bak base_url ER SDMX 2.1 XML (målt 2026-08-04, se
        // eurostatMetadata under). Egen gren, ikke sdmxMetadata/ecbMetadata,
        // fordi verken SDMX_STRUCTURE_ACCEPT (JSON) eller SDMX_XML_SOURCES
        // (ECBs mes:/str:-navnerom) passer — Eurostat har EGNE
        // navnerom-prefikser (m:/s:/c:) og en annen references-verdi
        // (descendants, ikke all — se kommentaren i eurostatMetadata).
        case "eurostat": return eurostatMetadata(src, tableId, f, deps.find);
        default:
          throw new Error(
            `table_metadata støtter ikke '${sourceId}' ennå — bruk probe på data-URL-en for å se kolonner`,
          );
      }
  }
}

async function pxwebMetadata(src: DataSource, tableId: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const url = new URL(`tables/${tableId}/metadata?lang=no`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`metadata for ${src.id}/${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json();

  const dims = (json?.dimension ?? {}) as Record<string, {
    label?: string;
    category?: { index?: Record<string, number>; label?: Record<string, string> };
    extension?: { elimination?: boolean };
  }>;
  const timeDims = new Set<string>((json?.role?.time ?? []) as string[]);
  const variables: TableVariable[] = Object.entries(dims).map(([code, d]) => {
    const labels = d.category?.label ?? {};
    const codes = Object.keys(d.category?.index ?? labels);
    const allValues = codes.map((c) => ({ code: c, label: labels[c] ?? c }));
    const { values, valuesTruncated } = pickValues(allValues, find);
    const elim = d.extension?.elimination;
    // fallback når feltet mangler: ContentsCode + tidsdimensjonen er
    // aldri eliminerbare (janbrus: «never eliminable»)
    const mandatory = elim !== undefined
      ? elim === false
      : (code === "ContentsCode" || timeDims.has(code));
    return {
      code,
      label: d.label ?? code,
      time: timeDims.has(code),
      values,
      valuesTruncated,
      mandatory,
    };
  });

  return {
    source: src.id,
    id: tableId,
    title: String(json?.label ?? tableId),
    variables,
    queryUrlTemplate: src.sporrings_url_mal?.replace("{id}", tableId),
  };
}

interface FhiDimensionCategory { label: string; value: string; }
interface FhiDimension { code: string; label: string; categories: FhiDimensionCategory[]; }

async function fhiMetadata(src: DataSource, tableId: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  // tableId kommer som "<register>/<tallId>" fra fhiSearch (search-catalog.ts)
  const [register, id] = tableId.split("/");
  if (!register || !id) throw new Error(`fhi table_id må være '<register>/<tallId>', fikk '${tableId}'`);
  const url = new URL(`${register}/table/${id}/dimension`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`fhi metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { dimensions?: FhiDimension[] };
  const dims = json.dimensions ?? [];
  const variables: TableVariable[] = dims.map((d) => {
    const allValues = d.categories.map((c) => ({ code: c.value, label: c.label }));
    const { values, valuesTruncated } = pickValues(allValues, find);
    return {
      code: d.code,
      label: d.label,
      time: false, // FHI gir ikke et pålitelig tids-signal (se spec §3) — ærlig forenkling
      values,
      valuesTruncated,
    };
  });
  return { source: src.id, id: tableId, title: tableId, variables };
}

interface DstVariableValue { id: string; text: string; }
interface DstVariable { id: string; text: string; time?: boolean; values: DstVariableValue[]; }

async function dstMetadata(src: DataSource, tableId: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const url = new URL(`tableinfo/${tableId}?format=JSON`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`dst metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { text?: string; variables?: DstVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => {
    const allValues = v.values.map((c) => ({ code: c.id, label: c.text }));
    const { values, valuesTruncated } = pickValues(allValues, find);
    return {
      code: v.id,
      label: v.text,
      time: !!v.time,
      values,
      valuesTruncated,
    };
  });
  return { source: src.id, id: tableId, title: json.text ?? tableId, variables };
}

interface StatfinVariable { code: string; text: string; values: string[]; valueTexts?: string[]; time?: boolean; }

async function statfinMetadata(src: DataSource, tableId: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const url = new URL(tableId, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`statfin metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { title?: string; variables?: StatfinVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => {
    const codes = v.values ?? [];
    const labels = v.valueTexts ?? codes;
    const allValues = codes.map((c, i) => ({ code: c, label: labels[i] ?? c }));
    const { values, valuesTruncated } = pickValues(allValues, find);
    return {
      code: v.code,
      label: v.text,
      time: !!v.time,
      values,
      valuesTruncated,
    };
  });
  return { source: src.id, id: tableId, title: json.title ?? tableId, variables };
}

function sdmxCodelistIdFromUrn(urn: string): string | null {
  const m = urn.match(/Codelist=[^:]+:([^(]+)\(/);
  return m ? m[1] : null;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// Fix-runde 1 (code review 2026-08-04): fast-xml-parser sin DEFAULT
// (parseTagValue:true) tallkonverterer ELEMENT-TEKST — <c:Value>01011000</c:Value>
// blir tallet 1011000 (LEDENDE NULL MISTET, ikke bare "streng vs tall").
// Målt direkte: parseTagValue:true → [1011000, 2020, "TOTAL"] (typeof
// number, number, string); parseTagValue:false → ["01011000","2020","TOTAL"]
// (alle strenger, byte-like). Et String(v)-plaster ETTERPÅ er IKKE nok —
// skaden (tapt ledende null) er allerede gjort før String() ser verdien;
// CN8/PRODCOM/kommune-kode-aktige koder ville korrumpert stille. Egen
// parser-instans BRUKES KUN for contentconstraint-dokumentet (eurostatAvailability
// under) — der er <c:Value>-ELEMENTTEKST selve datamodellen (kodeverdiene
// vi matcher mot). DSD/kodeliste-parsingen (delt xmlParser over, brukt av
// eurostatMetadata/ecbMetadata/sdmxMetadata) trenger IKKE samme fiks: koden
// (TableVariable.code, det feltet spørringer bygges fra) leser vi ALLTID fra
// <s:Code id="…">-ATTRIBUTTET, aldri elementteksten — og attributt-parsing
// er default parseAttributeValue:false (streng uendret) i BEGGE
// parser-instansene. <c:Name>-elementteksten (menneskelesbar LABEL, ikke
// kode) kunne i prinsippet tallkonverteres på samme vis, men xmlText()
// returnerer "" for en ren number (ikke streng, ikke {#text}-objekt) —
// utfallet blir da label-fallback til koden selv (`|| String(c.id ?? "")`),
// IKKE en korrumpert kode. Ufarlig kosmetisk degradering, ikke datafeil —
// derfor ingen ccXmlParser-lignende fiks nødvendig på DSD-siden.
const ccXmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: false });

function xmlText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// Eurostats <c:Name xml:lang="…"> gjentas PER SPRÅK på samme element (en/de/fr
// målt 2026-08-04 på s:Code-nivå) — fast-xml-parser gir da en ARRAY, ikke ett
// objekt slik ECB-fixturen (kun ett språk) lot xmlText() anta. Plukker "en",
// faller ellers tilbake til første oppføring (eller ren streng/tekst-node).
function xmlName(v: unknown, lang = "en"): string {
  if (v == null) return "";
  const arr = Array.isArray(v) ? v : [v];
  const match = arr.find((n) =>
    n && typeof n === "object" && (n as Record<string, unknown>)["xml:lang"] === lang);
  return xmlText(match ?? arr[0]);
}

// availableconstraint (SDMX 2.1): hvilke koder som FAKTISK er befolket i
// kuben — kodelistene alene lyver ved gyldige-men-tomme kombinasjoner (målt
// 2026-08-04 mot OECD DF_IALFS_UNE_M: CL_MEASURE hadde UNE_LF+UNE_LF_M, kun
// UNE_LF_M befolket; «ADJUSTMENT-koden NOR» fantes ikke). Best effort: alle
// feil → null, metadataene leveres ufiltrert som før.
async function sdmxAvailability(
  src: DataSource,
  agencyID: string,
  dataflowId: string,
  f: typeof fetch,
  accept: string,
): Promise<Map<string, Set<string>> | null> {
  try {
    const url = `${src.base_url.replace(/data\/$/, "")}availableconstraint/${agencyID},${dataflowId}`;
    const res = await f(url, { headers: { Accept: accept, "Accept-Language": "en" } });
    if (!res.ok) return null;
    const json = await res.json();
    const kv = json?.data?.contentConstraints?.[0]?.cubeRegions?.[0]?.keyValues;
    if (!Array.isArray(kv) || !kv.length) return null;
    const ut = new Map<string, Set<string>>();
    for (const k of kv as { id?: string; values?: unknown[] }[]) {
      if (typeof k.id === "string" && Array.isArray(k.values) && k.values.length) {
        ut.set(k.id, new Set(k.values.map(String)));
      }
    }
    return ut.size ? ut : null;
  } catch {
    return null;
  }
}

async function sdmxMetadata(src: DataSource, dataflowKey: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) {
    if (SDMX_XML_SOURCES.has(src.id)) return ecbMetadata(src, dataflowKey, f, find);
    throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  }
  // Komma-form er kanonisk (flowRef-en read() tar); slash-form godtas fortsatt
  // for gamle treff/modell-hukommelse. Ev. versjonsledd (NB,EXR,1.0) ignoreres
  // — strukturspørringen bruker /latest uansett.
  const [agencyID, dataflowId] = dataflowKey.split(/[,/]/);
  if (!agencyID || !dataflowId) throw new Error(`sdmx table_id må være '<agencyID>,<dataflowId>', fikk '${dataflowKey}'`);
  const url = `${src.base_url.replace(/data\/$/, "")}dataflow/${agencyID}/${dataflowId}/latest?references=all`;
  // Verifisert 2026-07-25 (live smoke-test, oppdaget FØR push): OECDs
  // ?references=all svarer 500 "languageTag1" på Denos fetch UTEN en
  // eksplisitt Accept-Language — curl sender én implisitt og feilen var
  // usynlig under research-fasen. Sendes alltid (harmløst for norgesbank).
  const res = await f(url, { headers: { Accept: accept, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`sdmx metadata for ${dataflowKey} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const dsd = json?.data?.dataStructures?.[0];
  if (!dsd) throw new Error(`fant ingen datastruktur for ${dataflowKey}`);
  const codelists = (json?.data?.codelists ?? []) as Record<string, unknown>[];
  const dimList = dsd.dataStructureComponents?.dimensionList ?? {};
  const plainDims = (dimList.dimensions ?? []) as Record<string, unknown>[];
  const timeDims = (dimList.timeDimensions ?? []) as Record<string, unknown>[];

  const codesFor = (d: Record<string, unknown>) => {
    const enumUrn = String((d.localRepresentation as Record<string, unknown> | undefined)?.enumeration ?? "");
    const clId = sdmxCodelistIdFromUrn(enumUrn);
    const cl = codelists.find((c) => c.id === clId);
    return (cl?.codes as Record<string, unknown>[] | undefined) ?? [];
  };

  const befolket = await sdmxAvailability(src, agencyID, dataflowId, f, accept);

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const dimId = String(d.id ?? "");
      const codes = codesFor(d);
      let allValues = codes.map((c) => ({ code: String(c.id ?? ""), label: String(c.name ?? c.id ?? "") }));
      const bef = befolket?.get(dimId);
      const filtrert = !!bef && allValues.some((v) => bef.has(v.code));
      if (filtrert) allValues = allValues.filter((v) => bef!.has(v.code));
      const { values, valuesTruncated } = pickValues(allValues, find);
      const ut: TableVariable = {
        code: dimId,
        label: dimId, // ingen egen "name" utover concept-referansen — koden ER labelen
        time: false,
        values,
        valuesTruncated,
      };
      if (filtrert) ut.kun_befolkede = true;
      return ut;
    }),
    ...timeDims.map((d) => ({
      code: String(d.id ?? ""),
      label: String(d.id ?? ""),
      time: true,
      values: [] as { code: string; label: string }[],
      valuesTruncated: false,
    })),
  ];
  const meta: TableMeta = { source: src.id, id: dataflowKey, title: String(dsd.name ?? dataflowKey), variables };
  if (befolket) {
    meta.tilgjengelighet = "verdilistene er filtrert til koder som FAKTISK har data i denne kuben " +
      "(availableconstraint) — en dimensjon med én verdi settes til den verdien; " +
      "velg aldri koder utenfor listene";
  }
  return meta;
}

async function ecbMetadata(src: DataSource, dataflowKey: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const [agencyID, dataflowId] = dataflowKey.split(/[,/]/);
  if (!agencyID || !dataflowId) throw new Error(`sdmx table_id må være '<agencyID>,<dataflowId>', fikk '${dataflowKey}'`);
  const url = `${src.base_url.replace(/data\/$/, "")}dataflow/${agencyID}/${dataflowId}/latest?references=all`;
  const res = await f(url, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new Error(`sdmx (xml) metadata for ${dataflowKey} feilet: HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const structures = doc?.["mes:Structure"]?.["mes:Structures"];
  const dsds = asArray(structures?.["str:DataStructures"]?.["str:DataStructure"]) as Record<string, unknown>[];
  const dsd = dsds[0];
  if (!dsd) throw new Error(`fant ingen datastruktur for ${dataflowKey}`);
  const codelists = asArray(structures?.["str:Codelists"]?.["str:Codelist"]) as Record<string, unknown>[];
  const dimList = (dsd["str:DataStructureComponents"] as Record<string, unknown> | undefined)?.["str:DimensionList"] as Record<string, unknown> | undefined ?? {};
  const plainDims = asArray(dimList["str:Dimension"]) as Record<string, unknown>[];
  const timeDims = asArray(dimList["str:TimeDimension"]) as Record<string, unknown>[];

  const codesFor = (d: Record<string, unknown>) => {
    const localRep = d["str:LocalRepresentation"] as Record<string, unknown> | undefined;
    const enumeration = localRep?.["str:Enumeration"] as Record<string, unknown> | undefined;
    const ref = enumeration?.Ref as Record<string, unknown> | undefined;
    const clId = ref?.id;
    const cl = codelists.find((c) => c.id === clId);
    return asArray(cl?.["str:Code"]) as Record<string, unknown>[];
  };

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const codes = codesFor(d);
      const allValues = codes.map((c) => ({ code: String(c.id ?? ""), label: xmlText(c["com:Name"]) || String(c.id ?? "") }));
      const { values, valuesTruncated } = pickValues(allValues, find);
      return {
        code: String(d.id ?? ""),
        label: String(d.id ?? ""),
        time: false,
        values,
        valuesTruncated,
      };
    }),
    ...timeDims.map((d) => ({
      code: String(d.id ?? ""),
      label: String(d.id ?? ""),
      time: true,
      values: [] as { code: string; label: string }[],
      valuesTruncated: false,
    })),
  ];
  return { source: src.id, id: dataflowKey, title: xmlText(dsd["com:Name"]) || dataflowKey, variables };
}

// Eurostat sin dissemination-API oppgir kun ÉN agency i praksis — katalogen
// (catalogs/eurostat.ts) gir tableId UTEN agency-prefiks (f.eks. "ei_lmhr_m",
// ikke "ESTAT,ei_lmhr_m" slik sdmx-grenens dataflowKey er), så agencyen kan
// ikke leses ut av tableId slik sdmxMetadata/ecbMetadata gjør. Dokumentert
// konstant, ikke gjettet — verifisert 2026-08-04 (curl mot ei_lmhr_m).
const EUROSTAT_AGENCY = "ESTAT";

// Eurostats SDMX 2.1-strukturrot ligger under en ANNEN sti enn
// data-endepunktet (statistics/1.0/data/ → sdmx/2.1/) — IKKE et rent
// data/$-kutt slik sdmxMetadata/ecbMetadata bruker for ECB/OECD/Norges Bank
// (der base_url selv ender i "…/data/" og strukturroten er "…/"-delen foran).
// Regex-erstatningen under er likevel en DERIVASJON fra registerets base_url
// (verifisert 2026-08-04: base_url ender nettopp i "statistics/1.0/data/") —
// aldri en frittstående host. Kaster hvis formen skulle endre seg, i stedet
// for å stille bygge en gal URL mot en host registeret ikke lenger sier.
function eurostatStructRoot(src: DataSource): string {
  const root = src.base_url.replace(/statistics\/1\.0\/data\/?$/, "sdmx/2.1/");
  if (root === src.base_url) {
    throw new Error(`eurostat base_url har uventet form (forventet …/statistics/1.0/data/): ${src.base_url}`);
  }
  return root;
}

// contentconstraint (Eurostats XML-ekvivalent til sdmxAvailability): hvilke
// koder som FAKTISK er befolket. Målt 2026-08-04 mot ei_lmhr_m:
// <s:Constraints><s:ContentConstraint><s:CubeRegion include="true">
//   <c:KeyValue id="s_adj"><c:Value>NSA</c:Value><c:Value>SA</c:Value></c:KeyValue>
//   …
// — id-ene på KeyValue er de EKSAKTE dimensjons-idene (små bokstaver for
// vanlige dimensjoner, TIME_PERIOD stor), samme streng som s:Dimension/
// s:TimeDimension sin id — ingen case-normalisering nødvendig. Best effort:
// alle feil (HTTP, parse, tom struktur, timeout) → null, ALDRI kast —
// metadataene leveres da ufiltrert, samme kontrakt som sdmxAvailability.
async function eurostatAvailability(
  structRoot: string,
  tableId: string,
  f: typeof fetch,
): Promise<Map<string, Set<string>> | null> {
  try {
    const url = `${structRoot}contentconstraint/${EUROSTAT_AGENCY}/${encodeURIComponent(tableId)}`;
    // AbortSignal.timeout: samme vakt-idé som fetchGuarded (ssrf.ts) og
    // fetchWithRetry (anthropic.ts) — her er kortformen nok siden HELE kallet
    // uansett er innkapslet i try/catch under: en abort er bare én av flere
    // feilklasser som allerede faller ned til best-effort-null.
    const res = await f(url, { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const xml = await res.text();
    // ccXmlParser (parseTagValue:false) — IKKE den delte xmlParser — se
    // kommentaren ved ccXmlParser sin deklarasjon: <c:Value>-elementteksten
    // ER kodeverdien vi matcher mot, og default-parseren mister ledende
    // nuller (01011000 → 1011000).
    const doc = ccXmlParser.parse(xml);
    const structures = doc?.["m:Structure"]?.["m:Structures"];
    const constraints = asArray(structures?.["s:Constraints"]?.["s:ContentConstraint"]) as Record<string, unknown>[];
    // Tar FØRSTE constraint/cube-region, samme forenkling som sdmxAvailability
    // (cubeRegions?.[0]) — målt: ei_lmhr_m har nøyaktig én ContentConstraint
    // med én CubeRegion (include="true"). Datasett med flere/ekskluderende
    // regioner dekkes ikke — best effort, ikke en fullstendig CubeRegion-tolk.
    const cubeRegion = constraints[0]?.["s:CubeRegion"] as Record<string, unknown> | undefined;
    // include="false" er en EKSKLUSJONS-region (KeyValues lister koder som
    // IKKE er befolket) — å behandle den som en inklusjonsliste ville
    // INVERTERT filteret (holdt kun de sjeldne/tomme kodene, filtrert bort
    // resten). Ikke målt på noe ekte Eurostat-datasett (ei_lmhr_m har
    // include="true"), men SDMX 2.1 tillater det — best effort: gi opp
    // (ufiltrert fallback) i stedet for å gjette retningen.
    if (String(cubeRegion?.include) === "false") return null;
    const keyValues = asArray(cubeRegion?.["c:KeyValue"]) as Record<string, unknown>[];
    if (!keyValues.length) return null;
    const ut = new Map<string, Set<string>>();
    for (const kv of keyValues) {
      const id = String(kv.id ?? "");
      // xmlText(v) her er nå TRYGT — ccXmlParser garanterer at v enten er en
      // ren streng (vanlig tilfelle) eller en tom/whitespace-node, ALDRI et
      // number pga. parseTagValue:false. filter(Boolean) fjerner tomme.
      const vals = asArray(kv["c:Value"]).map((v) => xmlText(v)).filter(Boolean);
      if (id && vals.length) ut.set(id, new Set(vals));
    }
    return ut.size ? ut : null;
  } catch {
    return null;
  }
}

// eurostatMetadata: SDMX 2.1 XML, samme mønster som ecbMetadata (fast-xml-parser,
// asArray/xmlText) MEN med Eurostats MÅLTE navnerom/element-former (2026-08-04,
// curl mot ei_lmhr_m — se task-4-report.md for full logg):
//   - Navnerom-prefikser er m:/s:/c: — IKKE ECBs mes:/str:/com:.
//   - dataflow-endepunktet AVVISER references=all (400 ERR_GEN_FLOW_REFERENCES:
//     «må være None, Children, Descendants»). references=children gir
//     Dataflow+DataStructure MEN INGEN kodelister; references=descendants gir
//     BEGGE i ETT kall — valgt (fewest calls: 1 kall mot N kodeliste-kall).
//   - <Ref> selv er UTEN navnerom-prefiks, som hos ECB.
//   - <s:Code>/<s:Dataflow>/<s:DataStructure> sin <c:Name xml:lang="…"> kan
//     gjenta seg PER SPRÅK — fast-xml-parser gir da en ARRAY (se xmlName()).
async function eurostatMetadata(src: DataSource, tableId: string, f: typeof fetch, find?: string): Promise<TableMeta> {
  const structRoot = eurostatStructRoot(src);
  const url = `${structRoot}dataflow/${EUROSTAT_AGENCY}/${encodeURIComponent(tableId)}?references=descendants`;
  // AbortSignal.timeout: descendants-svaret er STORT (3.4 MB for ei_lmhr_m,
  // GEO-kodelisten dominerer — se task-4-report.md) og kan i verste fall
  // henge lenge. Dette kallet er IKKE best-effort (i motsetning til
  // eurostatAvailability under, som fanger alt til null) — det MÅ lykkes for
  // at table_metadata skal ha noe å returnere, så en timeout skal gi en
  // ÆRLIG, lesbar norsk feil (fanges videre til {feil,guide} av
  // medGuideVedFeil i svar.ts) i stedet for en kryptisk AbortError-tekst.
  let res: Response;
  try {
    res = await f(url, { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error(`eurostat-strukturen svarte ikke innen 20 s for ${tableId}`);
    }
    throw e;
  }
  if (!res.ok) throw new Error(`eurostat metadata for ${tableId} feilet: HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const structures = doc?.["m:Structure"]?.["m:Structures"];
  const dsds = asArray(structures?.["s:DataStructures"]?.["s:DataStructure"]) as Record<string, unknown>[];
  const dsd = dsds[0];
  if (!dsd) throw new Error(`fant ingen datastruktur for ${tableId}`);
  const dataflows = asArray(structures?.["s:Dataflows"]?.["s:Dataflow"]) as Record<string, unknown>[];
  const codelists = asArray(structures?.["s:Codelists"]?.["s:Codelist"]) as Record<string, unknown>[];
  const dimList = (dsd["s:DataStructureComponents"] as Record<string, unknown> | undefined)?.["s:DimensionList"] as Record<string, unknown> | undefined ?? {};
  const plainDims = asArray(dimList["s:Dimension"]) as Record<string, unknown>[];
  const timeDims = asArray(dimList["s:TimeDimension"]) as Record<string, unknown>[];

  // ECB-paritet, bevisst: matcher KUN på Ref.id, ikke agencyID/version (Ref
  // bærer begge — se Ref-elementet i EUROSTAT_DSD_XML-fixturen). ecbMetadata
  // (over) gjør nøyaktig det samme. For ETT dataflow-kall (references=
  // descendants) er alle kodelistene som følger med hentet FOR nettopp denne
  // DSD-en, så et id-kollisjon på tvers av agency/versjon er ikke målt/
  // forventet i praksis — men hvis Eurostat noensinne skulle levere to
  // kodelister med samme id under forskjellig agency/versjon i samme svar,
  // ville denne oppslaget stille valgt den FØRSTE (Array.find), ikke
  // nødvendigvis den Ref faktisk peker på. Ikke fikset her (samme
  // begrensning som ecbMetadata har hatt uendret siden Task 1).
  const codesFor = (d: Record<string, unknown>) => {
    const localRep = d["s:LocalRepresentation"] as Record<string, unknown> | undefined;
    const enumeration = localRep?.["s:Enumeration"] as Record<string, unknown> | undefined;
    const ref = enumeration?.Ref as Record<string, unknown> | undefined;
    const clId = ref?.id;
    const cl = codelists.find((c) => c.id === clId);
    return asArray(cl?.["s:Code"]) as Record<string, unknown>[];
  };

  const befolket = await eurostatAvailability(structRoot, tableId, f);

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const dimId = String(d.id ?? "");
      const codes = codesFor(d);
      let allValues = codes.map((c) => ({ code: String(c.id ?? ""), label: xmlName(c["c:Name"]) || String(c.id ?? "") }));
      const bef = befolket?.get(dimId);
      const filtrert = !!bef && allValues.some((v) => bef.has(v.code));
      if (filtrert) allValues = allValues.filter((v) => bef!.has(v.code));
      const { values, valuesTruncated } = pickValues(allValues, find);
      const ut: TableVariable = {
        code: dimId,
        label: dimId,
        time: false,
        values,
        valuesTruncated,
      };
      if (filtrert) ut.kun_befolkede = true;
      return ut;
    }),
    ...timeDims.map((d) => ({
      code: String(d.id ?? ""),
      label: String(d.id ?? ""),
      time: true,
      values: [] as { code: string; label: string }[],
      valuesTruncated: false,
    })),
  ];
  // Dataflow-navnet ("Unemployment rate (%) - monthly data") er langt mer
  // lesbart enn DSD-navnet (typisk bare "<ID> data structure") — foretrekkes,
  // med DSD-navn og til slutt tableId som fallback.
  const title = xmlName(dataflows[0]?.["c:Name"]) || xmlName(dsd["c:Name"]) || tableId;
  const meta: TableMeta = { source: src.id, id: tableId, title, variables };
  if (befolket) {
    meta.tilgjengelighet = "verdilistene er filtrert til koder som FAKTISK har data i denne kuben " +
      "(contentconstraint) — en dimensjon med én verdi settes til den verdien; " +
      "velg aldri koder utenfor listene";
  }
  return meta;
}
