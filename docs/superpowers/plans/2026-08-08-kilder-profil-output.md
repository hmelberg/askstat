# Kilder/instruksjoner/output/innstillinger — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjennomføre spec `docs/superpowers/specs/2026-08-08-kilder-profil-output-design.md`: ny kilde-modal med faner/tags, kind+tags inn i prompten, «Instruksjoner», ryddet sidemeny/innstillinger, polert output, plotly-fiks og egne nøkler v1.

**Architecture:** Ren klientside-app (ES5, ingen bundler) + Netlify edge-functions (Deno/TS). Datamodellen (kind-felt + tags-liste) innføres nederst (profiles/packs) og bæres opp gjennom payload → server-prompt. UI-en bygges som ny dedikert modal-fil (`js/sources-modal.js`); gammel popover/landmodal fjernes. Ingen bakoverkompat.

**Tech Stack:** Vanilla JS (ES5, IIFE-moduler med node-testbar ren kjerne), node:test (`node --test tests/js/`), pytest (kun berørt av plotly-patch-testen), Deno edge functions, i18n-ordbøker i `js/i18n/*.js` med fasit `tools/ask_i18n_keys.json`.

## Global Constraints

- Ingen bakoverkompatibilitet: gamle brukerkilder uten kind vises som **enkeltkilde** («source») til de redigeres; ingen migreringskode.
- All ny brukersynlig tekst går via `t()`/`T()` eller `data-i18n` med **engelsk nøkkel** (ask-flatens konvensjon). Norsk oversettelse legges i `js/i18n/no.js` i samme task; full 13-språks-sweep er egen task (Task 12) — `tests/js/i18n-dicts.test.js` er rød mellom taskene som legger nøkler og Task 12, det er forventet og OK.
- `kind` er felt (`'overview'` = tema/samling, `'source'` = enkeltkilde); `tags` er valgfri liste av korte små-bokstav-ord. Reservert spesialbehandling: `mikro`/`makro` (farget badge + rutingsregel), alt annet nøytral badge.
- ES5 i js/-filer (var, function — ingen arrow/let/const/template literals); TS i netlify/edge-functions.
- Kjør `node --test tests/js/<fil>` for hver berørt testfil FØR commit; commit per task med beskrivende melding.
- Verifisering lokalt: `netlify dev` (port 8888) må RESTARTES etter endring i edge-TS (modul-cache); Chrome hard-reload m/ ignoreCache for js/ (kjent felle).

## Fil-kart (hvem eier hva etter runden)

- `js/profiles.js` — lagring (uendret API + tags-felt), Instruksjoner-modal (KUN profiler; modalKind fjernes)
- `js/packs.js` — innhold/katalog/payload (kind+tags gjennom compose), registry, land-logikk; DOM-delen krymper (popover + gammel manager + landmodal FJERNES)
- `js/sources-modal.js` — **NY**: hele kilde-dialogen (faner, søk, tag-chips, liste, infopanel, lag ny/rediger, land-dropdown, discover, import-inngang)
- `js/context-pill.js` — SLETTES (pillen blir ren åpne-dialog-knapp, wires i sources-modal.js)
- `js/ask-view.js` — output-knapper, editor-returknapp
- `js/ai-chat.js` — innstillinger (rekkefølge + egne nøkler), payload (user_keys), KEYS-injeksjon
- `netlify/edge-functions/_lib/svar-prompt.ts` — coercePacks/renderPacksBlock/get_pack/rutingsregel/user_keys-blokk/plotly-instruks
- `netlify/edge-functions/_lib/registry.ts` (eller der `renderRegistryBlock` bor — verifiser med grep) — tags i registerblokka
- `data/packs/index.json`, `data/data-sources.json` — tags-innhold
- `css/ask.css` — modal-, badge-, chip-, typografi-CSS
- `index.html` — sidemeny, modaler, innstillinger, plotly-helper

---

### Task 1: Datamodell klient — tags i profiles.js, kind+tags gjennom packs.js

**Files:**
- Modify: `js/profiles.js` (create/update/clamping)
- Modify: `js/packs.js` (list, rawSelected, compose, listRegistry, listCommunity, importPack)
- Test: `tests/js/profiles.test.js`, `tests/js/packs.test.js`

**Interfaces:**
- Consumes: eksisterende `Profiles.create(name, text, kind, origin)`, `Packs.compose(list)`.
- Produces (senere tasks er avhengige av NØYAKTIG disse formene):
  - `Profiles.create(name, text, kind, origin, tags)` — tags lagres clampet på oppføringen som `entry.tags` (kun når ikke-tom).
  - `Profiles.update(id, {name, text, tags})` — tags erstattes når feltet er med.
  - Brukerkilders pakketype bor i `origin.kind` (`'overview'|'source'`); egenskrevne kilder får `origin = {source:'own', kind:<valgt>}` (settes av sources-modal i Task 5 via create-kallet).
  - `Packs.list()` → `[{id:'user:…', name, kind, tags, imported:bool}]` — kind fra `origin.kind`, **default `'source'`** (spec §3, legacy uten origin); imported = `origin.source==='community'`.
  - `Packs.rawSelected()`/`payload()`-elementer får `kind` og `tags` med gjennom `compose()`: compose returnerer `{id, name, text, level, kind, tags}`.
    - kuraterte katalogposter: `kind = entry.kind==='source'?'source':'overview'`, `tags = entry.tags||[]`
    - `country:CC`: `kind='overview'`, `tags=[]`
    - `user:`: fra profiloppføringen som over.
  - `Packs.listRegistry()` → elementene får `tags: r.tags||[]`.
  - `Packs.listCommunity()` → elementene får `tags: p.tags||[]` (til Explore-visningen).
  - Tag-clamp (delt ren funksjon i profiles.js, eksportert som `Profiles.cleanTags` og gjenbrukt): `cleanTags(input)` — aksepterer array eller kommaseparert streng; trim, lowercase, `/^[a-zæøåa-z0-9_-]{1,24}$/`-filter, dedup, max 8.

- [ ] **Step 1: Skriv failende tester** i `tests/js/profiles.test.js` (cleanTags: `'Mikro, MAKRO, x  ,mikro'` → `['mikro','makro','x']`; create med tags lagrer clampet; update erstatter) og `tests/js/packs.test.js` (compose bærer kind/tags gjennom; list() default kind 'source' for oppføring uten origin.kind; listRegistry tar med tags). Følg eksisterende makeProfiles/makePacks-mock-mønster i filene.
- [ ] **Step 2:** `node --test tests/js/profiles.test.js tests/js/packs.test.js` — forventet FAIL på de nye testene.
- [ ] **Step 3:** Implementer i profiles.js: `cleanTags` som modulnivå-funksjon (ren, ES5), `create`-signaturen utvides (`tags` som 5. argument), `update` håndterer `'tags' in fields`. I packs.js: utvid `compose()` (behold budsjettlogikken urørt — kun feltene som mappes ut på linje 61–63), `rawSelected()` (slå opp kind/tags per gren), `list()`, `listRegistry()`, `listCommunity()`, og `importPack` (behold origin.kind-mappingen; legg `tags: entry.tags` inn i origin? NEI — tags lagres som `Profiles.create(..., entry.tags)`-argument).
- [ ] **Step 4:** `node --test tests/js/profiles.test.js tests/js/packs.test.js tests/js/konto-sync.test.js` — PASS (konto-sync røres ikke, men verifiser at merge tåler tags-feltet: `updated`-vinner-per-id-mekanismen kopierer hele oppføringen, så ingen endring ventes).
- [ ] **Step 5: Commit** `git commit -m "feat: tags-felt i profillageret, kind+tags gjennom packs-kjeden"`

### Task 2: Server — kind+tags i coercePacks/renderPacksBlock, get_pack-tekst, mikro/makro-rutingsregel, tags i registerblokka

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (coercePacks ~L53, renderPacksBlock ~L87, GET_PACK_TOOL ~L962, buildSvarSystem ~L874)
- Modify: fila som eier `renderRegistryBlock` (grep `renderRegistryBlock` under `netlify/edge-functions/_lib/`)
- Test: hvis det finnes deno-tester for _lib (grep `Deno.test` i repoet) utvid dem; ellers verifiseres med `deno check netlify/edge-functions/svar.ts` + smoke i Task 13.

**Interfaces:**
- Consumes: klient-payload-elementer `{id, name, text, level, kind, tags}` fra Task 1.
- Produces:
  - `RenderedPack` utvides med `kind: "overview"|"source"` og `tags: string[]`.
  - `coercePacks`: `kind = rec.kind === "overview" ? "overview" : "source"`; tags saneres med samme regex/tak som klienten (`/^[a-zæøåa-z0-9_-]{1,24}$/`, max 8, lowercase).
  - Overskrift i renderPacksBlock: `### ${p.kind === "overview" ? "Tema (samling)" : "Enkeltkilde"}: ${p.name} (id: ${p.id})${tagSuffix}` der `tagSuffix` = ` [tag1] [tag2]` (tom streng uten tags).
  - Ny forklaringssetning i blokk-ingressen: «Et TEMA (samling) er en meny over kilder — hent detaljer med get_pack ved behov. En ENKELTKILDE er en direkte instruks om én kilde.»
  - Ny konstant `MIKRO_MAKRO` (norsk, samme stil som naboblokkene): «## Mikro- vs. makrodata\n\nKilder er merket [mikro] (individdata: surveyer, registerdata på personnivå) eller [makro] (aggregert statistikk). Bruk [mikro]-kilder KUN når spørsmålet gjelder individnivå (fordelinger innen undergrupper, surveysvar, personnivå-sammenhenger) eller brukeren ber om det — ellers foretrekk [makro]-kilder.» Legges i `blocks`-lista i buildSvarSystem rett FØR `registryBlock` (kun data-ruten, dvs. i den eksisterende blocks-konstruksjonen på ~L874).
  - GET_PACK_TOOL.description omskrives: «Hent FULL tekst for en kildepakke: et TEMA (samling — overskrift '### Tema (samling): navn (id: <id>)') eller en ENKELTKILDE ('### Enkeltkilde: …'), eller en enkeltkilde referert i et tema med '(id: …)'-notasjon. Gjelder også brukerens egne kilder.»
  - `renderRegistryBlock`: hver kildelinje får ` [tag1] [tag2]`-suffiks når registerposten har `tags`.
- [ ] **Step 1:** Grep etter eksisterende testmønster (`grep -rn "Deno.test" netlify/ tests/`); skriv/utvid test for coercePacks (kind-default 'source', tags-sanering) hvis mønster finnes.
- [ ] **Step 2:** Implementer endringene over.
- [ ] **Step 3:** `deno check netlify/edge-functions/svar.ts` (og evt. testkommando fra step 1) — PASS.
- [ ] **Step 4: Commit** `git commit -m "feat: tema/enkeltkilde + tags i prompten, mikro/makro-rutingsregel"`

### Task 3: Innhold — tags i data/data-sources.json og data/packs/index.json

**Files:**
- Modify: `data/data-sources.json` (alle poster får `tags`), `data/packs/index.json` (tags der det er opplagt)
- Test: `tests/js/packs-lint.test.js` (utvid linten til å validere tags-formatet der den validerer andre felt)

**Interfaces:**
- Produces: `tags`-felt konsumert av Task 1/2-koden. Regler: alle registerposter får `mikro` ELLER `makro` (mikrodatakilder: ess, census/PUMS, nchs, wbmicro, cessda, dhs, hf og andre survey/individnivå-poster; makro: ssb, eurostat, worldbank, oecd, dbnomics, statfin, fhi og øvrige aggregerte). Landsspesifikke kilder får landtag (`norge`, `finland`, `usa` …). Pakkeposter i index.json: mikro/makro + land der beskrivelsen gjør det opplagt; ellers ingen tags (tomt felt utelates).
- [ ] **Step 1:** Les gjennom BEGGE filene i sin helhet; klassifiser hver post ut fra `beskrivelse`/`description` (individnivå → mikro). Usikre poster: makro hvis aggregert statistikk-API, ellers dropp taggen — ALDRI gjett mikro.
- [ ] **Step 2:** Utvid packs-lint-testen med tags-validering (samme regex/tak som Task 1) og kjør `node --test tests/js/packs-lint.test.js` — PASS.
- [ ] **Step 3: Commit** `git commit -m "data: mikro/makro/land-tags i kilderegisteret og pakkekatalogen"`

### Task 4: Kilde-modalens markup + CSS (uten JS-logikk)

**Files:**
- Modify: `index.html` (ny `#sourcesBackdrop`-modal; fjern `#countryBackdrop` (L459–474); rydd `#profilesBackdrop` for kilde-knappene `sourcesImportBtn`/`sourcesDeselectBtn`/`sourcesRemoveImportedBtn`/`sourcesInfo`/`sourcesHelp` (L479–501))
- Modify: `css/ask.css` (faner, chips, badges, tags-felt)

**Interfaces:**
- Produces (id-kontrakt som Task 5 wirer):

```html
<div class="ai-modal-backdrop" id="sourcesBackdrop">
  <div class="ai-modal">
    <h3 data-i18n>Sources</h3>
    <div class="ai-modal-help" data-i18n>Pick which sources the AI may use. Topics are curated menus of sources; single sources are direct instructions.</div>
    <div class="sources-top">
      <label for="sourcesCountrySelect" data-i18n>Country</label>
      <select id="sourcesCountrySelect"></select>
      <label class="sources-discover"><input type="checkbox" id="sourcesDiscoverCb"> <span data-i18n>Extended internet search — also look beyond the built-in sources (slower)</span></label>
    </div>
    <div class="sources-tabs" role="tablist">
      <button type="button" class="sources-tab" id="sourcesTabOverview" data-i18n>Topics</button>
      <button type="button" class="sources-tab" id="sourcesTabSource" data-i18n>Single sources</button>
    </div>
    <input type="search" id="sourcesSearch" class="sources-search" data-i18n-placeholder placeholder="Search…">
    <div id="sourcesTagChips" class="sources-tag-chips"></div>
    <div id="sourcesList" class="profiles-list sources-scroll"></div>
    <div id="sourcesInfo" class="sources-info" hidden></div>
    <div id="sourcesEdit" hidden>
      <div class="sources-kind-choice" id="sourcesKindChoice">
        <label><input type="radio" name="sourceKind" value="source" checked> <span data-i18n>Single source</span></label>
        <label><input type="radio" name="sourceKind" value="overview"> <span data-i18n>Topic (collection)</span></label>
      </div>
      <label for="sourceName" data-i18n>Name</label>
      <input type="text" id="sourceName" maxlength="60">
      <label for="sourceText" data-i18n>Text added to every ask</label>
      <textarea id="sourceText" rows="7" maxlength="40000"></textarea>
      <label for="sourceTags" data-i18n>Tags (comma-separated)</label>
      <input type="text" id="sourceTags">
      <div class="sources-tag-quick" id="sourcesTagQuick"></div>
      <details id="sourcePreviewWrap"><summary data-i18n>Preview</summary><div id="sourcePreview" class="ask-md-preview"></div></details>
    </div>
    <div class="ai-modal-actions">
      <button type="button" class="ai-modal-btn" data-i18n id="sourcesImportBtn">Import new sources…</button>
      <button type="button" class="ai-modal-btn" data-i18n id="sourcesNewBtn">New…</button>
      <button type="button" class="ai-modal-btn" data-i18n id="sourceDeleteBtn" hidden>Delete</button>
      <button type="button" class="ai-modal-btn primary" data-i18n id="sourceSaveBtn" hidden>Save</button>
      <button type="button" class="ai-modal-btn" data-i18n id="sourcesCloseBtn">Close</button>
    </div>
  </div>
</div>
```

- CSS (nye klasser i css/ask.css, gjenbruk eksisterende variabler): `.sources-tabs` (flex, gap 6px, margin 10px 0 6px), `.sources-tab` (pille m/ `border:1px solid var(--border)`, `border-radius:999px`, padding 5px 14px; `.active` → `background: var(--accent); color:#fff; border-color: var(--accent)`), `.sources-tag-chips`/`.sources-tag-quick` (flex-wrap, gap 6px, margin 6px 0), `.sources-chip` (liten pille, `.active` som fanen), `.sources-badge` (11px, `border-radius:4px`, padding 1px 6px, `background: var(--bg-code)`; `.sources-badge-mikro` → aksentfarget kant/tekst; `.sources-badge-makro` → grønnlig via `color-mix(in srgb, green 60%, var(--text))`-stil som matcher temaet), `.sources-top` (flex, gap 10px, align-items center; select maks ~180px), `.sources-kind-choice` (flex gap 14px, margin 8px 0). `#sourcesBackdrop`-listen gjenbruker `.sources-row`/`.sources-name`/`.sources-scroll`.
- `#packsExploreBackdrop { z-index: 301 }` består (Explore åpner OVER den nye modalen).
- [ ] **Step 1:** Legg inn markupen, fjern `#countryBackdrop`, rydd `#profilesBackdrop` (kilde-elementene ut; behold profil-feltene urørt).
- [ ] **Step 2:** CSS-klassene over.
- [ ] **Step 3:** Sanity: åpne `index.html` i nettleser (eller node-DOM-test i Task 5) — ingen JS-feil fra manglende id-er er forventet ENNÅ (gammel JS refererer fjernede id-er med null-guards; `profiles.js` sin openModal-source-gren ryddes i Task 5/7 — verifiser at boot ikke kaster med `node --test tests/js/ask-view.test.js`).
- [ ] **Step 4: Commit** `git commit -m "feat: kilde-modalens markup + CSS (faner, chips, badges)"`

### Task 5: js/sources-modal.js — dialoglogikken + fjern popover/landmodal-JS

**Files:**
- Create: `js/sources-modal.js` (+ `<script>`-tag i index.html rett etter packs.js)
- Modify: `js/packs.js` (SLETT DOM-delene: renderInto/PacksUi, renderLibrary/SourcesUi, rydde-knappene, landmodal-wiringen L842–928; BEHOLD Explore-modalen og boot; flytt `renderExploreList`-gruppering til å bruke tag-filterhjelperen)
- Delete: `js/context-pill.js` (+ script-tag); `#askContextMenu`-markup i index.html (L224–231) fjernes; `#askContextBtn` beholdes med statisk «Sources»-label (fjern `#askContextLabel`-spannet eller la det stå med fast tekst via data-i18n)
- Test: Create `tests/js/sources-modal.test.js`; Modify `tests/js/context-pill-dom.test.js` (slettes), `tests/js/packs.test.js` (renderInto-avhengige deler)

**Interfaces:**
- Consumes: `Packs.list/listRegistry/listCommunity/countryOptions/countryPackId/effectiveIds/describe/importPack/ensureSelected`, `Profiles.packsState/togglePack/toggleSourceOff/countryState/setCountry/create/update/remove/get/cleanTags/onChange`, `window.mdAskMarkdown`.
- Produces:
  - `window.SourcesModal = { open: function(), refresh: function() }` — `open()` kalles av sidemeny-knappen (Task 6) og pillen; `refresh()` no-op-sikker.
  - Ren, node-testbar filterfunksjon eksportert via `module.exports = { filterEntries: filterEntries }`:

```js
// entries: [{id,name,kind,tags,…}], state: {tab:'overview'|'source', q:'', tags:['mikro']}
// → kun entries med riktig kind, navn-match på q (case-insensitivt delstreng),
//   og ALLE valgte tags til stede (OG-semantikk). Valgte (checked) sorteres først, ellers navnesortering.
function filterEntries(entries, state, checkedIds) { … }
```

  - Modal-tilstand: `tab` (default `'source'`... nei: default `'overview'` — temaene er færrest og mest kuraterte; VALGT: default-fane = den fanen som har flest VALGTE kilder, ellers 'overview'), `q`, `activeTags` (Set), `selectedInfoId`, `editingId` (null | 'NY' | profilId).
  - Liste-elementene per fane: temaer = `Packs.list()` m/ kind 'overview' + kuraterte community-oversikter er alt i brukerens bibliotek etter import — kuraterte IKKE-importerte vises IKKE her (de bor i Import-utforskeren, uendret arkitektur). Enkeltkilder-fanen = `Packs.list()` kind 'source' + `Packs.listRegistry()` (innebygde, med «innebygd»-badge, toggle = `Profiles.toggleSourceOff`).
  - Rad: checkbox (togglePack / toggleSourceOff), navn (klikk → infopanel m/ describe(); Rediger/Slett kun for `user:`), badges: kind-fanen gjør kind-badge overflødig; tags rendres som `.sources-badge` (+ `sources-badge-mikro/-makro` for de to), `(innebygd)`/`(min)`-merke.
  - Tag-chips: unike tags fra gjeldende fanes entries, hyppigst først, max 12 chips; klikk toggler i `activeTags`.
  - Land-dropdown: options = «Automatic (from your language)» (value `auto`), «None (international)» (value `none`), deretter `Packs.countryOptions()` (value `cc:CC`); change → `Profiles.setCountry(...)` + `Packs.onLangChange(localeCandidates)` for auto (samme kall som gamle renderCountryRows, packs.js L890–902 — flytt localeCandidates-logikken hit eller eksponer den fra packs.js som `Packs.localeCandidates()`).
  - Discover-checkbox: leser/skriver localStorage `md_ask_discover` (literal nøkkel, samme som ai-chat.js payload — IKKE endre navnet).
  - Lag ny/rediger: `sourcesNewBtn` → vis `#sourcesEdit` med kind-radio (default 'source'), tomme felter; Save → `Profiles.create(name, text, 'source', {source:'own', kind:<radio>}, Profiles.cleanTags(tagsInput.value))` + `Profiles.togglePack('user:'+id)`; Rediger → prefill (kind-radio disabled? NEI — redigerbar, oppdaterer origin.kind via `Profiles.update(id, {name, text, tags})` + origin-oppdatering: utvid `Profiles.update` til å ta `originKind` i fields og skrive `origin.kind`). Hurtigchips under tags-feltet: `mikro`, `makro` + landets navn — klikk appender til feltet.
  - «Importer nye kilder…» → `openExplore()` (behold funksjonen i packs.js, eksponer som `Packs.openExplore = openExplore` i DOM-delen som blir igjen, eller flytt hele Explore-wiringen inn i sources-modal.js — VALGT: flytt Explore-wiringen (L745–840) inn i sources-modal.js så all kilde-UI bor i én fil; packs.js beholder kun data-API + boot).
  - Re-render på `Profiles.onChange` når modalen er åpen.
  - Pillen (`#askContextBtn`): click → `SourcesModal.open()`. Statisk tekst.
- [ ] **Step 1:** Skriv `tests/js/sources-modal.test.js` for `filterEntries` (fane-filter, søk, OG-tags, valgte-først-sortering) — FAIL.
- [ ] **Step 2:** Implementer `js/sources-modal.js` (IIFE + document-guard + module.exports for ren del, samme idiom som packs.js). Flytt Explore-wiringen. Slett popover-/landmodal-/manager-DOM-koden fra packs.js og hele context-pill.js. Oppdater script-tags i index.html.
- [ ] **Step 3:** Slett `tests/js/context-pill-dom.test.js`; oppdater `tests/js/packs.test.js` (fjern renderInto-avhengigheter). `node --test tests/js/` — PASS.
- [ ] **Step 4:** `Profiles.update`-utvidelsen (originKind) testes i `tests/js/profiles.test.js`.
- [ ] **Step 5: Commit** `git commit -m "feat: kilde-dialog med faner/søk/tag-filter; popover og landmodal fjernet"`

### Task 6: Sidemeny — omrokkering, «Kilder»-knapp, konto nederst

**Files:**
- Modify: `index.html` (L108–202), `js/profiles.js` (renderSideLabel → statisk), `js/packs.js` (renderCountryLabel-rester fjernes)

**Interfaces:**
- Produces ny rekkefølge i `#askSidebar`: side-head → `#askProfileBtn` (label: statisk `Instructions`-nøkkel, person-ikon beholdes) → NY `#askSourcesBtn` (database-ikonet fra gamle `.ask-ctx-head`-svg; label `Sources`; click → `SourcesModal.open()`) → `#askNewBtn` → examples-wrap → `#askAboutBtn` → `#askSwitchCode` → `#askSettingsBtn` → `#askHistoryWrap` → `.ask-side-bottom` (KUN login/konto-blokka).
- `#askCountryBtn` fjernes helt (markup + `renderCountryLabel`/`askCountryBtn`-wiring i packs.js er alt fjernet i Task 5 — verifiser).
- `#askProfileLabel`-span beholdes som node men får statisk tekst (profiles.js renderSideLabel forenkles til `sideLabel.textContent = T('Instructions')` — behold funksjonen så onChange-koblingen ikke knekker, eller fjern begge).
- [ ] **Step 1:** Flytt markup-blokkene; legg til `#askSourcesBtn`; wire click i sources-modal.js init (`document.getElementById('askSourcesBtn')` med null-guard).
- [ ] **Step 2:** Forenkle renderSideLabel. `node --test tests/js/` — PASS.
- [ ] **Step 3:** Visuell sjekk (dev-server): rekkefølge, thin-modus (ikonene), mobil-skuffen.
- [ ] **Step 4: Commit** `git commit -m "feat: sidemeny omrokkert — alle valg over historikken, konto alene nederst"`

### Task 7: «Instruksjoner»-modalen — rename + ny hjelpetekst, modalKind fjernes

**Files:**
- Modify: `js/profiles.js` (L361–523: modalKind-grener ut), `index.html` (`#profilesBackdrop`-tekster)

**Interfaces:**
- Consumes: Task 4 fjernet kilde-elementene fra modalen; Task 5 fjernet SourcesUi.
- Produces: `P.openModal = function ()` (ingen opts — prefill-flyten for «Save as source» i ask-view.js L864–872 peker nå på kilde-modalen: endre til `window.SourcesModal.openWithPrefill({name, text})` — legg til `openWithPrefill` i SourcesModal som åpner modalen rett i edit-visning med prefill og kind-default 'source').
- Nye tekster (nøkkel → no):
  - Tittel `Instructions` → «Instruksjoner»
  - Hjelp: `Instructions are added to every question you ask. Use them to steer how answers are made — language, form, method or emphasis. They can adjust or override the app's default behaviour. Examples: «Always answer briefly, in Norwegian», «Always show uncertainty and cite sources», «Use R instead of Python», «Prefer tables over charts», «I am a researcher — use technical terminology».` → tilsvarende norsk fra spec §5.
  - `New profile` → `New instruction` / «Ny instruksjon»; `No profile` → `No instruction` / «Ingen instruksjon»; sidemeny-title-attributt oppdateres.
- Payload-feltet `preferences` og serverblokka er UENDRET.
- [ ] **Step 1:** Fjern modalKind-variabelen og alle `modalKind === 'source'`-grener; oppdater tekster/nøkler i markup + profiles.js; `Profile applied: {name}`-prosesslinjen i ask-view.js → `Instructions applied: {name}`.
- [ ] **Step 2:** Wire ask-view.js «Save as source»-delegaten til `SourcesModal.openWithPrefill`; implementer openWithPrefill i sources-modal.js.
- [ ] **Step 3:** `node --test tests/js/profiles.test.js tests/js/ask-view.test.js` — PASS.
- [ ] **Step 4: Commit** `git commit -m "feat: Instruksjoner (tidl. Profil) — ren profilmodal, ny hjelpetekst"`

### Task 8: Svar-output — knapper etter ferdig svar, rerun ut, «Se kode og data», typografi

**Files:**
- Modify: `index.html` (L252–257), `js/ask-view.js`, `css/ask.css`
- Test: `tests/js/ask-view.test.js`

**Interfaces:**
- Produces:
  - `.ask-answer-actions` får `hidden` i markup; ask-view.js viser den i `showAnswer()` (svaret er ferdig — både ferske og historikk-gjenopprettede går den veien) og skjuler den øverst i `runAskFlow()` (ved L995-blokka) og i `askNewBtn`-handleren. Variabel `actionsRow = document.getElementById('askAnswerActions')` — gi diven `id="askAnswerActions"`.
  - MEN: `showAnswer` kalles også for språk-ruten/nøkkelfeil — det er OK (svaret er «ferdig»). `onDelta`-strømming rører ALDRI actionsRow.
  - `#askRerunBtn` + `rerunRestored()` + `rerunBtn`-referanser (L770–851, 898, 1003) fjernes helt. `restoreEntry` viser actionsRow (via showAnswer — sjekk at restoreEntry bruker showAnswer: ja, L784).
  - `View code` → nøkkel `View code and data` (no: «Se kode og data») — id uendret.
  - Typografi i css/ask.css under `.ask-answer`:

```css
.ask-answer { font-size: 14.5px; line-height: 1.6; }
.ask-answer p { margin: 0 0 10px; }
.ask-answer ul, .ask-answer ol { margin: 0 0 10px; padding-left: 22px; }
.ask-answer li { margin-bottom: 4px; }
.ask-answer h2 { font-size: 16px; margin: 16px 0 8px; }
.ask-answer h3 { font-size: 14.5px; margin: 12px 0 6px; }
.ask-answer table { border-collapse: collapse; margin: 10px 0; max-width: 100%; display: block; overflow-x: auto; }
.ask-answer th, .ask-answer td { border: 1px solid var(--border); padding: 5px 10px; font-size: 13.5px; }
.ask-answer th { background: var(--bg-code); }
.ask-answer code { background: var(--bg-code); border-radius: 4px; padding: 1px 5px; font-size: 13px; }
.ask-answer pre { background: var(--bg-code); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
.ask-answer pre code { background: none; padding: 0; }
.ask-answer blockquote { border-left: 3px solid var(--border); margin: 10px 0; padding: 2px 12px; color: var(--text-muted); }
```

- [ ] **Step 1:** Utvid `tests/js/ask-view.test.js` hvis den dekker knappe-synlighet (les fila først; ellers manuell verifisering i Task 13).
- [ ] **Step 2:** Implementer; fjern rerun-koden.
- [ ] **Step 3:** `node --test tests/js/ask-view.test.js` — PASS. Regenerer IKKE i18n-fasiten ennå (Task 12).
- [ ] **Step 4: Commit** `git commit -m "feat: svar-knapper først ved ferdig svar; rerun fjernet; svar-typografi"`

### Task 9: Tekster — overskrift + editor-returknapp

**Files:**
- Modify: `index.html` (L211), `js/ask-view.js` (L581–592)

**Interfaces:**
- `Ask with data` → ny nøkkel `Get answers based on data` (no: «Få svar basert på data») — endre BÅDE markup-nøkkelen og alle ordbøker som hadde gammel nøkkel (gjøres fullt i Task 12; her: en.js? en.js trengs ikke for engelske nøkler — kun no.js oppdateres nå).
- injectTopbarSwitch: `btn.textContent = t('Back to Ask'); btn.title = t('Back to the ask view');` — bruk ask-viewens `t` (finnes i scope, se L604-idiomet; funksjonen kalles ved init så språket er lastet). no: «Gå tilbake til Ask» / behold title-oversettelse.
- [ ] **Step 1:** Implementer; legg nøklene i no.js; slett gammel `Ask with data`-linje i alle 13 ordbøker (mekanisk sed-jobb — trygt siden nøkkelen forsvinner fra fasiten i Task 12).
- [ ] **Step 2:** `node --test tests/js/i18n.test.js` — PASS.
- [ ] **Step 3: Commit** `git commit -m "feat: «Få svar basert på data» + «Gå tilbake til Ask» (i18n)"`

### Task 10: Plotly — deep-merge + automargin + prompt-instruks

**Files:**
- Modify: `index.html` (mdRenderPlotlyFigure, L6343–6401), `js/ui.js` (L1882–1888), `netlify/edge-functions/_lib/svar-prompt.ts` (MODE_PY L775–779)
- Test: `tests/js/ui.test.js` (figure-layout-delen hvis dekket), pytest `tests/test_plotly_show_patch.py` (skal fortsatt passere uendret)

**Interfaces:**
- I mdRenderPlotlyFigure: legg `automargin: true` i baseLayout.xaxis/yaxis, og erstatt `Object.assign(baseLayout, spec.layout || {})` med seksjonsvis deep-merge:

```js
function mergeLayoutSection(base, over) {
  if (!over) return base;
  return Object.assign({}, base, over);
}
var spec_layout = spec.layout || {};
var layout = Object.assign({}, baseLayout, spec_layout);
['margin', 'xaxis', 'yaxis', 'font', 'legend', 'title'].forEach(function (k) {
  if (baseLayout[k] && typeof baseLayout[k] === 'object') {
    layout[k] = mergeLayoutSection(baseLayout[k], spec_layout[k]);
  }
});
```

  (modell-satte verdier vinner per nøkkel, men automargin/gridfarger overlever når modellen bare setter f.eks. `xaxis.title`).
- ui.js: `xaxis: { automargin: true }, yaxis: { automargin: true }` inn i default-objektet (L1882) med samme seksjonsmerge for xaxis/yaxis.
- MODE_PY «DESIGN OUTPUT FOR SVARET»-avsnittet får tillegg: «Bruk plotly.express der det rekker (px håndterer akser/labels automatisk); hold akse- og tick-labels korte; ved mange serier: legend under plottet (legend=dict(orientation="h", yanchor="top", y=-0.25)).»
- [ ] **Step 1:** Implementer alle tre.
- [ ] **Step 2:** `node --test tests/js/ui.test.js` + `python3 -m pytest tests/test_plotly_show_patch.py -q` — PASS. `deno check netlify/edge-functions/svar.ts`.
- [ ] **Step 3: Commit** `git commit -m "fix: plotly automargin + seksjonsvis layout-merge; px-instruks i prompten"`

### Task 11: Innstillinger — leverandør før nøkkel + egne nøkler v1

**Files:**
- Modify: `index.html` (L510–551: rekkefølge + egne-nøkler-seksjon), `js/ai-chat.js` (syncProviderFields L1346, openSettings/saveSettings L1355–1400, renderSourceKeys-naboskap L1287; payload L691 + ny user_keys L698-området; KEYS-injeksjon i `window.mdAskExecuteScript` L1534)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (+ svar.ts hvis coercing bor der): `renderUserKeysBlock`
- Test: `tests/js/ai-chat-validators.test.js` (hvis validator-mønster passer), `tests/js/run-kontrakt.test.js` (payload-kontrakten — les fila og utvid med user_keys)

**Interfaces:**
- Ny modal-rekkefølge: Språk → `AI-leverandør`-select → betinget: (anthropic) `#aiCfgByokStored` + Anthropic-nøkkelfeltet; (ellers) URL/modell/nøkkel — dvs. flytt L522–526-blokka inn under provider-blokka og la `syncProviderFields()` toggle begge veier (`anthropicFields.style.display = custom ? 'none' : ''`). → `#aiCfgSourceKeys` → NY `#aiCfgUserKeys`.
- Egne nøkler-markup:

```html
<div id="aiCfgUserKeys" style="margin-bottom:18px;">
  <label data-i18n>Your own keys</label>
  <div class="ai-modal-help" data-i18n>Add a key for any service you want the AI to use — e.g. kaggle. The note tells the AI how to use it; the key itself is available to generated code as KEYS['name'] and is never shown to the AI.</div>
  <div id="aiCfgUserKeyList"></div>
  <button type="button" class="ai-modal-btn" id="aiCfgUserKeyAdd" data-i18n>Add your own key</button>
  <div id="aiCfgUserKeyForm" hidden>
    <input type="text" id="userKeyName" data-i18n-placeholder placeholder="service name, e.g. kaggle" autocomplete="off">
    <input type="password" id="userKeyValue" data-i18n-placeholder placeholder="paste key" autocomplete="off" style="margin-top:4px;">
    <textarea id="userKeyNote" rows="2" data-i18n-placeholder placeholder="optional note and/or URL: how should this key be used?" style="margin-top:4px;"></textarea>
    <button type="button" class="ai-modal-btn" id="userKeySave" data-i18n style="margin-top:4px;">Save key</button>
  </div>
</div>
```

- Lagring: `md_user_keys` = JSON-liste `[{id:'usr-<slug>', navn, notat}]` der slug = navn lowercased `[a-z0-9_-]`, kollisjon → suffiks `-2`; nøkkelverdien: `window.Keys.set(id, value)`. Liste-rendering m/ «nøkkel registrert»-hint + Fjern-knapp (`Keys.remove(id)` + fjern metadata) — samme mønster som renderSourceKeys (L1287–1324).
- Payload (runSvarLoop body): `user_keys: (mdUserKeysMeta().length ? mdUserKeysMeta().map(function(k){return {navn:k.navn, notat:k.notat};}) : undefined)` — ALDRI nøkkelverdien. Hjelper `mdUserKeysMeta()` leser md_user_keys med try/catch.
- Server: `coerceUserKeys(u)` (max 10, navn ≤32 `[a-z0-9_-]`, notat ≤500 tegn) + blokk:

```
## Brukerens egne API-nøkler

Brukeren har lagt inn egne nøkler for tjenestene under. Selve nøkkelen er
tilgjengelig i generert Python-kode som KEYS['<navn>'] (en dict som finnes i
kjøremiljøet) — den er ALDRI synlig for deg. Bruk notatet til å forstå
hvordan tjenesten nås. CORS kan blokkere direkte kall fra nettleseren —
si ærlig fra hvis kallet feiler på nettverksnivå.

- kaggle: <notat>
```

  Renderes i buildSvarSystem (data-ruten, etter packsBlock) når lista er ikke-tom; `body.user_keys` sendes inn via svar.ts på samme måte som `preferences`.
- KEYS-injeksjon: i `window.mdAskExecuteScript` (ai-chat.js L1534), KUN python-modus: prepend

```js
var userKeys = {};
(mdUserKeysMeta()).forEach(function (k) {
  var v = window.Keys && window.Keys.get(k.id);
  if (v) userKeys[k.navn] = v;
});
if (Object.keys(userKeys).length && mode === 'python') {
  script = 'KEYS = ' + JSON.stringify(userKeys) + '\n' + script;
}
```

  (JSON.stringify av strenger er gyldig Python-dict-literal for enkle nøkler; nøkler/verdier med `'`/newline dekkes av JSON-escaping — men merk: Python tolker `\uXXXX` annerledes i vanlige strenger? Nei — JSON-escapede `"..."`-strenger med `\uXXXX` er gyldige Python-string-literals med samme betydning. OK.)
- [ ] **Step 1:** Les `tests/js/run-kontrakt.test.js`; utvid med user_keys-kontrakten (payload inneholder navn+notat, ALDRI value) — FAIL.
- [ ] **Step 2:** Implementer klientdelen (markup-rekkefølge, form, lagring, payload, injeksjon).
- [ ] **Step 3:** Implementer serverdelen; `deno check netlify/edge-functions/svar.ts`.
- [ ] **Step 4:** `node --test tests/js/` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: innstillinger-rekkefølge + egne nøkler v1 (KEYS-injeksjon, promptblokk)"`

### Task 12: i18n-sweep — alle nøkler i 13 ordbøker + ny fasit

**Files:**
- Modify: `tools/list_i18n_keys.mjs` (region-markørene: `id="profilesBackdrop"`-regionen består; legg til `id="sourcesBackdrop"`-region — les region()-listen L23–29 og utvid), alle `js/i18n/*.js`, `tools/ask_i18n_keys.json`
- Test: `tests/js/i18n-dicts.test.js`, `tests/js/i18n.test.js`

**Interfaces:**
- Consumes: alle nye nøkler fra Task 4–11 (grep `data-i18n`/`T('`/`t('` i endrede filer).
- [ ] **Step 1:** Oppdater region-listen i list_i18n_keys.mjs (sourcesBackdrop-blokka + evt. flyttede grenser); kjør `node tools/list_i18n_keys.mjs` → ny fasit.
- [ ] **Step 2:** `node --test tests/js/i18n-dicts.test.js` → FAIL med liste over manglende nøkler per språk.
- [ ] **Step 3:** Legg inn alle manglende nøkler i de 12 ordbøkene (+ sjekk en.js-medlemskap for editor-filtreringen); slett foreldreløse nøkler (gamle: `Ask with data`, `Manage sources…`, `Import shared sources…`, `Deselect all`, `Remove imported`, `New source`, `New profile`, `Profile`, `Profile: {name}`, `Country*`-nøklene, `Run code again`, `View code`, `Topic overviews`, `Individual sources`, `My sources`, `No profile`, popover-tekstene). Oversettelsene skal være reelle (ikke engelsk kopi) — bruk eksisterende ordbøkers stil.
- [ ] **Step 4:** `node --test tests/js/i18n-dicts.test.js tests/js/i18n.test.js` — PASS.
- [ ] **Step 5: Commit** `git commit -m "i18n: nye ask-nøkler i alle 13 ordbøker + regenerert fasit"`

### Task 13: Full verifisering — testsuiter + live smoke

**Files:** ingen nye (fikser går i filene over).

- [ ] **Step 1:** `node --test tests/js/` og `python3 -m pytest tests/ -q` — ALT grønt.
- [ ] **Step 2:** `deno check netlify/edge-functions/svar.ts`.
- [ ] **Step 3:** Start `netlify dev` (RESTART hvis den kjørte — edge-TS-cache) og gå gjennom smoke-lista fra spec §Verifisering i Chrome m/ hard reload: sidemeny-rekkefølge; Kilder-dialog (faner m/antall, søk, tag-chips, badges, land-dropdown, discover, lag ny m/type+tags, rediger, slett, import); Instruksjoner-modal; svar-flyt (knapper skjult under streaming, synlige etter; «Se kode og data» åpner editor; «Gå tilbake til Ask» tilbake); ny overskrift; innstillinger (leverandør øverst, betingede felt, egen nøkkel ende-til-ende med dummy — sjekk i Network-fanen at `user_keys` bærer navn+notat og ALDRI verdien, og i konsollen at generert script har `KEYS = {...}` prepend’et); ett dataspørsmål som gir plotly-figur med lange labels (ingen overlapp).
- [ ] **Step 4:** Fiks alt som ryker; re-kjør.
- [ ] **Step 5: Commit** eventuelle fikser: `git commit -m "fix: smoke-funn fra kilde/output-runden"`.

---

## Self-review (utført ved skriving)

- **Spec-dekning:** §1→Task 6; §2→Task 4+5; §3→Task 1; §4→Task 2(+3); §5→Task 7; §6→Task 8; §7→Task 9(+12); §8→Task 10; §9→Task 11; §10 (tags)→Task 1–5; verifisering→Task 13. Ingen gap funnet.
- **Rekkefølge:** datamodell (1) → server (2) → innhold (3) → UI-markup (4) → UI-logikk (5) → sidemeny (6) → instruksjoner (7) → output (8) → tekster (9) → plotly (10) → innstillinger/nøkler (11) → i18n (12) → smoke (13). Task 4/5-splitten lar markup-reviewen skje uavhengig av logikken.
- **Typekonsistens:** `kind: 'overview'|'source'` overalt (list/compose/coercePacks/renderPacksBlock); `cleanTags` én definisjon (profiles.js), serveren har egen TS-sanering med samme regler; `SourcesModal.open/openWithPrefill/refresh` konsumeres av Task 6/7.
