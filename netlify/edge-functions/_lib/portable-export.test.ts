import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

for (const f of ["data-directives.js", "pxweb.js", "assembly-duckdb.js", "portable-export.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const PE = (globalThis as any).PortableExport;

Deno.test("passthrough: script uten direktiver er byte-identisk", () => {
  const s = "import pandas as pd\nprint('hei')\n";
  const out = PE.transpile(s, "python", []);
  assertEquals(out.code, s);
  assertEquals(out.warnings, []);
});

Deno.test("GET csv: direkte URL → pd.read_csv, original som kommentar, header + import lagt til", () => {
  const s = "# load https://ourworldindata.org/grapher/life-expectancy.csv as co2\nprint(co2.head())\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes("Portabel eksport fra OpenStat")) throw new Error("mangler header:\n" + out.code);
  if (!out.code.includes("import pandas as pd")) throw new Error("mangler pandas-import");
  if (!out.code.includes('# load https://ourworldindata.org/grapher/life-expectancy.csv as co2')) {
    throw new Error("originaldirektivet mangler som kommentar");
  }
  if (!out.code.includes('co2 = pd.read_csv("https://ourworldindata.org/grapher/life-expectancy.csv", sep=None, engine="python")')) {
    throw new Error("feil emisjon:\n" + out.code);
  }
  assertEquals(out.warnings, []);
});

Deno.test("proxy-utpakking: /api/hent?url=<enc> → indre URL", () => {
  const inner = "https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?valueCodes[Kjonn]=0&outputFormat=csv";
  const s = "# load /api/hent?url=" + encodeURIComponent(inner) + " as ledighet\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes(`ledighet = pd.read_csv(${JSON.stringify(inner)}, sep=None, engine="python")`)) {
    throw new Error("indre URL ikke pakket ut:\n" + out.code);
  }
  if (out.code.includes("/api/hent")) {
    // originaldirektivet (kommentaren) FÅR inneholde /api/hent — men emisjonslinjen skal ikke
    const emitted = out.code.split("\n").filter((l: string) => l.includes("pd.read_csv"));
    if (emitted.some((l: string) => l.includes("/api/hent"))) throw new Error("proxy-URL i emisjon");
  }
});

Deno.test("POST-reversering: &body= → requests.post + json.loads", () => {
  const inner = "https://statfin.stat.fi/PXWeb/api/v1/en/StatFin/tyokay/tabell.px";
  const body = JSON.stringify({ query: [], response: { format: "csv" } });
  const s = "# load /api/hent?url=" + encodeURIComponent(inner) + "&body=" + encodeURIComponent(body) + " as syss\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes("requests.post(")) throw new Error("mangler requests.post:\n" + out.code);
  if (!out.code.includes("json.loads(" + JSON.stringify(body) + ")")) throw new Error("body ikke inlinet via json.loads");
  if (!out.code.includes("io.StringIO(")) throw new Error("csv-respons skal leses via io.StringIO");
  for (const imp of ["import requests", "import io", "import json"]) {
    if (!out.code.includes(imp)) throw new Error("mangler " + imp);
  }
});

Deno.test("kind(json) → .json()-emisjon m/ rå-JSON-kommentar", () => {
  const s = "# load https://api.worldbank.org/v2/country/NO/indicator/X?format=json as wb, kind(json)\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes('wb = requests.get("https://api.worldbank.org/v2/country/NO/indicator/X?format=json").json()')) {
    throw new Error("feil json-emisjon:\n" + out.code);
  }
});

Deno.test("connect + register-id løses via registry; cors:false-kilde blir DIREKTE URL", () => {
  const REG = [{ id: "ssb", navn: "SSB", utgiver: "SSB", tillit: "offisiell", tilgang: "pxweb",
    base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/", cors: false }];
  const s = "# connect ssb\n# load ssb/tables/05839/metadata as meta, kind(json)\n";
  const out = PE.transpile(s, "python", REG);
  if (!out.code.includes('meta = requests.get("https://data.ssb.no/api/pxwebapi/v2-beta/tables/05839/metadata").json()')) {
    throw new Error("registry-oppløsning feilet:\n" + out.code);
  }
});

Deno.test("parquet og csv-default: endelse styrer; ukjent endelse → csv + warning", () => {
  const s = "# load https://x.example/data.parquet as p\n# load https://x.example/api/rows as r\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes('p = pd.read_parquet("https://x.example/data.parquet")')) throw new Error("parquet-emisjon mangler");
  if (!out.code.includes('r = pd.read_csv("https://x.example/api/rows", sep=None, engine="python")')) throw new Error("csv-default mangler");
  if (!out.warnings.some((w: string) => w.includes("r"))) throw new Error("mangler csv-default-warning: " + JSON.stringify(out.warnings));
});

Deno.test("import-dedup: eksisterende 'import pandas as pd' dupliseres ikke", () => {
  const s = "import pandas as pd\n# load https://x.example/d.csv as df\n";
  const out = PE.transpile(s, "python", []);
  const count = (out.code.match(/^import pandas as pd$/gm) || []).length;
  assertEquals(count, 1);
});

Deno.test("direktivfeil → Error('Direktivfeil: …')", () => {
  assertThrows(() => PE.transpile("# load ukjent/tab as x\n", "python", []), Error, "Direktivfeil");
});

Deno.test("ukjent mode → Error", () => {
  assertThrows(() => PE.transpile("print(1)", "duckdb", []), Error);
});

Deno.test("R: GET csv → read.csv m/ separator-kommentar", () => {
  const s = "-- load https://x.example/d.csv as df\nsummary(df)\n";
  const out = PE.transpile(s, "r", []);
  if (!out.code.includes('df <- read.csv("https://x.example/d.csv")  # NB: sjekk skilletegn — nordiske CSV-er bruker ofte sep=";"')) {
    throw new Error("feil R-csv-emisjon:\n" + out.code);
  }
});

Deno.test("R: kind(json) → jsonlite::fromJSON", () => {
  const s = "# load https://x.example/d as j, kind(json)\n";
  const out = PE.transpile(s, "r", []);
  if (!out.code.includes('j <- jsonlite::fromJSON("https://x.example/d")  # krever jsonlite')) {
    throw new Error("feil R-json-emisjon:\n" + out.code);
  }
});

Deno.test("R: POST-reversering → httr::POST-skjelett", () => {
  const inner = "https://statfin.stat.fi/PXWeb/api/v1/en/t.px";
  const body = JSON.stringify({ query: [], response: { format: "csv" } });
  const s = "# load /api/hent?url=" + encodeURIComponent(inner) + "&body=" + encodeURIComponent(body) + " as syss\n";
  const out = PE.transpile(s, "r", []);
  if (!out.code.includes('httr::POST("https://statfin.stat.fi/PXWeb/api/v1/en/t.px"')) throw new Error("mangler httr::POST:\n" + out.code);
  if (!out.code.includes("body = " + JSON.stringify(body))) {
    throw new Error("body ikke inlinet med rStr:\n" + out.code);
  }
  if (!out.code.includes("# krever httr")) throw new Error("mangler pakke-kommentar");
});

Deno.test("R: POST-body med backslash escapes korrekt (rStr, ikke håndrullet)", () => {
  const inner = "https://x.example/api";
  const body = JSON.stringify({ path: "a\\/b", note: "it's" });
  const s = "# load /api/hent?url=" + encodeURIComponent(inner) + "&body=" + encodeURIComponent(body) + " as d\n";
  const out = PE.transpile(s, "r", []);
  // JSON.stringify-escaped dobbeltsitert literal skal inneholde bodyen eksakt:
  if (!out.code.includes("body = " + JSON.stringify(body))) {
    throw new Error("body ikke rStr-escapet:\n" + out.code);
  }
});

Deno.test("R: parquet → nedlasting + arrow, med kommentar", () => {
  const s = "# load https://x.example/d.parquet as p\n";
  const out = PE.transpile(s, "r", []);
  if (!out.code.includes('download.file("https://x.example/d.parquet"')) throw new Error("mangler download.file:\n" + out.code);
  if (!out.code.includes("arrow::read_parquet")) throw new Error("mangler arrow::read_parquet");
});

Deno.test("POST-body med ''' inni lekker/korrumperer ikke — json.loads(<escapet streng>)", () => {
  const inner = "https://x.example/api";
  const body = JSON.stringify({ note: "her er '''tre apostrofer''' inni en verdi" });
  const s = "# load /api/hent?url=" + encodeURIComponent(inner) + "&body=" + encodeURIComponent(body) + " as d\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes("json.loads(" + JSON.stringify(body) + ")")) {
    throw new Error("body med ''' ikke trygt inlinet:\n" + out.code);
  }
  if (out.code.includes("json.loads(r'''")) throw new Error("gammel r'''-inlining brukt fortsatt — usikker mot ''' i body:\n" + out.code);
});

const FRED_REG = [{ id: "fred", navn: "FRED", utgiver: "Fed", tillit: "etablert", tilgang: "rest",
  base_url: "https://api.stlouisfed.org/fred/", cors: false,
  auth: { type: "api_key", env: "FRED_API_KEY", plassering: "query:api_key" } }];
const KAGGLE_REG = [{ id: "kaggle", navn: "Kaggle", utgiver: "K", tillit: "etablert", tilgang: "rest",
  base_url: "https://www.kaggle.com/api/v1/", cors: false,
  auth: { type: "api_key", user: true, valgfri: true, plassering: "basic" } }];

Deno.test("nøkkelkilde (query-plassering) → plassholder-konstant + param i URL + warning", () => {
  const s = "# connect fred\n# load fred/series/observations?series_id=UNRATE&file_type=json as u, kind(json)\n";
  const out = PE.transpile(s, "python", FRED_REG);
  if (!out.code.includes('FRED_API_KEY = "SETT-INN-EGEN-NØKKEL"')) throw new Error("mangler plassholder:\n" + out.code);
  if (!out.code.includes('"&api_key=" + FRED_API_KEY')) throw new Error("nøkkelparam ikke bygget:\n" + out.code);
  if (!out.warnings.some((w: string) => w.includes("nøkkel"))) throw new Error("mangler warning");
  if (out.code.includes("SETT-INN-EGEN-NØKKEL\"\nFRED_API_KEY")) throw new Error("plassholder duplisert");
});

Deno.test("valgfri kilde (kaggle) → anonym eksport + kommentar, ingen plassholder", () => {
  const s = "# connect kaggle\n# load kaggle/datasets/download/o/s/f.csv as k\n";
  const out = PE.transpile(s, "python", KAGGLE_REG);
  if (out.code.includes("SETT-INN-EGEN-NØKKEL")) throw new Error("valgfri kilde skal ikke få plassholder");
  if (!out.code.includes("# nøkkel er valgfri")) throw new Error("mangler valgfri-kommentar:\n" + out.code);
  if (!out.code.includes('k = pd.read_csv("https://www.kaggle.com/api/v1/datasets/download/o/s/f.csv"')) {
    throw new Error("anonym emisjon mangler:\n" + out.code);
  }
});

Deno.test("key(<literal>) maskeres i output og gir warning", () => {
  const s = "# load https://x.example/hemmelig.csv as h, key(supersecret123)\n";
  const out = PE.transpile(s, "python", []);
  if (out.code.includes("supersecret123")) throw new Error("nøkkelliteral lekket til eksport");
  if (!out.code.includes("key(***)")) throw new Error("maskering mangler i kommentarlinjen");
  if (!out.warnings.some((w: string) => w.includes("h"))) throw new Error("mangler warning for kryptert kilde");
});

Deno.test("legitim key(...)-formet kode (data.table::key m.fl.) overlever byte-identisk — scrub skopet til direktivlinjer", () => {
  const s = "dt <- data.table::key(dt)\nx = mapping.key(5)\n# load https://x.example/scrub-safe.csv as s\n";
  const out = PE.transpile(s, "python", []);
  if (!out.code.includes("dt <- data.table::key(dt)")) throw new Error("data.table::key(dt) mangla/mangla byte-identisk:\n" + out.code);
  if (!out.code.includes("x = mapping.key(5)")) throw new Error("mapping.key(5) mangla byte-identisk:\n" + out.code);
  if (out.code.includes("key(***)")) throw new Error("legitim kode ble maskert:\n" + out.code);
  if (!out.code.includes('s = pd.read_csv("https://x.example/scrub-safe.csv"')) throw new Error("direktivlinjen virker ikke lenger:\n" + out.code);
  if (out.warnings.some((w: string) => w.includes("maskert"))) throw new Error("falsk maskerings-warning: " + JSON.stringify(out.warnings));
});

Deno.test("key(<literal>) på connect-linje maskeres også", () => {
  const s = "# connect https://x.example/enc as c, key(hemmelig999)\n# load c/d.csv as d\n";
  const out = PE.transpile(s, "python", []);
  if (out.code.includes("hemmelig999")) throw new Error("connect-nøkkelliteral lekket til eksport:\n" + out.code);
  if (!out.code.includes("key(***)")) throw new Error("maskering mangler på connect-linjen:\n" + out.code);
});

Deno.test("anvil-kilde og exec(remote) → ikke-portabel kommentarblokk, resten eksporteres", () => {
  const s = "# connect minkilde\n# load minkilde as d\nprint('etterpå')\n";
  const out = PE.transpile(s, "python", []);   // tomt register → anvil-gren
  if (!out.code.includes("krever OpenStat-appen")) throw new Error("mangler ikke-portabel-blokk:\n" + out.code);
  if (!out.code.includes("print('etterpå')")) throw new Error("resten av scriptet mangler");
  if (!out.warnings.length) throw new Error("mangler warning");
});

Deno.test("R: POST- og nøkkel-temporaries er gyldige R-navn (starter aldri med underscore)", () => {
  const REG = [{ id: "fred", navn: "F", utgiver: "F", tillit: "etablert", tilgang: "rest",
    base_url: "https://api.stlouisfed.org/fred/", cors: false,
    auth: { type: "api_key", env: "FRED_API_KEY", plassering: "query:api_key" } }];
  const inner = "https://x.example/t.px";
  const body = JSON.stringify({ q: 1 });
  const s = "# connect fred\n# load fred/series?x=1 as u, kind(json)\n# load /api/hent?url=" + encodeURIComponent(inner) + "&body=" + encodeURIComponent(body) + " as p\n";
  const out = PE.transpile(s, "r", REG);
  const targets = out.code.split("\n")
    .map((l: string) => (/^\s*([A-Za-z_.][\w.]*)\s*<-/.exec(l) || [])[1])
    .filter(Boolean);
  for (const t of targets) {
    if (/^_/.test(t)) throw new Error("ugyldig R-navn emittert: " + t + "\n" + out.code);
  }
  if (!out.code.includes("FRED_API_KEY <- ")) throw new Error("mangler R-plassholder");
  if (!out.code.includes("url_u_")) throw new Error("nøkkel-URL-variabel mangler/feil navn:\n" + out.code);
});

Deno.test("fast-path: malformet direktiv m/ key-literal scrubbes også uten parsebare loads", () => {
  const s = "# load https://x.example/secret.csv key(supersecret123)\nprint('hei')\n";
  const out = PE.transpile(s, "python", []);
  if (out.code.includes("supersecret123")) throw new Error("nøkkelliteral lekket via fast-path");
  if (!out.code.includes("key(***)")) throw new Error("maskering mangler");
  if (!out.code.includes("print('hei')")) throw new Error("resten mangler");
});

// ── pxweb-eksport (plan 2026-07-25 Task 2) ──────────────────────────────────
const PX_SCRIPT = [
  "# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)",
  "# load ssb/05839 as bef",
  "print(bef.head())",
].join("\n");

Deno.test("pxweb python: _px_frame-helper + data-URL med json-stat2", () => {
  const out = PE.transpile(PX_SCRIPT, "python", []);
  if (!out.code.includes("def _px_frame(ds):")) throw new Error("mangler helper:\n" + out.code);
  if (!out.code.includes('bef = _px_frame(requests.get("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?lang=no&outputFormat=json-stat2").json())')) {
    throw new Error("feil emisjon:\n" + out.code);
  }
  if (!out.code.includes("import requests")) throw new Error("mangler requests-import");
  if (!out.code.includes("import pandas as pd")) throw new Error("mangler pandas-import");
});

Deno.test("pxweb python: helperen emitteres ÉN gang ved to pxweb-loads", () => {
  const s2 = PX_SCRIPT + "\n# load ssb/07459 as pop\n";
  const out = PE.transpile(s2, "python", []);
  assertEquals(out.code.split("def _px_frame(ds):").length - 1, 1);
});

Deno.test("pxweb r: px_frame_-helper + jsonlite-lesing", () => {
  const out = PE.transpile(PX_SCRIPT.replace("print(bef.head())", "head(bef)"), "r", []);
  if (!out.code.includes("px_frame_ <- function(ds)")) throw new Error("mangler helper:\n" + out.code);
  if (!out.code.includes('bef <- px_frame_(jsonlite::fromJSON("https://data.ssb.no/api/pxwebapi/v2/tables/05839/data?lang=no&outputFormat=json-stat2", simplifyVector = FALSE))')) {
    throw new Error("feil emisjon:\n" + out.code);
  }
});

// ── montering i eksporten (plan 2026-07-25 Task 3) ──────────────────────────
const ASM_SCRIPT = [
  "# connect https://x.example/kommune.parquet as a, kind(parquet)",
  "# connect https://x.example/kommune2.parquet as b, kind(parquet)",
  "# create-dataset panel, key(kommune_nr year)",
  "# import a/skatt into panel",
  "# import b/avfall into panel",
  "print(panel.shape)",
].join("\n");

Deno.test("montering python: kildelesing + merge-kjede med composite key", () => {
  const out = PE.transpile(ASM_SCRIPT, "python", []);
  if (!out.code.includes('src_a = pd.read_parquet("https://x.example/kommune.parquet")')) {
    throw new Error("mangler kildelesing:\n" + out.code);
  }
  if (!out.code.includes('panel = src_a[["kommune_nr", "year", "skatt"]]')) {
    throw new Error("mangler subset:\n" + out.code);
  }
  if (!out.code.includes('panel = panel.merge(src_b[["kommune_nr", "year", "avfall"]], on=["kommune_nr", "year"], how="left")')) {
    throw new Error("mangler merge:\n" + out.code);
  }
});

Deno.test("montering r: merge med by = c(...) og all.x for left", () => {
  const out = PE.transpile(ASM_SCRIPT.replace("print(panel.shape)", "dim(panel)"), "r", []);
  if (!out.code.includes('panel <- src_a[, c("kommune_nr", "year", "skatt")]')) {
    throw new Error("mangler subset:\n" + out.code);
  }
  if (!out.code.includes('panel <- merge(panel, src_b[, c("kommune_nr", "year", "avfall")], by = c("kommune_nr", "year"), all.x = TRUE)')) {
    throw new Error("mangler merge:\n" + out.code);
  }
});

Deno.test("montering: join-steg mot datasett-variabel + pxweb-kilde i import", () => {
  const s2 = [
    "# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)",
    "# connect https://x.example/f.parquet as p, kind(parquet)",
    "# load p as ekstra",
    "# create-dataset d, key(Tid)",
    "# import ssb/05839.value into d",
    "# join ekstra into d on Tid inner",
  ].join("\n");
  const out = PE.transpile(s2, "python", []);
  if (!out.code.includes("src_ssb__05839 = _px_frame(requests.get(")) {
    throw new Error("pxweb-kilden i montering mangler:\n" + out.code);
  }
  if (!out.code.includes('d = d.merge(ekstra, on=["Tid"], how="inner")')) {
    throw new Error("join-steget mangler:\n" + out.code);
  }
});

Deno.test("montering: duckdb-kilde gir kommentar + warning, ikke knekt kode", () => {
  const s3 = [
    "# connect https://x.example/f.duckdb as db, kind(duckdb)",
    "# create-dataset d, key(pid)",
    "# import db/tab.col into d",
  ].join("\n");
  const out = PE.transpile(s3, "python", []);
  if (!out.warnings.some((w: string) => w.includes("duckdb"))) throw new Error("mangler warning");
  if (!out.code.includes("# (datasettet «d» kunne ikke eksporteres")) throw new Error("mangler kommentar:\n" + out.code);
});

Deno.test("eurostat python: samme _px_frame-helper, eurostat-URL", () => {
  const s4 = [
    "# connect https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data as eu, kind(eurostat)",
    "# read eu/nama_10_gdp?geo=NO as bnp",
  ].join("\n");
  const out = PE.transpile(s4, "python", []);
  if (!out.code.includes("def _px_frame(ds):")) throw new Error("mangler helper:\n" + out.code);
  if (!out.code.includes('bnp = _px_frame(requests.get("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp?lang=en&geo=NO&format=JSON").json())')) {
    throw new Error("feil emisjon:\n" + out.code);
  }
});
