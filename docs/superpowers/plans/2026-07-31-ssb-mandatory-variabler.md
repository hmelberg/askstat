# SSB mandatory-variabler + source-guides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ett-skudds SSB-uttrekk: `table_metadata` viser mandatory + kan søke i verdilister, prompten lærer riktig mønster, 400-feil oversettes til handlingsrettet melding, og ssb-guiden følger med første katalogkall.

**Architecture:** Fire lag (verktøykontrakt > feilmelding > guide > promptprosa). Edge-verktøyene endres i `_lib/tools/table-metadata.ts` + `svar.ts`-dispatch; ren 400-oversettelseslogikk i `js/pxweb.js` (node-testet) wiret i `js/data-loader.js`; guide-laget som ny `_lib/source-guides.ts` + statisk `data/source-guides/ssb.md`.

**Tech Stack:** Deno/TS (edge, `deno test`/`deno check`), vanilla JS IIFE (browser, `node --test`), markdown-guider som statiske assets.

**Spec:** `docs/superpowers/specs/2026-07-31-ssb-mandatory-variabler-design.md`

## Global Constraints

- ALDRI push — Hans beslutter (commit lokalt per task).
- Norske kommentarer, repo-stil (var-IIFE i js/, TS i edge).
- `svar-prompt.ts`-blokker og `prompts/svar.md` holdes byte-nært synkrone.
- Testkommandoer: `node --test "tests/js/*.test.js"` (glob — dir-form feiler på Node 26); `deno test netlify/edge-functions/_lib/`; `deno check netlify/edge-functions/svar.ts`.
- Verifiserte fakta som IKKE skal «forbedres»: PxWeb v2 400-er ved filtrert spørring uten valg for alle `elimination=false`-dimensjoner (alltid ContentsCode+Tid); 05839 har ContentsCode=`Personer`; 11342 har `Folkemengde` m.fl.; Region i 11342 har 979 koder og Oslo=`0301`.
- janbrus-referansene (kilde for guiden) ligger i `/private/tmp/claude-501/-Users-hom-Documents-GitHub/912e26b7-33ea-4b71-8709-30a6ca1f80dc/scratchpad/`: `SKILL.md`, `api-details.md`, `codelists-and-filters.md`, `troubleshooting.md`.

## Filstruktur

| Fil | Ansvar |
| --- | --- |
| `netlify/edge-functions/_lib/tools/table-metadata.ts` | `pickValues`-helper (find-filter før kutt), `mandatory` (pxweb) |
| `netlify/edge-functions/svar.ts` | `find`-passthrough; guide-vedlegg i executeTool |
| `netlify/edge-functions/_lib/svar-prompt.ts` | verktøyskjema (find), EVAL-regel 8, 3× eksempel-fiks |
| `netlify/edge-functions/prompts/svar.md` | speil |
| `netlify/edge-functions/_lib/source-guides.ts` | NY — guide-henting m/ per-kall-gating, injisert fetch |
| `netlify/edge-functions/_lib/registry.ts` | guide-annonsering i renderRegistryBlock |
| `data/data-sources.json` | `"guide": true` på ssb |
| `data/source-guides/ssb.md` | NY — destillert fra janbrus-refs |
| `js/pxweb.js` | rene helpere `missingMandatory`/`mandatoryErrorMessage` |
| `js/data-loader.js` | 400-catch i pxweb-grenen → beriket feil |
| `netlify/edge-functions/_lib/tools/table-metadata.test.ts` | NY deno-test |
| `netlify/edge-functions/_lib/source-guides.test.ts` | NY deno-test |
| `tests/js/pxweb.test.js` | + mandatory-helper-tester |

---

### Task 1: `table_metadata` — mandatory-flagg + find-param, ende til ende

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/table-metadata.ts`
- Modify: `netlify/edge-functions/svar.ts:168-170` (dispatch)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (CLIENT_TOOL_DEFS, table_metadata-oppføringen)
- Test: `netlify/edge-functions/_lib/tools/table-metadata.test.ts` (ny)

**Interfaces:**
- Produces: `tableMetadata(sourceId, tableId, deps)` får nytt valgfritt `deps.find?: string`; `TableVariable` får `mandatory?: boolean`; eksportert `pickValues(all, find)` for test.
- Consumes: eksisterende `TableMeta`/`TableVariable` (uendret ellers).

- [ ] **Step 1: Skriv de feilende deno-testene** — ny fil `netlify/edge-functions/_lib/tools/table-metadata.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickValues, tableMetadata } from "./table-metadata.ts";
import type { DataSource } from "../registry.ts";

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
const PXMETA = {
  label: "11342: Areal og befolkning",
  role: { time: ["Tid"] },
  dimension: {
    Region: {
      label: "region",
      category: { index: { "0301": 0, "1103": 1 }, label: { "0301": "Oslo", "1103": "Stavanger" } },
      extension: { elimination: true },
    },
    ContentsCode: {
      label: "statistikkvariabel",
      category: { index: { Folkemengde: 0 }, label: { Folkemengde: "Personer" } },
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
const fakeFetch = ((_url: string) =>
  Promise.resolve(new Response(JSON.stringify(PXMETA), { status: 200 }))) as typeof fetch;

Deno.test("pxwebMetadata: mandatory fra elimination; find når fram", async () => {
  const m = await tableMetadata("ssb", "11342", { registry: SSB_SRC, fetchImpl: fakeFetch, find: "oslo" });
  const region = m.variables.find((v) => v.code === "Region")!;
  const contents = m.variables.find((v) => v.code === "ContentsCode")!;
  assertEquals(region.mandatory, false);
  assertEquals(contents.mandatory, true);
  assertEquals(region.values, [{ code: "0301", label: "Oslo" }]);
  assert(m.variables.find((v) => v.code === "Tid")!.mandatory);
});
```

- [ ] **Step 2: Kjør — verifiser at de feiler**

Run: `deno test netlify/edge-functions/_lib/tools/table-metadata.test.ts`
Expected: FAIL — `pickValues` ikke eksportert

- [ ] **Step 3: Implementer i table-metadata.ts**

(a) Utvid `TableVariable` (etter `valuesTruncated`-feltet):

```ts
  // pxweb: fra extension.elimination === false (obligatorisk valg ved
  // filtrert spørring — SSB 400-er ellers, målt 2026-07-31). Utelates for
  // adaptere der metadataene ikke bærer informasjonen — aldri gjett.
  mandatory?: boolean;
```

(b) Delt helper (erstatter alle `codes.slice(0, MAX_VALUES)`-mønstrene) — legg rett under `const MAX_VALUES = 40;`:

```ts
// find-filter (delstreng i kode ELLER etikett, case-insensitivt) FØR
// MAX_VALUES-kuttet — trunkeringen skjer hos oss, hele listen er i minnet.
// valuesTruncated reflekterer listen ETTER filtrering.
export function pickValues(
  all: { code: string; label: string }[],
  find?: string,
): { values: { code: string; label: string }[]; valuesTruncated: boolean } {
  const needle = (find ?? "").trim().toLowerCase();
  const filtered = needle
    ? all.filter((v) =>
      v.code.toLowerCase().includes(needle) || v.label.toLowerCase().includes(needle))
    : all;
  return { values: filtered.slice(0, MAX_VALUES), valuesTruncated: filtered.length > MAX_VALUES };
}
```

(c) `tableMetadata`-signaturen: `deps: { registry: DataSource[]; fetchImpl?: typeof fetch; find?: string }` — og send `deps.find` videre til hver adapter-gren (`pxwebMetadata(src, tableId, f, deps.find)` osv. for fhi/dst/statfin/sdmx; worldbank/dbnomics-grenene har ikke verdilister — uendret).

(d) I HVER adapter-gren som i dag gjør `slice(0, MAX_VALUES)` (pxweb linje ~74, fhi ~109, statfin ~127, dst ~147, sdmx ~211): bygg først hele `{code, label}`-listen, kall `pickValues(allValues, find)` og bruk `values`/`valuesTruncated` derfra. Grenene tar ny valgfri parameter `find?: string`.

(e) `pxwebMetadata`: utvid dims-typen med `extension?: { elimination?: boolean }` og sett per variabel:

```ts
      const elim = d.extension?.elimination;
      // fallback når feltet mangler: ContentsCode + tidsdimensjonen er
      // aldri eliminerbare (janbrus: «never eliminable»)
      const mandatory = elim !== undefined
        ? elim === false
        : (code === "ContentsCode" || timeDims.has(code));
```
…og ta `mandatory` med i objektet som pushes til `variables`.

(f) `svar.ts:168-170` — passthrough:

```ts
    if (name === "table_metadata" && registry) {
      return JSON.stringify(await tableMetadata(String(input.source ?? ""), String(input.table_id ?? ""), {
        registry,
        find: typeof input.find === "string" && input.find.trim() ? input.find : undefined,
      }));
    }
```

(g) `svar-prompt.ts` CLIENT_TOOL_DEFS, table_metadata-oppføringen — ny beskrivelse + find-property:

```ts
  {
    name: "table_metadata",
    description: "Variabel-nivå metadata for en tabell fra search_catalog: dimensjoner, koder, tidsperioder — grunnlaget for et minimalt uttrekk. mandatory=true på en dimensjon betyr at read-kallet MÅ velge verdier for den (indicators= for ContentsCode, years= for Tid). Lange kodelister trunkeres — bruk find til å søke fram koder (f.eks. find=\"Oslo\").",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        table_id: { type: "string" },
        find: { type: "string", description: "valgfritt: delstreng-søk i kodelistene (kode eller etikett)" },
      },
      required: ["source", "table_id"],
    },
  },
```

- [ ] **Step 4: Kjør — verifiser at testene passerer + typecheck**

Run: `deno test netlify/edge-functions/_lib/tools/table-metadata.test.ts && deno test netlify/edge-functions/_lib/ && deno check netlify/edge-functions/svar.ts`
Expected: PASS alle (inkl. eksisterende _lib-tester)

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/tools/table-metadata.ts netlify/edge-functions/_lib/tools/table-metadata.test.ts netlify/edge-functions/svar.ts netlify/edge-functions/_lib/svar-prompt.ts
git commit -m "feat(svar): table_metadata med mandatory-flagg og find-søk i kodelister"
```

MERK: svar.md-speilet av CLIENT_TOOL_DEFS-beskrivelsen håndteres i Task 2 (én samlet speil-synk).

---

### Task 2: Prompt — EVAL-regel 8, eksempel-fikser, svar.md-speil

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (DELIVERY-blokken; 3 × 05839-forekomster på linje ~93/~147/~457)
- Modify: `netlify/edge-functions/prompts/svar.md` (speil: DELIVERY + MODE_R + verktøybeskrivelsen fra Task 1)

**Interfaces:**
- Consumes: mandatory/find-semantikken fra Task 1 (regelen beskriver den).
- Produces: prompt-tekst; plassholdergrammatikk/verktøynavn uendret.

- [ ] **Step 1: Ny EVAL-REGEL i DELIVERY** — legg til som punkt 8 etter regel 7 (DYNAMISK BYGDE URL-er):

```
8. pxweb-KRAV (SSB m.fl., målt 2026-07-31): en FILTRERT spørring MÅ velge
   verdier for ALLE dimensjoner med mandatory=true i table_metadata —
   alltid ContentsCode (\`indicators=\`) og Tid (\`years=\`). Utelatt →
   400 «Missing selection for mandatory variable». Én-innholds-tabeller
   har OGSÅ kravet: \`indicators=["<koden>"]\` med. Lange kodelister:
   bruk \`find=\` i table_metadata (f.eks. find="Oslo" → 0301) i stedet
   for å gjette koder. Kilder merket «kildeguide» i registeret: guiden
   følger automatisk med første search_catalog/table_metadata-svar — les
   den før du bygger spørringen.
```

- [ ] **Step 2: Fiks alle tre eksemplene** — `# ledighet = ssb.read("05839", years="2000:2009")` → `# ledighet = ssb.read("05839", years="2000:2009", indicators=["Personer"])` på alle tre stedene (grenseregel-tabellen i DELIVERY, direktiv-eksempelblokken i DELIVERY, og MODE_R-blokken).

- [ ] **Step 3: Speil i prompts/svar.md** — oppdater DELIVERY-blokken (regel 8 + to eksempler), MODE_R-blokken (ett eksempel) og table_metadata-verktøybeskrivelsen (fra Task 1) byte-nært (unescape TS-escapene: \\\` → \`).

- [ ] **Step 4: Verifiser**

Run: `deno test netlify/edge-functions/_lib/ && deno check netlify/edge-functions/svar.ts && grep -c 'indicators=\["Personer"\]' netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/prompts/svar.md`
Expected: tester PASS; grep = 3 i .ts og 3 i .md

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/prompts/svar.md
git commit -m "feat(svar): pxweb-KRAV-regel + komplette 05839-eksempler (indicators=)"
```

---

### Task 3: 400-oversettelse — rene helpere i pxweb.js + wiring i data-loader.js

**Files:**
- Modify: `js/pxweb.js` (to rene funksjoner + eksport)
- Modify: `js/data-loader.js` (pxweb-grenen, rundt `var fetchedPx = await fetchBytes(...)` ~linje 331)
- Test: `tests/js/pxweb.test.js` (append)

**Interfaces:**
- Consumes: `PX.metadataUrl(url)` (finnes), `fetchBytes(item)` (finnes; kaster `'HTTP <status> for <alias> (<url>)'` / `'proxy <status> for <alias>'` fra fetchLoadTarget).
- Produces: `PxWeb.missingMandatory(url, metaObj)` → `[{dim, label, codes: [{code, label}]}]` (maks 10 koder per dim); `PxWeb.mandatoryErrorMessage(table, missing)` → string.

- [ ] **Step 1: Skriv de feilende node-testene** — append i `tests/js/pxweb.test.js`:

```js
test('missingMandatory: finner mandatory-dimensjoner uten valg i URL-en', () => {
  const meta = {
    role: { time: ['Tid'] },
    dimension: {
      Region: { label: 'region', category: { index: { '0301': 0 }, label: { '0301': 'Oslo' } }, extension: { elimination: true } },
      ContentsCode: { label: 'statistikkvariabel', category: { index: { Folkemengde: 0 }, label: { Folkemengde: 'Personer' } }, extension: { elimination: false } },
      Tid: { label: 'år', category: { index: { 2024: 0 }, label: { 2024: '2024' } }, extension: { elimination: false } },
    },
  };
  const url = 'https://data.ssb.no/api/pxwebapi/v2/tables/11342?valueCodes[Region]=0301&valueCodes[Tid]=from(2015)';
  const missing = PxWeb.missingMandatory(url, meta);
  assert.strictEqual(missing.length, 1);
  assert.strictEqual(missing[0].dim, 'ContentsCode');
  assert.deepStrictEqual(missing[0].codes, [{ code: 'Folkemengde', label: 'Personer' }]);
});

test('missingMandatory: elimination mangler → fallback ContentsCode+tid; alt valgt → tom', () => {
  const meta = {
    role: { time: ['Tid'] },
    dimension: {
      ContentsCode: { label: 'v', category: { index: { A: 0 }, label: { A: 'a' } } },
      Tid: { label: 'år', category: { index: { 2024: 0 }, label: {} } },
    },
  };
  assert.strictEqual(PxWeb.missingMandatory('https://x/t?x=1', meta).length, 2);
  assert.strictEqual(PxWeb.missingMandatory(
    'https://x/t?valueCodes[ContentsCode]=A&valueCodes[Tid]=top(5)', meta).length, 0);
});

test('mandatoryErrorMessage: nevner dim, read-syntaks og koder', () => {
  const msg = PxWeb.mandatoryErrorMessage('11342', [
    { dim: 'ContentsCode', label: 'statistikkvariabel', codes: [{ code: 'Folkemengde', label: 'Personer' }] },
  ]);
  assert.match(msg, /11342/);
  assert.match(msg, /ContentsCode/);
  assert.match(msg, /indicators=/);
  assert.match(msg, /Folkemengde \(Personer\)/);
});
```

(Toppen av fila viser hvordan `PxWeb` requires — følg eksisterende mønster i `tests/js/pxweb.test.js`.)

- [ ] **Step 2: Kjør — verifiser FAIL**

Run: `node --test "tests/js/pxweb.test.js"`
Expected: FAIL — `missingMandatory is not a function`

- [ ] **Step 3: Implementer i js/pxweb.js** (før `var api = {…}`; legg de to i api-objektet):

```js
  // Obligatoriske dimensjoner (spec 2026-07-31-ssb-mandatory-variabler):
  // PxWeb v2 400-er på filtrerte spørringer uten valg for alle
  // elimination=false-dimensjoner. Ren analyse av tabell-URL + metadata —
  // node-testet; data-loader bruker den KUN på 400-feilveien.
  function missingMandatory(url, meta) {
    var q = String(url || '');
    var chosen = {};
    var re = /[?&]valueCodes\[([^\]]+)\]=/g;
    var m;
    while ((m = re.exec(q))) chosen[m[1]] = true;
    var timeDims = ((meta || {}).role || {}).time || [];
    var dims = (meta || {}).dimension || {};
    var out = [];
    Object.keys(dims).forEach(function (id) {
      if (chosen[id]) return;
      var d = dims[id] || {};
      var elim = (d.extension || {}).elimination;
      var mandatory = elim === undefined
        ? (id === 'ContentsCode' || timeDims.indexOf(id) >= 0)
        : elim === false;
      if (!mandatory) return;
      var labels = (d.category || {}).label || {};
      var codes = categoryCodes(d).slice(0, 10).map(function (c) {
        return { code: c, label: labels[c] || c };
      });
      out.push({ dim: id, label: d.label || id, codes: codes });
    });
    return out;
  }

  function mandatoryErrorMessage(table, missing) {
    var deler = (missing || []).map(function (mm) {
      var syntaks = mm.dim === 'ContentsCode' ? 'indicators=["<kode>"]'
        : mm.dim === 'Tid' ? 'years="<fra:til>"'
        : 'filters={"' + mm.dim + '": "<kode>"}';
      var koder = mm.codes.map(function (c) {
        return c.code === c.label ? c.code : c.code + ' (' + c.label + ')';
      }).join(', ');
      return mm.dim + ' [' + mm.label + '] — bruk ' + syntaks + '; gyldige koder: ' + koder;
    });
    return 'SSB-tabell ' + table + ' krever valg for obligatoriske dimensjoner ' +
      '(400 Missing selection). Legg til i read-linjen: ' + deler.join(' | ');
  }
```

- [ ] **Step 4: Wiring i js/data-loader.js** — pxweb-grenen; erstatt `var fetchedPx = await fetchBytes(Object.assign({}, item, { url: PX.dataUrlFor(item.kind, item.url) }));` med:

```js
        var fetchedPx;
        try {
          fetchedPx = await fetchBytes(Object.assign({}, item, { url: PX.dataUrlFor(item.kind, item.url) }));
        } catch (ePx) {
          // 400-oversettelse (spec 2026-07-31): «Missing selection» er den
          // målte hovedfeilen — oversett til en reparérbar melding med
          // gyldige koder, KUN på feilveien (én ekstra metadata-henting).
          var er400 = item.kind === 'pxweb' && /(HTTP|proxy) 400 /.test(String(ePx && ePx.message));
          if (!er400) throw ePx;
          var missingPx = [];
          try {
            var mBytes = await fetchBytes(Object.assign({}, item, { url: PX.metadataUrl(item.url) }));
            missingPx = PX.missingMandatory(item.url, JSON.parse(new TextDecoder().decode(mBytes.buf)));
          } catch (eMeta) { throw ePx; }   // metadata-feil → original feil
          if (!missingPx.length) throw ePx;
          throw new Error(PX.mandatoryErrorMessage(item.table || item.alias, missingPx));
        }
```

- [ ] **Step 5: Kjør — verifiser PASS + full js-suite**

Run: `node --test "tests/js/*.test.js"`
Expected: PASS alle (1091 + 3 nye)

- [ ] **Step 6: Commit**

```bash
git add js/pxweb.js js/data-loader.js tests/js/pxweb.test.js
git commit -m "feat(pxweb): 400 Missing selection → handlingsrettet feilmelding med gyldige koder"
```

---

### Task 4: Guide-laget — ssb.md + source-guides.ts + registrering

**Files:**
- Create: `data/source-guides/ssb.md`
- Create: `netlify/edge-functions/_lib/source-guides.ts`
- Test: `netlify/edge-functions/_lib/source-guides.test.ts` (ny)
- Modify: `netlify/edge-functions/svar.ts` (executeTool: search_catalog + table_metadata)
- Modify: `netlify/edge-functions/_lib/registry.ts` (renderRegistryBlock + DataSource-type)
- Modify: `data/data-sources.json` (`"guide": true` på ssb-oppføringen)

**Interfaces:**
- Produces: `makeGuideAttacher(origin, fetchImpl?)` → `attach(sourceId, resultObj)` — muterer resultObj med `guide`-felt første gang per kilde per kall-løp; stille no-op ved 404/nettverksfeil.
- Consumes: `origin` (finnes i svar.ts-scope, brukes av searchCatalog i dag).

- [ ] **Step 1: Skriv `data/source-guides/ssb.md`** — destillert fra janbrus-referansene (stier i Global Constraints; LES dem først) + de verifiserte faktaene. Krav til innholdet (~80–120 linjer): overskrift + «kilde: SSBs api-eksempler (janbrus), destillert 2026-07-31»; URL-mønstre (`/tables?query=`, `/tables/{id}/metadata`, `/tables/{id}/data`); **mandatory-regelen** m/ 400-teksten; tidsuttrykk `top(n)`, `from(år)`, `[range]`; codelists (`agg_`/`vs_`-prefiks, `codelist[Region]=…`, `outputValues`, `/codelists/{id}`-oppslag); kjente feller (default-CSV er BRED og latin-1 — json-stat2/SSB-malen for tidy; v2-beta er død; data-endepunktet mangler CORS). Direktiv-eksempel med komplett `ssb.read("11342", regions=["0301"], indicators=["Folkemengde"], years="2015:2024")`.

- [ ] **Step 2: Skriv den feilende deno-testen** — `netlify/edge-functions/_lib/source-guides.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeGuideAttacher } from "./source-guides.ts";

function fakeFetch(status: number, body: string): typeof fetch {
  let calls = 0;
  const f = ((_u: string) => { calls++; return Promise.resolve(new Response(body, { status })); }) as typeof fetch;
  (f as unknown as { calls: () => number }).calls = () => calls;
  return f;
}

Deno.test("attach: guide første gang, IKKE andre gang; én fetch totalt", async () => {
  const f = fakeFetch(200, "# SSB-guide");
  const attach = makeGuideAttacher("https://app.example", f);
  const r1: Record<string, unknown> = {};
  const r2: Record<string, unknown> = {};
  await attach("ssb", r1);
  await attach("ssb", r2);
  assertEquals(r1.guide, "# SSB-guide");
  assertEquals(r2.guide, undefined);
  assertEquals((f as unknown as { calls: () => number }).calls(), 1);
});

Deno.test("attach: 404 → stille no-op, resultatet urørt", async () => {
  const attach = makeGuideAttacher("https://app.example", fakeFetch(404, ""));
  const r: Record<string, unknown> = { hits: [] };
  await attach("oecd", r);
  assertEquals(r.guide, undefined);
  assert("hits" in r);
});
```

- [ ] **Step 3: Kjør — FAIL** (`source-guides.ts` finnes ikke)

Run: `deno test netlify/edge-functions/_lib/source-guides.test.ts`

- [ ] **Step 4: Implementer `_lib/source-guides.ts`**

```ts
// Kildeguider (spec 2026-07-31-ssb-mandatory-variabler §fiks 4):
// skills-mønsteret internt — per-kilde-referanse levert i FØRSTE
// search_catalog-/table_metadata-svar for kilden, hentet som statisk
// asset fra egen origin (Deno Deploy bundler ikke .md ved kjøretid).
// Feil (404/nett) → stille no-op: verktøysvaret er ellers uendret.
const MAX_GUIDE_CHARS = 8_000;

export function makeGuideAttacher(origin: string, fetchImpl: typeof fetch = fetch) {
  const sent = new Set<string>();
  return async function attach(sourceId: string, result: Record<string, unknown>): Promise<void> {
    if (!sourceId || sent.has(sourceId)) return;
    sent.add(sourceId);   // også ved feil: ikke re-fetch en død guide i samme løp
    try {
      const res = await fetchImpl(`${origin}/data/source-guides/${sourceId}.md`);
      if (!res.ok) return;
      const text = (await res.text()).slice(0, MAX_GUIDE_CHARS);
      if (text.trim()) result.guide = text;
    } catch { /* stille — guiden er berikelse, aldri avhengighet */ }
  };
}
```

- [ ] **Step 5: Wire i svar.ts** — import `makeGuideAttacher`; rett før `executeTool`-definisjonen: `const attachGuide = makeGuideAttacher(origin);`. Endre search_catalog- og table_metadata-grenene til å bygge objektet, kalle attach, og så stringifye:

```ts
    if (name === "search_catalog" && registry) {
      const r = await searchCatalog(String(input.source ?? ""), String(input.query ?? ""), { registry, origin }) as Record<string, unknown>;
      await attachGuide(String(input.source ?? ""), r);
      return JSON.stringify(r);
    }
    if (name === "table_metadata" && registry) {
      const r = await tableMetadata(String(input.source ?? ""), String(input.table_id ?? ""), {
        registry,
        find: typeof input.find === "string" && input.find.trim() ? input.find : undefined,
      }) as Record<string, unknown>;
      await attachGuide(String(input.source ?? ""), r);
      return JSON.stringify(r);
    }
```

- [ ] **Step 6: Registrering** — (a) `data/data-sources.json`: legg `"guide": true` i ssb-oppføringen; (b) `registry.ts`: legg `guide?: boolean;` i DataSource-typen (finn interfacet i fila) og i renderRegistryBlock, etter isSearchableSource-linjen:

```ts
    if (s.guide) bits.push("kildeguide følger med første search_catalog/table_metadata-svar");
```

- [ ] **Step 7: Kjør alt**

Run: `deno test netlify/edge-functions/_lib/ && deno check netlify/edge-functions/svar.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add data/source-guides/ssb.md data/data-sources.json netlify/edge-functions/_lib/source-guides.ts netlify/edge-functions/_lib/source-guides.test.ts netlify/edge-functions/svar.ts netlify/edge-functions/_lib/registry.ts
git commit -m "feat(svar): source-guide-laget — ssb.md levert ved første katalogkall"
```

---

### Task 5: Full regresjon

**Files:** ingen nye endringer (rettelser committes her)

- [ ] **Step 1:** `node --test "tests/js/*.test.js"` → forvent 1094 PASS
- [ ] **Step 2:** `deno test netlify/edge-functions/_lib/` → forvent PASS
- [ ] **Step 3:** `deno check netlify/edge-functions/svar.ts` → OK
- [ ] **Step 4:** `python3 -m pytest tests/ -x -q --ignore=tests/manual | tail -2` → forvent PASS

**Sluttkriterium (kjøres av kontrolløren, IKKE subagent — billable):** Oslo-eksempelspørsmålet i appen på nytt etter `netlify dev`-restart. PASS = ekte SSB-tall (tabell 11342 e.l.), ≤3 run_code, ingen degraderingsbadge.
