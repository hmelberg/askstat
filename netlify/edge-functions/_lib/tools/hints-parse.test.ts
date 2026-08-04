// Hint-må-parse (spec 2026-08-03 §fase 2.2): hvert how_to_read-hint fra
// søkearmene og hvert direktiveksempel i systemprompten skal overleve
// DataDirectives.parse + resolve mot det EKTE registeret. August-lærdommen:
// et hint i en form grammatikken ikke tar er en INTERN SELVMOTSIGELSE —
// denne testen gjør klassen umulig å gjeninnføre.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { searchDatasets } from "./search-datasets.ts";
import { parseRegistry } from "../registry.ts";
import { buildSvarSystem } from "../svar-prompt.ts";

for (const f of ["directive-parser.js", "data-directives.js", "api-kinds.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const DD = (globalThis as any).DataDirectives;

const registry = parseRegistry(JSON.parse(await Deno.readTextFile(
  new URL("../../../../data/data-sources.json", import.meta.url))));

// Hint bruker … som «fyll inn»-plassholder og <…>-maler; normaliser så
// grammatikk-FORMEN testes, ikke plassholderne.
function normaliser(linje: string): string | null {
  let s = linje.trim();
  const hash = s.indexOf("# ");
  if (!s.startsWith("#") && hash > 0) s = s.slice(hash);  // «table_metadata(...) → # s = …»-formen
  if (!s.startsWith("#")) return null;
  if (s.includes("<")) return null;
  s = s.replace(/,\s*(years|countries|indicators|regions|filters)=…/g, "");
  s = s.replace(/…/g, "");
  // Prompt-prosa siterer direktiveksempler i backticks — i en markdown-tabell-
  // celle etterfulgt av « |», i løpende tekst av seg selv. Begge er
  // markdown-dekor, ikke del av direktivet — fjern avsluttende ` (og en
  // eventuell tabell-pipe) FØR grammatikken testes.
  s = s.replace(/`\s*\|?\s*$/, "");
  return /=\s*[\w.]+\.(read|connect)\(/.test(s) ? s : null;
}

function assertParser(linje: string, kilde: string) {
  const parsed = DD.parse(linje);
  assert(parsed.loads.length + parsed.connects.length > 0,
    `${kilde}: ikke gjenkjent som direktiv: ${linje}`);
  for (const r of DD.resolve(parsed, registry)) {
    assert(!r.error, `${kilde}: resolve-feil for «${linje}»: ${r.error}`);
  }
}

function hentDirektivlinjer(tekst: string): string[] {
  const ut: string[] = [];
  for (const rå of tekst.split("\n")) {
    const n = normaliser(rå);
    if (n) ut.push(n);
  }
  return ut;
}

Deno.test("alle search_datasets-hint parser mot ekte register", async () => {
  const ssbSok = registry.find((s) => s.id === "ssb")?.sok_endepunkt ?? "";
  const fetchImpl = ((input: string | URL | Request) => {
    const url = String(input);
    const svar = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body),
      { status: 200, headers: { "content-type": "application/json" } }));
    if (ssbSok && url.startsWith(ssbSok.split("{q}")[0])) {
      return svar({ tables: [{ id: "05839", label: "Arbeidsledige" }] });
    }
    if (url.includes("sdmx.oecd.org") && url.includes("dataflow/all/all")) {
      return svar({ data: { dataflows: [{ id: "DF_TEST", agencyID: "OECD.SDD", name: "Health spending test" }] } });
    }
    if (url.includes("/data/apd-catalog.json")) {
      return svar([{ identifier: "apd1", name: "Health data", description: "",
        url: "https://example.org/x.csv", keywords: [], category: "Healthcare" }]);
    }
    if (url.includes("/data/worldbank-catalog.json")) {
      return svar({ indicators: [{ id: "SH.XPD.CHEX.GD.ZS", name: "Health expenditure share" }] });
    }
    if (url.includes("/data/eurostat-catalog.json")) {
      return svar({ tables: [{ code: "hlth_sha11_hf", title: "Health spending", start: "2000", end: "2024" }] });
    }
    if (url.includes("/data/owid-catalog.json")) {
      return svar({ charts: [{ slug: "life-expectancy", title: "Health life expectancy", subtitle: null }] });
    }
    if (url.includes("api.db.nomics.world")) {
      return svar({ results: { docs: [{ code: "WEO:latest", name: "World Economic Outlook",
        provider_code: "IMF", provider_name: "IMF", nb_series: 5 }] } });
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;

  const res = await searchDatasets("health spending", "stats",
    { registry, origin: "https://ask.melberg.app", fetchImpl });
  assert(res.failed.length === 0,
    "søkearmer feilet i mock (utvid fetchImpl): " + res.failed.join(", "));
  assert(res.hits.length >= 5, "for få treff til å dekke armene: " + res.hits.length);
  for (const hit of res.hits) {
    for (const linje of hentDirektivlinjer(hit.how_to_read ?? "")) {
      assertParser(linje, `hint(${hit.source})`);
    }
  }
});

Deno.test("direktiveksemplene i systemprompten parser mot ekte register", () => {
  for (const mode of ["python", "r", "duckdb"] as const) {
    const linjer = hentDirektivlinjer(buildSvarSystem("data", mode, ""));
    assert(linjer.length >= 2, `prompt(${mode}): fant for få direktiveksempler`);
    for (const linje of linjer) assertParser(linje, `prompt(${mode})`);
  }
});
