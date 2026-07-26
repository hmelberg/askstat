# `all()`-direktiv for pxweb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `all()`-direktiv som laster hele en pxweb-tabell (alle verdier på hver uspesifiserte dimensjon) med en 800 000-celles vakt — per spec `docs/superpowers/specs/2026-07-26-pxweb-all-direktiv-design.md`.

**Architecture:** Parseren setter et flagg, resolve (synkron) markerer pxweb-elementet, og lasteren (async) henter tabellens metadata, kjører en ren ekspansjons-/vakthjelper i `js/pxweb.js`, og fyller `valueCodes[Dim]=*` for uspesifiserte dimensjoner før den vanlige json-stat2→tidy-hentingen.

**Tech Stack:** Vanilla JS (IIFE-moduler), node --test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-pxweb-all-direktiv-design.md`.
- **Commit lokalt kun — ALDRI push** (`feedback-openstat-no-autopush`).
- Semantikk (spec §1): `all()` fyller `valueCodes[Dim]=*` for hver dimensjon som IKKE alt er satt av `years()/regions()/indicators()/filters()/valueCodes[...]`; eksplisitte selektorer overstyrer. Virker i både `# load` og `# read` (delt parseOptions/resolve).
- Format (spec §2): json-stat2, uendret (`PX.dataUrlFor` tvinger det alt).
- **Cellegrense (spec §4, verifisert 2026-07-26 mot ekte SSB): `PXWEB_ALL_MAX_CELLS = 800000`.** SSB avviser 801 400 (HTTP 400 «Too many cells selected»), godtar 797 100 (200). IKKE sett høyere. Over grensen → tydelig norsk feil via `t()`, aldri stille kutt.
- Kun pxweb i v1 (spec §5): `all()` på ikke-pxweb-kilde → tydelig feil.
- UI-strenger på norsk via `t()`, en.js-nøkkel. Ingen live HTTP i enhetstestene (fixturer).
- Testkommando: `node --test 'tests/js/*.test.js'`.
- Ankere (verifisert 2026-07-26): parseOptions `js/data-directives.js:48-72` (opsjons-while-løkka, `canon()`-hjelper); pxweb resolve-gren `:105-126` (`out = {rest, params}`, `params.push('valueCodes[Dim]=…')`, `return out`); loader pxweb-sti `js/data-loader.js:257-264` (`item.kind==='pxweb'`, `PX.dataUrlFor(item.kind, item.url)` → fetch → `columnsFromJsonStat` → csv); `js/pxweb.js` `buildUrl/dataUrl/metadataUrl` (:14-30). SSB /metadata er json-stat2-formet: `.id` (dim-rekkefølge), `.size` (parallelle antall), `.dimension[id].category.index` (koder).

---

### Task 1: Parser + resolve — `all()`-flagget

**Files:**
- Modify: `js/data-directives.js` (parseOptions ~:52-69, pxweb resolve-gren ~:105-125)
- Modify: `tests/js/data-directives-apikinds.test.js` (samme mønster som eksisterende pxweb-tester ~:104)

**Interfaces:**
- Produces: `parse(script)`-resolverte pxweb-elementer får `all: true` når linja har `all()`. Konsumeres av Task 3 (lasteren). Ikke-pxweb + `all()` → `{error}`.

- [ ] **Step 1: Feilende node-tester** i `data-directives-apikinds.test.js` (bruk `resolveOne`-hjelperen som de andre pxweb-testene):

```js
test('pxweb all(): setter all-flagget, bevarer eksplisitte valueCodes', () => {
  const bare = resolveOne(
    '# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)\n' +
    '# load ssb/05839 as bef, all()');
  assert.ok(!bare.error, bare.error);
  assert.equal(bare.all, true);
  const kombi = resolveOne(
    '# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)\n' +
    '# load ssb/05839 as bef, all(), years(2000:2009), indicators(Personer)');
  assert.equal(kombi.all, true);
  assert.ok(/valueCodes\[Tid\]=2000,2001/.test(kombi.url), kombi.url);       // years bevart
  assert.ok(/valueCodes\[ContentsCode\]=Personer/.test(kombi.url));          // indicators bevart
});

test('all() på ikke-pxweb-kilde → feil', () => {
  const r = resolveOne(
    '# connect https://sdmx.oecd.org/public/rest/data as o, kind(oecd)\n' +
    '# read o/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all as le, all()');
  assert.ok(r.error && /all\(\).*pxweb/i.test(r.error), r.error);
});
```

- [ ] **Step 2: Kjør → FAIL** (`node --test tests/js/data-directives-apikinds.test.js`).

- [ ] **Step 3: Implementer.** I parseOptions-løkka (etter `filters`-grenen, ~:68): `else if (name === 'all') canon().all = true;`. I resolve, pxweb-grenen (~:105, sett tidlig i grenen etter `var c` er tilgjengelig): `if (c.all) out.all = true;` (behold resten uendret — eksplisitte valueCodes bygges som før). I de ANDRE kind-grenene (sdmx/worldbank/eurostat/dbnomics): når `c.all`, `return { error: 'all() støttes foreløpig kun for pxweb-kilder — for andre kilder, angi utvalg eksplisitt' };` (legg sjekken tidlig i hver ikke-pxweb-gren, ELLER én felles sjekk før kind-forgreningen som unntar pxweb). Velg den formen som er lesbar og ikke dupliserer — én sjekk `if (c.all && kind !== 'pxweb') return {error…}` før pxweb-grenen er renest.

- [ ] **Step 4: Kjør → PASS** + full node-suite.
- [ ] **Step 5: Commit** — `feat: all()-direktiv — parser + resolve (pxweb-flagg, feil for andre kilder)`.

---

### Task 2: Ren ekspansjons-/vakthjelper i `js/pxweb.js`

**Files:**
- Modify: `js/pxweb.js` (ny `expandAllUrl` + `PXWEB_ALL_MAX_CELLS`, eksportert på API-objektet ~:108)
- Create: `tests/js/pxweb-all.test.js` (node --test, samme load-mønster som `tests/js/pxweb.test.js`)

**Interfaces:**
- Produces:
  - `PxWeb.PXWEB_ALL_MAX_CELLS` = `800000`.
  - `PxWeb.expandAllUrl(url, meta, maxCells)` → `{url}` ELLER `{error}`. Ren funksjon: `url` er base-data-URL-en (m/ ev. eksplisitte `valueCodes[...]`), `meta` er /metadata-json-stat2-objektet (`.id`, `.size`, `.dimension`), `maxCells` grensen. Fyller `valueCodes[Dim]=*` for dimensjoner uten eksisterende `valueCodes[Dim]=`; celletelling = produkt (eksplisitt komma-liste → listelengde, uttrykk/`*` → fullt `.size`-antall, uspesifisert → fullt). Over grensen → `{error}`.

- [ ] **Step 1: Feilende node-tester** (`tests/js/pxweb-all.test.js`). Lag en liten metadata-fixtur:

```js
const META = {                 // json-stat2-formet, som SSB /metadata
  id: ['Alder', 'Kjonn', 'ContentsCode', 'Tid'],
  size: [120, 3, 1, 164],
  dimension: {}                 // expandAllUrl trenger bare id+size for tellingen
};
const BASE = 'https://data.ssb.no/api/pxwebapi/v2/tables/05839';

test('expandAllUrl: bar URL → alle dims wildcardes, under grensen', () => {
  const r = PxWeb.expandAllUrl(BASE, META, 800000);
  assert.ok(!r.error, r.error);
  ['Alder','Kjonn','ContentsCode','Tid'].forEach(function (d) {
    assert.ok(r.url.indexOf('valueCodes[' + d + ']=*') >= 0, d + ' mangler: ' + r.url);
  });
});

test('expandAllUrl: eksplisitt dim beholdes, kun uspesifiserte fylles', () => {
  const r = PxWeb.expandAllUrl(BASE + '?valueCodes[Tid]=2000,2001&valueCodes[ContentsCode]=Personer', META, 800000);
  assert.ok(r.url.indexOf('valueCodes[Tid]=2000,2001') >= 0);      // uendret
  assert.ok(r.url.indexOf('valueCodes[Tid]=*') < 0);               // IKKE overstyrt
  assert.ok(r.url.indexOf('valueCodes[Alder]=*') >= 0);            // fylt
  assert.ok(r.url.indexOf('valueCodes[Kjonn]=*') >= 0);
});

test('expandAllUrl: celletelling teller eksplisitt komma-liste, ikke fullt', () => {
  // Tid=2 år (liste) × Alder 120 × Kjonn 3 × ContentsCode 1 = 720 celler
  const r = PxWeb.expandAllUrl(BASE + '?valueCodes[Tid]=2000,2001', META, 800000);
  assert.ok(!r.error, r.error);
});

test('expandAllUrl: over grensen → error (aldri stille)', () => {
  // full 05839 = 120×3×1×164 = 59 040; sett kunstig lav grense
  const r = PxWeb.expandAllUrl(BASE, META, 50000);
  assert.ok(r.error && /celler/.test(r.error), JSON.stringify(r));
});
```

- [ ] **Step 2: FAIL-kjøring.**
- [ ] **Step 3: Implementer `expandAllUrl`** i `js/pxweb.js` (ren streng-/URL-manipulasjon; gjenbruk `buildUrl`-mønsteret for query-splitting). Utled dims fra `meta.id`+`meta.size` (fall tilbake til `Object.keys(meta.dimension)` + `meta.dimension[id].category.index.length` hvis `size` mangler). Les eksisterende `valueCodes[X]=Y` fra query-en (regex `/valueCodes\[([^\]]+)\]=([^&]*)/g`). Celletelling per dim: satt m/ komma-liste (ingen `(` og ikke `*`) → antall komma-separerte + 1; satt m/ uttrykk (`from(`, `top(`, `*`, `range(`) → fullt `size`; usatt → fullt `size`. Produkt > maxCells → `{ error: '...' }` (bygg tallene inn, se en.js i Task 3). Ellers legg `valueCodes[Dim]=*` for usatte dims og returner `{ url }`. Eksporter begge på `api`-objektet (~:108).
- [ ] **Step 4: PASS** + full node-suite.
- [ ] **Step 5: Commit** — `feat: PxWeb.expandAllUrl + PXWEB_ALL_MAX_CELLS — ren all()-ekspansjon m/ cellevakt`.

---

### Task 3: Laster-integrasjon (`js/data-loader.js`)

**Files:**
- Modify: `js/data-loader.js` (pxweb-grenen ~:257-264)
- Modify: `js/i18n/en.js` (feilmeldingsnøkkel)

**Interfaces:**
- Consumes: `item.all` (Task 1), `PxWeb.expandAllUrl`/`PXWEB_ALL_MAX_CELLS` (Task 2), `PX.metadataUrl`, `fetchBytes`.

Ingen enhetstest (async fetch-orkestrering) — dekkes av Task 4s live smoke-test. Kravene:

- [ ] **Step 1:** I pxweb-grenen (~:257, FØR `PX.dataUrlFor`-hentingen), når `item.all`:
  ```js
  if (item.all && item.kind === 'pxweb') {
    var metaBytesA = await fetchBytes(Object.assign({}, item, { url: PX.metadataUrl(item.url) }));
    var metaObjA = JSON.parse(new TextDecoder().decode(metaBytesA.buf));
    var expA = PX.expandAllUrl(item.url, metaObjA, PX.PXWEB_ALL_MAX_CELLS);
    if (expA.error) throw new Error(expA.error);
    item = Object.assign({}, item, { url: expA.url });
  }
  ```
  Deretter fortsetter den eksisterende `fetchBytes(... PX.dataUrlFor(item.kind, item.url) ...)`-hentingen uendret (nå med ekspandert URL). NB: `all()` gjelder kun pxweb (eurostat deler grenen, men Task 1 tillater ikke `all()` for eurostat, så `item.all` er aldri satt der — guard på `item.kind==='pxweb'` er belte-og-bukseseler).
- [ ] **Step 2: en.js-nøkkel** for feilmeldingen fra `expandAllUrl` (og evt. resolve-feilen fra Task 1 om den ikke alt finnes). Meldingsformen (norsk, med interpolasjon): `all(): tabellen har for mange celler ({n} > {maks}) — begrens med filters()/years()/regions() for å laste et utvalg.` — sørg for at `expandAllUrl` (Task 2) bygger nøyaktig denne strengen via `t()` ELLER returnerer tallene så Task 3 bygger meldingen. Velg ETT sted (renest: `expandAllUrl` returnerer `{error}` med ferdig norsk tekst via en `t()` som er tilgjengelig i pxweb.js — sjekk om `t` finnes der; hvis ikke, returner `{tooManyCells:{n,max}}` og la data-loader/kallstedet bygge `t()`-meldingen). Dokumentér valget.
- [ ] **Step 3: Verifiser** — `node --check` på js-filene, full node-suite grønn, les diffen. Commit — `feat: laster ekspanderer all() for pxweb (metadata → cellevakt → valueCodes[*])`.

---

### Task 4: Kontrollør-verifisering (live SSB + full suite)

**Files:** Ingen kodeendringer.

- [ ] **Step 1: Live smoke-test (kontrollør, netlify dev + Chrome, EKTE SSB, brython-modus):**
  - `# connect …/v2/tables as ssb, kind(pxweb)` + `# load ssb/05839 as bef, all()` → `bef` lastes med hele tabellen (~59 040 rader i tidy form); ⊞ viser den; sidebar-datasettet har kolonnene Alder/Kjonn/ContentsCode/Tid/value.
  - `# load ssb/05839 as bef2, all(), years(2000:2009)` → begrenset til 2000–2009 (alle aldre/kjønn, men bare de årene).
  - En tabell over grensen: `# load ssb/07459 as stor, all()` → VENNLIG feil («for mange celler … begrens med …») FØR SSBs egen 400. Sjekk at meldingen viser tallene.
- [ ] **Step 2: Full suite:** `node --test 'tests/js/*.test.js'`, `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`, `python3 -m pytest tests/ -q` — alle grønne.
- [ ] **Step 3: Ledger. INGEN push.**

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §1→Task 1 (flagg+semantikk) + Task 2 (fyll uspesifiserte, eksplisitt overstyrer); §2 json-stat2 uendret (Task 3 rører ikke formatet); §3 mekanikk→Task 1 (resolve-flagg) + Task 2 (ren ekspansjon) + Task 3 (async metadata→guard→url); §4 grense 800000→Task 2-konstant + Task 4 live-avvisning; §5 ikke-pxweb-feil→Task 1; §6 testing→node-tester Task 1/2 + live Task 4.
- **Plassholder-skann:** Task 1/2 har komplett testkode + implementasjonspeker; Task 3 har eksakt kodeblokk + ankere. Ett bevisst valg utsatt til implementering (hvor `t()`-meldingen bygges — Task 3 Step 2 gir kriteriet). Ingen TBD-er.
- **Type-konsistens:** `all: true` settes i Task 1, leses i Task 3; `expandAllUrl(url, meta, maxCells) → {url}|{error}` definert i Task 2, kalt i Task 3; `PXWEB_ALL_MAX_CELLS=800000` samme verdi i spec, Task 2-konstant og Task 4-grense; metadata-formen (`.id`/`.size`/`.dimension`) konsistent mellom Task 2-fixtur og Task 3s ekte /metadata-svar.
- **Avhengigheter:** 1→2→3→4 sekvensielt (3 bruker både Task 1s flagg og Task 2s hjelper).
