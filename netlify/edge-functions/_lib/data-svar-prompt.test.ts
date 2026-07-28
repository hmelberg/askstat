import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDataSvarSystem, buildToolDefs, coerceDataMode, coerceDepth, depthClientToolCalls,
  progressLabel, questionTurn, repairTurn, TOOL_DEFS, CLIENT_TOOL_DEFS,
} from "./data-svar-prompt.ts";
// Den ekte direktivgrammatikken (browser-globals): promptens eksempler skal
// parse rent i den — «eksempler slår regler», så et eksempel parseren avviser
// er en prompt-bug (målt 2026-07-28: etterfølgende kommentar på direktivlinje).
import "../../../js/directive-parser.js";
import "../../../js/data-directives.js";

Deno.test("coerceDataMode defaults to python", () => {
  assertEquals(coerceDataMode("r"), "r");
  assertEquals(coerceDataMode("duckdb"), "duckdb");
  assertEquals(coerceDataMode("m2py"), "python");
  assertEquals(coerceDataMode(undefined), "python");
});

Deno.test("coerceDepth: deep er default (= oppførselen før parameteren)", () => {
  assertEquals(coerceDepth("fast"), "fast");
  assertEquals(coerceDepth("deep"), "deep");
  assertEquals(coerceDepth("turbo"), "deep");
  assertEquals(coerceDepth(undefined), "deep");
});

Deno.test("system prompt: byte-stable, mode-specific, carries core rules", () => {
  const reg = "## Kilderegister (kuratert)\n\n- **ssb** …";
  const a = buildDataSvarSystem("python", reg);
  assertEquals(a, buildDataSvarSystem("python", reg));
  for (const needle of [
    // «load» var her til 2026-07-27; ordet finnes ikke i vokabularet lenger
    // (ost.read erstattet det), så needelen ville bare målt at en gammel
    // prosaformulering overlevde. ost.connect/ost.read er de nye ankrene.
    "ost.connect", "ost.read", "probe", "aldri", "konfunder", "heterogenitet",
    "join", "Kilderegister", "transkribert", "modellkunnskap", "site:",
    "Søketips", "data.europa.eu",
    // 2026-07-27 (2): pandas-url-bro — grenseregelen pandas-vs-ost er ny i
    // DELIVERY; denne needelen er en TILLEGG (ingen eldre needle endret).
    "pd.read_csv", "Grenseregel",
    // Task 6-review: SDMX-forbeholdet manglet operasjonelt i DELIVERY (fantes
    // KUN i hjelp.html for mennesker) — TILLEGG, ingen eldre needle endret.
    "SDMX",
    "stub=",
    "filters={",          // eval-regel 1 (rå API-params som kwargs — målt feilklasse)
    "fredgraph",
    "VARIABELPLAN",       // spørrelogikken: gate før kode ved kausale spørsmål
    "HENDELSESSØK",       // naturlig eksperiment-leting m/ verifiseringskrav
    "cors:true",          // pandas-først-dreiningen (portabilitet)          // eval-regel 5 (nøkkelfri FRED-form)              // SSB-malen (langformat ved kilden) skal være i prompten
    // 2026-07-28: DELIVERY-eksempel-kirurgien — eksempelblokka skal LÆRE
    // pandas-først (eksempler slår regler, målt q15 r2), og proxy-formen
    // skal bare stå som merket siste utvei:
    "IKKE direktiv",
    "SISTE utvei",
    // 2026-07-28: forskningssyntese m/ mekanisk verifiserbare siteringer:
    "search_literature", "OpenAlex", "DOI",
    // 2026-07-28 (kveld): dtypes-prompten — ETT standard-idiom, ikke meny
    // (overraskelsesprinsippet: appen typer aldri implisitt; koden må selv):
    'dtype={"Region": str}',
    "ledende nuller",
    "to_datetime",
    'astype("category")',
    "convert_dtypes",
    "pyjstat",
    // Task 1: eval-regel 7 (dynamisk bygde URL-er)
    "dynamisk bygde URL-er", "simuler",
  ]) {
    if (!a.toLowerCase().includes(needle.toLowerCase())) throw new Error("mangler: " + needle);
  }
  const r = buildDataSvarSystem("r", reg);
  for (const n of ["read.csv(", "fromJSON", "IKKE hent på nytt",
    // r-prompt-dtypes-runden: standard-idiom + app-only-merket ost-vei
    "colClasses", "ledende nuller", "factor(", "ost_read_csv", "KUN I OPENSTAT"]) {
    if (!r.includes(n)) throw new Error("MODE_R mangler: " + n);
  }
  if (!r.includes("ggplot2") || a.includes("ggplot2")) throw new Error("modus-blokker feil");
  const a2 = buildDataSvarSystem("python", reg);
  if (!a2.includes("JSON-API")) throw new Error("DELIVERY mangler JSON-API-linjen");
  const d = buildDataSvarSystem("duckdb", reg);
  if (!d.includes("read_csv_auto")) throw new Error("duckdb-blokk mangler");
});

Deno.test("promptens egne kodeblokk-eksempler parser rent i den ekte grammatikken", () => {
  // deno-lint-ignore no-explicit-any
  const DD = (globalThis as any).DataDirectives;
  if (!DD) throw new Error("DataDirectives-globalen mangler (importrekkefølge?)");
  for (const mode of ["python", "r", "duckdb"] as const) {
    const sys = buildDataSvarSystem(mode, "## Kilderegister (kuratert)\n");
    const blocks = [...sys.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    if (mode === "python" && blocks.length < 2) throw new Error("fant ikke eksempelblokkene");
    for (const b of blocks) {
      const p = DD.parse(b);
      const a = DD.parseAssembly(b);
      const errs = (p.errors as string[]).concat(a.errors as string[]);
      if (errs.length) {
        throw new Error(`eksempelblokk i ${mode}-prompten lærer bort ugyldig syntaks: ${JSON.stringify(errs)}\n---\n${b}`);
      }
    }
  }
});

Deno.test("dybde: deep er default-blokk, fast bytter budsjett-tabell — ærlighet i begge", () => {
  const reg = "## Kilderegister (kuratert)\n\n- **ssb** …";
  const deep = buildDataSvarSystem("python", reg);
  assertEquals(deep, buildDataSvarSystem("python", reg, { depth: "deep" }));
  if (!deep.includes("## Dybde: DEEP")) throw new Error("DEEP-blokk mangler i default");
  if (deep.includes("## Dybde: FAST")) throw new Error("FAST-blokk lekket inn i deep");
  const fast = buildDataSvarSystem("python", reg, { depth: "fast" });
  if (!fast.includes("## Dybde: FAST")) throw new Error("FAST-blokk mangler");
  if (fast.includes("## Dybde: DEEP")) throw new Error("DEEP-blokk lekket inn i fast");
  // Fast reduserer ambisjon, aldri ærlighet — begge blokkvariantene bærer
  // fortsatt alle ærlighetsreglene (de ligger utenfor dybdeblokken):
  for (const s of [fast, deep]) {
    for (const n of ["ALDRI fabrikker", "probe", "VARIABELPLAN"]) {
      if (!s.includes(n)) throw new Error("ærlighetsregel mangler i dybdevariant: " + n);
    }
  }
  if (!fast.includes("ALDRI ÆRLIGHET")) throw new Error("fast mangler ambisjon-vs-ærlighet-setningen");
});

Deno.test("buildToolDefs: budsjett-knottene speiler dybdetabellene", () => {
  const fast = buildToolDefs("fast") as { name: string; max_uses?: number }[];
  const deep = buildToolDefs("deep") as { name: string; max_uses?: number }[];
  assertEquals(deep, TOOL_DEFS as typeof deep);
  assertEquals(fast.find((t) => t.name === "web_search")?.max_uses, 2);
  assertEquals(fast.find((t) => t.name === "web_fetch")?.max_uses, 1);
  assertEquals(deep.find((t) => t.name === "web_search")?.max_uses, 5);
  assertEquals(deep.find((t) => t.name === "web_fetch")?.max_uses, 5);
  assertEquals(depthClientToolCalls("fast"), 4);
  assertEquals(depthClientToolCalls("deep"), 12);
});

Deno.test("TOOL_DEFS: four client tools + hosted web_search/web_fetch", () => {
  const names = TOOL_DEFS.map((t) => (t as { name: string }).name);
  assertEquals(names, ["search_catalog", "table_metadata", "probe", "search_literature", "web_search", "web_fetch"]);
  assertEquals((TOOL_DEFS[4] as { type: string }).type, "web_search_20250305");
  assertEquals((TOOL_DEFS[5] as { type: string }).type, "web_fetch_20250910");
});

Deno.test("turns and progress labels", () => {
  if (!questionTurn("Hvor mange?", "x=1").includes("x=1")) throw new Error("script-kontekst mangler");
  const rep = repairTurn("q", "bad()", "NameError: x", 2);
  for (const n of ["bad()", "NameError", "2", "3"]) if (!rep.includes(n)) throw new Error("repair mangler " + n);
  if (!progressLabel("search_catalog", { source: "ssb", query: "ledighet" }).includes("ssb")) {
    throw new Error("progress-etikett");
  }
  if (!progressLabel("search_literature", { query: "cash-for-care" }).includes("cash-for-care")) {
    throw new Error("litteratur-etikett");
  }
});

Deno.test("CLIENT_TOOL_DEFS er de fire klientverktøyene; TOOL_DEFS utvider dem", () => {
  const names = (CLIENT_TOOL_DEFS as { name: string }[]).map((t) => t.name);
  assertEquals(names, ["search_catalog", "table_metadata", "probe", "search_literature"]);
  assertEquals(TOOL_DEFS.slice(0, 4), CLIENT_TOOL_DEFS);
  assertEquals((TOOL_DEFS as { name: string }[]).map((t) => t.name).slice(4), ["web_search", "web_fetch"]);
});

Deno.test("buildDataSvarSystem: memoryUrls-blokk kun når bedt om, mellom Søketips og register", () => {
  const reg = "## Kilderegister (kuratert)\n\n- **ssb** …";
  const uten = buildDataSvarSystem("python", reg);
  if (uten.includes("modellkunnskaps-URL")) throw new Error("MEMORY_URLS lekket inn i default");
  const med = buildDataSvarSystem("python", reg, { memoryUrls: true });
  if (!med.includes("modellkunnskaps-URL")) throw new Error("MEMORY_URLS mangler");
  const iHints = med.indexOf("## Søketips");
  const iMem = med.indexOf("## Uten websøk");
  const iReg = med.indexOf("## Kilderegister");
  if (!(iHints < iMem && iMem < iReg)) throw new Error("feil blokkrekkefølge");
});
