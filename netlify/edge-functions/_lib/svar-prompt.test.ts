import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRouteToolDefs, buildSvarSystem, coerceDepth, coerceRoute,
  depthClientToolCalls, depthRunCodeCalls, progressLabel, questionTurn,
} from "./svar-prompt.ts";

Deno.test("coerceRoute: ukjent → data", () => {
  assertEquals(coerceRoute("beregning"), "beregning");
  assertEquals(coerceRoute("oppslag"), "oppslag");
  assertEquals(coerceRoute("språk"), "data");
  assertEquals(coerceRoute(undefined), "data");
});

Deno.test("coerceDepth: deep er default (deep-only-runden)", () => {
  assertEquals(coerceDepth("deep"), "deep");
  assertEquals(coerceDepth("standard"), "standard");
  assertEquals(coerceDepth("fast"), "deep");
  assertEquals(coerceDepth(undefined), "deep");
});

Deno.test("buildSvarSystem(beregning): run_code + modus, INGEN register/EVAL/ost/Omforming", () => {
  const s = buildSvarSystem("beregning", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("run_code"));
  assert(s.includes("#@param"));
  assert(!s.includes("Omforming"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(!s.includes("EVAL-REGLER"));
  assert(!s.includes("ost.connect"));
});

Deno.test("buildSvarSystem(data): beholder EVAL-regler, register, delvis-regel og run_code", () => {
  const s = buildSvarSystem("data", "python", "REGISTERBLOKK-MARKØR", { depth: "standard" });
  assert(s.includes("EVAL-REGLER"));
  assert(s.includes("REGISTERBLOKK-MARKØR"));
  assert(s.includes("Delvise resultater"));
  assert(s.includes("run_code"));
  assert(s.includes("Dybde: STANDARD"));
});

Deno.test("buildSvarSystem(oppslag): minimal — websøk-krav, ingen register", () => {
  const s = buildSvarSystem("oppslag", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("kilde-URL"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  // Størrelsesvakt: RUN-blokka (delt med oppslag) har vokst med tre MÅLTE
  // regler i august (run-disiplin, svar-klart-stopp, variabel-persistens) —
  // taket justert 4000→4600 den 2026-08-04, fortsatt en bevisst brems.
  assert(s.length < 4600);
});

Deno.test("buildSvarSystem: svarformatet sier ingen kodeblokk i sluttsvaret", () => {
  const s = buildSvarSystem("data", "python", "");
  assert(s.includes("ingen kodeblokk"));
  assert(s.includes("ALDRI underscore inni"));   // KaTeX-regelen i RUN
  assert(!s.includes("ÉN kjørbar"));
});

Deno.test("buildRouteToolDefs: beregning = kun run_code", () => {
  const defs = buildRouteToolDefs("beregning", "standard") as { name?: string }[];
  assertEquals(defs.length, 1);
  assertEquals(defs[0].name, "run_code");
});

Deno.test("buildRouteToolDefs: data har katalogverktøy + run_code + hostede webverktøy m/ budsjett", () => {
  const defs = buildRouteToolDefs("data", "standard") as { name?: string; max_uses?: number; max_content_tokens?: number }[];
  const names = defs.map((d) => d.name);
  assert(names.includes("search_catalog") && names.includes("probe") && names.includes("run_code"));
  const ws = defs.find((d) => d.name === "web_search");
  const wf = defs.find((d) => d.name === "web_fetch");
  assertEquals(ws?.max_uses, 3);
  assertEquals(wf?.max_uses, 2);
  assertEquals(wf?.max_content_tokens, 15_000);
});

Deno.test("buildRouteToolDefs: hostedWeb:false dropper webverktøyene", () => {
  const defs = buildRouteToolDefs("oppslag", "deep", { hostedWeb: false }) as { name?: string }[];
  assertEquals(defs.map((d) => d.name), ["run_code"]);
});

Deno.test("budsjetter per dybde", () => {
  assertEquals(depthClientToolCalls("standard"), 8);
  assertEquals(depthClientToolCalls("deep"), 12);
  assertEquals(depthRunCodeCalls("standard"), 4);
  assertEquals(depthRunCodeCalls("deep"), 4);
});

Deno.test("questionTurn: med og uten script-kontekst", () => {
  assert(questionTurn("Hva?", "x=1").includes("x=1"));
  assert(!questionTurn("Hva?").includes("Gjeldende script"));
});

Deno.test("progressLabel: run_code har egen etikett", () => {
  assert(progressLabel("run_code", {}).includes("Kjører scriptet"));
});

Deno.test("buildRouteToolDefs: data-ruten har search_datasets; beregning/oppslag har ikke", () => {
  const names = (defs: unknown[]) => (defs as { name?: string }[]).map((d) => d.name);
  assert(names(buildRouteToolDefs("data", "standard")).includes("search_datasets"));
  assert(!names(buildRouteToolDefs("beregning", "standard")).includes("search_datasets"));
  assert(!names(buildRouteToolDefs("oppslag", "standard")).includes("search_datasets"));
});

Deno.test("buildSvarSystem(data): META_SEARCH inne, SEARCH_HINTS ute, KODEBOK inne", () => {
  const s = buildSvarSystem("data", "python", "REG");
  assert(s.includes("search_datasets"));
  assert(s.includes("Kodebok"));
  assert(!s.includes("Søketips utenfor registeret"));
  assert(s.includes("SISTE utvei"));
});

Deno.test("buildSvarSystem(beregning): ingen META_SEARCH/KODEBOK", () => {
  const s = buildSvarSystem("beregning", "python", "");
  assert(!s.includes("search_datasets"));
  assert(!s.includes("Kodebok"));
});

Deno.test("coerceRoute: utforsk er gyldig", () => {
  assertEquals(coerceRoute("utforsk"), "utforsk");
});

Deno.test("buildSvarSystem(utforsk): kontrakt + dybde + ankere + modus + run_code, ingen register/EVAL/katalog", () => {
  const s = buildSvarSystem("utforsk", "python", "REGISTERBLOKK-MARKØR", { depth: "standard" });
  assert(s.includes("Ikke avgjør spørsmålet"));      // oppdragssetningen
  assert(s.includes("DEKOMPONERINGS-GATE"));
  assert(s.includes("VERDIPREMISSER VELGES ALDRI STILLE"));
  assert(s.includes("MORALSKE SPØRSMÅL"));
  assert(s.includes("KORTSVAR"));
  assert(s.includes("LIGNINGER FORPLIKTER"));
  assert(s.includes("REGIONBESKRIVELSER"));
  assert(s.includes("Dybde: STANDARD"));
  assert(s.includes("Empiriske ankere"));
  assert(s.includes("#@param"));                     // MODE_PY er med
  assert(s.includes("run_code"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(!s.includes("EVAL-REGLER"));
  assert(!s.includes("search_datasets"));
});

Deno.test("buildSvarSystem(utforsk, deep): deep-dybdeblokk", () => {
  const s = buildSvarSystem("utforsk", "python", "", { depth: "deep" });
  assert(s.includes("Dybde: DEEP"));
  assert(!s.includes("Dybde: STANDARD"));
});

Deno.test("buildRouteToolDefs(utforsk): run_code + web m/ budsjett, ingen katalogverktøy", () => {
  const defs = buildRouteToolDefs("utforsk", "standard") as { name?: string; max_uses?: number }[];
  const names = defs.map((d) => d.name);
  assert(names.includes("run_code"));
  assert(names.includes("web_search") && names.includes("web_fetch"));
  assert(!names.includes("search_datasets") && !names.includes("search_catalog") && !names.includes("probe"));
  assertEquals(defs.find((d) => d.name === "web_search")?.max_uses, 3);
});

Deno.test("RUN-fellesregler: definisjonssprik + feilruting i alle pipeline-ruter", () => {
  for (const route of ["beregning", "oppslag", "data", "utforsk"] as const) {
    const s = buildSvarSystem(route, "python", "REG");
    assert(s.includes("FLERE FORSVARLIGE DEFINISJONER"), route);
    assert(s.includes("FEILRUTET"), route);
  }
});

Deno.test("buildRouteToolDefs(utforsk, hostedWeb:false): kun run_code", () => {
  const defs = buildRouteToolDefs("utforsk", "deep", { hostedWeb: false }) as { name?: string }[];
  assertEquals(defs.map((d) => d.name), ["run_code"]);
});

// Mikro/makro-rutingsregel (kilder-profil-output-runden 2026-08-08 Task 2):
// KUN data-ruten (registerkilder/pakker er der de aktuelle [mikro]/[makro]-
// merkede elementene lever) — de tre andre rutene har verken register eller
// pakker, og skal derfor heller ikke få regelen.
Deno.test("buildSvarSystem(data): Mikro/makro-blokk til stede, plassert før registerblokka", () => {
  const s = buildSvarSystem("data", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("## Mikro- vs. makrodata"));
  assert(s.includes("[mikro]") && s.includes("[makro]"));
  assert(s.indexOf("## Mikro- vs. makrodata") < s.indexOf("REGISTERBLOKK-MARKØR"),
    "mikro/makro-blokka skal stå RETT FØR registerblokka");
});

Deno.test("buildSvarSystem: Mikro/makro-blokk FRAVÆRENDE i beregning/oppslag/utforsk", () => {
  assert(!buildSvarSystem("beregning", "python", "").includes("Mikro- vs. makrodata"));
  assert(!buildSvarSystem("oppslag", "python", "").includes("Mikro- vs. makrodata"));
  assert(!buildSvarSystem("utforsk", "python", "", { depth: "standard" }).includes("Mikro- vs. makrodata"));
});

Deno.test("buildSvarSystem(data): DELIVERY dokumenterer auto-connect (registerid rett som receiver)", () => {
  // Kodekontrakt siden 2026-08-01 (DataDirectives.resolve, synket fra openstat):
  // en registerkilde-id som receiver er en implisitt connect. Verktøyhintene
  // viser bare read-linja, så prompten MÅ si at den formen er gyldig.
  const s = buildSvarSystem("data", "python", "REG");
  assert(s.includes("connect-linja er valgfri"));
  // SDMX-flowRef er komma-form (slash 404-er hos OECD, målt live 2026-08-01)
  assert(s.includes("<agency>,<dataflow>"));
});
