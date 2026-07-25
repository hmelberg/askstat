import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tableMetadata } from "./table-metadata.ts";
import { parseRegistry } from "../registry.ts";

const REG = parseRegistry([
  { id: "ssb", navn: "SSB", utgiver: "SSB", tillit: "offisiell", tilgang: "pxweb",
    base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/", cors: true,
    sporrings_url_mal: "https://data.ssb.no/api/pxwebapi/v2-beta/tables/{id}/data?valueCodes[{var}]={koder}&outputFormat=csv" },
  { id: "owid", navn: "OWID", utgiver: "OWID", tillit: "etablert", tilgang: "fil",
    base_url: "https://ourworldindata.org/grapher/", cors: true },
  { id: "fhi", navn: "FHI", utgiver: "FHI", tillit: "offisiell", tilgang: "rest",
    kind: "fhi", base_url: "https://statistikk-data.fhi.no/api/open/v1/", cors: true },
  { id: "dst", navn: "DST", utgiver: "DST", tillit: "offisiell", tilgang: "rest",
    kind: "dst", base_url: "https://api.statbank.dk/v1/", cors: true },
  { id: "statfin", navn: "StatFin", utgiver: "Tilastokeskus", tillit: "offisiell", tilgang: "rest",
    kind: "statfin", base_url: "https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/", cors: false },
  { id: "norgesbank", navn: "Norges Bank", utgiver: "Norges Bank", tillit: "offisiell",
    tilgang: "sdmx", kind: "sdmx", base_url: "https://data.norges-bank.no/api/data/", cors: true },
]);

// PxWebApi v2 /tables/{id}/metadata shape (subset): JSON-stat2-like dimensions
const META_FIXTURE = {
  label: "05839: Arbeidsledige (AKU), etter kjønn og år",
  dimension: {
    Kjonn: { label: "kjønn", category: { index: { "0": 0, "1": 1, "2": 2 },
      label: { "0": "Begge kjønn", "1": "Menn", "2": "Kvinner" } } },
    Tid: { label: "år", extension: { elimination: false },
      category: { index: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(1996 + i), i])),
        label: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(1996 + i), String(1996 + i)])) } },
  },
  role: { time: ["Tid"] },
};

function fakeFetch(payload: unknown, capture: string[]): typeof fetch {
  return ((input: string | URL | Request) => {
    capture.push(String(input));
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  }) as typeof fetch;
}

Deno.test("pxweb metadata: variables, time flag, value cap, query template", async () => {
  const calls: string[] = [];
  const meta = await tableMetadata("ssb", "05839", { registry: REG, fetchImpl: fakeFetch(META_FIXTURE, calls) });
  assertEquals(calls[0], "https://data.ssb.no/api/pxwebapi/v2-beta/tables/05839/metadata?lang=no");
  assertEquals(meta.title.startsWith("05839"), true);
  const kjonn = meta.variables.find((v) => v.code === "Kjonn")!;
  assertEquals(kjonn.time, false);
  assertEquals(kjonn.values.length, 3);
  assertEquals(kjonn.values[1], { code: "1", label: "Menn" });
  const tid = meta.variables.find((v) => v.code === "Tid")!;
  assertEquals(tid.time, true);
  assertEquals(tid.values.length, 40);          // capped
  assertEquals(tid.valuesTruncated, true);
  assertEquals(meta.queryUrlTemplate?.includes("{id}") ?? true, false); // {id} substituted
});

Deno.test("non-pxweb source throws with probe guidance", async () => {
  let threw = "";
  try { await tableMetadata("owid", "co2", { registry: REG }); } catch (e) { threw = String(e); }
  if (!threw.includes("probe")) throw new Error("ventet probe-henvisning: " + threw);
});

Deno.test("fhi metadata: kode fra categories[].value, ingen tids-flagg", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("daar/table/754/dimension")) {
      return Promise.resolve(new Response(JSON.stringify({
        dimensions: [
          { code: "DAAR", label: "Dødsår", categories: [{ label: "2020", value: "2020", children: [] }] },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("fhi", "daar/754", { registry: REG, fetchImpl });
  const daar = meta.variables.find((v) => v.code === "DAAR")!;
  assertEquals(daar.time, false);
  assertEquals(daar.values[0], { code: "2020", label: "2020" });
});

// --- dst adapter (Task 3) ---

Deno.test("dst metadata: time-flagg direkte per variabel", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("tableinfo/FOLK1A")) {
      return Promise.resolve(new Response(JSON.stringify({
        text: "Befolkningen den 1. i kvartalet",
        variables: [
          { id: "OMRÅDE", text: "område", elimination: true, time: false, values: [{ id: "000", text: "Hele landet" }] },
          { id: "Tid", text: "tid", time: true, values: [{ id: "2024K1", text: "2024K1" }] },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("dst", "FOLK1A", { registry: REG, fetchImpl });
  assertEquals(meta.variables.find((v) => v.code === "Tid")!.time, true);
  assertEquals(meta.variables.find((v) => v.code === "OMRÅDE")!.time, false);
});

// --- statfin adapter (Task 4) ---

Deno.test("statfin metadata: parallelle values/valueTexts-arrayer", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    if (String(input).includes("tyti/11pk.px")) {
      return Promise.resolve(new Response(JSON.stringify({
        title: "Employees by sex",
        variables: [
          { code: "sukupuoli", text: "Sex", values: ["1", "2"], valueTexts: ["Men", "Women"], elimination: true },
          { code: "timeperiod_m", text: "Month", values: ["2025M01"], valueTexts: ["2025M01"], time: true },
        ],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  const meta = await tableMetadata("statfin", "tyti/11pk.px", { registry: REG, fetchImpl });
  const sex = meta.variables.find((v) => v.code === "sukupuoli")!;
  assertEquals(sex.values, [{ code: "1", label: "Men" }, { code: "2", label: "Women" }]);
  assertEquals(meta.variables.find((v) => v.code === "timeperiod_m")!.time, true);
});

// --- sdmx adapter (Task 5) ---

const NB_EXR_DSD_FIXTURE = {
  data: {
    dataStructures: [{
      name: "Exchange rates",
      dataStructureComponents: {
        dimensionList: {
          dimensions: [
            { id: "BASE_CUR", localRepresentation: { enumeration: "urn:sdmx:org.sdmx.infomodel.codelist.Codelist=NB:CL_CURRENCY(1.0)" } },
          ],
          timeDimensions: [
            { id: "TIME_PERIOD", localRepresentation: { textFormat: { textType: "ObservationalTimePeriod" } } },
          ],
        },
      },
    }],
    codelists: [
      { id: "CL_CURRENCY", codes: [{ id: "NOK", name: "Norwegian krone" }, { id: "USD", name: "US dollar" }] },
    ],
  },
};

function fakeSdmxFetch(payload: unknown): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))) as typeof fetch;
}

Deno.test("sdmx metadata: kodeliste koblet via enumeration-URN, tidsdimensjon fra timeDimensions", async () => {
  const meta = await tableMetadata("norgesbank", "NB/EXR", { registry: REG, fetchImpl: fakeSdmxFetch(NB_EXR_DSD_FIXTURE) });
  const baseCur = meta.variables.find((v) => v.code === "BASE_CUR")!;
  assertEquals(baseCur.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);
});
