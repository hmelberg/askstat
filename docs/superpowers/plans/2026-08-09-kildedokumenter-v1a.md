# Kildedokumenter v1a (fundamentet) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjennomføre fundament-halvdelen av v1 i spec
`docs/superpowers/specs/2026-08-09-kildedokumenter-design.md`: ett
markdown-dokument per standardkilde som ny fasit (front matter + seksjoner,
raus parser), konvertering av dagens 30 registeroppføringer + 16 guider + 85
src-pakker, generering av dagens artefakter med **semantisk paritet** (prompten
endres ikke), og telemetri-opt-out i innstillingene (spec §10).

**Architecture:** Ny ren parser-modul (`js/source-doc.js`, ES5 IIFE +
module.exports — node-testbar og gjenbrukbar i både nettleser og
byggescript). Et byggescript (`tools/source_docs.mjs`) konverterer én gang
JSON+guider → `data/sources/<id>.md`, og regenererer deretter
`data/data-sources.json` + `data/source-guides/<id>.md` fra dokumentene —
server- og klientkoden som leser disse artefaktene røres IKKE i v1a.
Drift-test låser at dokumentene og artefaktene aldri glir fra hverandre.
Telemetri-valget er en uavhengig liten leveranse (checkbox + vakt i
chokepointet `FeilTelemetri.sendFeilrapport`).

**Tech Stack:** Vanilla JS (ES5, IIFE-moduler med module.exports-hale),
node:test (`node --test tests/js/*.test.js` — ALLTID glob, katalogform
feiler på Node 26), Node-script i tools/ (.mjs), Deno edge-functions (røres
ikke i v1a utover verifisering), i18n-ordbøker `js/i18n/*.js` m/ fasit
`tools/ask_i18n_keys.json`.

## Global Constraints

- **Ingen bakoverkompatibilitet** (ingen brukere): gamle former erstattes;
  konverteringsscriptet beholdes som `convert`-subkommando men trengs aldri
  igjen etter denne runden.
- **Prompt-paritet er hard grense i v1a:** `parseRegistry(gammel JSON)` skal
  være deep-equal med `parseRegistry(regenerert JSON)`, og regenererte
  guide-filer skal være **byte-identiske** med dagens. Maskinfelt-dietten
  fra spec §2 (sporrings_url_mal/join_nokler/oppskrift → prosa) er derfor
  BEVISST UTSATT til v1b — den endrer promptrendring og skal vurderes
  samlet der.
- ES5 i js/-filer (var/function — ingen arrow/let/const/template literals);
  moderne JS er ok i tools/*.mjs.
- All ny brukersynlig tekst: engelsk nøkkel via `data-i18n`/`t()`; norsk i
  `js/i18n/no.js` i samme task; full 12-ordbok-sweep + fasit-regenerering i
  Task 6 (i18n-dicts-testen er rød mellom task 5 og 6 — forventet).
- Kjør `node --test tests/js/<fil>` for berørte testfiler FØR commit; commit
  per task. ALDRI push — Hans beslutter.
- Verifisering lokalt: `netlify dev` (port 8899/3998 for askstat) må
  RESTARTES etter endring i edge-TS; Chrome hard-reload m/ ignoreCache for
  js/ (kjent felle).

## Fil-kart (hvem eier hva etter runden)

- `data/sources/<id>.md` — **NY, fasiten**: ett dokument per standardkilde
  (30 stk), front matter + seksjonene Kort/Guide/Variabler/Om kilden.
- `data/data-sources.json` — GENERERT artefakt (fortsatt commitet; leses av
  registry.ts som før). Toppkommentar er ikke mulig i JSON — genererings-
  merket bor i drift-testen og README-linja (Task 2).
- `data/source-guides/<id>.md` — GENERERT artefakt (byte-identisk innhold =
  Guide-seksjonen; leses av source-guides.ts som før).
- `data/packs/community/*.md` — konvertert til front matter (samme innhold,
  ny innpakning); fortsatt lest rått av packs.js/get_pack.
- `js/source-doc.js` — **NY**: parse/serialize/normalize + alias-tabeller.
- `tools/source_docs.mjs` — **NY**: `convert` (engangs), `convert-packs`
  (engangs), `generate` (varig: docs → artefakter).
- `js/feil-telemetri.js` — telemetri-vakt (md_telemetri_av).
- `index.html` — telemetri-checkbox i `#aiSettingsBackdrop`.
- `personvern.html` / `personvern.en.html` — telemetriavsnitt.

---

### Task 1: Parser — js/source-doc.js

**Files:**
- Create: `js/source-doc.js` (+ `<script src="js/source-doc.js">` i
  index.html rett FØR packs.js — v1b trenger den i nettleser; i v1a er den
  passiv der)
- Test: Create `tests/js/source-doc.test.js`

**Interfaces:**
- Produces `window.SourceDoc` / `module.exports` med NØYAKTIG disse navnene
  (Task 2/3/4 og hele v1b konsumerer dem):

```js
// parse(text) -> {
//   fields:     {}   // typede verdier fra front matter (string|number|boolean|array|objekt)
//   fieldOrder: []   // nøkler i original rekkefølge (styrer serialize + JSON-generering)
//   title:      ''   // første '# '-overskrift (uten '# '), '' hvis ingen
//   sections:   []   // [{key, heading, text}] i dokumentrekkefølge;
//                    //  key = 'kort'|'guide'|'variabler'|'om'|null (null = fri prosa)
//                    //  text = råtekst mellom denne og neste '## ' (trimmet i endene)
//   warnings:   []   // norske strenger, aldri kast for innholdsproblemer
// }
// serialize(doc)  -> kanonisk tekst: '---\n' + front matter (fieldOrder-rekkefølge)
//                    + '---\n\n' + ('# ' + title + '\n\n' hvis title) + seksjonene
//                    ('## ' + heading + '\n\n' + text + '\n\n', fri prosa uten key beholder plass)
// normalize(text) -> serialize(parse(text)) — idempotent: normalize(normalize(x)) === normalize(x)
// sectionKey(heading) -> 'kort'|'guide'|'variabler'|'om'|null  (case-insensitiv aliasmatch)
// TAG_ALIASES     -> {micro:'mikro', macro:'makro', norway:'norge', sweden:'sverige', denmark:'danmark', us:'usa'}
// SECTION_ALIASES -> {kort:['kort','short','summary'], guide:['guide'],
//                     variabler:['variabler','variables'], om:['om kilden','about','about the source']}
```

- **Tre aksepterte inndataformer** (spec §2, raus inn — kanonisk ut):
  1. Front matter: `---` på første linje, felter frem til neste `---`.
  2. Fenced yaml: første ```yaml-blokk i dokumentet (dagens src-pakke-form);
     listeform `- id: x` (som i src-bls-api.md) flates: første elements
     nøkler blir fields.
  3. Nakne `key: value`-linjer fra toppen (før første blanklinje/overskrift),
     minst én linje som matcher `/^[a-z_][a-z0-9_]*:\s/i` — ellers er hele
     dokumentet prosa (fields = {}).
- **Mini-YAML** (flat + ett nivå nesting — IKKE full YAML):
  - `key: value` — key `[A-Za-z_][A-Za-z0-9_]*`; verdi = resten etter første
    `:` (trimmet).
  - Typing: `true`/`false` → boolean; `/^-?\d+$/` → number; `[a, b]` →
    array av skalarer (samme typing per element); `"…"` → JSON-parse
    (escapes); ellers råstreng.
  - Nesting (for `auth`/`oppskrift`): `key:` med tom verdi etterfulgt av
    2-space-innrykkede `sub: value`-linjer → objekt.
  - serialize quoter en verdi (JSON.stringify) KUN når den inneholder `: `,
    starter med `[`/`"`/`#`/whitespace, eller har ledende/etterfølgende
    whitespace; arrays som `[a, b]`; objekter som nestet blokk.
- parse kaster ALDRI på innhold (kun på ikke-streng-input); rare linjer i
  front matter → warnings + linja ignoreres.

- [ ] **Step 1: Skriv failende tester** i `tests/js/source-doc.test.js`
  (node:test, samme require-idiom som `tests/js/packs.test.js`):
  - round-trip: front matter-dokument → parse → serialize === input
    (skriv testdokumentet i kanonisk form).
  - fenced yaml (kopiér src-socrata.md-formen inn i testen som streng) →
    parse gir samme fields som front matter-varianten; normalize gir
    front matter-form.
  - nakne linjer: `'name: X\ndata_url: https://a/b.csv\n\nProsa.'` →
    fields {name, data_url}, prosaen bevart; normalize idempotent.
  - typing: cors true → boolean; `tags: [makro, norge]` → array; quoted
    streng med `: ` round-trips.
  - nesting: auth-blokk (type/env/plassering) → objekt og tilbake.
  - seksjoner: `## Kort`/`## Variables`/`## Om kilden`/`## Egne notater` →
    keys 'kort'/'variabler'/'om'/null; sectionKey('Short') === 'kort'.
  - dokument UTEN key-linjer øverst → fields {}, alt er prosa/seksjoner.
- [ ] **Step 2:** `node --test tests/js/source-doc.test.js` — FAIL
  («SourceDoc is not defined»/module not found).
- [ ] **Step 3:** Implementer `js/source-doc.js` (IIFE + document-guard +
  `if (typeof module !== 'undefined') module.exports = {...}` — samme hale
  som packs.js). Legg script-taggen i index.html.
- [ ] **Step 4:** `node --test tests/js/source-doc.test.js` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: SourceDoc-parser (front matter/fenced-yaml/nakne felter, kanonisk serialisering)"`

### Task 2: Konvertering + generering — tools/source_docs.mjs

**Files:**
- Create: `tools/source_docs.mjs`
- Create (via kjøring): `data/sources/<id>.md` × 30
- Modify (via kjøring): `data/data-sources.json` (regenerert form)
- Modify: `netlify/edge-functions/README.md` eller `README.md` (én linje:
  data-sources.json + source-guides/ er GENERERT fra data/sources/ — rediger
  aldri direkte, kjør `node tools/source_docs.mjs generate`)

**Interfaces:**
- Consumes: `require('../js/source-doc.js')` (parse/serialize).
- Produces subkommandoer (`node tools/source_docs.mjs <cmd>`):
  - `convert` (ENGANGS): leser `data/data-sources.json` +
    `data/source-guides/<id>.md`; skriver per kilde `data/sources/<id>.md`:
    - front matter: ALLE JSON-felter unntatt `beskrivelse`, `quirks` og
      `guide`, i original nøkkelrekkefølge, PLUSS `order: <index>` (0-basert
      posisjon i arrayen) sist. Sammensatte felter (auth, oppskrift,
      join_nokler, tags) bevares som nestet blokk/array.
    - `# <navn>`-tittel.
    - `## Kort` = quirks-strengen VERBATIM (én linje, uansett lengde) —
      utelates når kilden mangler quirks.
    - `## Guide` = guidefilens innhold VERBATIM — kun når fila finnes.
    - `## Om kilden` = beskrivelse-strengen verbatim.
  - `generate` (VARIG): leser alle `data/sources/*.md`, sorterer på
    `fields.order`, og skriver:
    - `data/data-sources.json`: array av objekter — nøkler i
      fieldOrder-rekkefølge (uten `order`), med `beskrivelse` (fra
      Om kilden-seksjonen), `quirks` (fra Kort-seksjonen, kun når den
      finnes) og `guide: true` (kun når Guide-seksjon finnes) skutt inn —
      posisjonene i objektet er kosmetiske (parseRegistry leser felter ved
      navn); `JSON.stringify(arr, null, 2) + '\n'`.
    - `data/source-guides/<id>.md`: Guide-seksjonens tekst + `'\n'` — og
      SLETTER guide-filer for kilder uten Guide-seksjon (skal ikke skje
      etter convert; scriptet feiler høyt hvis en eksisterende guidefil
      ville blitt slettet).
  - Begge kommandoer avslutter med exit code ≠ 0 og norsk feilmelding ved
    problemer (duplikat-id, duplikat-order, manglende navn/base_url).
- **Paritetsvakt i convert:** etter skriving kjøres generate i minne og
  sammenlignes: (a) guide-filer byte-identiske med originalene, (b) gammel
  vs. ny data-sources.json deep-equal ETTER normalisering
  `JSON.parse(JSON.stringify(...))` — feltrekkefølge ignoreres, verdier og
  entry-rekkefølge må være identiske. Avvik → ingenting skrives, feilene
  listes.

- [ ] **Step 1:** Skriv `tools/source_docs.mjs` med begge subkommandoene og
  paritetsvakten.
- [ ] **Step 2:** Kjør `node tools/source_docs.mjs convert` — forventet:
  30 filer i `data/sources/`, paritetsvakten grønn (skriver tallene:
  «30 kilder, 16 guider byte-like, JSON deep-equal ✅»).
- [ ] **Step 3:** Kjør `node tools/source_docs.mjs generate` og
  `git diff --stat data/` — forventet: kun kosmetisk diff i
  data-sources.json (feltrekkefølge/whitespace), ALLE source-guides/-filer
  uendret (tom diff der).
- [ ] **Step 4:** Verifiser semantikken direkte:
  `deno test -A netlify/edge-functions/_lib/registry.test.ts` og
  `deno test -A netlify/edge-functions/_lib/source-guides-drift.test.ts` —
  PASS (drift-testen leser de regenererte filene).
- [ ] **Step 5:** README-linja om generert-status.
- [ ] **Step 6: Commit** `git commit -m "feat: data/sources/-dokumenter som fasit; data-sources.json + guider genereres (semantisk paritet verifisert)"`

### Task 3: Drift-test — dokumentene og artefaktene kan aldri gli

**Files:**
- Create: `tests/js/source-docs-drift.test.js`

**Interfaces:**
- Consumes: `js/source-doc.js` (parse/normalize) + `tools/source_docs.mjs`
  (eksportér `generateInMemory(docsDir)` → `{json, guides: {id: text}}` fra
  modulen slik at testen slipper å skrive filer — legg `export function
  generateInMemory` i Task 2-koden og bruk den fra CLI-grenen der).
- Produces (testene senere tasks/v1b lener seg på):
  - **Regenererings-likhet:** `generateInMemory('data/sources')` deep-equal
    med commitet `data/data-sources.json` og byte-lik hver commitet
    `data/source-guides/<id>.md`. (Fanger: noen redigerte artefaktet
    direkte, eller dokument endret uten regenerering.)
  - **Round-trip-idempotens:** for hver `data/sources/*.md`:
    `normalize(text) === text` (dokumentene er commitet i kanonisk form).
  - **Unikhet:** id-er unike, order-verdier unike, `fields.id` ===
    filnavn-stammen.
  - **Guide-konsistens:** Guide-seksjon finnes ⇔ generert guide-fil finnes
    (erstatter IKKE `source-guides-drift.test.ts` i deno — den består og
    vokter guide↔quirks-innholdet; denne vokter dokument↔artefakt).
- [ ] **Step 1:** Skriv testen — den skal PASSE umiddelbart mot Task 2-
  resultatet (rød først-prinsippet dekkes ved å midlertidig endre én verdi i
  data-sources.json og se testen feile — gjør det, se FAIL, revert, se PASS).
- [ ] **Step 2:** `node --test tests/js/source-docs-drift.test.js` — PASS.
- [ ] **Step 3: Commit** `git commit -m "test: drift-vern dokumenter ↔ genererte artefakter (+ idempotens og unikhet)"`

### Task 4: Community-pakker → front matter

**Files:**
- Modify: `tools/source_docs.mjs` (ny subkommando `convert-packs`)
- Modify (via kjøring): `data/packs/community/*.md` (85 src-* + oversiktene
  som har yaml-blokk), `data/packs/norway.md`/`finland.md` hvis de har
  yaml-blokk (les og sjekk — norway.md har IKKE yaml, da røres den ikke)
- Modify: `tests/js/packs-lint.test.js`

**Interfaces:**
- Produces: `convert-packs` kjører per fil: `SourceDoc.parse` → hvis
  formen var fenced-yaml: skriv `SourceDoc.serialize`-formen (front matter
  øverst, prosa/seksjoner bevart ordrett; den gamle ```yaml-blokka fjernes
  — feltene bor nå i front matter). Filer uten yaml-blokk → urørt.
  Idempotent (kjøring nr. 2 endrer ingenting).
- packs-lint utvides: alle `data/packs/community/*.md` skal parse med
  `fields.id` tilstede og UTEN fenced ```yaml-blokk i teksten (gammel form
  avvises nå — lint-melding sier «kjør node tools/source_docs.mjs
  convert-packs»).
- NB: pakketeksten som modellen ser endrer innpakning (`---`-linjer i
  stedet for ```yaml). Det er innenfor v1a-pariteten (spec §2 — kanonisk
  form); selve feltene og prosaen er uendret.
- [ ] **Step 1:** Utvid `tests/js/packs-lint.test.js` med
  front-matter-kravet — FAIL (85 filer i gammel form).
- [ ] **Step 2:** Implementer og kjør `node tools/source_docs.mjs
  convert-packs`; spot-sjekk 3 filer manuelt (src-bls-api.md,
  src-socrata.md, én oversikt) — feltene identiske, prosa ordrett.
- [ ] **Step 3:** `node --test tests/js/packs-lint.test.js` — PASS; kjør
  også `node --test tests/js/packs.test.js` (compose leser text rått —
  uendret oppførsel forventet).
- [ ] **Step 4:** Kjør konverteringen én gang til — `git diff --exit-code
  data/packs/` (idempotens).
- [ ] **Step 5: Commit** `git commit -m "feat: community-pakker på front matter-form; lint krever ny form"`

### Task 5: Telemetri-opt-out (spec §10)

**Files:**
- Modify: `js/feil-telemetri.js` (vakt), `index.html`
  (`#aiSettingsBackdrop`-seksjon + openSettings/saveSettings-koden der
  innstillingene wires — grep `aiCfgUserKeys` for riktig blokk),
  `personvern.html`, `personvern.en.html`
- Test: `tests/js/feil-telemetri.test.js` (finnes — les og utvid; lager du
  den hvis den mot formodning mangler, følg deps-injeksjonsmønsteret i
  fila/byggFeilrapport)

**Interfaces:**
- Produces:
  - `js/feil-telemetri.js`: ny intern `telemetriAv()`:

```js
function telemetriAv() {
  try {
    return !!(global.localStorage &&
      global.localStorage.getItem('md_telemetri_av') === '1');
  } catch (e) { return false; }
}
```

    Første linje i `sendFeilrapport`: `if (telemetriAv()) return;`.
    Eksporter i api-objektet: `telemetriAv: telemetriAv` (testbarhet).
  - Innstillinger-markup, RETT ETTER `#aiCfgUserKeys`-diven:

```html
<div id="aiCfgPrivacy" style="margin-bottom:12px;">
  <label class="sources-discover"><input type="checkbox" id="aiCfgTelemetry" checked>
    <span data-i18n>Send anonymous error reports (helps improve the sources)</span></label>
  <div class="ai-modal-help" data-i18n>Only errors are ever sent — never your questions, data or keys. See the privacy page for details.</div>
</div>
```

  - openSettings: `document.getElementById('aiCfgTelemetry').checked =
    localStorage.getItem('md_telemetri_av') !== '1';` (try/catch som
    naboene). saveSettings: checked → `removeItem('md_telemetri_av')`,
    ellers `setItem('md_telemetri_av', '1')`.
  - Personvernsidene får nytt avsnitt under feilsøkings-/datadelen (les
    sidene og legg det der tilsvarende innhold bor):
    - no: «**Feilrapporter.** Når noe feiler i appen, sendes en anonym
      feilrapport til oss (kun feilen — aldri spørsmålene, dataene eller
      nøklene dine; nøkkellignende verdier maskeres før sending). Dette
      hjelper oss å oppdage og rette kilder som har sluttet å virke. Du kan
      skru det av i AI-innstillingene («Send anonyme feilrapporter»).»
    - en: «**Error reports.** When something fails in the app, an anonymous
      error report is sent to us (the error only — never your questions,
      data or keys; key-like values are masked before sending). This helps
      us detect and fix sources that have stopped working. You can turn it
      off in the AI settings ("Send anonymous error reports").»
- [ ] **Step 1:** Les `tests/js/feil-telemetri.test.js`; skriv failende
  tester: (a) `md_telemetri_av='1'` i localStorage-mock → sendFeilrapport
  kaller ALDRI fetch-stubben; (b) uten flagget → fetch kalles som før;
  (c) localStorage som kaster → telemetriAv() === false (rapporten går).
- [ ] **Step 2:** `node --test tests/js/feil-telemetri.test.js` — FAIL.
- [ ] **Step 3:** Implementer vakten + eksporten; kjør testen — PASS.
- [ ] **Step 4:** Markup + openSettings/saveSettings + no.js-nøklene +
  personvernavsnittene.
- [ ] **Step 5:** `node --test tests/js/feil-telemetri.test.js` og manuell
  sjekk i dev-server: skru av → fremprovoser feil (still et spørsmål med
  ugyldig nøkkel) → Network-fanen viser INGEN POST til `/_/api/feil`; skru
  på → rapport sendes.
- [ ] **Step 6: Commit** `git commit -m "feat: telemetri-opt-out i innstillingene (md_telemetri_av, vakt i sendFeilrapport)"`

### Task 6: i18n-sweep

**Files:**
- Modify: alle `js/i18n/*.js` (12 ordbøker), `tools/ask_i18n_keys.json`
- Test: `tests/js/i18n-dicts.test.js`, `tests/js/i18n.test.js`

**Interfaces:**
- Consumes: de to nye nøklene fra Task 5 (`Send anonymous error reports
  (helps improve the sources)`, `Only errors are ever sent — never your
  questions, data or keys. See the privacy page for details.`).
- [ ] **Step 1:** `node tools/list_i18n_keys.mjs` → regenerert fasit
  (aiSettingsBackdrop-regionen dekker de nye data-i18n-elementene —
  verifiser at begge nøklene kom med; hvis ikke: utvid region-listen i
  scriptet).
- [ ] **Step 2:** `node --test tests/js/i18n-dicts.test.js` — FAIL med
  manglende nøkler per språk.
- [ ] **Step 3:** Legg reelle oversettelser i alle 12 ordbøker (ikke
  engelsk kopi); kjør vm-parse-sjekken av ordbøkene (kjent `,,`-felle ved
  scriptede endringer).
- [ ] **Step 4:** `node --test tests/js/i18n-dicts.test.js
  tests/js/i18n.test.js` — PASS.
- [ ] **Step 5: Commit** `git commit -m "i18n: telemetri-valgets nøkler i alle ordbøker + regenerert fasit"`

### Task 7: Full verifisering

**Files:** ingen nye (fikser går i filene over).

- [ ] **Step 1:** `node --test tests/js/*.test.js` og `python3 -m pytest
  tests/ -q` — ALT grønt.
- [ ] **Step 2:** `deno check netlify/edge-functions/svar.ts` og `deno test
  -A netlify/edge-functions/_lib/` — PASS (ingen TS-endringer i runden, men
  drift-testene leser regenererte datafiler).
- [ ] **Step 3:** Prompt-paritet ende-til-ende: start `netlify dev`
  (RESTART, port 8899), still ETT dataspørsmål (f.eks. Norge-ledighet) med
  .env-nøkkelen og verifiser i Network-fanen at svaret kommer normalt og at
  progress-linja viser kilderegisteret i bruk (registerblokka bygges fra
  regenerert JSON). Sammenlign én kildes guide-levering: spørsmål som
  treffer ssb → search_catalog-svaret bærer guide-feltet (uendret
  mekanikk).
- [ ] **Step 4:** Telemetri-smoken fra Task 5 Step 5 gjentas mot dev-server
  ETTER hele runden (regresjonsvakt).
- [ ] **Step 5:** Konverterings-idempotens: `node tools/source_docs.mjs
  generate && git diff --exit-code data/` — tom.
- [ ] **Step 6: Commit** eventuelle fikser:
  `git commit -m "fix: smoke-funn fra kildedokumenter v1a"`.

---

## Utsatt til v1b (egen plan når v1a er landet og reviewet)

Overlegg/redigering m/ GitHub-tilbakestilling og hash-hint, master–detalj i
kildemodalen m/ ferskhetsprikk, ny kilde-modalen (placeholder/`?`-hjelp/
«Sett inn mal»), `#`/`@` m/ autocomplete + `sources_on` serverside,
eksport/import + importer-fra-URL, «Hva ser modellen?», kildelinje under
svar, maskinfelt-dietten, Variabler-seksjonens søke-/prompt-bruk (parseren
og seksjonsnøkkelen er klare fra Task 1). Åpne valg som tas i v1b-planen:
default-fane, maltekst, «Kort»-seksjonens omskriving fra quirks-prosa.

## Self-review (utført ved skriving)

- **Spec-dekning (v1a-delen):** format+parser (§2) → Task 1; fasit-skifte +
  generering + konvertering (§1/§2) → Task 2; drift-vern (§Verifisering
  round-trip/idempotens) → Task 3; 85 src-pakker (§2 konvertering) → Task 4;
  telemetri (§10) → Task 5+6; paritet + smoke (§3, §Verifisering v1) →
  Task 2 Step 4 + Task 7. Resten av v1 eksplisitt listet under «Utsatt til
  v1b».
- **Placeholder-scan:** ingen TBD/«utvid passende» — alle tekster, regex-er
  og kommandoer står ordrett; markup og vaktkode er komplette.
- **Typekonsistens:** `SourceDoc.parse/serialize/normalize/sectionKey/
  TAG_ALIASES/SECTION_ALIASES` definert i Task 1 og konsumert med samme
  navn i Task 2/3/4; `generateInMemory` innføres i Task 2 og konsumeres i
  Task 3; `md_telemetri_av`-nøkkelen og `telemetriAv`-eksporten samsvarer
  mellom Task 5-kode og -tester.
