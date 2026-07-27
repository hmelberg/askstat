import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDataSvarSystem, coerceDataMode, progressLabel, questionTurn, repairTurn, TOOL_DEFS, CLIENT_TOOL_DEFS,
} from "./data-svar-prompt.ts";

Deno.test("coerceDataMode defaults to python", () => {
  assertEquals(coerceDataMode("r"), "r");
  assertEquals(coerceDataMode("duckdb"), "duckdb");
  assertEquals(coerceDataMode("m2py"), "python");
  assertEquals(coerceDataMode(undefined), "python");
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
  ]) {
    if (!a.toLowerCase().includes(needle.toLowerCase())) throw new Error("mangler: " + needle);
  }
  const r = buildDataSvarSystem("r", reg);
  if (!r.includes("ggplot2") || a.includes("ggplot2")) throw new Error("modus-blokker feil");
  const d = buildDataSvarSystem("duckdb", reg);
  if (!d.includes("read_csv_auto")) throw new Error("duckdb-blokk mangler");
});

Deno.test("TOOL_DEFS: three client tools + hosted web_search/web_fetch", () => {
  const names = TOOL_DEFS.map((t) => (t as { name: string }).name);
  assertEquals(names, ["search_catalog", "table_metadata", "probe", "web_search", "web_fetch"]);
  assertEquals((TOOL_DEFS[3] as { type: string }).type, "web_search_20250305");
  assertEquals((TOOL_DEFS[4] as { type: string }).type, "web_fetch_20250910");
});

Deno.test("turns and progress labels", () => {
  if (!questionTurn("Hvor mange?", "x=1").includes("x=1")) throw new Error("script-kontekst mangler");
  const rep = repairTurn("q", "bad()", "NameError: x", 2);
  for (const n of ["bad()", "NameError", "2", "3"]) if (!rep.includes(n)) throw new Error("repair mangler " + n);
  if (!progressLabel("search_catalog", { source: "ssb", query: "ledighet" }).includes("ssb")) {
    throw new Error("progress-etikett");
  }
});

Deno.test("CLIENT_TOOL_DEFS er de tre klientverktøyene; TOOL_DEFS utvider dem", () => {
  const names = (CLIENT_TOOL_DEFS as { name: string }[]).map((t) => t.name);
  assertEquals(names, ["search_catalog", "table_metadata", "probe"]);
  assertEquals(TOOL_DEFS.slice(0, 3), CLIENT_TOOL_DEFS);
  assertEquals((TOOL_DEFS as { name: string }[]).map((t) => t.name).slice(3), ["web_search", "web_fetch"]);
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
