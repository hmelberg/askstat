# Oppdagelseslaget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `search_datasets(query, scope)`-meta-søk som vifter ut parallelt til kuraterte kataloger (stats: ssb/worldbank/eurostat/dbnomics/oecd/apd; research: datacite/data.europa.eu) og gir modellen én normalisert trefliste med `how_to_read`-hint per treff.

**Architecture:** To statiske kataloger høstes til `data/*.json` (apd-mønsteret) og søkes lokalt på edgen; tre levende kataloger søkes via API. `search-datasets.ts` gjør scope-ruting, parallell utvifting med 2,5 s per-katalog-timeout, kilde-diversifisert fletting (maks 4/katalog, topp 15). META_SEARCH-promptblokken erstatter SEARCH_HINTS (netto promptvekst ≈ 0). Spec: `docs/superpowers/specs/2026-07-30-oppdagelseslaget-design.md`.

**Tech Stack:** Deno edge functions (colocated `*.test.ts`, `deno test --allow-all netlify/edge-functions/_lib/`), python-høsteskript i `tools/` med pytest i `tests/` (mønster: `tools/harvest_apd_catalog.py` + `tests/test_harvest_apd_catalog.py`), eksisterende registry/searchCatalog-infrastruktur.

## Global Constraints

- **Commit lokalt per task, ALDRI push** (Hans beslutter). Aldri kall `/api/svar`/`/api/ask-ruter` med ekte nøkkel eller klikk Ask — fakturert. Direkte curl mot katalog-API-ene og `deno run --allow-net`-røyk er ufakturert og lov.
- **API-former er live-verifisert 2026-07-30** (står i hver task) — bruk dem som fasit, ikke gjett utover dem. Ved avvik: curl selv og tilpass + notér.
- Prompt-konvensjon: TS-konstanter er det som sendes; `prompts/svar.md` holdes synkron.
- Statiske katalogfiler ≤ ~1 MB (spec); worldbank filtreres til source-id 2 (WDI, 1 498) + 16 (HNP).
- Per-katalog-timeout 2 500 ms; treff-tak: maks 4 per katalog, 15 totalt.
- Node-testkommando på denne maskinen: `node --test $(find tests/js -name '*.test.js')` (bare katalog-arg feiler på Node v26). Python: `python3 -m pytest tests/test_harvest_worldbank_catalog.py -q` osv.
- Registerfeltene er norske (`tilgang`, `tillit`, `sok_endepunkt`); `CatalogHit` = `{source, id, title, period?, url}` (search-catalog.ts:9).
- Ingen nøkler i v1-katalogene; SSRF-vernet gjelder (alle nye fetches går mot faste https-verter).

## Filstruktur (mål)

| Fil | Ansvar |
|---|---|
| `tools/harvest_worldbank_catalog.py` + `data/worldbank-catalog.json` | Høst WDI+HNP-indikatorlisten |
| `tools/harvest_eurostat_catalog.py` + `data/eurostat-catalog.json` | Høst Eurostat-TOC |
| `netlify/edge-functions/_lib/tools/catalogs/static-catalog.ts` | Felles origin-fetch + modulcache for statiske kataloger |
| `…/catalogs/worldbank.ts`, `…/catalogs/eurostat.ts` | Statisk søk (+ wb table_metadata) |
| `…/catalogs/dbnomics.ts`, `…/catalogs/datacite.ts`, `…/catalogs/dataeuropa.ts` | Levende søk (+ dbnomics table_metadata) |
| `netlify/edge-functions/_lib/tools/search-datasets.ts` | Scope-ruting, parallell utvifting, fletting |
| `netlify/edge-functions/_lib/tools/table-metadata.ts` | + worldbank/dbnomics-kinds |
| `netlify/edge-functions/_lib/svar-prompt.ts` + `prompts/svar.md` | META_SEARCH, KODEBOK, verktøydef |
| `netlify/edge-functions/svar.ts` | executeTool-case + verktøydef |
| `docs/eval/ask-evalsett.md` | Q11/Q12 + målinger |

---

### Task 1: Høsteskript og statiske katalogfiler

**Files:**
- Create: `tools/harvest_worldbank_catalog.py`, `tools/harvest_eurostat_catalog.py`
- Create (generert av skriptene): `data/worldbank-catalog.json`, `data/eurostat-catalog.json`
- Test: `tests/test_harvest_worldbank_catalog.py`, `tests/test_harvest_eurostat_catalog.py`

**Interfaces:**
- Consumes: `api.worldbank.org/v2/indicator?format=json&source=<2|16>&per_page=1000&page=N` → verifisert form `[{"page":1,"pages":…,"total":…}, [{"id","name","unit","source":{"id","value"},"sourceNote",…}]]`. Eurostat-TOC `https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en` → verifisert TSV med quotede felter: `"title"␉"code"␉"type"␉"last update of data"␉"last table structure change"␉"data start"␉"data end"␉"values"`; titler er innrykket med ledende mellomrom; `type` ∈ {folder, dataset, table}.
- Produces (Task 2 leser disse formatene):
  - `data/worldbank-catalog.json` = `{"generated": "<ISO-dato>", "count": N, "indicators": [{"id","name","unit","src","note"}]}` (unit/note utelates når tomme; note trimmet til 160 tegn).
  - `data/eurostat-catalog.json` = `{"generated": "<ISO-dato>", "count": N, "tables": [{"code","title","start","end"}]}` (kun type dataset/table; title trimmet til 140 tegn, innrykk strippet).

- [ ] **Step 1: Skriv failende tester**

`tests/test_harvest_worldbank_catalog.py` (mønster fra `tests/test_harvest_apd_catalog.py` — les den for import-/fixturestil, gjenbruk dens måte å teste rene funksjoner uten nett):

```python
"""Høsteskriptets rene funksjoner + formatvalidering av committet katalog."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from harvest_worldbank_catalog import trim_indicator

CATALOG = pathlib.Path(__file__).resolve().parents[1] / "data" / "worldbank-catalog.json"


def test_trim_indicator_beholder_kun_feltene_vare():
    raw = {"id": "SH.XPD.CHEX.GD.ZS", "name": "Current health expenditure (% of GDP)",
           "unit": "", "source": {"id": "2", "value": "World Development Indicators"},
           "sourceNote": "x" * 500, "topics": [{"id": "8"}]}
    t = trim_indicator(raw)
    assert t["id"] == "SH.XPD.CHEX.GD.ZS"
    assert t["src"] == "World Development Indicators"
    assert len(t["note"]) <= 160
    assert "unit" not in t          # tom unit utelates
    assert "topics" not in t


def test_committet_katalog_er_gyldig_og_under_1mb():
    assert CATALOG.exists(), "kjør tools/harvest_worldbank_catalog.py"
    assert CATALOG.stat().st_size < 1_000_000
    d = json.loads(CATALOG.read_text())
    assert d["count"] == len(d["indicators"]) > 1000
    sample = d["indicators"][0]
    assert set(sample) >= {"id", "name"}
    # WDI-indikatoren evalene bruker skal finnes
    assert any(i["id"] == "SH.XPD.CHEX.GD.ZS" for i in d["indicators"])
```

`tests/test_harvest_eurostat_catalog.py`:

```python
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from harvest_eurostat_catalog import parse_toc_line

CATALOG = pathlib.Path(__file__).resolve().parents[1] / "data" / "eurostat-catalog.json"


def test_parse_toc_line_dataset():
    line = '"    Unemployment by sex and age"\t"une_rt_m"\t"dataset"\t" "\t" "\t"1983"\t"2026"\t'
    row = parse_toc_line(line)
    assert row == {"code": "une_rt_m", "title": "Unemployment by sex and age",
                   "start": "1983", "end": "2026"}


def test_parse_toc_line_folder_og_header_hopper():
    assert parse_toc_line('"General statistics"\t"general"\t"folder"\t" "\t" "\t" "\t" "\t') is None
    assert parse_toc_line('"title"\t"code"\t"type"\t"x"\t"x"\t"x"\t"x"\t"values"') is None


def test_committet_katalog_er_gyldig_og_under_1mb():
    assert CATALOG.exists(), "kjør tools/harvest_eurostat_catalog.py"
    assert CATALOG.stat().st_size < 1_000_000
    d = json.loads(CATALOG.read_text())
    assert d["count"] == len(d["tables"]) > 3000
    assert any(t["code"] == "une_rt_m" for t in d["tables"])
```

- [ ] **Step 2: Kjør — skal feile** (`ModuleNotFoundError`)

Run: `python3 -m pytest tests/test_harvest_worldbank_catalog.py tests/test_harvest_eurostat_catalog.py -q`

- [ ] **Step 3: Skriv høsteskriptene**

`tools/harvest_worldbank_catalog.py`:

```python
#!/usr/bin/env python3
"""Høster Verdensbankens indikatorliste til data/worldbank-catalog.json.

Kuratert (spec 2026-07-30): kun source-id 2 (World Development Indicators,
~1500) og 16 (Health Nutrition and Population Statistics) — hele listen er
29 544 indikatorer og ville sprengt 1 MB-taket. Kjøres manuelt ved behov,
som tools/harvest_apd_catalog.py.
"""
import datetime
import json
import pathlib
import urllib.request

API = "https://api.worldbank.org/v2/indicator?format=json&per_page=1000&source={src}&page={page}"
SOURCES = ["2", "16"]
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "worldbank-catalog.json"


def trim_indicator(raw):
    t = {"id": raw["id"], "name": (raw.get("name") or "").strip()}
    unit = (raw.get("unit") or "").strip()
    if unit:
        t["unit"] = unit
    src = ((raw.get("source") or {}).get("value") or "").strip()
    if src:
        t["src"] = src
    note = " ".join(((raw.get("sourceNote") or "")).split())[:160]
    if note:
        t["note"] = note
    return t


def fetch_source(src):
    page, pages, rows = 1, 1, []
    while page <= pages:
        with urllib.request.urlopen(API.format(src=src, page=page), timeout=60) as r:
            meta, data = json.load(r)
        pages = meta["pages"]
        rows += [trim_indicator(x) for x in (data or [])]
        page += 1
    return rows


def main():
    seen, indicators = set(), []
    for src in SOURCES:
        for row in fetch_source(src):
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            indicators.append(row)
    OUT.write_text(json.dumps({
        "generated": datetime.date.today().isoformat(),
        "count": len(indicators),
        "indicators": indicators,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"skrev {OUT} ({len(indicators)} indikatorer, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
```

`tools/harvest_eurostat_catalog.py`:

```python
#!/usr/bin/env python3
"""Høster Eurostats innholdsfortegnelse (TOC) til data/eurostat-catalog.json."""
import datetime
import json
import pathlib
import urllib.request

TOC = "https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en"
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "eurostat-catalog.json"


def _unquote(field):
    return field.strip().strip('"').strip()


def parse_toc_line(line):
    parts = line.rstrip("\n").split("\t")
    if len(parts) < 7:
        return None
    title, code, typ = _unquote(parts[0]), _unquote(parts[1]), _unquote(parts[2])
    if typ not in ("dataset", "table") or code in ("code", ""):
        return None
    return {"code": code, "title": title[:140],
            "start": _unquote(parts[5]), "end": _unquote(parts[6])}


def main():
    with urllib.request.urlopen(TOC, timeout=120) as r:
        text = r.read().decode("utf-8", errors="replace")
    seen, tables = set(), []
    for line in text.splitlines():
        row = parse_toc_line(line)
        if row and row["code"] not in seen:
            seen.add(row["code"])
            tables.append(row)
    OUT.write_text(json.dumps({
        "generated": datetime.date.today().isoformat(),
        "count": len(tables),
        "tables": tables,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"skrev {OUT} ({len(tables)} tabeller, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Kjør høstingen (ekte API-er, ufakturert) og testene**

Run: `python3 tools/harvest_worldbank_catalog.py && python3 tools/harvest_eurostat_catalog.py`
Expected: to «skrev …»-linjer; filstørrelser godt under 1 MB.
Run: `python3 -m pytest tests/test_harvest_worldbank_catalog.py tests/test_harvest_eurostat_catalog.py -q`
Expected: PASS. Blir en fil > 1 MB: stram note-/title-trimmen, IKKE hev taket.
Run også: `python3 -m pytest tests/ -q -x --ignore=tests/js` (hele python-suiten uendret grønn).

- [ ] **Step 5: Commit**

```bash
git add tools/harvest_worldbank_catalog.py tools/harvest_eurostat_catalog.py data/worldbank-catalog.json data/eurostat-catalog.json tests/test_harvest_worldbank_catalog.py tests/test_harvest_eurostat_catalog.py
git commit -m "feat(oppdagelse): høstede kataloger — Verdensbanken (WDI+HNP) og Eurostat-TOC"
```

---

### Task 2: Statiske katalogadaptere (worldbank, eurostat)

**Files:**
- Create: `netlify/edge-functions/_lib/tools/catalogs/static-catalog.ts`
- Create: `netlify/edge-functions/_lib/tools/catalogs/worldbank.ts`
- Create: `netlify/edge-functions/_lib/tools/catalogs/eurostat.ts`
- Test: `netlify/edge-functions/_lib/tools/catalogs/worldbank.test.ts`, `…/eurostat.test.ts`

**Interfaces:**
- Consumes: katalogfil-formatene fra Task 1; `DatasetHit` defineres HER og gjenbrukes av alle senere tasks:

```ts
export interface DatasetHit {
  source: string;
  id: string;
  title: string;
  description?: string;
  time?: string;
  geo?: string;
  access: "open" | "landing-page" | "restricted" | "key-required";
  how_to_read: string;
  url?: string;
}
```

- Produces (Task 4/5 bruker disse eksakte signaturene):
  - `static-catalog.ts`: `export interface DatasetHit {…}` (over) + `export async function loadStaticCatalog<T>(origin: string, path: string, fetchImpl?: typeof fetch): Promise<T>` (origin-fetch + modulcache per path, samme idé som apd) + `export function clearStaticCatalogCache(): void` (for tester) + `export function scoreSubstring(hay: string, qWords: string[]): number` (antall query-ord som substring-matcher, 0 = ingen match).
  - `worldbank.ts`: `export async function worldbankSearch(query: string, origin: string, fetchImpl?: typeof fetch): Promise<DatasetHit[]>` (maks 8, navn-treff rangeres foran note-treff) + `export async function worldbankMetadata(indicatorId: string, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>`.
  - `eurostat.ts`: `export async function eurostatSearch(query: string, origin: string, fetchImpl?: typeof fetch): Promise<DatasetHit[]>` (maks 8).

- [ ] **Step 1: Failende tester**

`worldbank.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearStaticCatalogCache } from "./static-catalog.ts";
import { worldbankMetadata, worldbankSearch } from "./worldbank.ts";

const CATALOG = JSON.stringify({
  generated: "2026-07-30", count: 3,
  indicators: [
    { id: "SH.XPD.CHEX.GD.ZS", name: "Current health expenditure (% of GDP)", src: "WDI", note: "Level of current health expenditure as share of GDP." },
    { id: "SP.POP.TOTL", name: "Population, total", src: "WDI" },
    { id: "NY.GDP.MKTP.CD", name: "GDP (current US$)", src: "WDI", note: "health systems excluded obviously" },
  ],
});

function catalogFetch(): typeof fetch {
  return ((url: string) => {
    if (String(url).endsWith("/data/worldbank-catalog.json")) {
      return Promise.resolve(new Response(CATALOG, { status: 200 }));
    }
    return Promise.reject(new Error("uventet URL: " + url));
  }) as unknown as typeof fetch;
}

Deno.test("worldbankSearch: navn-treff foran note-treff, DatasetHit-form", async () => {
  clearStaticCatalogCache();
  const hits = await worldbankSearch("health expenditure", "https://app.test", catalogFetch());
  assertEquals(hits[0].id, "SH.XPD.CHEX.GD.ZS");           // begge ord i navnet
  assertEquals(hits[0].source, "worldbank");
  assertEquals(hits[0].access, "open");
  assert(hits[0].how_to_read.includes("worldbank.read"));
  assert(hits[0].how_to_read.includes("SH.XPD.CHEX.GD.ZS"));
  // NY.GDP… matcher bare "health" i note → med, men bak
  assert(hits.some((h) => h.id === "NY.GDP.MKTP.CD"));
  assert(!hits.some((h) => h.id === "SP.POP.TOTL"));        // null treff → ute
});

Deno.test("worldbankMetadata: henter per-indikator-detalj (verifisert API-form)", async () => {
  const f = (() => Promise.resolve(new Response(JSON.stringify([
    { page: 1 },
    [{ id: "SP.POP.TOTL", name: "Population, total", unit: "",
       source: { id: "2", value: "World Development Indicators" },
       sourceNote: "Total population is based on…", sourceOrganization: "UN" }],
  ]), { status: 200 }))) as unknown as typeof fetch;
  const m = await worldbankMetadata("SP.POP.TOTL", f);
  assertEquals(m.id, "SP.POP.TOTL");
  assertEquals(m.kilde, "World Development Indicators");
  assert(String(m.definisjon).startsWith("Total population"));
});
```

`eurostat.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearStaticCatalogCache } from "./static-catalog.ts";
import { eurostatSearch } from "./eurostat.ts";

const CATALOG = JSON.stringify({
  generated: "2026-07-30", count: 2,
  tables: [
    { code: "une_rt_m", title: "Unemployment by sex and age – monthly data", start: "1983", end: "2026" },
    { code: "nrg_pc_202", title: "Gas prices for household consumers", start: "2007", end: "2026" },
  ],
});

Deno.test("eurostatSearch: substring-treff, time-felt og kanonisk how_to_read", async () => {
  clearStaticCatalogCache();
  const f = (() => Promise.resolve(new Response(CATALOG, { status: 200 }))) as unknown as typeof fetch;
  const hits = await eurostatSearch("unemployment", "https://app.test", f);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "une_rt_m");
  assertEquals(hits[0].time, "1983–2026");
  assert(hits[0].how_to_read.includes('eurostat.read("une_rt_m"'));
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `deno test --allow-all netlify/edge-functions/_lib/tools/catalogs/`

- [ ] **Step 3: Implementer**

`static-catalog.ts`:

```ts
// Felles for statiske, forhåndshøstede kataloger (apd-mønsteret): filene
// ligger i data/ på appens eget origin og caches per modul-instans.
export interface DatasetHit {
  source: string;
  id: string;
  title: string;
  description?: string;
  time?: string;
  geo?: string;
  access: "open" | "landing-page" | "restricted" | "key-required";
  how_to_read: string;
  url?: string;
}

const cache = new Map<string, unknown>();

export function clearStaticCatalogCache(): void {
  cache.clear();
}

export async function loadStaticCatalog<T>(
  origin: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const key = `${origin}${path}`;
  if (cache.has(key)) return cache.get(key) as T;
  const resp = await fetchImpl(key);
  if (!resp.ok) throw new Error(`katalogfil utilgjengelig: ${path} (${resp.status})`);
  const data = await resp.json() as T;
  cache.set(key, data);
  return data;
}

// Enkel relevans: antall query-ord (≥3 tegn) som substring-matcher.
export function scoreSubstring(hay: string, qWords: string[]): number {
  const h = hay.toLowerCase();
  return qWords.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
}

export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
}
```

`worldbank.ts`:

```ts
import { type DatasetHit, loadStaticCatalog, queryWords, scoreSubstring } from "./static-catalog.ts";

interface WbCatalog {
  indicators: { id: string; name: string; unit?: string; src?: string; note?: string }[];
}

const MAX = 8;

export async function worldbankSearch(
  query: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const cat = await loadStaticCatalog<WbCatalog>(origin, "/data/worldbank-catalog.json", fetchImpl);
  const words = queryWords(query);
  if (!words.length) return [];
  const scored = cat.indicators.map((i) => ({
    i,
    nameScore: scoreSubstring(`${i.name} ${i.id}`, words),
    noteScore: scoreSubstring(i.note ?? "", words),
  })).filter((s) => s.nameScore > 0 || s.noteScore > 0);
  // Navn-treff foran note-treff; flere ord truffet foran færre.
  scored.sort((a, b) => (b.nameScore - a.nameScore) || (b.noteScore - a.noteScore));
  return scored.slice(0, MAX).map(({ i }) => ({
    source: "worldbank",
    id: i.id,
    title: i.name,
    description: [i.src, i.note].filter(Boolean).join(" — ") || undefined,
    geo: "global",
    access: "open",
    how_to_read:
      `table_metadata('worldbank', '${i.id}') → # x = worldbank.read("country/all/indicator/${i.id}")` +
      ` (land som ISO3 adskilt med ; i stedet for all; years= filtrerer)`,
  }));
}

// Per-indikator-detalj. Verifisert API-form 2026-07-30:
// [meta, [{id, name, unit, source:{value}, sourceNote, sourceOrganization}]]
export async function worldbankMetadata(
  indicatorId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const url = `https://api.worldbank.org/v2/indicator/${encodeURIComponent(indicatorId)}?format=json`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`worldbank metadata ${resp.status} for ${indicatorId}`);
  const json = await resp.json();
  const row = Array.isArray(json) && Array.isArray(json[1]) ? json[1][0] : null;
  if (!row) throw new Error(`ukjent worldbank-indikator: ${indicatorId}`);
  return {
    id: row.id,
    navn: row.name,
    enhet: row.unit || undefined,
    kilde: row.source?.value,
    definisjon: row.sourceNote,
    organisasjon: row.sourceOrganization,
    lesing: `# x = worldbank.read("country/all/indicator/${row.id}")`,
  };
}
```

`eurostat.ts`:

```ts
import { type DatasetHit, loadStaticCatalog, queryWords, scoreSubstring } from "./static-catalog.ts";

interface EsCatalog {
  tables: { code: string; title: string; start: string; end: string }[];
}

const MAX = 8;

export async function eurostatSearch(
  query: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const cat = await loadStaticCatalog<EsCatalog>(origin, "/data/eurostat-catalog.json", fetchImpl);
  const words = queryWords(query);
  if (!words.length) return [];
  const scored = cat.tables
    .map((t) => ({ t, score: scoreSubstring(`${t.title} ${t.code}`, words) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX).map(({ t }) => ({
    source: "eurostat",
    id: t.code,
    title: t.title,
    time: t.start && t.end ? `${t.start}–${t.end}` : undefined,
    geo: "EU/EFTA",
    access: "open",
    how_to_read:
      `# e = eurostat.read("${t.code}", filters={…}, years=…) — kildens egne parametre (geo, unit, …) i filters={}; probe før bruk`,
  }));
}
```

- [ ] **Step 4: Kjør**

Run: `deno test --allow-all netlify/edge-functions/_lib/tools/catalogs/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/tools/catalogs/
git commit -m "feat(oppdagelse): statiske katalogadaptere for worldbank og eurostat"
```

---

### Task 3: Levende katalogadaptere (dbnomics, datacite, data.europa.eu)

**Files:**
- Create: `netlify/edge-functions/_lib/tools/catalogs/dbnomics.ts`, `…/datacite.ts`, `…/dataeuropa.ts`
- Test: `…/dbnomics.test.ts`, `…/datacite.test.ts`, `…/dataeuropa.test.ts`

**Interfaces:**
- Consumes: `DatasetHit` fra Task 2. Verifiserte API-former 2026-07-30:
  - DBnomics søk `https://api.db.nomics.world/v22/search?q=<enc>&limit=10` → `{results: {docs: [{code, name, provider_code, provider_name, nb_series}], num_found}}`. NB: flerords-spørring er AND og gir ofte 0 treff («unemployment nordic» → 0; «unemployment» → 1885).
  - DataCite `https://api.datacite.org/dois?query=<enc>&resource-type-id=dataset&page[size]=8` → `{data: [{id: "<doi>", attributes: {titles: [{title}], publisher, publicationYear, url}}], meta: {total}}`.
  - data.europa.eu `https://data.europa.eu/api/hub/search/search?q=<enc>&limit=8` → `{result: {results: [{id, title: {<lang>: str}, description: {<lang>: str}, distributions?: […], landing_page?, country?: {label}}], count}}` — title/description er SPRÅK-nøklede objekter.
- Produces (Task 4/5): `dbnomicsSearch(query, fetchImpl?): Promise<DatasetHit[]>`, `dbnomicsMetadata(ref, fetchImpl?): Promise<Record<string, unknown>>` (ref = `"PROVIDER/DATASETKODE"`), `dataciteSearch(query, fetchImpl?): Promise<DatasetHit[]>`, `dataeuropaSearch(query, fetchImpl?): Promise<DatasetHit[]>`.

- [ ] **Step 1 (KUN dbnomicsMetadata): verifiser datasets-endepunktets form med curl**

Søke-API-et er verifisert; datasett-endepunktet er IKKE. Kjør (ufakturert):

Run: `curl -s "https://api.db.nomics.world/v22/datasets/OECD/DSD_EAG_LSO_EA@DF_LSO_NEAC_ALL" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False)[:600])"`

Noter feltstien til dimensjoner/perioder (forventet et `datasets`-objekt med `dimensions_labels`/`dimensions_values_labels` eller lignende). Bygg `dbnomicsMetadata` mot den OBSERVERTE formen, lagre det trunkerte svaret som fixture-streng i testen, og returner normalisert `{ref, navn, dimensjoner (navn→antall verdier eller etiketter), lesing: '# d = dbnomics.read("<ref>/<serie-maske>")'}`. Feiler endepunktet helt: implementér `dbnomicsMetadata` som kaster med norsk feilmelding som peker på search-treffets info, og notér avviket i commit-meldingen.

- [ ] **Step 2: Failende tester**

`dbnomics.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dbnomicsSearch } from "./dbnomics.ts";

const HIT = { code: "DSD_EAG@DF_X", name: "Educational attainment", provider_code: "OECD", provider_name: "OECD", nb_series: 893103 };

function searchFetch(byQuery: Record<string, unknown[]>): typeof fetch {
  return ((url: string) => {
    const q = new URL(String(url)).searchParams.get("q") ?? "";
    const docs = byQuery[q] ?? [];
    return Promise.resolve(new Response(JSON.stringify({ results: { docs, num_found: docs.length } }), { status: 200 }));
  }) as unknown as typeof fetch;
}

Deno.test("dbnomicsSearch: DatasetHit-form med provider/kode-id", async () => {
  const hits = await dbnomicsSearch("unemployment", searchFetch({ unemployment: [HIT] }));
  assertEquals(hits[0].source, "dbnomics");
  assertEquals(hits[0].id, "OECD/DSD_EAG@DF_X");
  assert(hits[0].how_to_read.includes("dbnomics.read"));
  assert(String(hits[0].description).includes("893103") || String(hits[0].description).includes("893 103"));
});

Deno.test("dbnomicsSearch: flerords-null-treff prøver lengste ord (AND-fellen, målt 2026-07-30)", async () => {
  const hits = await dbnomicsSearch("unemployment nordic", searchFetch({
    "unemployment nordic": [], unemployment: [HIT],
  }));
  assertEquals(hits.length, 1);
});
```

`datacite.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dataciteSearch } from "./datacite.ts";

Deno.test("dataciteSearch: landing-page-access og DOI-URL", async () => {
  const f = (() => Promise.resolve(new Response(JSON.stringify({
    data: [{ id: "10.18712/nsd-nsd3456-v2", attributes: {
      titles: [{ title: "Level of Living Survey on Working Conditions 2025" }],
      publisher: "Sikt", publicationYear: 2026,
      url: "https://surveybanken.sikt.no/study/NSD3456/2",
    } }], meta: { total: 7161 },
  }), { status: 200 }))) as unknown as typeof fetch;
  const hits = await dataciteSearch("health income survey", f);
  assertEquals(hits[0].source, "datacite");
  assertEquals(hits[0].access, "landing-page");
  assertEquals(hits[0].url, "https://surveybanken.sikt.no/study/NSD3456/2");
  assert(hits[0].how_to_read.includes("web_fetch") || hits[0].how_to_read.includes("probe"));
  assertEquals(hits[0].time, "2026");
});
```

`dataeuropa.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dataeuropaSearch } from "./dataeuropa.ts";

function respWith(results: unknown[]): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify({ result: { results, count: results.length } }), { status: 200 }))) as unknown as typeof fetch;
}

Deno.test("dataeuropaSearch: engelsk tittel foretrekkes, distribusjon → open + url", async () => {
  const hits = await dataeuropaSearch("health", respWith([{
    id: "abc-123",
    title: { de: "Gesundheit", en: "Health spending" },
    description: { en: "Yearly spending." },
    country: { label: "Italy" },
    distributions: [{ format: { id: "CSV" }, access_url: ["https://x.it/d.csv"] }],
  }]));
  assertEquals(hits[0].title, "Health spending");
  assertEquals(hits[0].access, "open");
  assertEquals(hits[0].url, "https://x.it/d.csv");
  assertEquals(hits[0].geo, "Italy");
});

Deno.test("dataeuropaSearch: uten distribusjon → landing-page mot datasettsiden", async () => {
  const hits = await dataeuropaSearch("health", respWith([{
    id: "xyz-9", title: { fr: "Santé" }, description: {},
  }]));
  assertEquals(hits[0].title, "Santé");            // første språk når en mangler
  assertEquals(hits[0].access, "landing-page");
  assertEquals(hits[0].url, "https://data.europa.eu/data/datasets/xyz-9");
});
```

- [ ] **Step 3: Kjør — skal feile**, **Step 4: Implementer**

`dbnomics.ts`:

```ts
import type { DatasetHit } from "./static-catalog.ts";

const SEARCH = "https://api.db.nomics.world/v22/search";
const MAX = 8;

interface DbnDoc { code: string; name: string; provider_code: string; provider_name: string; nb_series?: number }

async function runSearch(q: string, fetchImpl: typeof fetch): Promise<DbnDoc[]> {
  const resp = await fetchImpl(`${SEARCH}?q=${encodeURIComponent(q)}&limit=${MAX}`);
  if (!resp.ok) throw new Error(`dbnomics-søk ${resp.status}`);
  const json = await resp.json();
  return (json?.results?.docs ?? []) as DbnDoc[];
}

export async function dbnomicsSearch(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  let docs = await runSearch(query, fetchImpl);
  // DBnomics-søk er AND over ordene og gir ofte 0 treff på flerords-spørringer
  // (målt 2026-07-30). Fall tilbake til det lengste ordet.
  const words = query.trim().split(/\s+/);
  if (!docs.length && words.length > 1) {
    const longest = words.sort((a, b) => b.length - a.length)[0];
    docs = await runSearch(longest, fetchImpl);
  }
  return docs.slice(0, MAX).map((d) => ({
    source: "dbnomics",
    id: `${d.provider_code}/${d.code}`,
    title: d.name,
    description: `${d.provider_name}${d.nb_series ? ` — ${d.nb_series} serier` : ""}`,
    access: "open",
    how_to_read:
      `table_metadata('dbnomics', '${d.provider_code}/${d.code}') → # d = dbnomics.read("${d.provider_code}/${d.code}/<serie-maske>") (maks 1000 serier per kall)`,
  }));
}

// Datasettstruktur — formen verifiseres med curl i Task 3 Step 1 og
// implementasjonen følger den observerte formen (fixture i testen).
export async function dbnomicsMetadata(
  ref: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const [provider, ...rest] = ref.split("/");
  const dataset = rest.join("/");
  if (!provider || !dataset) throw new Error(`dbnomics-referanse skal være PROVIDER/DATASETT, fikk: ${ref}`);
  const resp = await fetchImpl(
    `https://api.db.nomics.world/v22/datasets/${encodeURIComponent(provider)}/${encodeURIComponent(dataset)}`,
  );
  if (!resp.ok) throw new Error(`dbnomics metadata ${resp.status} for ${ref}`);
  const json = await resp.json();
  // Normaliser mot observert form (Step 1); behold rådimensjonene kompakte.
  return {
    ref,
    raa: json,   // erstattes av feltplukk etter Step 1-verifiseringen
    lesing: `# d = dbnomics.read("${ref}/<serie-maske>")`,
  };
}
```

(Merk: `raa: json` er en MIDLERTIDIG linje planen forventer at Step 1-verifiseringen ERSTATTER med konkret feltplukk `{navn, dimensjoner}` + tilhørende test med fixture — ikke la den overleve til commit.)

`datacite.ts`:

```ts
import type { DatasetHit } from "./static-catalog.ts";

const MAX = 8;

export async function dataciteSearch(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const url = `https://api.datacite.org/dois?query=${encodeURIComponent(query)}` +
    `&resource-type-id=dataset&page%5Bsize%5D=${MAX}`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`datacite-søk ${resp.status}`);
  const json = await resp.json();
  const rows = (json?.data ?? []) as { id: string; attributes: Record<string, unknown> }[];
  return rows.map((r) => {
    const a = r.attributes ?? {};
    const titles = (a.titles as { title?: string }[] | undefined) ?? [];
    const landing = typeof a.url === "string" && a.url ? a.url : `https://doi.org/${r.id}`;
    return {
      source: "datacite",
      id: r.id,
      title: titles[0]?.title ?? r.id,
      description: [a.publisher, a.publicationYear].filter(Boolean).join(", ") || undefined,
      time: a.publicationYear ? String(a.publicationYear) : undefined,
      access: "landing-page" as const,
      url: landing,
      how_to_read:
        `Forskningsdatasett (DOI ${r.id}) — IKKE direkte lastbart: web_fetch/probe landingssiden ${landing} for å finne fil-URL og kodebok; probe-✅ kreves før bruk`,
    };
  });
}
```

`dataeuropa.ts`:

```ts
import type { DatasetHit } from "./static-catalog.ts";

const MAX = 8;

function pickLang(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as Record<string, unknown>;
  const v = o.en ?? Object.values(o)[0];
  return typeof v === "string" ? v : "";
}

export async function dataeuropaSearch(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetHit[]> {
  const url = `https://data.europa.eu/api/hub/search/search?q=${encodeURIComponent(query)}&limit=${MAX}`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`data.europa.eu-søk ${resp.status}`);
  const json = await resp.json();
  const rows = (json?.result?.results ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const dists = (r.distributions as Record<string, unknown>[] | undefined) ?? [];
    const firstUrl = dists.map((d) =>
      (Array.isArray(d.access_url) ? d.access_url[0] : d.access_url) ??
      (Array.isArray(d.download_url) ? d.download_url[0] : d.download_url)
    ).find((u) => typeof u === "string" && u) as string | undefined;
    const country = (r.country as Record<string, unknown> | undefined)?.label;
    return {
      source: "dataeuropa",
      id: String(r.id ?? ""),
      title: pickLang(r.title) || String(r.id ?? ""),
      description: pickLang(r.description).slice(0, 200) || undefined,
      geo: typeof country === "string" ? country : undefined,
      access: firstUrl ? "open" as const : "landing-page" as const,
      url: firstUrl ?? `https://data.europa.eu/data/datasets/${r.id}`,
      how_to_read: firstUrl
        ? `probe ${firstUrl} — cors:true → vanlig pd.read_csv; ellers /api/hent-innpakning`
        : `Landingsside — web_fetch/probe https://data.europa.eu/data/datasets/${r.id} for å finne fil-URL`,
    };
  });
}
```

- [ ] **Step 5: Kjør + commit**

Run: `deno test --allow-all netlify/edge-functions/_lib/tools/catalogs/`
Expected: PASS (inkl. dbnomicsMetadata-testen du skrev fra Step 1-fixturen).

```bash
git add netlify/edge-functions/_lib/tools/catalogs/
git commit -m "feat(oppdagelse): levende adaptere — dbnomics (m/AND-fallback), datacite, data.europa.eu"
```

---

### Task 4: Meta-søket `search-datasets.ts`

**Files:**
- Create: `netlify/edge-functions/_lib/tools/search-datasets.ts`
- Test: `netlify/edge-functions/_lib/tools/search-datasets.test.ts`

**Interfaces:**
- Consumes: alle adapterne (Task 2–3), `searchCatalog` + `CatalogHit` fra `../search-catalog.ts` (gjenbruk for ssb/oecd/apd), `DataSource`/registry-typene.
- Produces (Task 5 wirer denne):

```ts
export type SearchScope = "stats" | "research" | "all";
export interface SearchDatasetsResult {
  hits: DatasetHit[];
  failed: string[];
  scope: SearchScope;
  query: string;
}
export function coerceScope(s: unknown): SearchScope;   // ukjent → "stats"
export async function searchDatasets(
  query: string,
  scope: SearchScope,
  deps: { registry: DataSource[]; origin: string; fetchImpl?: typeof fetch },
): Promise<SearchDatasetsResult>;
```

Konstanter: `CATALOG_TIMEOUT_MS = 2_500`, `MAX_PER_CATALOG = 4`, `MAX_TOTAL = 15`.

- [ ] **Step 1: Failende tester**

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coerceScope, searchDatasets } from "./search-datasets.ts";
import type { DatasetHit } from "./catalogs/static-catalog.ts";

function hit(source: string, n: number): DatasetHit {
  return { source, id: `${source}-${n}`, title: `${source} treff ${n}`, access: "open", how_to_read: "x" };
}

Deno.test("coerceScope: ukjent → stats", () => {
  assertEquals(coerceScope("research"), "research");
  assertEquals(coerceScope("all"), "all");
  assertEquals(coerceScope("stat"), "stats");
  assertEquals(coerceScope(undefined), "stats");
});

Deno.test("searchDatasets: fletter m/diversitet (maks 4 per katalog, 15 totalt), failed-liste", async () => {
  const catalogs = {
    a: () => Promise.resolve([1, 2, 3, 4, 5, 6].map((n) => hit("a", n))),
    b: () => Promise.resolve([1, 2, 3].map((n) => hit("b", n))),
    c: () => Promise.reject(new Error("nede")),
    d: () => new Promise<DatasetHit[]>(() => {}),   // henger → timeout
  };
  const res = await searchDatasets("x", "stats", {
    registry: [], origin: "https://app.test",
    _catalogsForTest: catalogs, _timeoutMs: 50,
  } as never);
  assertEquals(res.failed.sort(), ["c", "d"]);
  assertEquals(res.hits.filter((h) => h.source === "a").length, 4);   // kappet fra 6
  assertEquals(res.hits.filter((h) => h.source === "b").length, 3);
  // Round-robin: første treff fra hver katalog kommer før andres andre-treff
  assertEquals(res.hits[0].id, "a-1");
  assertEquals(res.hits[1].id, "b-1");
  assert(res.hits.length <= 15);
});
```

- [ ] **Step 2: Kjør — skal feile**, **Step 3: Implementer**

```ts
// search_datasets: meta-søk med scope — parallell utvifting til kuraterte
// kataloger, kilde-diversifisert fletting. Spec 2026-07-30-oppdagelseslaget.
import { searchCatalog } from "./search-catalog.ts";
import type { DataSource } from "../registry.ts";
import type { DatasetHit } from "./catalogs/static-catalog.ts";
import { worldbankSearch } from "./catalogs/worldbank.ts";
import { eurostatSearch } from "./catalogs/eurostat.ts";
import { dbnomicsSearch } from "./catalogs/dbnomics.ts";
import { dataciteSearch } from "./catalogs/datacite.ts";
import { dataeuropaSearch } from "./catalogs/dataeuropa.ts";

export type SearchScope = "stats" | "research" | "all";

export interface SearchDatasetsResult {
  hits: DatasetHit[];
  failed: string[];
  scope: SearchScope;
  query: string;
}

export const CATALOG_TIMEOUT_MS = 2_500;
export const MAX_PER_CATALOG = 4;
export const MAX_TOTAL = 15;

export function coerceScope(s: unknown): SearchScope {
  return s === "research" || s === "all" ? s : "stats";
}

interface Deps {
  registry: DataSource[];
  origin: string;
  fetchImpl?: typeof fetch;
  _catalogsForTest?: Record<string, () => Promise<DatasetHit[]>>;
  _timeoutMs?: number;
}

// Gjenbruk av eksisterende enkeltkilde-søk: CatalogHit → DatasetHit.
function viaSearchCatalog(
  sourceId: string,
  query: string,
  deps: Deps,
  howToRead: (id: string) => string,
): () => Promise<DatasetHit[]> {
  return async () => {
    const hits = await searchCatalog(sourceId, query, {
      registry: deps.registry, origin: deps.origin, fetchImpl: deps.fetchImpl,
    });
    return hits.slice(0, MAX_PER_CATALOG + 2).map((h) => ({
      source: h.source, id: h.id, title: h.title,
      time: h.period || undefined, access: "open" as const,
      url: h.url || undefined, how_to_read: howToRead(h.id),
    }));
  };
}

function buildCatalogs(query: string, scope: SearchScope, deps: Deps): Record<string, () => Promise<DatasetHit[]>> {
  const f = deps.fetchImpl ?? fetch;
  const stats: Record<string, () => Promise<DatasetHit[]>> = {
    ssb: viaSearchCatalog("ssb", query, deps, (id) =>
      `table_metadata('ssb', '${id}') → # s = ssb.read("${id}", years=…)`),
    worldbank: () => worldbankSearch(query, deps.origin, f),
    eurostat: () => eurostatSearch(query, deps.origin, f),
    dbnomics: () => dbnomicsSearch(query, f),
    oecd: viaSearchCatalog("oecd", query, deps, (id) =>
      `table_metadata('oecd', '${id}') → # o = oecd.read("${id}", years=…, countries=…)`),
    apd: viaSearchCatalog("apd", query, deps, () => `probe URL-en fra treffet før bruk`),
  };
  const research: Record<string, () => Promise<DatasetHit[]>> = {
    datacite: () => dataciteSearch(query, f),
    dataeuropa: () => dataeuropaSearch(query, f),
  };
  if (scope === "stats") return stats;
  if (scope === "research") return research;
  return { ...stats, ...research };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function searchDatasets(
  query: string,
  scope: SearchScope,
  deps: Deps,
): Promise<SearchDatasetsResult> {
  const catalogs = deps._catalogsForTest ?? buildCatalogs(query, scope, deps);
  const timeoutMs = deps._timeoutMs ?? CATALOG_TIMEOUT_MS;
  const names = Object.keys(catalogs);
  const settled = await Promise.allSettled(
    names.map((n) => withTimeout(catalogs[n](), timeoutMs)),
  );
  const failed: string[] = [];
  const perCatalog: DatasetHit[][] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") perCatalog.push(s.value.slice(0, MAX_PER_CATALOG));
    else failed.push(names[i]);
  });
  // Round-robin-fletting: bevarer hver katalogs egen rangering, sprer kilder.
  const hits: DatasetHit[] = [];
  for (let round = 0; hits.length < MAX_TOTAL; round++) {
    let any = false;
    for (const list of perCatalog) {
      if (round < list.length && hits.length < MAX_TOTAL) {
        hits.push(list[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return { hits, failed, scope, query };
}
```

- [ ] **Step 4: Kjør + commit**

Run: `deno test --allow-all netlify/edge-functions/_lib/tools/search-datasets.test.ts`
Expected: PASS.

```bash
git add netlify/edge-functions/_lib/tools/search-datasets.ts netlify/edge-functions/_lib/tools/search-datasets.test.ts
git commit -m "feat(oppdagelse): search_datasets-meta-søk — scope, parallell utvifting, diversifisert fletting"
```

---

### Task 5: Wiring — svar.ts, table_metadata, verktøydef

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts` (nye kinds)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (SEARCH_DATASETS_TOOL + buildRouteToolDefs + progressLabel)
- Modify: `netlify/edge-functions/svar.ts` (executeTool-case)
- Test: `netlify/edge-functions/_lib/tools/table-metadata.test.ts` (utvid), `_lib/svar-prompt.test.ts` (utvid)

**Interfaces:**
- Consumes: `searchDatasets`/`coerceScope` (Task 4), `worldbankMetadata` (Task 2), `dbnomicsMetadata` (Task 3).
- Produces: `SEARCH_DATASETS_TOOL` eksportert fra svar-prompt.ts; `buildRouteToolDefs("data", …)` inkluderer den (beregning/oppslag gjør IKKE); `tableMetadata(source, id, deps)` håndterer kind `worldbank` og `dbnomics`.

- [ ] **Step 1: Failende tester**

I `svar-prompt.test.ts`, legg til:

```ts
Deno.test("buildRouteToolDefs: data-ruten har search_datasets; beregning/oppslag har ikke", () => {
  const names = (defs: unknown[]) => (defs as { name?: string }[]).map((d) => d.name);
  assert(names(buildRouteToolDefs("data", "standard")).includes("search_datasets"));
  assert(!names(buildRouteToolDefs("beregning", "standard")).includes("search_datasets"));
  assert(!names(buildRouteToolDefs("oppslag", "standard")).includes("search_datasets"));
});
```

(Husk å utvide importen med `SEARCH_DATASETS_TOOL` om testen bruker den direkte.)

I `table-metadata.test.ts`, legg til (følg filens eksisterende mock-mønster for fetchImpl/registry — les de første ~40 linjene først):

```ts
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
```

- [ ] **Step 2: Kjør — skal feile**, **Step 3: Implementer**

1. `table-metadata.ts`: i kind-switchen, legg til

```ts
    case "worldbank": return worldbankMetadata(tableId, deps.fetchImpl);
    case "dbnomics": return dbnomicsMetadata(tableId, deps.fetchImpl);
```

med imports fra `./catalogs/worldbank.ts` og `./catalogs/dbnomics.ts`. (Les switchens faktiske form først — den kan dispatche på `src.kind` med andre variabelnavn; følg filens mønster.)

2. `svar-prompt.ts`: ny eksport ved siden av `RUN_CODE_TOOL`:

```ts
export const SEARCH_DATASETS_TOOL = {
  name: "search_datasets",
  description:
    "Meta-søk etter datasett på tvers av kuraterte kataloger. scope='stats' (default): SSB, Verdensbanken, Eurostat, DBnomics (IMF/BIS/ILO m.fl.), OECD, apd. scope='research': DataCite (forskningsdata/DOI), data.europa.eu. scope='all': begge. Returnerer normaliserte treff med how_to_read-hint per treff, og failed-liste over kataloger som ikke svarte.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "søkeord (engelsk gir flest treff i internasjonale kataloger)" },
      scope: { type: "string", enum: ["stats", "research", "all"] },
    },
    required: ["query"],
  },
};
```

I `buildRouteToolDefs`: data-grenen får `SEARCH_DATASETS_TOOL` FØRST i klientverktøy-listen: `return [SEARCH_DATASETS_TOOL, ...CLIENT_TOOL_DEFS, RUN_CODE_TOOL, ...web];` (beregning/oppslag uendret). `progressLabel` får case:

```ts
    case "search_datasets": return `Søker kataloger (${input.scope ?? "stats"}): «${String(input.query ?? "").slice(0, 60)}» …`;
```

3. `svar.ts`: import `coerceScope, searchDatasets` fra `./_lib/tools/search-datasets.ts`; i `executeTool`, FØRSTE case:

```ts
    if (name === "search_datasets" && registry) {
      return JSON.stringify(await searchDatasets(
        String(input.query ?? ""), coerceScope(input.scope), { registry, origin },
      ));
    }
```

(`registry` er lastet kun for data-ruten — samme guard som search_catalog; verktøyet finnes bare i data-rutens defs, så guarden er belte-og-seler.)

- [ ] **Step 4: Kjør hele edge-suiten + commit**

Run: `deno test --allow-all netlify/edge-functions/_lib/` og `deno check netlify/edge-functions/svar.ts`
Expected: alle PASS / clean.

```bash
git add netlify/edge-functions/
git commit -m "feat(oppdagelse): search_datasets wiret i svar.ts + worldbank/dbnomics table_metadata"
```

---

### Task 6: Prompts — META_SEARCH og KODEBOK

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (META_SEARCH erstatter SEARCH_HINTS; ny KODEBOK; INTRO fase 2)
- Modify: `netlify/edge-functions/prompts/svar.md` (synk + changelog)
- Test: `netlify/edge-functions/_lib/svar-prompt.test.ts`

**Interfaces:**
- Produces: `buildSvarSystem("data", …)` inneholder META_SEARCH- og KODEBOK-tekstene, IKKE gamle SEARCH_HINTS; beregning/oppslag uendret.

- [ ] **Step 1: Failende tester**

```ts
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
```

- [ ] **Step 2: Kjør — skal feile**, **Step 3: Implementer**

SLETT `SEARCH_HINTS`-konstanten. Nye blokker (ordrett):

```ts
const META_SEARCH = `\
## Datasøk (search_datasets først)

Let etter data i denne rekkefølgen:
1. **search_datasets(query, scope)** — scope='stats' for offisiell
   statistikk/indikatorer/tidsserier; scope='research' for survey-,
   individ- og forskningsdata; scope='all' når du er usikker. Engelske
   søkeord gir flest treff i internasjonale kataloger.
2. Følg **how_to_read**-hintet på treffet du velger (table_metadata →
   kanonisk read, eller probe/web_fetch av landingsside). Treff med
   access='landing-page' er IKKE lastbare før probe/web_fetch har funnet en
   faktisk fil-URL — probe-✅-kravet gjelder uendret.
3. **search_catalog(source, query)** for å grave dypere i ÉN katalog.
4. web_search/web_fetch er SISTE utvei for datasøk — ikke første.
Kataloger i failed-listen svarte ikke — nevn det om det er relevant for
svaret, eller søk dem målrettet med search_catalog.`;

const KODEBOK = `\
## Kodebok (survey-/individ-/forskningsdata)

FØR analyse av forskningsdata (Stata/SPSS/survey-CSV):
- Les variabel- og verdietiketter: \`pd.read_stata(url_eller_fil,
  convert_categoricals=True)\` (etikettene ligger i fila). CSV uten
  kodebok: let etter kodebok/dokumentasjon på landingssiden (web_fetch).
- Sjekk spesielle missing-koder (mønstre som 8/9/98/99/999 = «vet ikke»/
  «ikke svart») FØR beregning — aldri behandle dem som verdier.
- Se etter vekter/strata (kolonnenavn som weight/vekt/stratum) og NEVN i
  svaret om analysen er vektet eller ikke.
- Mangler kodebok: si eksplisitt hvilke variabeltolkninger som er antatt —
  aldri gjett verdibetydninger stille.`;
```

Montering for data-ruten (behold rekkefølgen ellers):
`[INTRO, DEPTH[depth], DELIVERY, QUERYLOGIC, SCIENCE, INLINE, MULTI, MODE[mode], META_SEARCH, KODEBOK, RUN, PARTIAL]` (+ MEMORY_URLS/registry som før).

`INTRO` fase 2 første linje endres fra «(search_catalog → table_metadata → probe; …)» til «(search_datasets → table_metadata → probe; search_catalog for å grave i én katalog; …)».

`prompts/svar.md`: samme endringer + changelog-linje «2026-07-30: META_SEARCH erstatter SEARCH_HINTS; KODEBOK ny; search_datasets-verktøyet (spec 2026-07-30-oppdagelseslaget)».

- [ ] **Step 4: Kjør + commit**

Run: `deno test --allow-all netlify/edge-functions/_lib/svar-prompt.test.ts` (og hele `_lib/`)
Expected: PASS.

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt.test.ts netlify/edge-functions/prompts/svar.md
git commit -m "feat(oppdagelse): META_SEARCH erstatter SEARCH_HINTS; KODEBOK-blokk for forskningsdata"
```

---

### Task 7: Live-røyk, eval Q11/Q12 og regresjonsvakt

**Files:**
- Modify: `docs/eval/ask-evalsett.md` (Q11/Q12 + målinger)

Verifiserings-gaten. Fakturerte klikk gjøres av KONTROLLEREN (subagent-sandkasser nekter dem — kjent); denne tasken forbereder og kjører alt ufakturert.

- [ ] **Step 1: Full testsuite**

Run: `deno test --allow-all netlify/edge-functions/_lib/ && node --test $(find tests/js -name '*.test.js') && python3 -m pytest tests/ -q --ignore=tests/js`
Expected: alt grønt.

- [ ] **Step 2: Ufakturert live-røyk av meta-søket**

Restart dev-server (`kill $(lsof -ti tcp:8899)`; `npx netlify dev --port 8899` i bakgrunn; vent på 200). Deretter direkte adapterrøyk uten LLM:

```bash
cat > /tmp/smoke-search-datasets.ts << 'EOF'
import { searchDatasets } from "./netlify/edge-functions/_lib/tools/search-datasets.ts";
import { loadRegistry } from "./netlify/edge-functions/_lib/registry.ts";
const registry = await loadRegistry("http://localhost:8899");
for (const [q, scope] of [["health expenditure", "stats"], ["income survey Norway", "research"], ["unemployment", "all"]] as const) {
  const r = await searchDatasets(q, scope, { registry, origin: "http://localhost:8899" });
  console.log(`\n=== ${scope}: "${q}" — ${r.hits.length} treff, failed: [${r.failed}]`);
  for (const h of r.hits.slice(0, 6)) console.log(`  ${h.source} | ${h.id} | ${h.title.slice(0, 60)} | ${h.access}`);
}
EOF
deno run --allow-net --allow-read /tmp/smoke-search-datasets.ts
```

Expected: stats-søket har worldbank-treff for SH.XPD-familien; research-søket har datacite-treff; failed-listene er tomme eller små. Feiler en katalog konsistent: fiks adapteren (curl API-et selv) FØR eval.

- [ ] **Step 3: Legg Q11/Q12 i evaldokumentet**

I tabellen i `docs/eval/ask-evalsett.md`:

```markdown
| 11 | Finn forskningsdata om helse og inntekt på individnivå | data | research-/all-scope-søk; DataCite-treff m/ærlig access-merking; INGEN fabrikkerte fil-URL-er; gjerne ærlig «krever søknad/landingsside» |
| 12 | Hvilke EU-land bruker størst andel av BNP på helse? Bruk Eurostat eller Verdensbanken. | data | besvares via katalogsøk UTEN web_search; < 90 s; kilde+år oppgitt |
```

- [ ] **Step 4: Rapportér klart for fakturert eval**

Kontrolleren kjører Q11, Q12 og regresjonsvakten (Q4 + stikkprøve Q1/Q7) i nettleseren med BYOK, måler tid/run_code/verktøykall (spesielt: brukte Q12 web_search? — skal IKKE), og appender målingene til evaldokumentet + committer. Denne tasken committer kun Q11/Q12-radene:

```bash
git add docs/eval/ask-evalsett.md
git commit -m "eval: Q11 (forskningsdata/research-scope) og Q12 (katalogsøk uten websøk) definert"
```

---

## Self-review-notater (kjørt ved planskriving)

- **Spec-dekning:** verktøy+fletting (Task 4), statiske kataloger m/1 MB-tak (1–2), levende adaptere (3), table_metadata-utvidelser (2, 3, 5), prompts (6), feilhåndtering/failed (4), eval Q11/Q12 + regresjon (7), search_catalog uendret (kun gjenbrukt). Utsatt-listen røres ikke.
- **Typekonsistens:** `DatasetHit` definert én gang (static-catalog.ts) og importert overalt; `coerceScope`-default "stats" konsistent med verktøydef-beskrivelsen; kind-strengen `dataeuropa` brukes kun som hit-source (ingen registeroppføring trengs — treffene leses via probe/URL, aldri via ost-alias).
- **Kjent risiko 1:** dbnomics datasets-endepunktets form er uverifisert → Task 3 Step 1 verifiserer med curl før implementasjon (fixture-basert test); `raa: json`-linjen i planteksten er markert midlertidig og skal erstattes.
- **Kjent risiko 2:** data.europa.eu-feltvariasjon (multilingual/manglende felter) → pickLang + defensive optional-kjeder + landing-page-fallback.
- **Kjent risiko 3:** flere klientverktøykall per spørsmål kan presse standard-budsjettet (4) — meta-søket er designet for å SENKE antallet (1 søk i stedet for 2–3); Q12-regresjonen måler dette.
