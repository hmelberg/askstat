# Språk-og-pakke-runden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deep-only, komponerbare kildepakker (personlig profil + pakke), ny tagline/About, 12 UI-språk med locale-default, mobil ask-visning og delbar pakkekatalog — per spec `docs/superpowers/specs/2026-08-05-sprak-pakker-deling-design.md`.

**Architecture:** Pakker er en andre, skrivebeskyttet «profil-slot» som klienten resolver til tekst (statiske assets + landmal) og sender som `pack`-felt til `/api/svar`; serveren rendrer to merkede promptblokker med heading-demotering. i18n får fallbackkjede lang→en→nøkkel og engelske nøkler for ask-visningen. Deling v1 er statiske filer i repoet + kopi-import.

**Tech Stack:** Vanilla JS (IIFE + `module.exports`-seam for node:test), Deno edge functions (deno test), statiske JSON/md-assets, css uten preprocessor.

## Global Constraints

- Svarspråk følger SPØRSMÅLET, aldri UI-språket (uendret regel).
- Per-blokk-cap 8000 tegn for profil- OG pakketekst; navn ≤60.
- `depth` beholdes i payload/historikk/telemetri som konstant `'deep'`.
- Ask-visningens i18n-nøkler er ENGELSKE; editorens norske nøkler røres ikke.
- Editor-visningen oversettes IKKE; Details-sporet forblir engelsk.
- Auto-pakkevalg synkes ALDRI (per-enhet); manuelt pakkevalg synkes i profiles-dokumentet.
- `tolk-resultat.ts` + `prompts/tolk-resultat.md` skal holdes byte-identiske (delt med openstat) — endres tolk-prompten, endres BEGGE filer.
- Testkommandoer: `node --test tests/js/*.test.js` (eksplisitt glob, Node 26) og `cd netlify/edge-functions && deno test --allow-net=none` (som eksisterende suite kjøres).
- Ingen push uten Hans' beslutning; commit per task.

---

### Task 1: Deep-only

**Files:**
- Modify: `js/ask-view.js` (48-50, 611-635, askDepth-bruk), `index.html` (dybdepille-markup), `js/ai-chat.js` (depth-fallback), `netlify/edge-functions/_lib/svar-prompt.ts:14-16`
- Test: `netlify/edge-functions/_lib/svar-prompt.test.ts` (coerceDepth-forventning), `tests/js/ask-view.test.js` hvis den tester dybde

**Interfaces:**
- Produces: `askDepth()` returnerer alltid `'deep'`; server `coerceDepth(undefined) === 'deep'`.

- [ ] **Step 1:** Oppdater deno-testen for `coerceDepth`: forventning `coerceDepth(undefined) === "deep"` og `coerceDepth("standard") === "standard"`. Kjør — skal FEILE.
- [ ] **Step 2:** `svar-prompt.ts`: `return d === "standard" ? "standard" : "deep";`. Kjør deno-testene — PASS.
- [ ] **Step 3:** Klient: fjern `coerceAskDepth`/`LS_ASK_DEPTH`-logikken og pille-wiringen i `ask-view.js` (611-635); `askDepth()` → `function askDepth() { return 'deep'; }`. Fjern `askDepthBtn`/`askDepthMenu`/`askDepthLabel`-markup i `index.html`. `ai-chat.js`: `depth: params.depth || 'deep'`.
- [ ] **Step 4:** `node --test tests/js/*.test.js` — grønt; grep at ingen referanser til `askDepthBtn`/`md_ask_depth` gjenstår.
- [ ] **Step 5:** Commit `feat(ask): deep-only — dybdevelgeren fjernet, server-default deep`.

### Task 2: Visuelle fikser (tittel-margin + papirtone)

**Files:**
- Modify: `css/ask.css:85`, `app.css` (light-tema-tokens)

- [ ] **Step 1:** `css/ask.css:85`: `margin: 7vh 0 6px` → `margin: 7vh auto 6px`.
- [ ] **Step 2:** `app.css` light-tema: `--bg: #efeade`, `--scrollbar-track: #efeade`, `--sidebar-bg: #e9e4d8`, `--border: #ded8c9`. (Stigen bakgrunn→sidebar→panel forblir monoton; dark uendret.)
- [ ] **Step 3:** Visuell verifisering: åpne appen (statisk server holder — `python3 -m http.server`), skjermdump bred vindusbredde: tittel sentrert over kortet, papirtone synlig mot hvitt kort.
- [ ] **Step 4:** Commit `fix(ask): sentrer tittel (margin-shorthand nullet auto) + mørkere papirtone`.

### Task 3: Pack-slot i Profiles-lageret

**Files:**
- Modify: `js/profiles.js`
- Test: `tests/js/profiles.test.js`, `tests/js/konto-sync.test.js` (rundtur)

**Interfaces:**
- Produces (på `makeProfiles`-instansen):
  - `packState() → {id: string|null, auto: boolean}` — resolvert: manuelt valg fra doc → auto fra storage-nøkkel `md_pack_auto` → `{id:null, auto:false}`.
  - `setPack(id: string|null)` — MANUELT valg; skriver `doc.pack = {id, updated: now()}`, fjerner `md_pack_auto`, fire().
  - `setAutoPack(id: string|null)` — skriver KUN `md_pack_auto` (ikke doc); no-op hvis `doc.pack` finnes; fire().
- Dokumentform: `doc.pack?: {id: string|null, updated: string}` — kun manuelt valg. `mergeRemote`: felt-nivå nyeste-`updated`-vinner; remote UTEN `pack`-felt → behold lokal.

- [ ] **Step 1:** Failing tests i `profiles.test.js`:

```js
test('pack-slot: manuelt valg vinner over auto, synkes, auto gjør ikke', () => {
  const s = fakeStorage();
  const p = makeProfiles(s, { now: () => '2026-08-05T10:00:00Z' });
  assert.deepEqual(p.packState(), { id: null, auto: false });
  p.setAutoPack('norway');
  assert.deepEqual(p.packState(), { id: 'norway', auto: true });
  assert.equal(p.exportDoc().pack, undefined);          // auto aldri i doc
  p.setPack('finland');
  assert.deepEqual(p.packState(), { id: 'finland', auto: false });
  assert.equal(p.exportDoc().pack.id, 'finland');
  p.setAutoPack('norway');                              // no-op etter manuelt valg
  assert.deepEqual(p.packState(), { id: 'finland', auto: false });
});
test('pack-slot: mergeRemote nyeste vinner, fravær bevarer lokal', () => {
  const p = makeProfiles(fakeStorage(), { now: () => '2026-08-05T10:00:00Z' });
  p.setPack('norway');
  p.mergeRemote({ v: 1, updated: '2026-08-06T00:00:00Z', profiles: {} });      // uten pack
  assert.equal(p.packState().id, 'norway');
  p.mergeRemote({ v: 1, updated: '2026-08-06T00:00:00Z', profiles: {},
    pack: { id: null, updated: '2026-08-06T00:00:00Z' } });                     // nyere eksplisitt null
  assert.deepEqual(p.packState(), { id: null, auto: false });
});
```

- [ ] **Step 2:** Kjør — FAIL (`packState is not a function`).
- [ ] **Step 3:** Implementer i `profiles.js`: `PACK_AUTO = 'md_pack_auto'`; `packState/setPack/setAutoPack` per kontrakten; i `mergeRemote`, etter profil-loopen:

```js
if ('pack' in (remoteDoc || {})) {
  var rp = remoteDoc.pack;
  var lp = doc.pack;
  var rU = rp ? String(rp.updated || '') : String(remoteDoc.updated || '');
  if (!lp || rU > String(lp.updated || '')) {
    if (rp === null) { if (doc.pack !== undefined) { delete doc.pack; changed = true; } }
    else if (!lp || lp.id !== rp.id || String(lp.updated||'') !== rU) { doc.pack = rp; changed = true; }
  }
}
```

  (Merk: `pack: {id:null}` = manuelt «International»; `pack`-felt fraværende = aldri valgt.)
- [ ] **Step 4:** `node --test tests/js/profiles.test.js tests/js/konto-sync.test.js` — grønt (konto-sync pusher hele doc, så pack følger gratis; legg en rundtur-assert i konto-sync-testen på at `pack` overlever push→merge).
- [ ] **Step 5:** Commit `feat(packs): pack-slot i profillageret — manuelt valg synkes, auto per enhet`.

### Task 4: Pakke-assets + js/packs.js (katalog, landmal, resolusjon)

**Files:**
- Create: `data/packs/index.json`, `data/packs/norway.md`, `data/packs/finland.md`, `data/packs/countries.json`, `js/packs.js`
- Modify: `index.html` (script-tag for packs.js etter profiles.js)
- Test: `tests/js/packs.test.js`

**Interfaces:**
- Produces: `window.Packs` / `makePacks(storage, fetchImpl, profiles)`:
  - `list() → [{id, name, group: 'builtin'|'country'|'imported'}]`
  - `resolve(id) → Promise<{name, text}>` — kuratert md, landmal, eller importert
  - `payload() → {name, text} | undefined` — SYNKRON, fra cache for gjeldende pakke
  - `ensureCurrent() → Promise<void>` — preload tekst for gjeldende valg (boot + ved bytte)
  - `autoFrom(locale) → id | null` — `'sv-FI'`→`'finland'`, `'nb-NO'`→`'norway'`, `'pt-BR'`→`'country:BR'`, språk-only: no/nb/nn→norway, da→country:DK, fi→finland, is→country:IS, sv→country:SE, ja→country:JP, hi→country:IN; de/fr/es/pt/zh/en → null
- Formater:
  - `index.json`: `{v:1, packs:[{id:"norway", name:"Norway", description:"…", file:"norway.md", country:"NO"}, …]}` (valgfritt `datasets`-felt reservert, wires ikke)
  - `countries.json`: `{v:1, countries:{"NO":{name:"Norway", agency:"Statistics Norway (SSB)", note:"ssb and fhi have first-class adapters — canonical ssb.read."}, "DE":{name:"Germany", agency:"Destatis", note:"No Destatis adapter — use eurostat or dbnomics (both cover DE), or web_fetch."}, …}}` — Norden + DE, FR, ES, PT, BR, CN, JP, IN, NL, IT, UK, US
  - Landmal (engelsk): `The user is likely from {NAME}. When the question concerns {NAME} or has no explicit geography, prefer relevant national sources — such as {AGENCY} — when it is possible and natural for the question. {NOTE}`
- Cache: in-memory + `localStorage md_pack_text:<id>`; katalog i `md_packs_index` (24t TTL via `updated`-felt er unødvendig — cache-bust følger deploy, hent alltid nett-først med storage-fallback).

- [ ] **Step 1:** Failing tests (node, `makePacks` med fake fetch/storage):

```js
const { makePacks } = require('../../js/packs.js');
test('autoFrom: region vinner, entydige språk mappes, tvetydige → null', () => {
  const P = makePacks(fakeStorage(), async () => ({ ok: false }), null);
  assert.equal(P.autoFrom('sv-FI'), 'finland');
  assert.equal(P.autoFrom('nb-NO'), 'norway');
  assert.equal(P.autoFrom('pt-BR'), 'country:BR');
  assert.equal(P.autoFrom('sv'), 'country:SE');
  assert.equal(P.autoFrom('de'), null);
  assert.equal(P.autoFrom('en-US'), 'country:US');
});
test('resolve: kuratert md hentes og caches; landmal renderes fra countries.json', async () => { /* fake fetch serverer index.json/countries.json/norway.md; assert resolve('norway').text inneholder 'ssb'; resolve('country:DE').text inneholder 'Destatis' og 'eurostat' */ });
test('payload: synkron fra cache etter ensureCurrent, undefined uten pakke', async () => { /* profiles-fake med packState() */ });
```

  (Testene skrives UT — kommentarene over er innholdsbeskrivelse for planen, ikke plassholdere i testfila.)
- [ ] **Step 2:** Kjør — FAIL. Implementer `js/packs.js` (IIFE + `module.exports = { makePacks }`; DOM-del kommer i Task 6). `en-US`-merknad: region US finnes i countries.json → `country:US` (regionen vinner, engelsk språk alene gir null).
- [ ] **Step 3:** Skriv `norway.md` (ssb/fhi/norgesbank-id-er fra `data/data-sources.json`, «search ssb/statfin with local-language terms via search_catalog», kjente hull fra ROUTING-blokka) og `finland.md` (statfin søkbar via search_catalog, finske søketermer, Eurostat dekker FI). ≤8000 tegn hver, engelsk, markdown.
- [ ] **Step 4:** `node --test tests/js/packs.test.js` — grønt. Manuell røyk: `python3 -m http.server`, konsoll `await Packs.resolve('country:JP')`.
- [ ] **Step 5:** Commit `feat(packs): katalog, kuraterte pakker (norway/finland), landmal + resolusjon`.

### Task 5: Server-injeksjon — pack-blokk + heading-demotering

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (coercePack, demoteHeadings, blokkrendering ~linje 24-33 og 758), `netlify/edge-functions/svar.ts` (body.pack videre), `js/ai-chat.js` (pack i payload)
- Test: `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts`

**Interfaces:**
- Produces: `coercePack(p: unknown) → {name: string, text: string} | null` (name trim ≤60, text trim ≤8000; null hvis tomt); `demoteHeadings(s: string) → string` (`^#{1,6}` +2 nivåer, tak 6); buildSvarPrompt-opts får `pack?: unknown`.
- Blokkform i prompten (pakke rett ETTER preferanseblokka):

```
## Aktiv kildepakke: <name> (valgt av brukeren — overstyrer standardvalg)

Pakken beskriver foretrukne kilder. Den har forrang over landrutingen —
men opphever ALDRI ærlighetsreglene (probe-✅, fabrikasjonsvern, budsjettene):

<demotert tekst>
```

- [ ] **Step 1:** Failing deno-tester i `svar-prompt-prefs.test.ts`: pack-blokk med navn i prompten; `## Mine kilder` i pakketekst blir `#### Mine kilder`; preferansetekst demoteres OGSÅ; `coercePack(null)`/tom tekst → ingen blokk; 9000-tegns tekst kuttes til 8000.
- [ ] **Step 2:** Kjør — FAIL. Implementer i svar-prompt.ts:

```ts
export function demoteHeadings(s: string): string {
  return s.replace(/^(#{1,6})(\s)/gm, (_m, h: string, sp: string) =>
    "#".repeat(Math.min(6, h.length + 2)) + sp);
}
export function coercePack(p: unknown): { name: string; text: string } | null {
  if (!p || typeof p !== "object") return null;
  const name = String((p as Record<string, unknown>).name ?? "").trim().slice(0, 60);
  const text = String((p as Record<string, unknown>).text ?? "").trim().slice(0, 8000);
  return name && text ? { name, text } : null;
}
```

  `renderPreferencesBlock` bruker `demoteHeadings(prefs)`; ny `renderPackBlock(pack)`; begge inn der `prefBlock` monteres (linje ~758).
- [ ] **Step 3:** `svar.ts`: send `body.pack` inn som `pack`-opt (samme sted som `preferences`). `ai-chat.js`: `pack: (window.Packs && window.Packs.payload && window.Packs.payload()) || undefined,` rett under preferences-linja (689-691).
- [ ] **Step 4:** Deno-suite grønn + `node --test tests/js/*.test.js` grønn.
- [ ] **Step 5:** Commit `feat(packs): kildepakke-blokk i svar-prompten m/heading-demotering (også preferanser)`.

### Task 6: Pakke-velger-UI + proveniens + markdown-forhåndsvisning

**Files:**
- Modify: `index.html` (pakke-pille etter profil-pilla i input-kortet), `js/packs.js` (DOM-del), `js/ask-view.js` (Pack applied-linje; eksponer `window.mdAskMarkdown`), `js/profiles.js` (markdown-preview i modalen), `css/ask.css` (gjenbruk .ask-pill-btn/.ask-pop-menu — kun evt. småjustering)

**Interfaces:**
- Consumes: `Profiles.packState/setPack`, `Packs.list/resolve/ensureCurrent`, `window.mdAskMarkdown(s) → html` (ask-views markdown-it-instans, med maskMathSegments-omveien UNØDVENDIG her — ren md.render).
- Produces: pille `askPackBtn`/`askPackLabel`/`askPackMenu`; etikett «Sources: <navn>» + «(auto)»-suffiks; menyvalg «International default» øverst, deretter builtin-gruppa, deretter land (fra countries.json), «Manage/Import…» kommer i Task 13.

- [ ] **Step 1:** Markup i `index.html` (kopier profil-pillas anatomi, id-ene over). DOM-del i `packs.js`: renderPicker/renderMenu à la profiles.js:252-298; valg → `Profiles.setPack(id)` + `Packs.ensureCurrent()`.
- [ ] **Step 2:** `ask-view.js` i flytstart (etter «Profile applied»-linja ~987): les `Profiles.packState()`; hvis id → `progressLine('Pack applied: ' + navn + (auto ? ' (auto)' : ''))`. Navnet hentes fra `Packs.list()`-oppslag.
- [ ] **Step 3:** `window.mdAskMarkdown = function (s) { return md.render(String(s || '')); };` i ask-view.js der `md` finnes. Profil-modalen: under textarea, en `<details>`-preview som rendrer `mdAskMarkdown(textEl.value)` ved åpning/input (debounce unødvendig — render ved toggle holder).
- [ ] **Step 4:** Manuell røyk (statisk server): velg Norway-pakke, still spørsmål med BYOK-stub AVSLÅTT — verifiser i Details at «Pack applied: Norway» logges før feilen; bytt til International; verifiser «(auto)» vises når `md_pack_auto` er satt og doc.pack fjernet (devtools).
- [ ] **Step 5:** `node --test tests/js/*.test.js` grønn (DOM-delen er document-guardet som i profiles.js). Commit `feat(packs): velger-pille, Pack applied-proveniens, markdown-preview`.

### Task 7: Copy — tagline, title, About-modal

**Files:**
- Modify: `index.html` (title, sub-linje, lenkelinje, sidebar-knapp «Why AskStat?», About-modal-markup), `js/ask-view.js` (åpne/lukke-wiring), `css/ask.css` (.ask-about-line, modal gjenbruker profiles-backdrop-klassene)

**Interfaces:**
- Produces: eksakt copy fra spec §3 (tagline «The AI finds open data and writes the code that computes your answer — you can check every step.», title «AskStat — an AI that answers with data and verifiable code», lenkelinje «Unlike a chatbot, every answer comes with its data and code. Why that matters →», About-modalens fire kulepunkter). Element-id-er: `askAboutBtn` (sidebar), `askAboutLink` (lenkelinje), `askAboutBackdrop`/`askAboutCloseBtn` (modal).

- [ ] **Step 1:** Markup + copy inn; modalen bruker samme backdrop/panel-klasser som profilmodalen.
- [ ] **Step 2:** Wiring i ask-view.js (tre addEventListener + backdrop-klikk lukker).
- [ ] **Step 3:** Manuell røyk: begge innganger åpner, Esc/backdrop lukker, ingen konsollfeil.
- [ ] **Step 4:** Commit `feat(ask): ny tagline + Why AskStat?-modal`.

### Task 8: i18n-fallbackkjede + locale-default + SUPPORTED-utvidelse

**Files:**
- Modify: `js/i18n.js`, `index.html` (`settingLanguage`-options)
- Test: `tests/js/i18n.test.js` (ny — `makeI18n`-seam må trekkes ut hvis fila ikke har module.exports; gjør minimal eksport `module.exports = { detectLang, translate }` med injisert dict/nav)

**Interfaces:**
- Produces: `t(key)`-oppslag lang → `M2PY_I18N.en` → nøkkel; `SUPPORTED = ['no','en','da','sv','fi','is','de','fr','es','pt','zh','ja','hi']`; `detectInitialLang()`: lagret valg → `navigator.language` språkdel mot SUPPORTED → `'en'`. Dict-lasting: `js/i18n/<lang>.js` injiseres som script-tag ved boot for aktivt språk ≠ en (en.js lastes alltid statisk som fallback-ordbok); ved onload re-kjøres apply-passet hvis DOM alt er klar.

- [ ] **Step 1:** Failing node-test: `translate('X', {lang:'fr', dicts:{fr:{}, en:{X:'EN-X'}}}) === 'EN-X'`; `translate('X', {lang:'fr', dicts:{fr:{X:'FR-X'}, en:{X:'EN-X'}}}) === 'FR-X'`; `detectLang({stored:null, nav:'da-DK'}) === 'da'`; `detectLang({stored:'no', nav:'fr'}) === 'no'`; `detectLang({stored:null, nav:'tlh'}) === 'en'`.
- [ ] **Step 2:** Kjør — FAIL. Refaktorer i18n.js: ren kjernefunksjon + IIFE-bruk, `module.exports`-seam nederst (samme mønster som profiles.js). Fallbacken i `t()` OG `lookup()`.
- [ ] **Step 3:** `index.html`: 13 options i `settingLanguage` (engelske språknavn + endonym, f.eks. «Norsk (Norwegian)»).
- [ ] **Step 4:** Grønt + manuell røyk: `localStorage.microdata_ui_lang='fr'` uten fr-ordbok → engelsk UI (aldri norsk).
- [ ] **Step 5:** Commit `feat(i18n): fallbackkjede lang→en→nøkkel, locale-default, 13 språk i SUPPORTED`.

### Task 9: Wire ask-visningen for i18n (engelske nøkler)

**Files:**
- Modify: `index.html` (data-i18n-attributter på askView-markupen inkl. eksemplene og `data-q`), `js/i18n.js` (støtte for `data-i18n-q` hvis apply-mekanismen mangler den; VIKTIG: stash-mekanismen (`m2py_lang_stash`) må dekke q-attributtet så re-oversettelse er idempotent), `js/ask-view.js` + `js/profiles.js` + `js/packs.js` (dynamiske strenger → `t('…')`: progresslinjene «Interpreting the question …», «Route: {r}. Interpretation: {t}», «Profile applied: {n}», «Pack applied: {n}», badge-tekstene i badgeFor, «No profile», «Manage profiles…», «Edit», tagline/About-tekstene får data-i18n i markup)

**Interfaces:**
- Consumes: eksisterende apply-mekanisme i i18n.js (data-i18n/-placeholder/-title/-aria) — LES DEN FØRST; ask-view følger samme konvensjon med engelske nøkler.
- Produces: komplett nøkkelliste for ordbøkene (Task 10) — generer den med `node tools/list_i18n_keys.mjs` (nytt lite verktøy: scann index.html for data-i18n*-verdier i askView-subtreet + grep `t('` i ask-view/profiles/packs) → `tools/ask_i18n_keys.json`.

- [ ] **Step 1:** Les apply-mekanismen i i18n.js (linje 60-182); legg til `data-i18n-q`-håndtering m/stash hvis nødvendig.
- [ ] **Step 2:** Attributter på alt synlig i askView (sidebar, piller, menyer, modaler, tagline, About, input-placeholder, eksempel-etiketter OG `data-q`).
- [ ] **Step 3:** `t()`-wrap dynamiske strenger (lista i Files over — også «Recents», «Clear history», login-modalens ask-strenger).
- [ ] **Step 4:** Skriv `tools/list_i18n_keys.mjs`, generer `tools/ask_i18n_keys.json`; sanity: 60–120 nøkler.
- [ ] **Step 5:** Manuell røyk med engelsk UI: identisk utseende (nøkkel = engelsk tekst); `m2py_i18n_debug=1` + norsk viser __i18nMissing-settet fullt av ask-nøkler (forventet før Task 10).
- [ ] **Step 6:** `node --test tests/js/*.test.js` grønn. Commit `feat(i18n): ask-visningen wiret med engelske nøkler + data-i18n-q + nøkkelekstraktor`.

### Task 10: Ordbøker for 12 språk

**Files:**
- Create: `js/i18n/no.js`, `da.js`, `sv.js`, `fi.js`, `is.js`, `de.js`, `fr.js`, `es.js`, `pt.js`, `zh.js`, `ja.js`, `hi.js`
- Test: `tests/js/i18n-dicts.test.js`

**Interfaces:**
- Consumes: `tools/ask_i18n_keys.json` (Task 9).
- Produces: hver fil `window.M2PY_I18N = window.M2PY_I18N || {}; window.M2PY_I18N.<lang> = { "<engelsk nøkkel>": "<oversettelse>", … };` — KUN ask-nøkler; `{navn}`-plassholdere bevares ordrett i oversettelsene.

- [ ] **Step 1:** Failing test: for hvert språk i SUPPORTED≠en: fila finnes, evaluerer (vm.runInNewContext med window-stub), dekker ALLE nøkler i ask_i18n_keys.json, og hver oversettelse bevarer samme `{plassholder}`-sett som nøkkelen.
- [ ] **Step 2:** Generer oversettelsene (Claude authoring — dette ER innholdsarbeidet; eksemplene oversettes som naturlige spørsmål, `data-q` inkludert; zh = forenklet kinesisk, pt = europeisk portugisisk med brasiliansk-nøytrale valg, hi = devanagari).
- [ ] **Step 3:** Testen grønn. Manuell røyk: bytt til de/ja/hi i settings — hele ask-visningen skifter, ingen norsk lekkasje, RTL ikke aktuelt.
- [ ] **Step 4:** Commit `feat(i18n): ordbøker for 12 språk (ask-visningen)`.

### Task 11: Språkbytte ↔ auto-pakke + boot-kobling

**Files:**
- Modify: `js/i18n.js` (eksponer `onLangChange`-hook eller kall direkte), `js/packs.js` (boot: `Packs.boot()` — hvis `packState()` er `{id:null, auto:false}` og doc.pack fraværende → `autoFrom(navigator.language)` → `Profiles.setAutoPack(id)`; språkbytte-handler: samme, men KUN når intet manuelt valg), `index.html` (kall Packs.boot() etter profiles/packs-script)
- Test: `tests/js/packs.test.js` (utvid)

- [ ] **Step 1:** Failing test: `boot()` med nav-locale `sv-FI` og urørt lager → `packState()` = `{id:'finland', auto:true}`; med `setPack('norway')` først → boot endrer ingenting; språkbytte `onLangChange('ja')` uten manuelt valg → auto `country:JP`.
- [ ] **Step 2:** Implementer (merk: `doc.pack` fraværende vs `{id:null}` skiller «aldri valgt» fra «valgte International» — boot auto-setter KUN ved fraværende).
- [ ] **Step 3:** Grønt + manuell røyk: fersk profil (inkognito) med nb-NO-browser → «Sources: Norway (auto)».
- [ ] **Step 4:** Commit `feat(packs): locale→auto-pakke ved boot og språkbytte`.

### Task 12: ui_lang-utvidelse + promptgeneralisering (server)

**Files:**
- Modify: `netlify/edge-functions/ask-ruter.ts` (+ speilfila `prompts/ask-ruter.md`), `netlify/edge-functions/tolk-resultat.ts` (+ `prompts/tolk-resultat.md` — BYTE-SPEIL, endre begge), `netlify/edge-functions/_lib/svar-prompt.ts` (alle «norsk/engelsk»-forekomster: 44, 462, 478, 606, 613 → «på spørsmålets språk»), `js/ask-view.js`/`js/ai-chat.js` (`uiLang = window.M2PY_LANG || 'en'` — dropp no/en-ternæren)
- Test: deno-tester for coerce-funksjonen; drift-tester for promptspeilene må forbli grønne

**Interfaces:**
- Produces: `coerceUiLang(v: unknown) → string` i begge endepunkter: godkjent liste `["no","en","da","sv","fi","is","de","fr","es","pt","zh","ja","hi"]`, ukjent → `"en"`. Promptene refererer språket generisk («svar på samme språk som spørsmålet»; ui_lang styrer KUN språk-rutens direkte svar og tolkningsteksten).

- [ ] **Step 1:** Failing deno-test for coerceUiLang (gyldig kode passerer, `"tlh"`/undefined → en).
- [ ] **Step 2:** Implementer; oppdater promptlinjene og BEGGE speilfiler; kjør drift-testene (`prompt-assembly.test.ts` m.fl.).
- [ ] **Step 3:** Full deno-suite grønn; `node --test` grønn.
- [ ] **Step 4:** Commit `feat(i18n): ui_lang for 13 språkkoder + prompt sier «spørsmålets språk»`.

### Task 13: Deling v1 — katalog, Explore/Import, lint

**Files:**
- Create: `data/packs/community/README.md` (PR-oppskrift + format), `data/packs/community/us-health-surveys.md` (seed-eksempel: NHIS/MEPS-pekere fra ipums-guiden, URL-er + siterte nøkkelfakta), `tests/js/packs-lint.test.js`
- Modify: `data/packs/index.json` (community-seksjon `{id:"us-health-surveys", …, community:true, author:"hans"}`), `js/packs.js` (import-lager `md_packs_imported` + `list()`-gruppe 'imported'; Explore-modal), `index.html` (modal-markup `packsExploreBackdrop` + menypunkt «View/Import shared packs…» i pakkemenyen)

**Interfaces:**
- Produces: `Packs.importPack(entry, text)` → skriver `md_packs_imported[id] = {name, text, origin:{source:'community', id, updated}}`; importerte vises i pluggvelgeren og resolves lokalt (ALDRI re-fetch — kopi-semantikk). Explore-modalen viser beskrivelse + `mdAskMarkdown`-preview FØR import (les-før-aktiver).
- Lint (kjøres i node-suiten): alle filer i index finnes, ≤8000 tegn, ingen treff på nøkkelregexen fra `js/feil-telemetri.js` (gjenbruk NOKKEL_RE-mønsteret), alle markdown-lenker er https, id-er `^[a-z0-9-]+$` og unike.

- [ ] **Step 1:** Failing lint-test (mot dagens assets — grønn først når seed-fila og index-utvidelsen er på plass og gyldige).
- [ ] **Step 2:** Skriv README + seed-pakka; utvid index.json.
- [ ] **Step 3:** Implementer importlager + Explore-modal + menypunkt.
- [ ] **Step 4:** Failing→grønn funksjonstest i packs.test.js: `importPack` → `list()` inneholder 'imported'-gruppa → `resolve('imported:us-health-surveys')` gir kopien uten fetch.
- [ ] **Step 5:** Manuell røyk: åpne Explore, preview rendres, Import → velgbar → «Pack applied: …» i Details.
- [ ] **Step 6:** Commit `feat(packs): delingskatalog v1 — community-mappe, Explore/Import (kopi m/opprinnelse), lint`.

### Task 14: Mobil ask-visning

**Files:**
- Modify: `css/ask.css` (79: erstatt display:none-regelen; drawer + backdrop + mobiltopplinje + flex-wrap), `index.html` (mobiltopplinje: `askMobileTop` med hamburger `askDrawerBtn` + «AskStat»), `js/ask-view.js` (drawer-toggle; lukk ved valg/navigasjon), `app.css` (modal-caps hvis modal-klassene bor der: `max-height: 85vh; overflow-y: auto` på panelet)

**Interfaces:**
- Produces: <720px: `.ask-sidebar` = fixed drawer (`transform: translateX(-100%)`, `.open` → 0, bredde 280px, z-index over innhold, halvtransparent backdrop `askDrawerBackdrop`); ≥720px: uendret. `.ask-input-tools { flex-wrap: wrap; }` generelt.

- [ ] **Step 1:** CSS: `@media (max-width: 720px)`-blokk med drawer-reglene + `.ask-mobile-top { display:flex }` (ellers `display:none`); fjern `display:none`-regelen for sidebaren.
- [ ] **Step 2:** Markup + toggle-js (hamburger åpner, backdrop/menyvalg lukker).
- [ ] **Step 3:** Verifisering med playwright/chrome-devtools på 390×844: sidebar-skuffen åpner/lukker, input-kort og svar innenfor bredden (ingen horisontal scroll på body), profil/pakke/About/login-modaler brukbare, tappmål ok.
- [ ] **Step 4:** Desktop-regresjonssjekk (bred skjermdump uendret).
- [ ] **Step 5:** Commit `feat(ask): mobil — sidebar-skuff m/hamburger, reflow, modal-caps`.

### Task 15: Sluttverifisering + dokumentoppdatering

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-sprak-pakker-deling-design.md` (status-linja), `README.md` (én linje om språk/pakker hvis README beskriver funksjoner)

- [ ] **Step 1:** Full testkjøring: `node --test tests/js/*.test.js` + deno-suiten + `pytest` (uendret, men kjør for regresjon).
- [ ] **Step 2:** E2E-røyk med .env-nøkkel (playwright, port 8899-oppsettet fra netlify.toml): ETT spørsmål med Norway-pakke aktiv — verifiser «Pack applied» i Details og at svaret kommer; ETT spørsmål på fransk UI (fr) — verifiser fransk chrome + svar på spørsmålets språk.
- [ ] **Step 3:** Spec-status → «implementert 2026-08-XX»; commit `docs: språk-og-pakke-runden implementert`.
- [ ] **Step 4:** Rapporter til Hans med commit-liste og smoke-funn; PUSH kun etter Hans' klarsignal.
