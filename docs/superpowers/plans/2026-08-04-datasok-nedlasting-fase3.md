# Datasøk og nedlasting fase 3 — implementasjonsplan (fire kilder)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 3 fra spec `docs/superpowers/specs/2026-08-03-datasok-og-nedlasting-v1-design.md`: DBnomics-ryggrad, OWID-katalogarm, Google Data Commons (søk + dekningssjekk + nedlasting), IPUMS (mikrodata, tilstandsløs extract-flyt) + datatype-ruting (§3x) og rå-URL-tomt-vakten fra sluttreviewen.

**Architecture:** Nye søkearmer følger `catalogs/`-mønsteret (statisk fil eller live API, DatasetHit m/ how_to_read); nedlasting følger kind-mønsteret (translateCanonical → api-kinds-flatener → CSV-bytes); alt promptarbeid testlåses som i fase 2. Hint-må-parse-testens mock MÅ utvides per ny arm — det er den innebygde drift-alarmen, ikke en plage.

**Tech Stack:** Deno/TS edge-funksjoner, vanilla JS (IIFE + node --test), Python-høsteskript (tools/, pytest).

## Global Constraints

- Brukervendte feilstrenger på norsk. Ingen nye runtime-avhengigheter.
- `ost`-grammatikken endres IKKE — nye kilder følger eksisterende kind-mønster (som dbnomics/worldbank). Spikens kjennelse (wbgapi/sdmx1-adopsjon, prefix-rewrites for biblioteker) er BEVISST utenfor denne planen.
- Hver ny søkearm: stille fraværende ved manglende forutsetning (nøkkel/fil), høylytt på lastelaget. `failed`-listen navngir armer som svarte feil.
- `netlify/edge-functions/_lib/tools/hints-parse.test.ts` asserterer `failed.length===0` — hver ny arm KREVER at testens fetchImpl-mock utvides (Task 3/6 sier hvordan). Glemmes det, er rød test riktig oppførsel.
- Kildeguider ≤ 8 000 tegn (attacher-taket); `guide:true` ↔ fil håndheves av source-guides-drift.test.ts.
- Eksterne API-former (Datasette, Data Commons, IPUMS) verifiseres med curl i egne steg FØR adapterkoden ferdigstilles — juster koden til målt form, aldri omvendt.
- Testkommandoer: `node --test tests/js/*.test.js` (Node 26: aldri bar katalog), `python3 -m pytest -q`, `cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/`.
- Commits per task; **push først i Task 11** (Netlify autodeploy = prod). Task 5 (DC-nøkkel) er Hans-checkpoint; Tasks 6–8 bygges mot mocks og live-verifiseres i Task 11.
- Telemetri-/scrubbing-koden røres ikke.

## File Structure

- Modify `netlify/edge-functions/_lib/tools/search-datasets.ts` — per-arm-tak (dbnomics 6) + owid- og datacommons-armer i stats-settet.
- Create `tools/harvest_owid_catalog.py` + `data/owid-catalog.json` + `tests/test_harvest_owid_catalog.py`.
- Create `netlify/edge-functions/_lib/tools/catalogs/owid.ts` + `owid.test.ts`.
- Create `netlify/edge-functions/_lib/tools/catalogs/datacommons.ts` + `datacommons.test.ts`.
- Modify `netlify/edge-functions/_lib/tools/table-metadata.ts` — datacommons-dekningsgren.
- Modify `js/data-loader.js` — rå-URL-tomt-vakt i `fetchRawUrl`; datacommons-kind-sti.
- Modify `js/api-kinds.js` — datacommons-flatener.
- Modify `js/data-directives.js` — translateCanonical datacommons-gren; kind-listen i resolve.
- Modify `data/data-sources.json` — datacommons- og ipums-oppføringer (+ guide:true).
- Create `data/source-guides/datacommons.md`, `data/source-guides/ipums.md`.
- Modify `netlify/edge-functions/_lib/svar-prompt.ts` — ROUTING: DATATYPE-linje + DC-rolle; META_SEARCH uendret.
- Modify tests: hints-parse-mock, svar-prompt-budsjett (nye assertions), data-loader-feilkropp (append), data-directives-apikinds (node, append).
- Modify `docs/eval/ask-evalsett.md` — 5 nye spørsmål.

---

### Task 1: DBnomics-ryggrad — per-arm-tak 6

**Files:** Modify `netlify/edge-functions/_lib/tools/search-datasets.ts`; test append i `search-datasets.test.ts`.

**Interfaces:** Produces: `CATALOG_CAP: Record<string, number>` (eksportert for test); dbnomics-armen leverer inntil 6 treff, andre armer fortsatt `MAX_PER_CATALOG` (4). `MAX_TOTAL` 15 uendret.

- [ ] **Step 1: Feilende test** — append i `search-datasets.test.ts` (bruk filens eksisterende `_catalogsForTest`-mønster, les toppen først):

```ts
Deno.test("dbnomics-armen har hevet tak (ryggrad, spec fase 3a)", async () => {
  const hit = (i: number) => ({ source: "dbnomics", id: "D" + i, title: "t" + i,
    access: "open" as const, how_to_read: "x" });
  const res = await searchDatasets("q", "stats", {
    registry: [], origin: "https://x.example",
    _catalogsForTest: {
      dbnomics: () => Promise.resolve(Array.from({ length: 8 }, (_, i) => hit(i))),
      worldbank: () => Promise.resolve(Array.from({ length: 8 }, (_, i) =>
        ({ ...hit(i), source: "worldbank" }))),
    },
  });
  assertEquals(res.hits.filter((h) => h.source === "dbnomics").length, 6);
  assertEquals(res.hits.filter((h) => h.source === "worldbank").length, 4);
});
```

- [ ] **Step 2: Kjør — FAIL** (`deno test --allow-all _lib/tools/search-datasets.test.ts`)
- [ ] **Step 3: Implementer** — i search-datasets.ts:

```ts
// Per-arm-tak: dbnomics er den internasjonale ryggraden (spec fase 3a) og
// skal ikke begraves av round-robin-flettingen. Andre armer: MAX_PER_CATALOG.
export const CATALOG_CAP: Record<string, number> = { dbnomics: 6 };
```

og i settled-løkka: `perCatalog.push(s.value.slice(0, CATALOG_CAP[names[i]] ?? MAX_PER_CATALOG));` (viaSearchCatalog-slicen på 4 består — den gjelder enkeltkilde-søk).

- [ ] **Step 4: Kjør — PASS + hele Deno-suiten**
- [ ] **Step 5: Commit** `feat(ryggrad): dbnomics per-arm-tak 6 i search_datasets`

---

### Task 2: OWID-katalog — høsteskript + statisk fil

**Files:** Create `tools/harvest_owid_catalog.py`, `data/owid-catalog.json`, `tests/test_harvest_owid_catalog.py`.

**Interfaces:** Produces: `data/owid-catalog.json` = `{"charts": [{"slug": str, "title": str, "subtitle": str|null}]}` (~4 400 innslag). Kilde (VERIFISERT 2026-08-04): Datasette `https://datasette-public.owid.io/owid.json?sql=...` — `charts`-tabellen har kolonnene slug/title/subtitle; 4 445 rader.

- [ ] **Step 1: Verifiser kilden + kolonner** — `curl -s "https://datasette-public.owid.io/owid.json?sql=select+slug,title,subtitle+from+charts+limit+3"`; sjekk også om tabellen har publiserings-/utkast-kolonne (`select * from charts limit 1` → kolonneliste) og filtrer i så fall på publisert.
- [ ] **Step 2: Feilende test** — `tests/test_harvest_owid_catalog.py` etter mønster av `test_harvest_worldbank_catalog.py` (les den først): ren funksjon `rens_chart(row) -> dict|None` (dropp rader uten slug/tittel; klipp subtitle til 200 tegn) + `CATALOG.exists()`-sjekk med «kjør tools/harvest_owid_catalog.py»-melding.
- [ ] **Step 3: Skriv høsteren** — `tools/harvest_owid_catalog.py`: pag inert SQL (`limit 1000 offset N`) til tom side; `rens_chart` per rad; skriv JSON med `ensure_ascii=False` + `_provenance`-felt {source_url, fetched_at} (oda-reader-konvensjonen fra Workbench-utredningen). Følg de andre høsternes CLI-stil.
- [ ] **Step 4: Kjør høsteren** — `python3 tools/harvest_owid_catalog.py`; verifiser ~4 400 innslag og at fila er < ~1,5 MB.
- [ ] **Step 5: pytest PASS; commit** `feat(owid): høstet katalog (Datasette, 4,4k charts)`

---

### Task 3: OWID-søkearm

**Files:** Create `netlify/edge-functions/_lib/tools/catalogs/owid.ts` + `owid.test.ts`; modify `search-datasets.ts` (stats-settet); modify `hints-parse.test.ts` (mock).

**Interfaces:** Produces: `owidSearch(query, origin, fetchImpl) -> DatasetHit[]` (maks 8; scoreSubstring over `title + subtitle`); how_to_read er REN PANDAS (venstre kolonne i grenseregelen — ingen direktiv).

- [ ] **Step 1: Verifiser hint-URL-formen LIVE** — `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "https://ourworldindata.org/grapher/life-expectancy.csv?useColumnShortNames=true&csvType=filtered&country=NOR~SWE&time=2000..2024"` og sammenlign med varianten UTEN `csvType=filtered`. Hintet skal bruke den formen som faktisk filtrerer (mindre nedlasting) — dokumenter målingen i en kommentar i owid.ts.
- [ ] **Step 2: Feilende test** — `owid.test.ts` etter eurostat.test.ts-mønster: mocket statisk fil `{"charts":[{"slug":"life-expectancy","title":"Life expectancy at birth","subtitle":null}]}`; assert treff for «life expectancy», tomt for tulleord, og at `how_to_read` inneholder `pd.read_csv("https://ourworldindata.org/grapher/life-expectancy.csv` og `access === "open"`.
- [ ] **Step 3: Implementer** — `owid.ts` etter eurostat.ts-mønster (loadStaticCatalog `/data/owid-catalog.json`, queryWords/scoreSubstring, MAX 8):

```ts
    how_to_read:
      `Åpen GET-CSV — ren pandas (INTET direktiv):\n` +
      `df = pd.read_csv("https://ourworldindata.org/grapher/${c.slug}.csv?useColumnShortNames=true<FILTERFORM-FRA-STEP-1>")\n` +
      `country=NOR~SWE (~ skiller land), time=2000..2024 eller time=latest; probe URL-en før bruk`,
```

(erstatt `<FILTERFORM-FRA-STEP-1>` med målt form). I search-datasets.ts: `owid: () => owidSearch(query, deps.origin, f),` i stats-settet.

- [ ] **Step 4: Utvid hints-parse-mocken** — i hints-parse.test.ts sin fetchImpl: `if (url.includes("/data/owid-catalog.json")) return svar({ charts: [{ slug: "life-expectancy", title: "Health life expectancy", subtitle: null }] });` (tittel må treffe «health spending»-querien? — nei: match querien «health …» med tittel som inneholder ordet health). Kjør testen; `failed` skal være tom og owid-hintet (ren pandas, ingen `#`) skal hoppes over av normaliser uten feil.
- [ ] **Step 5: Full Deno-suite PASS; commit** `feat(owid): søkearm over høstet katalog — ren-pandas-hint`

---

### Task 4: Tomt-vakt for rå-URL-/bro-veien

**Files:** Modify `js/data-loader.js` (`fetchRawUrl`); test append i `netlify/edge-functions/_lib/data-loader-feilkropp.test.ts`.

**Interfaces:** Produces: `fetchRawUrl` kaster norsk, handlingsrettet feil når svaret er CSV med 0 datarader (header-only). Gjelder KUN CSV (content-type inneholder 'csv' ELLER url matcher `\.csv(\?|$)`) — JSON/HTML/parquet røres ikke (falske positive).

- [ ] **Step 1: Feilende tester** (append):

```ts
Deno.test("fetchRawUrl: CSV med 0 datarader kaster (OWID-slug-feil-klassen)", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("entity,year,value\n",
    { status: 200, headers: { "content-type": "text/csv" } }))) as typeof fetch;
  await assertRejects(() => DL.fetchRawUrl("https://owid.example/x.csv", { fetchImpl }),
    Error, "TOMT");
});

Deno.test("fetchRawUrl: én-linjes ikke-CSV kaster IKKE", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("{\"a\":1}",
    { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  const r = await DL.fetchRawUrl("https://api.example/x", { fetchImpl });
  if (!r.bytes.length) throw new Error("skulle levert bytes");
});
```

- [ ] **Step 2: FAIL → implementer** — i `fetchRawUrl`, etter `assertNotTruncated`/arrayBuffer:

```js
    // Tomt-vakt for bro-veien (spec fase 3 / sluttreview F4): OWID-hintets
    // vei er ren pd.read_csv(url) — en feilslått slug/filter gir header-only
    // CSV som ellers ville blitt en stille tom ramme. KUN csv (content-type
    // eller .csv-endelse) vaktes — json/html/parquet har legitime én-linjere.
    var ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('csv') >= 0 || /\.csv(\?|$)/.test(url)) {
      var prefiks = new TextDecoder().decode(buf.slice(0, 2048));
      var rader = prefiks.split('\n').filter(function (l) { return l.trim(); });
      if (rader.length < 2) {
        throw new Error('«' + url + '»: uttrekket kom TOMT tilbake (0 datarader) — ' +
          'sjekk slug/filtre (land- og tidsparametre) før ny kjøring');
      }
    }
```

(NB: `buf` finnes allerede; behold retur-objektet uendret.)

- [ ] **Step 3: PASS + full Deno- og Node-suite; commit** `feat(lasting): tomt-vakt også på rå-URL/bro-veien (csv-only)`

---

### Task 5: CHECKPOINT — Data Commons-nøkkel (Hans)

**Files:** ingen.

- [ ] **Step 1: Be Hans om nøkkel** — registrer gratis API-nøkkel (https://apikeys.datacommons.org), legg den som `DATACOMMONS_API_KEY` i Netlify-env OG i lokal `.env`. Tasks 6–8 bygges mot mocks uavhengig; Task 11 live-verifiserer. Meld fra og fortsett.

---

### Task 6: Data Commons-søkearm (terskel 0,9; stille uten nøkkel)

**Files:** Create `catalogs/datacommons.ts` + `datacommons.test.ts`; modify `search-datasets.ts`; modify `hints-parse.test.ts` (mock).

**Interfaces:** Produces: `dcSearch(query, apiKey, fetchImpl) -> DatasetHit[]` (maks 5, KUN treff med score ≥ 0.9 — Workbench-målt: 0,9999 = ekte, 0,755 = temadrift); i search-datasets: armen registreres BARE når `Deno.env.get("DATACOMMONS_API_KEY")` finnes (stille fraværende ellers — aldri i failed-listen).

- [ ] **Step 1: Verifiser API-formen** (krever Task 5-nøkkel i .env; HAR du den ikke ennå: skriv adapteren mot formen under og merk verifisering som gjenstående for Task 11): `curl -s "https://api.datacommons.org/v2/resolve?key=$DATACOMMONS_API_KEY&nodes=unemployment%20rate&property=%3C-description-%3E"` — noter responsform (candidates m/ dcid + score/typeOf). Konsulter docs.datacommons.org/api/rest/v2/resolve ved avvik og JUSTER koden til målt form.
- [ ] **Step 2: Feilende test** — mock to kandidater (score 0.99 og 0.75); assert kun første overlever, `source === "datacommons"`, `access === "open"`, how_to_read nevner `table_metadata('datacommons', '<dcid>')` FØR lasting (dekningssjekk-kontrakten).
- [ ] **Step 3: Implementer** — how_to_read:

```
`table_metadata('datacommons', '${dcid}', find='<landkode>') → SJEKK DEKNING for geografien FØR bruk (søketreff ≠ observasjoner) → # x = datacommons.read("${dcid}", countries=["NOR"])`
```

I search-datasets.ts: registrer armen betinget (`const dcKey = Deno.env.get("DATACOMMONS_API_KEY"); if (dcKey) stats.datacommons = () => dcSearch(query, dcKey, f);`). Testene i search-datasets.test.ts bruker `_catalogsForTest` og påvirkes ikke.

- [ ] **Step 4: hints-parse-mocken** — armen er env-betinget; i testmiljøet uten nøkkel er den fraværende → ingen mock-endring NØDVENDIG, men legg en kommentar i hints-parse.test.ts om at DC-hintet dekkes når env-nøkkel settes i CI (bevisst hull, dokumentert).
- [ ] **Step 5: Full suite PASS; commit** `feat(dc): resolve-søkearm m/ 0,9-terskel, stille uten nøkkel`

---

### Task 7: Data Commons-dekningssjekk i table_metadata

**Files:** Modify `netlify/edge-functions/_lib/tools/table-metadata.ts`; test append i `table-metadata.test.ts`.

**Interfaces:** Produces: `tableMetadata('datacommons', '<statvar-dcid>', {find: 'NOR'})` → `{source, id, dekning: [{entity, siste_dato, antall_fasetter, fasetter: [{kilde, enhet?}]}], råd: string}`. `find` tolkes som ISO3/ISO2-landkode → `country/<KODE>`; uten find: rådet sier «angi find=<landkode>». Nøkkel fra `Deno.env.get("DATACOMMONS_API_KEY")`; mangler den → kast norsk feil («datacommons krever site-nøkkel — sett DATACOMMONS_API_KEY»).

- [ ] **Step 1: Verifiser observasjons-API-et** (med nøkkel; ellers bygg mot formen og merk for Task 11): `curl -s "https://api.datacommons.org/v2/observation?key=$KEY&variable.dcids=<statvar>&entity.dcids=country/NOR&date=LATEST&select=entity&select=variable&select=date&select=value&select=facet"` — noter byVariable/orderedFacets-formen.
- [ ] **Step 2: Feilende tester** — (a) mock med to fasetter (WB 83.112, OECD 83.1) → dekning viser BEGGE m/ kilde (multi-fasett-tvetydigheten skal frem, aldri velges stille); (b) mock uten observasjoner → `dekning: []` og `råd` inneholder «INGEN observasjoner» + «velg en annen variabel» (den målte 0,9999997-uten-data-fellen); (c) dispatch: ny `case "datacommons"` i tableMetadata-switchen (kind-basert som worldbank/dbnomics).
- [ ] **Step 3: Implementer; full suite PASS; commit** `feat(dc): dekningssjekk i table_metadata — fasetter eksplisitt, tomt = høylytt råd`

---

### Task 8: Data Commons-nedlasting (registeroppføring + flatener)

**Files:** Modify `data/data-sources.json`, `js/data-directives.js`, `js/api-kinds.js`, `js/data-loader.js`; tests: append i `tests/js/data-directives-apikinds.test.js` (node) og `data-loader-feilkropp.test.ts` (deno); create `data/source-guides/datacommons.md`.

**Interfaces:**
- Registeroppføring: `{"id": "datacommons", "navn": "Google Data Commons", "utgiver": "Google", "tillit": "etablert", "tilgang": "rest", "kind": "datacommons", "base_url": "https://api.datacommons.org/v2/", "cors": true, "auth": {"type": "api_key", "env": "DATACOMMONS_API_KEY", "plassering": "query:key"}, "guide": true, "quirks": "søketreff ≠ dekning — table_metadata(find=<land>) FØR read; multi-fasett: navngi kilden"}` — auth→`viaProxy` automatisk (nøkkel injiseres i /api/hent, når aldri klienten).
- Direktivform: `# x = datacommons.read("<statvar-dcid>", countries=["NOR","SWE"], years="2010:2024")`.
- `translateCanonical('datacommons', …)`: countries → `entity.dcids=country/<KODE>`-params (flere = flere params); indicators/regions → norsk hard feil («bruk countries= eller filters={"entity": [...]} med dcid-er»); filters.entity (liste av dcid-er) → entity.dcids-params; years → clientYears (klientfiltrering, som dbnomics).
- Lasteren (data-loader kind-sti): dataUrl = base + `observation?variable.dcids=<sti>&date=all&select=entity&select=variable&select=date&select=value&select=facet` + entity-params; JSON → `dcColumns(doc)` i api-kinds.js → kolonner `{variable, entity, date, value, facet_kilde}` (én rad per observasjon; ved flere fasetter: ta orderedFacets[0] som verdi-rad MEN legg fasettkilden i facet_kilde-kolonnen så valget er synlig — aldri stille) → `columnsToCsv` → tomt-vakten fra fase 2 gjelder.
  **RETTET (fix-runde 2, live-verifisert 2026-08-04):** `date=all` er DØD live — svarer TOMT (`byEntity: {"<entity>": {}}`, ingen orderedFacets) mot ekte v2/observation, til tross for at det er den dokumenterte formen. Lasteren utelater date-parameteren HELT (full serie; years= filtreres uansett klient-side via clientYears) — se `js/api-kinds.js` (`dcObservationUrl`). Linja over er den opprinnelige (feilaktige) planen, bevart for historikk.
- Guide `datacommons.md` (~15 linjer): dekningssjekk-plikten, countries=ISO3, fasett-regelen, «aldri kilde for nordiske detaljer — ssb/fhi/eurostat der».

- [ ] **Step 1: Feilende node-tester** (data-directives-apikinds.test.js, filens mønster): translateCanonical-grenen (countries→entity-params; indicators→error; years→clientYears) + resolve av `# x = datacommons.read("Count_Person", countries=["NOR"])` mot registeroppføringen → url/kind/viaProxy riktige.
- [ ] **Step 2: Feilende deno-test** (data-loader-feilkropp.test.ts, append): mocket observasjonsrespons m/ to fasetter → CSV har facet_kilde-kolonne og datarader; tom respons → TOMT-kast.
- [ ] **Step 3: Implementer alle fire filer + guiden; registry-validering grønn** (`deno test --allow-all _lib/registry.test.ts _lib/source-guides-drift.test.ts`).
- [ ] **Step 4: Full node- + deno-suite PASS; commit** `feat(dc): nedlasting — registeroppføring, kanonisk oversettelse, fasett-synlig flatener, guide`

---

### Task 9: IPUMS — register, nøkkel-UI, guide, datatype-ruting

**Files:** Modify `data/data-sources.json`; create `data/source-guides/ipums.md`; modify `netlify/edge-functions/_lib/svar-prompt.ts` (ROUTING); tests: append i `svar-prompt-budsjett.test.ts`; verifiser nøkkel-UI.

**Interfaces:**
- Registeroppføring: `{"id": "ipums", "navn": "IPUMS (NHIS/MEPS/International)", "utgiver": "IPUMS / University of Minnesota", "tillit": "etablert", "tilgang": "rest", "base_url": "https://api.ipums.org/", "cors": false, "auth": {"type": "api_key", "user": true, "plassering": "header:Authorization"}, "guide": true, "nokkel_hint": "gratis konto på ipums.org → API key", "quirks": "asynkron extract-flyt — se guiden; datasett kan ikke videredistribueres"}`. (user-nøkkel + header = gyldig per registry-valideringen; cors:false → alltid /api/hent, som injiserer nøkkelen vertsbundet.)
- ROUTING får DATATYPE-blokk (spec §3x) — legg RETT FØR «Flere kilder dekker spørsmålet?»-punktet:

```
- **DATATYPE styrer scope:** individ-/mikrodata (survey, personnivå,
  registerhendelser) → search_datasets scope='research' + ipums-guiden
  (helse-surveys NHIS/MEPS, internasjonale folketellinger); aggregert/
  makro (rater, indekser, tidsserier) → scope='stats'; usikker → 'all'.
```

- Guide `ipums.md` (verbatim-innhold skrives i tasken, ≤ 8 000 tegn) med den TILSTANDSLØSE flyten: (1) sjekk nylige extracts: `# status = ost.read("/api/hent?url=" + urlenkodet("https://api.ipums.org/extracts?collection=nhis&version=2"))` — vent, direktiver er literal-only: guiden gir FERDIG-enkodede eksempel-URL-er for nhis/meps/ipumsi; (2) finnes ferdig extract → last ned download-URL-en via /api/hent; (3) ellers: send inn extract (POST GET-innpakket: `/api/hent?url=<extracts-endepunkt>&body=<url-enkodet definisjon>`), poll ÉN gang, og AVSLUTT ÆRLIG: «extract er sendt inn — spør igjen om ~5 minutter, så plukker jeg den opp» (dette er et VELLYKKET utfall); (4) mikrodata-etikk: aldri videredistribuer, aggreger før visning.

- [ ] **Step 1: Verifiser IPUMS-API-formen** — `curl -s -H "Authorization: <dummy>" https://api.ipums.org/extracts?collection=nhis&version=2 -o /dev/null -w "%{http_code}\n"` (403/401 forventet = endepunktet finnes; 404 → sjekk versjonsparameteren mot developer.ipums.org og juster guiden).
- [ ] **Step 2: Feilende prompt-test** (append i svar-prompt-budsjett.test.ts): `sys.includes("DATATYPE styrer scope")` og `sys.includes("ipums")`.
- [ ] **Step 3: Registeroppføring + guide; drift-test grønn.**
- [ ] **Step 4: Verifiser nøkkel-UI-en** — `renderSourceKeys` i js/ai-chat.js bygger fra registerets user-auth-oppføringer (fred/kaggle-mønsteret): bekreft ved lesing at ipums dukker opp automatisk med nokkel_hint; hvis lista er hardkodet et sted, utvid den.
- [ ] **Step 5: Full suite PASS; commit** `feat(ipums): registeroppføring, guide m/ tilstandsløs extract-flyt, datatype-ruting`

---

### Task 10: Evalsett-utvidelse

**Files:** Modify `docs/eval/ask-evalsett.md`.

- [ ] **Step 1: Legg til 5 rader** i spørsmålstabellen (nummerert 13–17): 13 OWID-hverdagsspråk («Har forventet levealder i verden økt de siste 50 årene?» — forventet: owid-arm, ren pandas, figur); 14 DC-demografi («Sammenlign befolkningsveksten i Norge og Sverige siste 20 år» — forventet: DC ELLER ssb/scb; hvis DC: dekningssjekk synlig i sporet); 15 DBnomics-makro («Hvordan har IMFs vekstanslag for Norge endret seg?» — forventet: dbnomics WEO:latest); 16 IPUMS-flyt («Finn amerikanske surveydata om helseforsikring på individnivå» — forventet: ipums-guiden følges; ÆRLIG «extract sendt inn»-utfall er PASS); 17 dekningshull («Hvor mange enhjørninger finnes per fylke?» — forventet: ærlig ikke-funnet, INGEN fabrikkerte tall). Noter at etter-målingen (spec §Testing) = de 5 baseline-spørsmålene + disse.
- [ ] **Step 2: Commit** `docs(eval): fase 3-spørsmål (13–17) + etter-målingsdefinisjon`

---

### Task 11: Sluttsjekk, push, live-smoke, etter-måling

**Files:** ingen nye.

- [ ] **Step 1: Full suite alle miljøer** (kommandoene i Global Constraints) — alt grønt.
- [ ] **Step 2: Push** (`git push` fra askstat-rot; Netlify autodeployer).
- [ ] **Step 3: Live-smoke per ny arm fra prod-origin:** (a) `curl https://ask.melberg.app/data/owid-catalog.json` 200; (b) OWID-hint-URL-en (life-expectancy-eksempelet) 200 m/ datarader; (c) DC: hvis DATACOMMONS_API_KEY er satt i Netlify — ett search_datasets-kall via appen (spørsmål 14) og sjekk at dc-armen dukker opp i sporet; ellers noter som venter-på-nøkkel; (d) IPUMS: extracts-endepunktet via `/api/hent` gir 401 uten registrert nøkkel (bevis på at proxy-ruten og feilen er ærlig).
- [ ] **Step 4: Etter-måling (Hans avgjør omfang):** de 5 baseline-spørsmålene + 13–17 med samme playwright-oppsett som midtveis-målingen; resultater i `docs/eval/2026-08-baseline.md` som «Etter fase 3»-seksjon. Kostnad ~10 kjøringer på Hans' nøkkel — spør før start.
- [ ] **Step 5: Rapporter** — hva som er live, kjente hull (DC-nøkkel-status, IPUMS uverifisert mot ekte konto), og lukk planen.

---

## Self-review (utført ved skriving)

- **Spec-dekning fase 3:** 3a → Task 1; 3b → Tasks 2–3; 3x → Task 9 (ROUTING-blokken); 3c → Tasks 5–8; 3d → Task 9; sluttreview-F4 → Task 4; eval → Tasks 10–11. Prefix-rewrites/bibliotek-adopsjon bevisst utenfor (kjennelsens eget løp).
- **Plassholder-sjekk:** eksterne API-former har eksplisitte verifiser-med-curl-steg med juster-koden-instruks — det er målt-før-skrevet-disiplin, ikke TBD. `<FILTERFORM-FRA-STEP-1>` i Task 3 er en bevisst måleavhengighet med presis utfyllingsregel.
- **Typekonsistens:** `CATALOG_CAP` (Task 1) brukes kun i search-datasets; `dcSearch`/`dcColumns`/`facet_kilde` navngitt likt i Tasks 6–8; DATATYPE-blokkens tekst i Task 9 matcher test-assertens substring.
