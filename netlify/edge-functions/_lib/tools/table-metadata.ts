// table_metadata tool: variable-level lookup for a catalog hit, so the model
// can build a MINIMAL query URL (spec: build datasets from variables).
import { findSource, SDMX_STRUCTURE_ACCEPT, type DataSource } from "../registry.ts";

export interface TableVariable {
  code: string;
  label: string;
  time: boolean;
  values: { code: string; label: string }[];
  valuesTruncated: boolean;
}

export interface TableMeta {
  source: string;
  id: string;
  title: string;
  variables: TableVariable[];
  queryUrlTemplate?: string;
}

const MAX_VALUES = 40;

export async function tableMetadata(
  sourceId: string,
  tableId: string,
  deps: { registry: DataSource[]; fetchImpl?: typeof fetch },
): Promise<TableMeta> {
  const src = findSource(deps.registry, sourceId);
  if (!src) throw new Error(`ukjent kilde '${sourceId}'`);
  const f = deps.fetchImpl ?? fetch;
  switch (src.tilgang) {
    case "pxweb": return pxwebMetadata(src, tableId, f);
    case "sdmx": return sdmxMetadata(src, tableId, f);
    default:
      switch (src.kind) {
        case "fhi": return fhiMetadata(src, tableId, f);
        case "dst": return dstMetadata(src, tableId, f);
        case "statfin": return statfinMetadata(src, tableId, f);
        default:
          throw new Error(
            `table_metadata støtter ikke '${sourceId}' ennå — bruk probe på data-URL-en for å se kolonner`,
          );
      }
  }
}

async function pxwebMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(`tables/${tableId}/metadata?lang=no`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`metadata for ${src.id}/${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json();

  const dims = (json?.dimension ?? {}) as Record<string, {
    label?: string;
    category?: { index?: Record<string, number>; label?: Record<string, string> };
  }>;
  const timeDims = new Set<string>((json?.role?.time ?? []) as string[]);
  const variables: TableVariable[] = Object.entries(dims).map(([code, d]) => {
    const labels = d.category?.label ?? {};
    const codes = Object.keys(d.category?.index ?? labels);
    const values = codes.slice(0, MAX_VALUES).map((c) => ({ code: c, label: labels[c] ?? c }));
    return {
      code,
      label: d.label ?? code,
      time: timeDims.has(code),
      values,
      valuesTruncated: codes.length > MAX_VALUES,
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

async function fhiMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  // tableId kommer som "<register>/<tallId>" fra fhiSearch (search-catalog.ts)
  const [register, id] = tableId.split("/");
  if (!register || !id) throw new Error(`fhi table_id må være '<register>/<tallId>', fikk '${tableId}'`);
  const url = new URL(`${register}/table/${id}/dimension`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`fhi metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { dimensions?: FhiDimension[] };
  const dims = json.dimensions ?? [];
  const variables: TableVariable[] = dims.map((d) => ({
    code: d.code,
    label: d.label,
    time: false, // FHI gir ikke et pålitelig tids-signal (se spec §3) — ærlig forenkling
    values: d.categories.slice(0, MAX_VALUES).map((c) => ({ code: c.value, label: c.label })),
    valuesTruncated: d.categories.length > MAX_VALUES,
  }));
  return { source: src.id, id: tableId, title: tableId, variables };
}

interface DstVariableValue { id: string; text: string; }
interface DstVariable { id: string; text: string; time?: boolean; values: DstVariableValue[]; }

async function dstMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(`tableinfo/${tableId}?format=JSON`, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`dst metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { text?: string; variables?: DstVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => ({
    code: v.id,
    label: v.text,
    time: !!v.time,
    values: v.values.slice(0, MAX_VALUES).map((c) => ({ code: c.id, label: c.text })),
    valuesTruncated: v.values.length > MAX_VALUES,
  }));
  return { source: src.id, id: tableId, title: json.text ?? tableId, variables };
}

interface StatfinVariable { code: string; text: string; values: string[]; valueTexts?: string[]; time?: boolean; }

async function statfinMetadata(src: DataSource, tableId: string, f: typeof fetch): Promise<TableMeta> {
  const url = new URL(tableId, src.base_url).toString();
  const res = await f(url);
  if (!res.ok) throw new Error(`statfin metadata for ${tableId} feilet: HTTP ${res.status}`);
  const json = await res.json() as { title?: string; variables?: StatfinVariable[] };
  const variables: TableVariable[] = (json.variables ?? []).map((v) => {
    const codes = v.values ?? [];
    const labels = v.valueTexts ?? codes;
    return {
      code: v.code,
      label: v.text,
      time: !!v.time,
      values: codes.slice(0, MAX_VALUES).map((c, i) => ({ code: c, label: labels[i] ?? c })),
      valuesTruncated: codes.length > MAX_VALUES,
    };
  });
  return { source: src.id, id: tableId, title: json.title ?? tableId, variables };
}

function sdmxCodelistIdFromUrn(urn: string): string | null {
  const m = urn.match(/Codelist=[^:]+:([^(]+)\(/);
  return m ? m[1] : null;
}

async function sdmxMetadata(src: DataSource, dataflowKey: string, f: typeof fetch): Promise<TableMeta> {
  const accept = SDMX_STRUCTURE_ACCEPT[src.id];
  if (!accept) throw new Error(`sdmx-strukturspørringer er ikke støttet for '${src.id}' ennå (kun XML) — bruk web_search + probe`);
  const [agencyID, dataflowId] = dataflowKey.split("/");
  if (!agencyID || !dataflowId) throw new Error(`sdmx table_id må være '<agencyID>/<dataflowId>', fikk '${dataflowKey}'`);
  const url = `${src.base_url.replace(/data\/$/, "")}dataflow/${agencyID}/${dataflowId}/latest?references=all`;
  const res = await f(url, { headers: { Accept: accept } });
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

  const variables: TableVariable[] = [
    ...plainDims.map((d) => {
      const codes = codesFor(d);
      return {
        code: String(d.id ?? ""),
        label: String(d.id ?? ""), // ingen egen "name" utover concept-referansen — koden ER labelen
        time: false,
        values: codes.slice(0, MAX_VALUES).map((c) => ({ code: String(c.id ?? ""), label: String(c.name ?? c.id ?? "") })),
        valuesTruncated: codes.length > MAX_VALUES,
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
  return { source: src.id, id: dataflowKey, title: String(dsd.name ?? dataflowKey), variables };
}
