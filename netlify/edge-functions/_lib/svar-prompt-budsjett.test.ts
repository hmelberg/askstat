import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRouteToolDefs, buildSvarSystem, depthClientToolCalls, depthRunCodeCalls } from "./svar-prompt.ts";

Deno.test("budsjettknotter og DEPTH-teksten forteller samme historie (spec fase 2.5)", () => {
  assertEquals(depthClientToolCalls("standard"), 8);
  assertEquals(depthRunCodeCalls("standard"), 4);
  assertEquals(depthClientToolCalls("deep"), 12);
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("≤ 8 totalt"), "DEPTH-tabellen må si ≤ 8 klientverktøykall");
  assert(sys.includes("| ≤ 3 |"), "DEPTH-tabellen må si ≤ 3 web_search");
  assert(sys.includes("| ≤ 2 |"), "DEPTH-tabellen må si ≤ 2 web_fetch");
  assert(sys.includes("≤ 4 kjøringer"), "DEPTH-tabellen må si ≤ 4 run_code");
  const tools = buildRouteToolDefs("data", "standard") as { name: string; max_uses?: number }[];
  assertEquals(tools.find((t) => t.name === "web_search")?.max_uses, 3);
  assertEquals(tools.find((t) => t.name === "web_fetch")?.max_uses, 2);
});

Deno.test("utforsk-standard-prosaen matcher de delte knottene", () => {
  const sys = buildSvarSystem("utforsk", "python", "");
  assert(sys.includes("≤ 3 web_search"), "utforsk-teksten må promise ≤ 3 web_search");
  assert(sys.includes("web_search, ≤ 2"), "utforsk-teksten må promise web_search, ≤ 2 web_fetch");
  assert(sys.includes("≤ 4 run_code-kjøringer"), "utforsk-teksten må promise ≤ 4 run_code-kjøringer");
});

Deno.test("dekningssjekk- og omstartsreglene er montert i data-ruten (spec fase 2.4)", () => {
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("DEKNINGSSJEKK"), "META_SEARCH må ha dekningssjekk-regelen");
  assert(sys.includes("forkast tilnærmingen"), "RUN må ha omstartsregelen");
});

Deno.test("MODE_PY lærer aldri bort toppnivå-await micropip (målt SyntaxError 2026-08-04)", () => {
  const sys = buildSvarSystem("data", "python", "");
  assert(!/Andre pakker: `import micropip/.test(sys),
    "MODE_PY må ikke instruere `import micropip; await micropip.install(...)`");
  assert(sys.includes("installerer manglende\nimports automatisk"),
    "MODE_PY må forklare auto-install-veien");
  assert(sys.includes("ALDRI `await micropip.install(...)`"),
    "MODE_PY må forby toppnivå-await eksplisitt");
});

Deno.test("run-disiplin- og enklest-kilde-reglene er montert (målt 2026-08-04)", () => {
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("REPARASJONSRESERVE"), "RUN må si at budsjettet er reparasjonsreserve, ikke arbeidsplan");
  assert(sys.includes("table_metadata(find=…) FØRST"), "RUN må kreve kodeoppslag før ny kjøring ved tomt uttrekk");
  assert(sys.includes("ENKLEST spørremodell"), "ROUTING må ha enklest-kilde-regelen");
});

Deno.test("ROUTING har DATATYPE-blokken og nevner ipums (F3 Task 9)", () => {
  const sys = buildSvarSystem("data", "python", "");
  assert(sys.includes("DATATYPE styrer scope"), "ROUTING må ha DATATYPE-blokken");
  assert(sys.includes("ipums"), "ROUTING/DATATYPE må nevne ipums-guiden");
});
