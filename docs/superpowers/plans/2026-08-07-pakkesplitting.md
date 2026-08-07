# Pakkesplitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Splitte de 12 flerkilde-temapakkene i `data/packs/community/` i enkeltkildepakker (`src-*`) pluss korte tema-oversikter, og la modellen hente enkeltpakker on demand via `get_pack`.

**Architecture:** Innholdet transformeres (ingen ny mekanikk for lagring/valg): temapakkene beholder id-ene sine men skrives om til oversikter med `(id: src-…)`-referanser; hver substansiell kilde blir en egen liten pakke. Motoren endres minimalt: `get_pack` eksponeres for alle valgte pakker (ikke bare nedgraderte), og klientens `fullTextFor` resolver allerede vilkårlige katalog-id-er. To nye lint-regler (kind-felt + referanse-drift) er PR-porten som holder oversikter og enkeltpakker i sync.

**Tech Stack:** Vanilla JS (js/packs.js, node --test), Deno/TypeScript edge functions (netlify/edge-functions/_lib/, deno test), JSON-katalog + markdown-innhold.

**Spec:** `docs/superpowers/specs/2026-08-07-pakkesplitting-design.md`

## Global Constraints

- Pakke-id-er: `^[a-z0-9-]+$` (lint håndhever); enkeltkildepakker prefikses `src-`, filnavn = `<id>.md`.
- Pakketekst ≤ 40 000 tegn (`PACK_TEXT_MAX`); `summary` PÅKREVD på alle community-poster, ≤ 1 500 tegn.
- Alle lenker i pakkefiler MÅ være `https://` (lint håndhever); aldri nøkler/hemmeligheter — referer som `key(name)`.
- Pakkespråk: engelsk (README-konvensjon). Kode-/testkommentarer: norsk (repo-stil).
- Node-suiten kjøres `node --test 'tests/js/*.test.js'` fra repo-rot; Deno-suiten `deno test --allow-all _lib/` fra `netlify/edge-functions/`.
- Nye i18n-nøkler må inn i ALLE 12 ordbøker (`js/i18n/{no,da,sv,fi,is,de,fr,es,pt,zh,ja,hi}.js`) + fasiten regenereres med `node tools/list_i18n_keys.mjs` (drift-testen `tests/js/i18n-dicts.test.js` feiler ellers).
- Ingen bakoverkompat-hensyn (ingen brukere) — temapakkene omskrives på stedet, id-ene beholdes.
- Push er kontrollørens (Hans'/hovedøktas) beslutning — subagenter committer, men pusher ALDRI.

---

## Felles regler og maler (refereres fra innholdstaskene 5–16)

### R1 — Splitteregel (deterministisk)

En YAML-oppføring i en temapakke blir egen `src-`-pakke **hvis og bare hvis** minst ett av:

- en attributt inneholder en `https://`-URL (`data_url_pattern`, `api_base`, `mirror`, `free_aggregate_tool`, …),
- den har operasjonelle attributter: `gotcha`/`⚠_gotcha`, `weight_vars`, `design_vars`, `api_method`, `rate_limit`, `recommended_entry_point`, `demo_version`,
- temapakkens PROSA har en egen seksjon/avsnitt viet kilden (gjelder også rene prosa-pakker som GSS-seksjonen i us-social-surveys).

Ellers blir oppføringen stående som en punktlinje i oversikten UTEN `(id:)`-referanse, med det ærlige innholdet komprimert til én linje (navn — tilgangsnivå; én nøkkelfakta). **Ingen oppføring skal forsvinne** — hver id i tasken sin sjekkliste ender som enten src-pakke eller oversiktslinje.

### R2 — Dedup og registry-overlapp

- **Registry-kilder får ALDRI src-pakke.** Registry-id-ene er: `apd cdc census cessda datacommons datanorge dbnomics dhs dst ecb ess eurostat fhi fred githubraw hf ihsn ipums kaggle nchs norgesbank oecd owid scb ssb statfin wbmicro who wikipedia worldbank`. YAML-oppføringer som beskriver SAMME tjeneste som en registry-kilde (`huggingface`→hf, `kaggle`, `cessda`, `data_norge_no`→datanorge) blir oversiktslinjer som peker på registry-kilden («registry source — see the … source guide»). Tilgangs-ORDNINGER som er distinkte fra registry-API-et (`ssb_microdata_loan`, `dst_forskningsservice`) ER egne src-pakker.
- **Kilder som går igjen i flere temapakker dedupliseres til ÉN pakke**, referert med samme `(id: src-…)` fra begge oversikter. Kjente tilfeller: `uk_data_service` (data-catalogs + europe-national-microdata) → `src-uk-data-service`; `hfcs` (demography) og `ecb_hfcs` (labour-firms) er samme undersøkelse → `src-hfcs`; `openml` (data-catalogs + research-repositories-prosa) → `src-openml`. Første task som møter kilden oppretter pakken; senere task refererer den bare.
- Id-normalisering: underscore → bindestrek (`fjc_idb` → `src-fjc-idb`), alltid `src-`-prefiks.

### R3 — Mal for enkeltkildepakke (`data/packs/community/src-<kilde>.md`)

```markdown
# <Fullt kildenavn>

<1–2 setninger: hva kilden er og når den skal brukes — hentet fra
temapakkens `use`/prosa. Vær ærlig om tilgang (open / registration /
application / purchase / enclave).>

```yaml
<hele YAML-blokken fra temapakken, uendret bortsett fra id-feltet som
settes til src-id-en (f.eks. `id: src-brfss`)>
```

<Eventuell prosa fra temapakken som gjelder KUN denne kilden (traps,
URL-mønstre, vektveiledning). Tverrgående prosa blir i oversikten.>
```

### R4 — Mal for omskrevet oversikt (temapakke → `kind: "overview"`)

Strukturen i den omskrevne fila:

```markdown
# <Samme tittel som før>

<Use this pack when …-avsnittet beholdes.>

<Tverrgående narrativ beholdes: preferred sources-rekkefølge,
registry-kildehenvisninger, analysis notes, standing caveats
(f.eks. CDC/NCHS-suspensjonene), fallback-råd.>

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **<Kildenavn>** (id: src-<kilde>) — one-line: unit, access level, what it is best for.
- …

## Other sources (no separate pack)

- <Navn> — tilgangsnivå; én nøkkelfakta. (Linjer for oppføringene som IKKE fikk src-pakke etter R1.)
```

### R5 — index.json-post for src-pakke

```json
{
  "id": "src-<kilde>",
  "name": "<Kort kildenavn>",
  "description": "<Én setning om hva kilden er.>",
  "summary": "<1–3 setninger: enhet, dekning, tilgang, hovedbruk. ≤1500 tegn.>",
  "file": "community/src-<kilde>.md",
  "community": true,
  "kind": "source",
  "author": "hans",
  "updated": "2026-08-07"
}
```

### R6 — Verifisering per innholdstask

Etter hver temapakke-splitt, fra repo-rot:

```bash
node --test tests/js/packs-lint.test.js tests/js/packs.test.js
```

Forventet: PASS — fanger manglende filer, manglende summary/kind, id-format, `(id:)`-drift, størrelse, nøkler, http-lenker.

---

### Task 1: `kind`-felt i index.json + lint

**Files:**
- Modify: `data/packs/index.json` (12 community-poster)
- Test: `tests/js/packs-lint.test.js:18-38` (testen «index.json: v1, gyldige unike id-er, community har author+updated»)

**Interfaces:**
- Produces: `index.packs[i].kind: "overview" | "source"` på alle community-poster — Task 2 (drift-lint), Task 4 (Explore-gruppering) og R5-malen bygger på feltet.

- [ ] **Step 1: Skriv den feilende lint-utvidelsen**

I `tests/js/packs-lint.test.js`, inne i `if (p.community) {`-greina (etter summary-assertene på linje 32–33), legg til:

```js
      // Pakkesplitting (spec 2026-08-07 §1): kind skiller tema-oversikter
      // fra enkeltkildepakker — Explore grupperer på den og drift-linten
      // skanner oversikter for (id: …)-referanser.
      assert.ok(p.kind === 'overview' || p.kind === 'source',
        `community-pakke uten gyldig kind: ${p.id} (fikk: ${p.kind})`);
```

- [ ] **Step 2: Kjør testen — forvent FAIL**

Run: `node --test tests/js/packs-lint.test.js`
Expected: FAIL med `community-pakke uten gyldig kind: us-health-surveys (fikk: undefined)`

- [ ] **Step 3: Legg `"kind": "overview"` på de 12 community-postene**

I `data/packs/index.json`: alle 12 community-poster (`us-health-surveys`, `europe-surveys`, `global-surveys`, `us-social-surveys`, `education-skills`, `data-catalogs`, `nordic-microdata`, `europe-national-microdata`, `labour-firms`, `demography-migration-housing`, `crime-transport-energy-politics`, `research-repositories`) får feltet `"kind": "overview"` rett etter `"community": true`. (`norway`/`finland` er builtin med `country` — de skal IKKE ha kind.)

- [ ] **Step 4: Kjør testen — forvent PASS**

Run: `node --test tests/js/packs-lint.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/packs/index.json tests/js/packs-lint.test.js
git commit -m "feat: kind-felt (overview/source) på community-pakker + lint (pakkesplitting §1)"
```

---

### Task 2: Drift-lint — `(id: …)`-referanser i oversikter må finnes

**Files:**
- Test: `tests/js/packs-lint.test.js` (ny test etter «pakkefiler: …»-testen, dvs. etter linje 57)

**Interfaces:**
- Consumes: `p.kind` fra Task 1.
- Produces: lint-garantien innholdstaskene 5–16 lener seg på: en oversikt kan ikke referere en pakke-id som ikke finnes.

- [ ] **Step 1: Skriv drift-testen**

```js
// Drift-vern (spec 2026-08-07 §4): hver (id: x)-referanse i en oversikts-
// pakke MÅ finnes i index.json — oversikter og enkeltkildepakker skal
// ikke kunne drive fra hverandre (samme mønster som source-guides-drift-
// testen på serversiden). Skannes KUN i kind:overview-filer; YAML-blokker
// i enkeltkildepakker bruker `id:` uten parentes og treffes ikke.
test('oversiktspakker: alle (id: …)-referanser finnes i index.json', () => {
  const ids = new Set(index.packs.map((p) => p.id));
  for (const p of index.packs) {
    if (p.kind !== 'overview') continue;
    const text = fs.readFileSync(path.join(PACKS, p.file), 'utf-8');
    for (const m of text.matchAll(/\(id:\s*([a-z0-9-]+)\)/g)) {
      assert.ok(ids.has(m[1]), `${p.file}: (id: ${m[1]}) finnes ikke i index.json`);
    }
  }
});
```

- [ ] **Step 2: Kjør testen — forvent PASS (vakuøst)**

Run: `node --test tests/js/packs-lint.test.js`
Expected: PASS — dagens temapakker inneholder ingen `(id: …)`-mønstre ennå; testen beviser sin verdi ved at et bevisst feilreferanse-eksperiment (legg midlertidig `(id: finnes-ikke)` i en oversiktsfil, se FAIL, fjern igjen) slår ut. Gjør eksperimentet.

- [ ] **Step 3: Commit**

```bash
git add tests/js/packs-lint.test.js
git commit -m "test: drift-lint — (id: …)-referanser i oversiktspakker må finnes i index.json (pakkesplitting §4)"
```

---

### Task 3: Motor — get_pack for alle valgte pakker, ny beskrivelse, maxGetPack 5

**Files:**
- Modify: `netlify/edge-functions/svar.ts:179-183` (needsGetPack)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts:87-110` (renderPacksBlock-notatet) og `:956-968` (GET_PACK_TOOL + kommentar)
- Modify: `netlify/edge-functions/_lib/anthropic.ts:568` (maxGetPack-default) + kommentarene på linje 356 og 376
- Test: `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts:88-97`

**Interfaces:**
- Consumes: payload-kontrakten `packs: [{id,name,text,level}]` (uendret).
- Produces: `get_pack` i `clientTools` når ≥1 pakke er valgt i data-ruten; modell-synlig instruks om `(id: …)`-notasjonen. Klientsiden (`js/ai-chat.js` → `Packs.fullTextFor`) er UENDRET — den resolver allerede vilkårlige katalog-id-er (verifisert i design-samtalen).

- [ ] **Step 1: Oppdater prefs-testen først (rød)**

I `svar-prompt-prefs.test.ts`, erstatt hele testen `"packs-blokk: get_pack-setningen KUN når minst én pakke ikke er full"` (linje 88–97) med:

```ts
Deno.test("packs-blokk: get_pack-setningen alltid; kortform-halen kun ved nedgradering", () => {
  const alleFull = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "full" }],
  });
  assert(alleFull.includes("get_pack-verktøyet"));
  assert(!alleFull.includes("kortform/maskinutdrag"));
  const enKort = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "summary" }],
  });
  assert(enKort.includes("kortform/maskinutdrag"));
});
```

- [ ] **Step 2: Kjør Deno-suiten — forvent FAIL**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt-prefs.test.ts`
Expected: FAIL — `alleFull` inneholder i dag ingen get_pack-setning.

- [ ] **Step 3: Implementer de fire endringene**

`svar-prompt.ts` — i `renderPacksBlock` (linje 98–101), erstatt `getPackNote`-uttrykket:

```ts
  const getPackNote =
    " Enkeltkildepakker referert i pakkene med (id: …)-notasjon kan hentes i" +
    " full tekst med get_pack-verktøyet" +
    (anyShort
      ? "; det samme gjelder pakker merket kortform/maskinutdrag (id-en står i overskriften)."
      : ".");
```

(`anyShort` beholdes; notatet er nå UBETINGET — fjern ternæren som ga `""`.)

`svar-prompt.ts` — GET_PACK_TOOL (linje 959–968): oppdater description og kommentaren over:

```ts
// (svar.ts legger den til for ALLE valgte pakker i data-ruten —
// pakkesplitting 2026-08-07; før: kun ved nedgradering.)
export const GET_PACK_TOOL = {
  name: "get_pack",
  description:
    "Hent FULL tekst for en kildepakke: en pakke sendt i kortform/maskinutdrag (id-en står i pakkens overskrift: '### Kildepakke: navn (id: <id>)'), ELLER en enkeltkildepakke referert i en oversiktspakke med '(id: src-…)'-notasjon.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string", description: "pakkens id, fra overskriften eller (id: …)-referansen" } },
    required: ["id"],
  },
};
```

`svar.ts` (linje 179–182): erstatt betingelsen og kommentaren:

```ts
  // get_pack er kun aktuelt i data-ruten (packs-blokka rendres KUN der, se
  // buildSvarSystem). Pakkesplitting (spec 2026-08-07 §2): verktøyet følger
  // nå ALLE valgte pakker — oversiktspakker refererer enkeltkildepakker med
  // (id: src-…)-notasjon som modellen skal kunne hente uavhengig av
  // nedgradering.
  const needsGetPack = route === "data" && coercePacks(body.packs).length > 0;
```

`anthropic.ts` (linje 568): `const maxGetPack = opts.maxGetPack ?? 5;` — og i kommentarene på linje 356/376, nevn: «default 5 (pakkesplitting 2026-08-07: et spørsmål kan trenge 2–3 enkeltkilder pluss re-henting)».

- [ ] **Step 4: Kjør hele Deno-suiten — forvent PASS**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: PASS (anthropic.test.ts:417 passerer eksplisitt maxGetPack: 3 og er upåvirket av ny default).

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/svar.ts netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/anthropic.ts netlify/edge-functions/_lib/svar-prompt-prefs.test.ts
git commit -m "feat: get_pack for alle valgte pakker + (id:)-notasjon i beskrivelse/notat; maxGetPack 3→5 (pakkesplitting §2)"
```

---

### Task 4: Explore-gruppering (oversikter/enkeltkilder) + i18n

**Files:**
- Modify: `js/packs.js:320-326` (listCommunity) og `:706-721` (renderExploreList)
- Modify: `app.css` (ny klasse `.ask-explore-group`)
- Modify: `js/i18n/{no,da,sv,fi,is,de,fr,es,pt,zh,ja,hi}.js` (2 nye nøkler), `tools/ask_i18n_keys.json` (regenereres)
- Test: `tests/js/packs.test.js` (listCommunity-kind), `tests/js/i18n-dicts.test.js` (kjøres, endres ikke)

**Interfaces:**
- Consumes: `kind` fra index.json (Task 1).
- Produces: `listCommunity()` returnerer `{id, name, description, author, updated, kind}`; Explore rendrer to grupper. Valg-/import-mekanikken (importPack → `user:`-kopi) er UENDRET.

- [ ] **Step 1: Skriv feilende test for listCommunity**

I `tests/js/packs.test.js`, ved de eksisterende listCommunity-testene (finn `listCommunity` i fila og legg ny test i samme stil/mock-oppsett — mocken må ha en index med to community-poster der én har `kind: 'source'`):

```js
test('listCommunity: kind følger med (default overview)', async () => {
  // bruk samme makePacks-mockmønster som testene rundt; index-mocken:
  // packs: [{id:'ov', name:'Ov', file:'community/ov.md', community:true, kind:'overview'},
  //         {id:'src-x', name:'X', file:'community/src-x.md', community:true, kind:'source'}]
  const rows = P.listCommunity();
  assert.equal(rows.find((r) => r.id === 'ov').kind, 'overview');
  assert.equal(rows.find((r) => r.id === 'src-x').kind, 'source');
});
```

- [ ] **Step 2: Kjør — forvent FAIL**

Run: `node --test tests/js/packs.test.js`
Expected: FAIL — `kind` er `undefined` i dagens map.

- [ ] **Step 3: Implementer listCommunity-endringen**

`js/packs.js:320-326`:

```js
    function listCommunity() {
      return curated().filter(function (p) { return p.community; })
        .map(function (p) {
          return { id: p.id, name: p.name, description: p.description || '',
            author: p.author || '', updated: p.updated || '',
            kind: p.kind === 'source' ? 'source' : 'overview' };
        });
    }
```

- [ ] **Step 4: Kjør — forvent PASS, så implementer grupperingen (DOM, ikke node-testet)**

Run: `node --test tests/js/packs.test.js` → PASS.

`js/packs.js` `renderExploreList` (linje 706–721) erstattes med (radbyggingen er identisk med i dag, bare flyttet inn i gruppeløkka):

```js
      function renderExploreList() {
        expList.innerHTML = '';
        var entries = filterCatalog(P.listCommunity(), expSearch ? expSearch.value : '');
        // Pakkesplitting (spec 2026-08-07 §3): to grupper — oversikter
        // først, enkeltkilder under. Tomme grupper får ingen overskrift.
        [['overview', T('Topic overviews')], ['source', T('Individual sources')]]
          .forEach(function (grp) {
            var rows = entries.filter(function (e) { return e.kind === grp[0]; });
            if (!rows.length) return;
            var head = document.createElement('div');
            head.className = 'ask-explore-group';
            head.textContent = grp[1];
            expList.appendChild(head);
            rows.forEach(function (e) {
              var row = document.createElement('button');
              row.type = 'button';
              row.className = 'ask-explore-row';
              var nm = document.createElement('strong');
              nm.textContent = e.name;
              var desc = document.createElement('div');
              desc.textContent = e.description;
              row.appendChild(nm);
              row.appendChild(desc);
              row.addEventListener('click', function () { expSelectEntry(e); });
              expList.appendChild(row);
            });
          });
      }
```

I `app.css`, ved de andre `.ask-explore-*`-reglene (søk etter `ask-explore-row`), legg til:

```css
.ask-explore-group {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.65;
  padding: 10px 4px 4px;
}
```

- [ ] **Step 5: i18n — 2 nye nøkler i 12 ordbøker + fasit**

Nøklene `"Topic overviews"` og `"Individual sources"` legges (alfabetisk plassert) i alle 12 ordbøker. Norsk: `"Tema-oversikter"` / `"Enkeltkilder"`. Øvrige språk oversettes idiomatisk (da: `"Temaoversigter"`/`"Enkeltkilder"`, sv: `"Temaöversikter"`/`"Enskilda källor"`, fi: `"Aihekatsaukset"`/`"Yksittäiset lähteet"`, is: `"Efnisyfirlit"`/`"Stakar heimildir"`, de: `"Themenübersichten"`/`"Einzelquellen"`, fr: `"Panoramas thématiques"`/`"Sources individuelles"`, es: `"Panoramas temáticos"`/`"Fuentes individuales"`, pt: `"Panoramas temáticos"`/`"Fontes individuais"`, zh: `"主题概览"`/`"单个来源"`, ja: `"テーマ別概要"`/`"個別ソース"`, hi: `"विषय अवलोकन"`/`"एकल स्रोत"`). Deretter:

Run: `node tools/list_i18n_keys.mjs` (regenererer `tools/ask_i18n_keys.json`)

- [ ] **Step 6: Kjør node-suiten — forvent PASS**

Run: `node --test 'tests/js/*.test.js'`
Expected: PASS (inkl. i18n-dicts-driften).

- [ ] **Step 7: Commit**

```bash
git add js/packs.js app.css js/i18n/ tools/ask_i18n_keys.json tests/js/packs.test.js
git commit -m "feat: Explore grupperer Tema-oversikter/Enkeltkilder på kind-feltet + i18n (pakkesplitting §3)"
```

---

### Task 5: Pilot-innholdssplitt — us-health-surveys

**Files:**
- Create: `data/packs/community/src-brfss.md`, `src-nsduh.md`, `src-nvss.md`, `src-cdc-wonder.md`, `src-hrs.md`, `src-hcup.md`, `src-mimic-iv.md`
- Modify: `data/packs/community/us-health-surveys.md` (omskrives per R4), `data/packs/index.json` (+7 R5-poster)
- Test: R6

**Interfaces:**
- Consumes: R1–R5, lintene fra Task 1–2.
- Produces: mønsterfilene alle senere innholdstasker etterligner. Reviewer (Hans) ser piloten FØR taskene 6–16 kjøres.

**Partisjon (R1 anvendt på dagens YAML-blokk, linje 62–133):** SPLITT `brfss` (URL+weight_vars+gotcha), `nsduh` (weight_vars+gotcha), `nvss` (mirror-URL), `cdc_wonder` (api_base+api_method+rate_limit+gotcha), `hrs` (recommended_entry_point), `hcup` (URL+weight_vars+gotcha), `mimic_iv` (demo_version+gotcha). LINJER (ingen operasjonelle attributter): `cms_synpuf`, `seer`, `all_of_us`. Registry-henvisningene i prosaen (ipums/nchs/cdc) og MEPS-direktefiler-avsnittet BLIR i oversikten.

- [ ] **Step 1: Opprett de 7 src-filene**

Eksempel — `data/packs/community/src-brfss.md` (de andre seks følger samme mal, R3, med sine YAML-blokker klippet ordrett fra temapakken):

```markdown
# BRFSS — Behavioral Risk Factor Surveillance System

The only US source giving reliable state-level (and via SMART, some
county/MSA) chronic-disease prevalence at the record level. The cdc
registry source's PLACES/BRFSS tables give the aggregate shortcut; this
is the microdata behind them. Open, no key.

```yaml
- id: src-brfss
  name: Behavioral Risk Factor Surveillance System
  provider: CDC
  unit: person (adult), state-representative
  n_per_year: "~400,000+ (2024: 457,670)"
  access: open, no key
  data_url_pattern: "https://www.cdc.gov/brfss/annual_data/{YEAR}/files/LLCP{YEAR}XPT.zip"
  weight_vars: [_LLCPWT]
  design_vars: [_PSU, _STSTR]
  use: "state-level chronic-disease prevalence microdata"
  gotcha: "states add optional modules — variable availability varies by state x year; weighting changed to raking + cell phones added in 2011, don't cross that break naively"
```

Weight with `_LLCPWT` and use the `_PSU`/`_STSTR` design variables for
variance estimation. See the US health surveys overview pack for the
standing CDC/NCHS 2025-26 caveat.
```

- [ ] **Step 2: Legg de 7 index.json-postene til (R5)**

`summary`-eksempel for src-brfss: `"US state-representative adult health microdata (~400k/yr), open XPT downloads, no key. Best for state-level chronic-disease prevalence; weight with _LLCPWT; 2011 weighting break."` Tilsvarende 1–3 setninger for de øvrige seks, destillert fra deres YAML.

- [ ] **Step 3: Omskriv us-health-surveys.md per R4**

Behold: tittel, «Use this pack when …», «Preferred sources» (ipums/nchs/MEPS-direkte/aggregate fallbacks), «Analysis notes», hele «⚠ Standing caveat»-seksjonen. Erstatt «More US health microdata»-seksjonen (inkl. hele YAML-blokken) med:

```markdown
## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **BRFSS** (id: src-brfss) — state-representative adult health microdata, open, no key.
- **NSDUH / SAMHDA** (id: src-nsduh) — substance use and mental health, person 12+, open public-use.
- **NVSS natality/mortality files** (id: src-nvss) — one record per US birth/death, open micro files.
- **CDC WONDER** (id: src-cdc-wonder) — query API returning aggregated cells, NOT microdata.
- **HRS** (id: src-hrs) — ageing panel 50+, free registration; start from the RAND longitudinal file.
- **HCUP** (id: src-hcup) — largest US all-payer hospital data; purchase + DUA.
- **MIMIC-IV** (id: src-mimic-iv) — critical-care EHR; credentialed application, open ~100-patient demo.

## Other sources (no separate pack)

- SEER cancer registry — application (registration + signed DUA); population-based registries covering ~48% of the US; SEER-Medicare is a separate, stricter application.
- CMS DE-SynPUF — open synthetic 2008-2010 Medicare claims; prototype pipelines only, NOT valid for substantive inference (real inference needs CMS LDS/RIF or the VRDC enclave).
- All of Us — NIH enclave (Researcher Workbench); registered-tier data cannot be downloaded — describe as an enclave, never a downloadable dataset.
```

- [ ] **Step 4: Kjør R6-verifiseringen — forvent PASS**

Run: `node --test tests/js/packs-lint.test.js tests/js/packs.test.js`
Expected: PASS — spesielt drift-testen validerer nå 7 ekte `(id: src-…)`-referanser.

- [ ] **Step 5: Commit**

```bash
git add data/packs/community/ data/packs/index.json
git commit -m "feat: pilot-splitt us-health-surveys — 7 src-pakker + oversikt (pakkesplitting §1)"
```

**REVIEW-PORT:** Vis piloten til kontrolløren/Hans før taskene 6–16 settes i gang.

---

### Tasks 6–16: Innholdssplitt av de resterende 11 temapakkene

Hver task følger NØYAKTIG samme fem steg som Task 5 (opprett src-filer per R1+R3, index-poster per R5, omskriv oversikten per R4, kjør R6, commit) på SIN temapakke. Commit-melding: `feat: splitt <pakkeid> — <N> src-pakker + oversikt (pakkesplitting §1)`. Id-listene under er komplette (fra planleggingens opptelling) — hver id skal ende som src-pakke eller oversiktslinje; R1 avgjør hvilken, R2 avgjør dedup/registry-unntak.

- [ ] **Task 6: crime-transport-energy-politics** (28 id-er): ncvs, nibrs, ncrp, fjc_idb, open_policing, csew, eu_safety_survey, nhts, fars, crss, bts_airline, uk_nts, rvu_norway, open_mobility, eia_api, epa_aqs, eea_air_quality, cams, era5, ejscreen, anes, ces, medsl, cses, manifesto_project, national_election_studies, legislative_data, voter_files. Merk: behold prosaen om 2025-26-ustabiliteten for `.gov`-portaler i oversikten.
- [ ] **Task 7: demography-migration-housing** (32 id-er): hmd, hfd, stmf, un_wpp, ipums_international, uk_census_microdata, insee_fichiers_detail, ine_census_microdata, us_decennial_post_dp, acs_pums, oecd_dioc, eurostat_migr, eu_lfs_migration_modules, unhcr_microdata, iom_dtm, mafe, mignex, hfcs, eurostat_hbs, ahs, recs, ce_pumd, land_registry_ppd, nordic_house_prices, mtus, hetus, atus, ghsl, worldpop, geostat, tiger, nhgis. R2: `hfcs` er kanonisk her → opprett `src-hfcs` (labour-firms refererer den senere). `acs_pums` overlapper census-registry-kilden — registry-linje, ikke src-pakke, hvis innholdet er det samme som census-guiden dekker; ellers splitt.
- [ ] **Task 8: labour-firms** (28 id-er): lodes, qwi, bds, lbd, cps_org, qcew, oews, jolts, bls_api, onet, osha_ita, h1b_perm, indeed_hiring_lab, soii_cfoi, iab_leed, eu_lfs, sbs, cis, gleif, companies_house, bronnoysund, cvr_denmark, bolagsverket, orbis, eu_efige, ecb_safe, ecb_hfcs, oecd_multiprod_dynemp. R2: `ecb_hfcs` → referer `(id: src-hfcs)` fra Task 7, INGEN ny pakke.
- [ ] **Task 9: nordic-microdata** (24 id-er): npr, kuhr, reseptregisteret, legemiddelregisteret, mfr, dodsarsaksregisteret, kreftregisteret, hjerte_kar, moba, conor, hunt, tromso, sikt, ssb_microdata_loan, data_norge_no, dst_forskningsservice, sundhedsdatastyrelsen, scb_mona, socialstyrelsen, snd, findata, thl, statice, landlaeknir. R2: `data_norge_no` → datanorge-registry-linje. Mange av registrene er søknadsgatede uten URL-attributter — forvent relativt mange oversiktslinjer her; det er riktig utfall.
- [ ] **Task 10: europe-national-microdata** (20 id-er): fdz_destatis, fdz_iab, fdz_rv, gesis_gml, casd, adisp_progedo, insee_census, ons_srs, uk_data_service, adr_uk, istat, ine_spain, amdc, bfs_switzerland, cso_ireland, eurostat_safe_centres, cros_cimes, cessda, iza_idsc, ehds. R2: `uk_data_service` er kanonisk her → opprett `src-uk-data-service`; `cessda` → registry-linje.
- [ ] **Task 11: data-catalogs** (11 id-er): ckan, socrata, data_europa, huggingface, kaggle, openml, uci, icpsr, uk_data_service, gesis, cessda. R2: `huggingface`→hf-registry-linje, `kaggle`→registry-linje, `cessda`→registry-linje, `uk_data_service`→referer `(id: src-uk-data-service)` fra Task 10; `openml` er kanonisk her → opprett `src-openml` (research-repositories refererer den i Task 16).
- [ ] **Task 12: europe-surveys** (8 id-er): easyshare, g2aging, elsa, tilda, soep, ukhls, ggp, eurostat_ehis. Prosaen om ESS (registry-kilde) og CESSDA blir i oversikten.
- [ ] **Task 13: global-surveys** (8 id-er): mics, who_sage, who_steps, haalsi, g2aging_lmic, wvs, ghdx_gbd, global_health. Behold GBD-som-modellerte-estimater-advarselen i oversikten.
- [ ] **Task 14: education-skills** (10 id-er): naep, nces_longitudinal, urban_education_data, ipeds, college_scorecard, seda, uk_cohorts_npd, neps, timss_pirls_icils_iccs, eurostat_aes.
- [ ] **Task 15: us-social-surveys** (ren prosa): GSS-seksjonen → `src-gss` (rik: URL-mønster, 204-trap, vektvariabler, 2021-modusbrudd); census-seksjonen → registry-linje; Pew-seksjonen → oversiktslinje (login-walled, ingen operasjonelle attributter). Oversikten beholder «Machine-reachable first»-strukturen.
- [ ] **Task 16: research-repositories** (ren prosa): seksjonene → `src-dataverse`, `src-zenodo`, `src-figshare` (+ `src-osf` hvis fila har en OSF-seksjon); OpenML-omtale → referer `(id: src-openml)` fra Task 11. Zenodo/dataverse-detaljene (CORS-status, 403-forventningen, søke-URL-ene) går i sine src-pakker; oversikten beholder når-skal-hva-brukes-rådet.

Etter HVER av taskene 6–16: kjør R6, commit. Taskene er uavhengige av hverandre UNNTATT dedup-avhengighetene: Task 8 krever Task 7 (src-hfcs), Task 11 krever Task 10 (src-uk-data-service), Task 16 krever Task 11 (src-openml).

---

### Task 17: README, spec-status og live-smoke

**Files:**
- Modify: `data/packs/community/README.md`
- Modify: `docs/superpowers/specs/2026-08-07-pakkesplitting-design.md` (Status-linja)
- Test: full node-suite + full Deno-suite + manuell live-smoke

- [ ] **Step 1: Oppdater README.md**

Etter «Contributing a pack»-seksjonen, dokumentér: `kind`-feltet (source/overview) er PÅKREVD for community-pakker; enkeltkildepakker prefikses `src-` og holder én kilde; oversikter refererer dem med `(id: src-…)`-notasjonen (lint håndhever at referansen finnes); registry-kilder (ssb, hf, cessda, …) får aldri src-pakke — de omtales som «registry source»; delte kilder dedupliseres til én pakke. Oppdater R5-eksempelblokken i README med `"kind"`-feltet.

- [ ] **Step 2: Kjør begge suitene**

Run: `node --test 'tests/js/*.test.js'` og `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: PASS begge.

- [ ] **Step 3: Live-smoke (oversikt → get_pack)**

Start dev-miljøet FERSKT (kjent felle: netlify dev cacher edge-TS-moduler — restart + et 400-smoke-kall før du stoler på evalueringen). I appen: åpne biblioteksmanageren → Importer delte kilder → verifiser to-gruppe-visningen (Tema-oversikter/Enkeltkilder) → importer «Crime, transport, energy …»-oversikten → spør «How many people died in US fatal crashes in 2022 according to FARS?» → verifiser i nettverksfanen at et `get_pack`-kall for `src-fars` gikk gjennom (continue-runde med `get_pack_result`) og at svaret bruker pakkens innhold ærlig. Verifiser også at et spørsmål der en enkeltkilde er importert direkte (f.eks. src-brfss) fungerer som før uten get_pack.

- [ ] **Step 4: Flipp spec-status + siste commit**

Spec-ens Status-linje → `implementert <dagens dato ved utførelse> (plan docs/superpowers/plans/2026-08-07-pakkesplitting.md)`.

```bash
git add data/packs/community/README.md docs/superpowers/specs/2026-08-07-pakkesplitting-design.md
git commit -m "docs: README-konvensjoner for src-pakker/oversikter + spec-status (pakkesplitting §5)"
```

---

## Self-review-notater (skrevet ved planlegging)

- **Spec-dekning:** §1 → Task 1, 5–16; §2 → Task 3; §3 → Task 4; §4 → Task 2; §5 → Task 3 (prefs-test), R6, Task 17. Substans-terskelen (spec-oppdatering 2026-08-07) → R1; dedup → R2.
- **Bevisst utelatt (YAGNI):** revers-drift-lint (src-pakke uten oversiktsreferanse er harmløs — søkbar i Explore); ingen endring i user:-kopimodellen (import = frossen kopi, som besluttet i menyopprydding-runden — en stale kopi-oversikt kan i verste fall referere en id som senere forsvinner; akseptert, ingen brukere).
- **Kjent risiko:** `(id: …)`-regexen i drift-linten treffer også eventuelle parentetiske id-omtaler i løpende prosa; skriv oversiktsprosa som unngår mønsteret utenom referanselistene.
