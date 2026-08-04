import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickValues, tableMetadata } from "./table-metadata.ts";
import { findSource, parseRegistry } from "../registry.ts";
import type { DataSource } from "../registry.ts";

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
  { id: "oecd", navn: "OECD", utgiver: "OECD", tillit: "offisiell",
    tilgang: "sdmx", kind: "sdmx", base_url: "https://sdmx.oecd.org/public/rest/data/", cors: true },
  { id: "ecb", navn: "ECB", utgiver: "ECB", tillit: "offisiell",
    tilgang: "sdmx", kind: "sdmx", base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
  // Ekte form fra data-sources.json (uendret her): tilgang="rest" (IKKE
  // "sdmx") + kind="eurostat" — dispatchen treffer derfor default-grenen i
  // tableMetadata og videre på src.kind, ikke src.tilgang.
  { id: "eurostat", navn: "Eurostat (dissemination API)", utgiver: "Eurostat", tillit: "offisiell",
    tilgang: "rest", kind: "eurostat",
    base_url: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/", cors: true },
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

function fakeSdmxFetch(payload: unknown, capture: string[] = []): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    capture.push(String(input));
    capture.push(String((init?.headers as Record<string, string> | undefined)?.["Accept-Language"] ?? ""));
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  }) as typeof fetch;
}

Deno.test("sdmx metadata: kodeliste koblet via enumeration-URN, tidsdimensjon fra timeDimensions", async () => {
  const calls: string[] = [];
  const meta = await tableMetadata("norgesbank", "NB/EXR", { registry: REG, fetchImpl: fakeSdmxFetch(NB_EXR_DSD_FIXTURE, calls) });
  const baseCur = meta.variables.find((v) => v.code === "BASE_CUR")!;
  assertEquals(baseCur.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);
  assertEquals(calls[0], "https://data.norges-bank.no/api/dataflow/NB/EXR/latest?references=all");
  // Verifisert 2026-07-25: OECDs strukturendepunkt svarer 500 uten denne
  // headeren (Denos fetch, ikke curl) — sendes derfor alltid, for alle sdmx-kilder.
  assertEquals(calls[1], "en");
});

Deno.test("sdmx metadata: komma-form id (som search_catalog nå returnerer) godtas likt", async () => {
  // search_catalog gir flowRef-en på komma-form («NB,EXR» — det read() tar);
  // strukturendepunktet trenger agency/flow som separate path-segmenter.
  const calls: string[] = [];
  const meta = await tableMetadata("norgesbank", "NB,EXR", { registry: REG, fetchImpl: fakeSdmxFetch(NB_EXR_DSD_FIXTURE, calls) });
  assertEquals(meta.title, "Exchange rates");
  assertEquals(calls[0], "https://data.norges-bank.no/api/dataflow/NB/EXR/latest?references=all");
});

// --- ecb adapter (XML, Task 1) ---

const ECB_EXR_DSD_XML = `<?xml version='1.0' encoding='UTF-8'?><mes:Structure xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:str="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:com="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><mes:Structures><str:DataStructures><str:DataStructure agencyID="ECB" id="ECB_EXR1"><com:Name xml:lang="en">Exchange Rates</com:Name><str:DataStructureComponents><str:DimensionList><str:Dimension id="CURRENCY"><str:LocalRepresentation><str:Enumeration><Ref agencyID="ECB" id="CL_CURRENCY" version="1.0" package="codelist"/></str:Enumeration></str:LocalRepresentation></str:Dimension><str:TimeDimension id="TIME_PERIOD"/></str:DimensionList></str:DataStructureComponents></str:DataStructure></str:DataStructures><str:Codelists><str:Codelist id="CL_CURRENCY"><str:Code id="NOK"><com:Name xml:lang="en">Norwegian krone</com:Name></str:Code><str:Code id="USD"><com:Name xml:lang="en">US dollar</com:Name></str:Code></str:Codelist></str:Codelists></mes:Structures></mes:Structure>`;

function fakeEcbXmlMetaFetch(xml: string, capture: string[] = []): typeof fetch {
  return ((input: string | URL | Request) => {
    capture.push(String(input));
    return Promise.resolve(new Response(xml, { status: 200 }));
  }) as typeof fetch;
}

Deno.test("ecb metadata: kodeliste koblet via Ref.id (ingen URN-parsing), tidsdimensjon fra TimeDimension", async () => {
  const calls: string[] = [];
  const meta = await tableMetadata("ecb", "ECB/EXR", { registry: REG, fetchImpl: fakeEcbXmlMetaFetch(ECB_EXR_DSD_XML, calls) });
  const currency = meta.variables.find((v) => v.code === "CURRENCY")!;
  assertEquals(currency.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);
  assertEquals(calls[0], "https://data-api.ecb.europa.eu/service/dataflow/ECB/EXR/latest?references=all");
});

Deno.test("ecb metadata: find via pickValues — kort liste (<=MAX_VALUES) tømmes ikke (sluttreview, bundlet med pxweb-regelen)", async () => {
  const meta = await tableMetadata("ecb", "ECB/EXR", {
    registry: REG,
    fetchImpl: fakeEcbXmlMetaFetch(ECB_EXR_DSD_XML),
    find: "usd",
  });
  const currency = meta.variables.find((v) => v.code === "CURRENCY")!;
  // CURRENCY har bare 2 koder — find skal IKKE filtrere en så kort liste,
  // samme regel som pxwebMetadata nå bruker.
  assertEquals(currency.values, [{ code: "NOK", label: "Norwegian krone" }, { code: "USD", label: "US dollar" }]);
});

// --- worldbank/dbnomics adapters (Task 5, delegerer til catalogs/*.ts) ---

Deno.test("tableMetadata: kind worldbank delegerer til worldbankMetadata", async () => {
  const f = (() => Promise.resolve(new Response(JSON.stringify([
    { page: 1 },
    [{ id: "SP.POP.TOTL", name: "Population, total", source: { value: "WDI" }, sourceNote: "…" }],
  ]), { status: 200 }))) as unknown as typeof fetch;
  const reg = parseRegistry([{ id: "worldbank", navn: "Verdensbanken", utgiver: "WB",
    tillit: "etablert", tilgang: "rest", kind: "worldbank",
    base_url: "https://api.worldbank.org/v2/", cors: true }]);
  const m = await tableMetadata("worldbank", "SP.POP.TOTL", { registry: reg, fetchImpl: f }) as Record<string, unknown>;
  assertEquals(m.navn, "Population, total");
});

Deno.test("tableMetadata: kind dbnomics delegerer til dbnomicsMetadata", async () => {
  const f = (() => Promise.resolve(new Response(JSON.stringify({
    datasets: { docs: [{
      code: "CPI", name: "Consumer Price Index", provider_code: "IMF",
      dimensions_codes_order: ["freq"],
      dimensions_labels: { freq: "Frequency" },
      dimensions_values_labels: { freq: { M: "Monthly", A: "Annual" } },
    }] },
  }), { status: 200 }))) as unknown as typeof fetch;
  const reg = parseRegistry([{ id: "dbnomics", navn: "DBnomics", utgiver: "Cepremap",
    tillit: "etablert", tilgang: "rest", kind: "dbnomics",
    base_url: "https://api.db.nomics.world/v22/series/", cors: true }]);
  const m = await tableMetadata("dbnomics", "IMF/CPI", { registry: reg, fetchImpl: f }) as Record<string, unknown>;
  assertEquals(m.navn, "Consumer Price Index");
});

// --- mandatory-flagg + find-param (Task 1, ssb-mandatory) ---

Deno.test("pickValues: find-filter treffer kode OG etikett, case-insensitivt, FØR kuttet", () => {
  const all = Array.from({ length: 100 }, (_, i) => ({ code: `K${i}`, label: `Sted ${i}` }));
  all.push({ code: "0301", label: "Oslo" });
  const r = pickValues(all, "oslo");
  assertEquals(r.values, [{ code: "0301", label: "Oslo" }]);
  assertEquals(r.valuesTruncated, false);
  const rKode = pickValues(all, "030");
  assertEquals(rKode.values.length, 1);
});

Deno.test("pickValues: uten find — første 40 + truncated-flagg", () => {
  const all = Array.from({ length: 50 }, (_, i) => ({ code: `${i}`, label: `${i}` }));
  const r = pickValues(all);
  assertEquals(r.values.length, 40);
  assertEquals(r.valuesTruncated, true);
});

// Fake pxweb-metadata: ContentsCode/Tid elimination=false, Region=true.
// Region har >40 koder (som ekte kommune-lister) slik at find fortsatt
// filtrerer DER — mens ContentsCode (kort, obligatorisk liste, som SSBs
// egen 4-koders variant) skal beholde ALLE koder selv når find er satt
// (sluttreview 2026-07-31: find skal aldri tømme en mandatory-dimensjon).
const REGION_ENTRIES = Array.from({ length: 45 }, (_, i) => ({ code: `K${i}`, label: `Sted ${i}` }));
REGION_ENTRIES.push({ code: "0301", label: "Oslo" });
const REGION_INDEX: Record<string, number> = {};
const REGION_LABEL: Record<string, string> = {};
REGION_ENTRIES.forEach((c, i) => { REGION_INDEX[c.code] = i; REGION_LABEL[c.code] = c.label; });

const PXMETA = {
  label: "11342: Areal og befolkning",
  role: { time: ["Tid"] },
  dimension: {
    Region: {
      label: "region",
      category: { index: REGION_INDEX, label: REGION_LABEL },
      extension: { elimination: true },
    },
    ContentsCode: {
      label: "statistikkvariabel",
      category: {
        index: { Folkemengde: 0, Fodte: 1, Dode: 2, Innflytting: 3 },
        label: { Folkemengde: "Personer", Fodte: "Fødte", Dode: "Døde", Innflytting: "Innflytting" },
      },
      extension: { elimination: false },
    },
    Tid: {
      label: "år",
      category: { index: { "2024": 0 }, label: { "2024": "2024" } },
      extension: { elimination: false },
    },
  },
};
const SSB_SRC: DataSource[] = [{
  id: "ssb", navn: "SSB", utgiver: "SSB", tillit: "offisiell",
  tilgang: "pxweb", base_url: "https://data.ssb.no/api/pxwebapi/v2/",
} as unknown as DataSource];
const fakeMandatoryFetch = ((_url: string) =>
  Promise.resolve(new Response(JSON.stringify(PXMETA), { status: 200 }))) as typeof fetch;

Deno.test("pxwebMetadata: mandatory fra elimination; find når fram (lang liste filtreres)", async () => {
  const m = await tableMetadata("ssb", "11342", { registry: SSB_SRC, fetchImpl: fakeMandatoryFetch, find: "oslo" });
  const region = m.variables.find((v) => v.code === "Region")!;
  const contents = m.variables.find((v) => v.code === "ContentsCode")!;
  assertEquals(region.mandatory, false);
  assertEquals(contents.mandatory, true);
  assertEquals(region.values, [{ code: "0301", label: "Oslo" }]);
  assert(m.variables.find((v) => v.code === "Tid")!.mandatory);
});

Deno.test("pxwebMetadata: find tømmer IKKE en kort mandatory-dimensjon (ContentsCode)", async () => {
  const m = await tableMetadata("ssb", "11342", { registry: SSB_SRC, fetchImpl: fakeMandatoryFetch, find: "oslo" });
  const contents = m.variables.find((v) => v.code === "ContentsCode")!;
  // Ingen av ContentsCode-kodene matcher "oslo" — hadde find filtrert denne
  // korte, obligatoriske listen ville values vært tom (og modellen ville
  // trodd tabellen ikke hadde noe å måle). Den skal stå urørt.
  assertEquals(contents.values.length, 4);
  assertEquals(contents.valuesTruncated, false);
});

Deno.test("dbnomicsMetadata: gir dimensjonsKODER + verdikoder (grunnlaget for filters=)", async () => {
  // Før returnerte adapteren {lesbar etikett: antall verdier} — modellen kunne
  // dermed IKKE bygge filters={"weo-country": ["NOR"]}, som er den eneste veien
  // til et uttrekk under 1000-serie-taket (målt live 2026-08-01).
  const f = (() => Promise.resolve(new Response(JSON.stringify({
    datasets: { docs: [{
      code: "WEO", name: "World Economic Outlook", provider_code: "IMF",
      dimensions_codes_order: ["weo-country", "weo-subject"],
      dimensions_labels: { "weo-country": "Country", "weo-subject": "Subject" },
      dimensions_values_labels: {
        "weo-country": { NOR: "Norway", SWE: "Sweden" },
        "weo-subject": { NGDP_RPCH: "GDP growth" },
      },
    }] },
  }), { status: 200 }))) as unknown as typeof fetch;
  const reg = parseRegistry([{ id: "dbnomics", navn: "DBnomics", utgiver: "Cepremap",
    tillit: "etablert", tilgang: "rest", kind: "dbnomics",
    base_url: "https://api.db.nomics.world/v22/series/", cors: true }]);
  const m = await tableMetadata("dbnomics", "IMF/WEO", { registry: reg, fetchImpl: f }) as Record<string, unknown>;

  const dims = m.dimensjoner as { kode: string; navn: string; verdier: { code: string; label: string }[] }[];
  assertEquals(dims[0].kode, "weo-country");          // KODEN, ikke etiketten
  assertEquals(dims[0].navn, "Country");
  assertEquals(dims[0].verdier[0], { code: "NOR", label: "Norway" });
  // lesing-hintet skal vise filters=-veien, ikke serie-masken
  assertEquals(String(m.lesing).includes("filters="), true);
});

// ---------------------------------------------------------------------------
// Task 7: Data Commons-dekningssjekk. datacommons har INGEN registeroppføring
// (Task 8 legger den til) — REG under er den SAMME registry-instansen brukt
// i pxweb-testene over og har bevisst ingen 'datacommons'-kilde, for å bevise
// at dispatchen treffer FØR findSource-oppslaget.
// Responsform: docs.datacommons.org/api/rest/v2/observation (se kommentaren
// i catalogs/datacommons.ts) — byVariable[<dcid>].byEntity[<entity>].
// orderedFacets[], med fasettmetadata (importName/unit) i et eget
// facets-kart. Live-verifisering med ekte nøkkel er UTESTÅENDE (Task 11).

function dcObservationFetch(
  orderedFacets: { facetId: string; latestDate?: string; earliestDate?: string; obsCount?: number }[],
  facetsMeta: Record<string, { importName?: string; unit?: string }>,
): typeof fetch {
  return ((input: string | URL | Request) => {
    const u = new URL(String(input));
    assertEquals(u.pathname, "/v2/observation");
    assert(u.searchParams.get("key"), "key-param skal være med");
    const dcid = u.searchParams.get("variable.dcids")!;
    const entity = u.searchParams.get("entity.dcids")!;
    assertEquals(u.searchParams.get("date"), "LATEST");
    assertEquals(u.searchParams.getAll("select").sort(), ["date", "entity", "facet", "value", "variable"]);
    const body = {
      byVariable: { [dcid]: { byEntity: { [entity]: { orderedFacets } } } },
      facets: facetsMeta,
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as unknown as typeof fetch;
}

Deno.test("dispatch: datacommons trigges FØR registeroppslaget (REG har ingen 'datacommons'-kilde)", () => {
  assertEquals(findSource(REG, "datacommons"), null);
});

Deno.test("datacommons: mangler DATACOMMONS_API_KEY → kaster norsk feil", async () => {
  const had = Deno.env.get("DATACOMMONS_API_KEY");
  if (had !== undefined) Deno.env.delete("DATACOMMONS_API_KEY"); // defensivt — testen forutsetter fravær
  try {
    await assertRejects(
      () => tableMetadata("datacommons", "Count_Person", { registry: REG, find: "NOR" }),
      Error,
      "DATACOMMONS_API_KEY",
    );
  } finally {
    if (had !== undefined) Deno.env.set("DATACOMMONS_API_KEY", had);
  }
});

Deno.test("datacommons: to fasetter (WB, OECD) vises BEGGE m/ kilde — aldri velges stille", async () => {
  Deno.env.set("DATACOMMONS_API_KEY", "TESTKEY");
  try {
    const f = dcObservationFetch(
      [
        { facetId: "83.112", latestDate: "2022" },
        { facetId: "83.1", latestDate: "2023" },
      ],
      {
        "83.112": { importName: "World Bank WDI", unit: "USDollar" },
        "83.1": { importName: "OECD", unit: "USDollar" },
      },
    );
    const meta = await tableMetadata("datacommons", "SomeStatVar", { registry: REG, fetchImpl: f, find: "NOR" });
    assertEquals(meta.source, "datacommons");
    assertEquals(meta.id, "SomeStatVar");
    const dekning = meta.dekning as {
      entity: string; siste_dato: string | null; antall_fasetter: number;
      fasetter: { kilde: string; enhet?: string }[];
    }[];
    assertEquals(dekning.length, 1);
    assertEquals(dekning[0].entity, "country/NOR");
    assertEquals(dekning[0].antall_fasetter, 2);
    const kilder = dekning[0].fasetter.map((x) => x.kilde).sort();
    assertEquals(kilder, ["OECD", "World Bank WDI"]);          // BEGGE, ikke bare én
    assertEquals(dekning[0].siste_dato, "2023");                // seneste av de to fasettene
    assert(String(meta.råd).length > 0);
    assert(String(meta.råd).includes("2 fasetter"), String(meta.råd));
  } finally {
    Deno.env.delete("DATACOMMONS_API_KEY");
  }
});

Deno.test("datacommons: ingen observasjoner → dekning tom + høylytt råd (0,9999997-uten-data-fellen)", async () => {
  Deno.env.set("DATACOMMONS_API_KEY", "TESTKEY");
  try {
    const f = dcObservationFetch([], {});
    const meta = await tableMetadata("datacommons", "Count_TobaccoUser", { registry: REG, fetchImpl: f, find: "NOR" });
    assertEquals(meta.dekning, []);
    const råd = String(meta.råd);
    assert(råd.includes("INGEN observasjoner"), råd);
    assert(råd.includes("velg en annen variabel"), råd);
  } finally {
    Deno.env.delete("DATACOMMONS_API_KEY");
  }
});

// Fix-runde 2 (live-verifisert 2026-08-04): den EKTE tom-dekning-formen fra
// v2/observation er byEntity[<entity>] som et TOMT OBJEKT — INGEN
// orderedFacets-nøkkel i det hele tatt (ikke bare orderedFacets: [], som
// testen over dekker via dcObservationFetch-helperen). ?? []-mønsteret i
// dcCoverage (catalogs/datacommons.ts) må dekke BEGGE former.
Deno.test("datacommons: byEntity[<entity>] tomt objekt (INGEN orderedFacets-nøkkel, ekte live-form) → samme 'ingen observasjoner'", async () => {
  Deno.env.set("DATACOMMONS_API_KEY", "TESTKEY");
  try {
    const f = ((input: string | URL | Request) => {
      const u = new URL(String(input));
      const dcid = u.searchParams.get("variable.dcids")!;
      const entity = u.searchParams.get("entity.dcids")!;
      const body = { byVariable: { [dcid]: { byEntity: { [entity]: {} } } }, facets: {} };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;
    const meta = await tableMetadata("datacommons", "LifeExpectancy_Person", { registry: REG, fetchImpl: f, find: "NOR" });
    assertEquals(meta.dekning, []);
    const råd = String(meta.råd);
    assert(råd.includes("INGEN observasjoner"), råd);
    assert(råd.includes("velg en annen variabel"), råd);
  } finally {
    Deno.env.delete("DATACOMMONS_API_KEY");
  }
});

Deno.test("datacommons: uten find → råd ber om find=<landkode>, INGEN API-kall", async () => {
  Deno.env.set("DATACOMMONS_API_KEY", "TESTKEY");
  try {
    let called = false;
    const f = (() => {
      called = true;
      return Promise.reject(new Error("skal ikke kalles uten find"));
    }) as unknown as typeof fetch;
    const meta = await tableMetadata("datacommons", "Count_Person", { registry: REG, fetchImpl: f });
    assertEquals(meta.dekning, []);
    assert(String(meta.råd).includes("angi find=<landkode>"), String(meta.råd));
    assertEquals(called, false);
  } finally {
    Deno.env.delete("DATACOMMONS_API_KEY");
  }
});

Deno.test("datacommons: find → country/<KODE>, ISO3 og ISO2 begge uppercased", async () => {
  Deno.env.set("DATACOMMONS_API_KEY", "TESTKEY");
  try {
    let seenEntity = "";
    const f = ((input: string | URL | Request) => {
      const u = new URL(String(input));
      seenEntity = u.searchParams.get("entity.dcids") ?? "";
      const dcid = u.searchParams.get("variable.dcids")!;
      const body = { byVariable: { [dcid]: { byEntity: { [seenEntity]: { orderedFacets: [] } } } }, facets: {} };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;

    await tableMetadata("datacommons", "X", { registry: REG, fetchImpl: f, find: "nor" });
    assertEquals(seenEntity, "country/NOR");                    // ISO3, lower→upper

    await tableMetadata("datacommons", "X", { registry: REG, fetchImpl: f, find: "no" });
    assertEquals(seenEntity, "country/NO");                     // ISO2, uppercased uendret (ingen ISO2→ISO3-konvertering)
  } finally {
    Deno.env.delete("DATACOMMONS_API_KEY");
  }
});

// --- sdmx availability-berikelse (2026-08-04, målt mot OECD DF_IALFS_UNE_M:
// kodelistene viste UNE_LF+UNE_LF_M m.fl., men kun UNE_LF_M var BEFOLKET —
// modellen brant kjøringer på gyldige-men-tomme kombinasjoner) ---

const OECD_UNE_DSD_FIXTURE = {
  data: {
    dataStructures: [{
      name: "Monthly unemployment",
      dataStructureComponents: {
        dimensionList: {
          dimensions: [
            { id: "MEASURE", localRepresentation: { enumeration: "urn:sdmx:org.sdmx.infomodel.codelist.Codelist=OECD:CL_MEASURE(1.0)" } },
            { id: "ADJUSTMENT", localRepresentation: { enumeration: "urn:sdmx:org.sdmx.infomodel.codelist.Codelist=OECD:CL_ADJ(1.0)" } },
          ],
          timeDimensions: [{ id: "TIME_PERIOD" }],
        },
      },
    }],
    codelists: [
      { id: "CL_MEASURE", codes: [{ id: "UNE_LF", name: "Unemployment (annual)" }, { id: "UNE_LF_M", name: "Unemployment (monthly)" }] },
      { id: "CL_ADJ", codes: [{ id: "N", name: "Not adjusted" }, { id: "Y", name: "Adjusted" }, { id: "W", name: "Working day adjusted" }] },
    ],
  },
};

const OECD_UNE_AVAIL_FIXTURE = {
  data: {
    contentConstraints: [{
      cubeRegions: [{
        keyValues: [
          { id: "MEASURE", values: ["UNE_LF_M"] },
          { id: "ADJUSTMENT", values: ["N", "Y"] },
          { id: "TIME_PERIOD", values: [] },
        ],
      }],
    }],
  },
};

function fetchPerUrl(svar: Record<string, unknown | number>): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = String(input);
    for (const [del, payload] of Object.entries(svar)) {
      if (url.includes(del)) {
        if (typeof payload === "number") return Promise.resolve(new Response("feil", { status: payload }));
        return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
      }
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}

Deno.test("sdmx metadata: availability filtrerer verdiene til befolkede koder", async () => {
  const fetchImpl = fetchPerUrl({
    "availableconstraint": OECD_UNE_AVAIL_FIXTURE,
    "dataflow/OECD.SDD.TPS/DSD_LFS%40DF_IALFS_UNE_M": OECD_UNE_DSD_FIXTURE,
    "dataflow/OECD.SDD.TPS/DSD_LFS@DF_IALFS_UNE_M": OECD_UNE_DSD_FIXTURE,
  });
  const meta = await tableMetadata("oecd", "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", { registry: REG, fetchImpl });
  const measure = meta.variables.find((v) => v.code === "MEASURE")!;
  assertEquals(measure.values, [{ code: "UNE_LF_M", label: "Unemployment (monthly)" }]);
  assertEquals(measure.kun_befolkede, true);
  const adj = meta.variables.find((v) => v.code === "ADJUSTMENT")!;
  assertEquals(adj.values.map((v) => v.code), ["N", "Y"]);
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.values, []);   // tidsdimensjonen røres ikke
  assertEquals(typeof meta.tilgjengelighet, "string");
});

Deno.test("sdmx metadata: availability-feil → ufiltrert fallback, ingen kast", async () => {
  const fetchImpl = fetchPerUrl({
    "availableconstraint": 500,
    "dataflow/OECD.SDD.TPS/DSD_LFS": OECD_UNE_DSD_FIXTURE,
  });
  const meta = await tableMetadata("oecd", "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", { registry: REG, fetchImpl });
  const measure = meta.variables.find((v) => v.code === "MEASURE")!;
  assertEquals(measure.values.length, 2);   // begge koder — ufiltrert
  assertEquals(meta.tilgjengelighet, undefined);
});

// --- eurostat adapter (XML, Task 4 — vane-myking) ---------------------------
// Målt 2026-08-04 mot ei_lmhr_m (curl, se task-4-report.md for full logg):
//   - dataflow-endepunktet svarer 400 på references=all («ERR_GEN_FLOW_
//     REFERENCES: … må være None, Children, Descendants») — ECBs ?references=all
//     virker IKKE her. references=children gir Dataflow+DataStructure MEN
//     ingen kodelister; references=descendants gir BEGGE (7 kodelister for
//     ei_lmhr_m, inkl. GEO) i ETT kall (3.4 MB, mest GEO) — valgt form: FÆREST
//     kall (1) slår minst-payload (children + N kodeliste-kall).
//   - Navnerom er m:/s:/c: (IKKE ECBs mes:/str:/com:) — <Ref> selv er UTEN
//     prefiks, som hos ECB.
//   - <s:Code>-elementer har FLERE <c:Name xml:lang="…"> (en/de/fr) —
//     fast-xml-parser gir da en ARRAY, ikke ett objekt (ECB-fixturen testet
//     kun ETT språk og fanget ikke dette). xmlName() under plukker "en",
//     ellers første.
//   - contentconstraint/ESTAT/<kode> (case-insensitivt) svarer 200 med
//     <s:CubeRegion include="true"><c:KeyValue id="s_adj"><c:Value>NSA</c:Value>
//     …</c:KeyValue>…</s:CubeRegion> — id-ene er de EKSAKTE dimensjons-idene
//     (små bokstaver: freq/unit/s_adj/indic/geo, TIME_PERIOD stor).

const EUROSTAT_DSD_XML = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DF1</m:ID></m:Header><m:Structures>` +
  `<s:Dataflows><s:Dataflow id="EI_LMHR_M" agencyID="ESTAT" version="1.0"><c:Name xml:lang="en">Unemployment rate (%) - monthly data</c:Name><s:Structure><Ref id="EI_LMHR_M" version="1.0" agencyID="ESTAT" package="datastructure" class="DataStructure"/></s:Structure></s:Dataflow></s:Dataflows>` +
  `<s:Codelists>` +
  `<s:Codelist agencyID="ESTAT" id="S_ADJ" version="1.0"><c:Name xml:lang="en">Seasonal adjustment</c:Name>` +
  `<s:Code id="NSA"><c:Name xml:lang="en">Unadjusted data</c:Name><c:Name xml:lang="de">Unbereinigte Daten</c:Name></s:Code>` +
  `<s:Code id="SA"><c:Name xml:lang="en">Seasonally adjusted data</c:Name><c:Name xml:lang="de">Saisonbereinigte Daten</c:Name></s:Code>` +
  `<s:Code id="CA"><c:Name xml:lang="en">Calendar adjusted data</c:Name></s:Code>` +
  `</s:Codelist>` +
  `<s:Codelist agencyID="ESTAT" id="INDIC" version="1.0"><c:Name xml:lang="en">Indicator</c:Name>` +
  `<s:Code id="LM-UN-T-TOT"><c:Name xml:lang="en">Unemployment, total</c:Name></s:Code>` +
  `<s:Code id="LM-UN-M-TOT"><c:Name xml:lang="en">Unemployment, males</c:Name></s:Code>` +
  `</s:Codelist>` +
  `</s:Codelists>` +
  `<s:DataStructures><s:DataStructure agencyID="ESTAT" id="EI_LMHR_M" version="1.0"><c:Name xml:lang="en">EI_LMHR_M data structure</c:Name><s:DataStructureComponents><s:DimensionList>` +
  `<s:Dimension id="s_adj" position="1"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="S_ADJ" package="codelist" version="1.0"/></s:Enumeration></s:LocalRepresentation></s:Dimension>` +
  `<s:Dimension id="indic" position="2"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="INDIC" package="codelist" version="1.0"/></s:Enumeration></s:LocalRepresentation></s:Dimension>` +
  `<s:TimeDimension id="TIME_PERIOD" position="3"/>` +
  `</s:DimensionList></s:DataStructureComponents></s:DataStructure></s:DataStructures>` +
  `</m:Structures></m:Structure>`;

// contentconstraint: befolker 2 av 3 s_adj-koder (NSA, SA — CA er ALDRI
// rapportert); indic er BEVISST utelatt fra KeyValues (best-effort skal la
// dimensjoner UTEN treff i constraint stå ufiltrert, ikke tømme dem).
const EUROSTAT_CC_XML = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DS1</m:ID></m:Header><m:Structures><s:Constraints><s:ContentConstraint agencyID="ESTAT" id="EI_LMHR_M" version="1.0"><c:Name xml:lang="en">Cube description for dataflow EI_LMHR_M</c:Name><s:CubeRegion include="true"><c:KeyValue id="s_adj"><c:Value>NSA</c:Value><c:Value>SA</c:Value></c:KeyValue><c:KeyValue id="TIME_PERIOD"><c:Value>1983-01</c:Value><c:Value>2026-06</c:Value></c:KeyValue></s:CubeRegion></s:ContentConstraint></s:Constraints></m:Structures></m:Structure>`;

function fakeEurostatFetch(
  dsdXml: string,
  ccXml: string | number,
  capture: string[] = [],
): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = String(input);
    capture.push(url);
    if (url.includes("contentconstraint")) {
      if (typeof ccXml === "number") return Promise.resolve(new Response("feil", { status: ccXml }));
      return Promise.resolve(new Response(ccXml, { status: 200 }));
    }
    if (url.includes("dataflow")) return Promise.resolve(new Response(dsdXml, { status: 200 }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}

Deno.test("eurostat metadata: dispatch treffer (kind='eurostat', tilgang='rest') og strukturroten er utledet fra base_url", async () => {
  const calls: string[] = [];
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EUROSTAT_CC_XML, calls),
  });
  assertEquals(meta.source, "eurostat");
  // statistics/1.0/data/ → sdmx/2.1/ (IKKE bare data/$-kutt som ECB/OECD/NB —
  // se eurostatStructRoot-kommentaren i table-metadata.ts)
  assertEquals(calls[0], "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/EI_LMHR_M?references=descendants");
});

Deno.test("eurostat metadata: dimensjoner+koder ut, tidsdimensjon tom, flerspråklig c:Name → 'en' plukkes", async () => {
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EUROSTAT_CC_XML),
  });
  assertEquals(meta.title, "Unemployment rate (%) - monthly data");
  const sadj = meta.variables.find((v) => v.code === "s_adj")!;
  // NSA/SA har BÅDE en+de c:Name (array hos fast-xml-parser) — CA har kun en.
  // Uten xmlName()-håndtering av arrayet ville label blitt "" eller kastet.
  assertEquals(sadj.values.find((v) => v.code === "NSA")?.label, "Unadjusted data");
  const time = meta.variables.find((v) => v.code === "TIME_PERIOD")!;
  assertEquals(time.time, true);
  assertEquals(time.values, []);   // tidsdimensjonen røres aldri av filteret
});

Deno.test("eurostat metadata: contentconstraint filtrerer til befolkede koder + kun_befolkede; dimensjon UTEN treff i constraint står ufiltrert", async () => {
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EUROSTAT_CC_XML),
  });
  const sadj = meta.variables.find((v) => v.code === "s_adj")!;
  assertEquals(sadj.values.map((v) => v.code).sort(), ["NSA", "SA"]);   // CA UTE
  assertEquals(sadj.kun_befolkede, true);
  const indic = meta.variables.find((v) => v.code === "indic")!;
  assertEquals(indic.values.length, 2);          // indic har ingen KeyValue i CC → ufiltrert
  assertEquals(indic.kun_befolkede, undefined);
  assertEquals(typeof meta.tilgjengelighet, "string");
});

Deno.test("eurostat metadata: contentconstraint feiler (500) → ufiltrert fallback for ALLE dimensjoner, ingen kast", async () => {
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, 500),
  });
  const sadj = meta.variables.find((v) => v.code === "s_adj")!;
  assertEquals(sadj.values.length, 3);           // alle tre, ufiltrert
  assertEquals(sadj.kun_befolkede, undefined);
  assertEquals(meta.tilgjengelighet, undefined);
});

Deno.test("eurostat metadata: find= tømmer IKKE en kort, ufiltrert liste (samme pickValues-kontrakt som andre adaptere)", async () => {
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EUROSTAT_CC_XML),
    find: "helt-urelatert-søkeord",
  });
  // indic (2 koder, IKKE befolkningsfiltrert — ingen KeyValue for indic i CC)
  // skal IKKE tømmes av et find som ikke treffer noen av kodene — samme regel
  // som ecb/pxweb: find slår kun inn på lister lengre enn MAX_VALUES (40).
  const indic = meta.variables.find((v) => v.code === "indic")!;
  assertEquals(indic.values.length, 2);
  assertEquals(indic.valuesTruncated, false);
});

Deno.test("eurostat metadata: find= filtrerer en LANG kodeliste (>MAX_VALUES) til treff", async () => {
  // Bygg en DSD med én dimensjon som har 45 koder — find skal filtrere DENNE,
  // i motsetning til testen over (kort liste, urørt av find).
  const manyCodes = Array.from({ length: 45 }, (_, i) => `<s:Code id="G${i}"><c:Name xml:lang="en">Geo ${i}</c:Name></s:Code>`).join("");
  const dsd = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DF2</m:ID></m:Header><m:Structures>` +
    `<s:Dataflows><s:Dataflow id="X" agencyID="ESTAT" version="1.0"><c:Name xml:lang="en">Test</c:Name><s:Structure><Ref id="X" version="1.0" agencyID="ESTAT" package="datastructure" class="DataStructure"/></s:Structure></s:Dataflow></s:Dataflows>` +
    `<s:Codelists><s:Codelist agencyID="ESTAT" id="GEO" version="1.0">${manyCodes}<s:Code id="NO"><c:Name xml:lang="en">Norway</c:Name></s:Code></s:Codelist></s:Codelists>` +
    `<s:DataStructures><s:DataStructure agencyID="ESTAT" id="X" version="1.0"><c:Name xml:lang="en">X</c:Name><s:DataStructureComponents><s:DimensionList>` +
    `<s:Dimension id="geo" position="1"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="GEO" package="codelist" version="1.0"/></s:Enumeration></s:LocalRepresentation></s:Dimension>` +
    `<s:TimeDimension id="TIME_PERIOD" position="2"/>` +
    `</s:DimensionList></s:DataStructureComponents></s:DataStructure></s:DataStructures></m:Structures></m:Structure>`;
  const meta = await tableMetadata("eurostat", "X", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(dsd, 404),   // ingen constraint-treff i det hele tatt → 404
    find: "norway",
  });
  const geo = meta.variables.find((v) => v.code === "geo")!;
  assertEquals(geo.values, [{ code: "NO", label: "Norway" }]);
});

// --- eurostat fix-runde 1 (code review 2026-08-04) --------------------------

// Medium: fast-xml-parser sin default (parseTagValue:true) tallkonverterer
// <c:Value>-ELEMENTTEKST — "01011000" ble tallet 1011000 (LEDENDE NULL TAPT),
// "2020" ble tallet 2020 (typeof number). xmlText() returnerer "" for et rent
// number (verken streng eller {#text}-objekt), så BEGGE ble filtrert vekk av
// .filter(Boolean) FØR fiksen — kun "TOTAL" (aldri tall-aktig) ville overlevd
// i befolket-settet, mens kun_befolkede:true løy om at lista var komplett.
const LEADING_ZERO_DSD_XML = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DF3</m:ID></m:Header><m:Structures>` +
  `<s:Dataflows><s:Dataflow id="Y" agencyID="ESTAT" version="1.0"><c:Name xml:lang="en">Y</c:Name><s:Structure><Ref id="Y" version="1.0" agencyID="ESTAT" package="datastructure" class="DataStructure"/></s:Structure></s:Dataflow></s:Dataflows>` +
  `<s:Codelists><s:Codelist agencyID="ESTAT" id="PROD" version="1.0">` +
  `<s:Code id="01011000"><c:Name xml:lang="en">Live bovine animals</c:Name></s:Code>` +
  `<s:Code id="2020"><c:Name xml:lang="en">Year-like code</c:Name></s:Code>` +
  `<s:Code id="TOTAL"><c:Name xml:lang="en">Total</c:Name></s:Code>` +
  `</s:Codelist></s:Codelists>` +
  `<s:DataStructures><s:DataStructure agencyID="ESTAT" id="Y" version="1.0"><c:Name xml:lang="en">Y</c:Name><s:DataStructureComponents><s:DimensionList>` +
  `<s:Dimension id="prod" position="1"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="PROD" package="codelist" version="1.0"/></s:Enumeration></s:LocalRepresentation></s:Dimension>` +
  `<s:TimeDimension id="TIME_PERIOD" position="2"/>` +
  `</s:DimensionList></s:DataStructureComponents></s:DataStructure></s:DataStructures></m:Structures></m:Structure>`;

const LEADING_ZERO_CC_XML = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DS3</m:ID></m:Header><m:Structures><s:Constraints><s:ContentConstraint agencyID="ESTAT" id="Y" version="1.0"><c:Name xml:lang="en">Cube description for dataflow Y</c:Name><s:CubeRegion include="true"><c:KeyValue id="prod"><c:Value>01011000</c:Value><c:Value>2020</c:Value><c:Value>TOTAL</c:Value></c:KeyValue></s:CubeRegion></s:ContentConstraint></s:Constraints></m:Structures></m:Structure>`;

Deno.test("eurostat metadata: contentconstraint bevarer ledende null og numeriske koder BYTE-LIKT (parseTagValue-fellen, fix-runde 1)", async () => {
  const meta = await tableMetadata("eurostat", "Y", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(LEADING_ZERO_DSD_XML, LEADING_ZERO_CC_XML),
  });
  const prod = meta.variables.find((v) => v.code === "prod")!;
  // ALLE tre skal overleve — hverken "01011000" (ledende null) eller "2020"
  // (tallformet) skal droppes stille slik de gjorde før parseTagValue:false.
  assertEquals(prod.values.map((v) => v.code).sort(), ["01011000", "2020", "TOTAL"]);
  assertEquals(prod.kun_befolkede, true);
});

// Low: en include="false"-CubeRegion er en EKSKLUSJONSLISTE (KeyValues
// lister koder som IKKE er befolket) — å tolke den som inklusjon ville
// INVERTERT filteret. Best effort: gi opp (ufiltrert fallback), ikke gjett.
const EXCLUSION_CC_XML = `<?xml version='1.0' encoding='UTF-8'?><m:Structure xmlns:m="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure" xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"><m:Header><m:ID>DS4</m:ID></m:Header><m:Structures><s:Constraints><s:ContentConstraint agencyID="ESTAT" id="EI_LMHR_M" version="1.0"><c:Name xml:lang="en">Excluded codes</c:Name><s:CubeRegion include="false"><c:KeyValue id="s_adj"><c:Value>CA</c:Value></c:KeyValue></s:CubeRegion></s:ContentConstraint></s:Constraints></m:Structures></m:Structure>`;

Deno.test("eurostat metadata: CubeRegion include='false' (eksklusjon) → ufiltrert fallback, ingen inversjon, ingen kast", async () => {
  const meta = await tableMetadata("eurostat", "EI_LMHR_M", {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EXCLUSION_CC_XML),
  });
  const sadj = meta.variables.find((v) => v.code === "s_adj")!;
  // Uten guarden ville s_adj blitt filtrert til KUN "CA" (den ekskluderte
  // koden) — stikk motsatt av riktig svar. Med guarden: alle tre, ufiltrert.
  assertEquals(sadj.values.length, 3);
  assertEquals(sadj.kun_befolkede, undefined);
  assertEquals(meta.tilgjengelighet, undefined);
});

Deno.test("eurostat metadata: descendants-kallet timer ut → ærlig norsk feil (fanges av medGuideVedFeil, ikke rå AbortError)", async () => {
  const timeoutFetch = ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("dataflow")) {
      const err = new DOMException("signal timed out", "TimeoutError");
      return Promise.reject(err);
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  let threw = "";
  try {
    await tableMetadata("eurostat", "EI_LMHR_M", { registry: REG, fetchImpl: timeoutFetch });
  } catch (e) {
    threw = String(e);
  }
  assertEquals(threw.includes("svarte ikke innen 20 s"), true, threw);
  assertEquals(threw.includes("EI_LMHR_M"), true, threw);
});

Deno.test("eurostat metadata: tableId URL-enkodes i BEGGE kall (dataflow og contentconstraint)", async () => {
  const calls: string[] = [];
  // Ingen ekte Eurostat-kode inneholder mellomrom — brukes her KUN for å bevise
  // at encodeURIComponent faktisk kjører (worldbankMetadata-mønsteret), ikke
  // fordi det er en realistisk table_id.
  const weird = "ei lmhr_m";
  await tableMetadata("eurostat", weird, {
    registry: REG,
    fetchImpl: fakeEurostatFetch(EUROSTAT_DSD_XML, EUROSTAT_CC_XML, calls),
  });
  assertEquals(calls.some((u) => u.includes("dataflow/ESTAT/ei%20lmhr_m")), true, calls.join(" | "));
  assertEquals(calls.some((u) => u.includes("contentconstraint/ESTAT/ei%20lmhr_m")), true, calls.join(" | "));
});
