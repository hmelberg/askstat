# Metadata-modal + navn-toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flytt metadata fra inline sidebar-container til en egen modal (ⓘ), gjør variabellisten til en navn-toggle, flytt datatabellen til et ⊞-ikon, døp om «Fra fellesskapet» → «Kommentarer», og gjør giscus tema-bevisst — per spec `docs/superpowers/specs/2026-07-26-metadata-modal-og-navn-toggle-design.md`.

**Architecture:** Gjenbruker all eksisterende rendring (MetaInfo, `metaRenderDataset`/`metaRender`, `/api/metadata`, giscus) uendret — endrer bare MÅL-noden (inline-container → modal-body) og klikk-wiringen i `index.html`. Én ny modal-overlay (bygget på `var-detail-overlay`-mønsteret). `js/comments.js` får tema/språk-parametrisering.

**Tech Stack:** Vanilla JS (IIFE-moduler), giscus, node --test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-metadata-modal-og-navn-toggle-design.md`. Forrige leveransers spec-er (`2026-07-25-metadata-sidebar-design.md`, `2026-07-26-metadata-ui-datasett-flate-design.md`) gjelder fortsatt for alt som IKKE endres her.
- **Commit lokalt kun — ALDRI push** (`feedback-openstat-no-autopush`).
- Enhetlig rad-modell (spec §1): `navn · ⊞(kun datasett) · ⓘ`. Navn-klikk = veksle variabelliste (skjult som standard, klikk igjen skjuler). ⊞ = datatabell (`showIndividataModal`, kun datasett). ⓘ = metadata-modal (begge flater).
- Metadata-modal (spec §2): bygget på `var-detail-overlay`-mønsteret (id `varDetailOverlay` ~index.html:495 — header m/ tittel + lukk-knapp, `role="dialog"`, Esc/backdrop lukker). Innhold rendres av eksisterende `metaRenderDataset(container, ds, prov, cacheKey)` (~index.html:4603) og `metaRender(container, key, entry, varName)` (~index.html:7951) — bare `container` blir modal-body i stedet for inline-div. Lazy+cache (`window.__datasetMetaCache`, `entry.metaInfo`) uendret.
- Stale-datasett: navn-klikk på stale rad gir fortsatt `showStaleRunExplanation` (~index.html:4444). ⓘ på stale rad ÅPNER metadata-modalen (metadata er motor-uavhengig); ⊞ på stale rad gir samme kjør-forklaring (ingen data).
- «Fra fellesskapet» → «Kommentarer»: i `metaCommunityFrame` (~index.html:4532) byttes `t('Fra fellesskapet')` → `t('Kommentarer')`; ny en.js-nøkkel.
- giscus tema (spec §3): `js/comments.js` `attrs(target, opts)` bruker `opts.theme` når gitt; kallstedene sender tema utledet fra `document.body.getAttribute('data-theme')` (`light`/`dark` → giscus `data-theme` `light`/`dark`). Språk `no` KUN hvis giscus støtter det (verifiser giscus' lokalliste; ellers `en`). Standardverdien i modulen forblir `preferred_color_scheme` når `opts.theme` ikke gis.
- UI-strenger på norsk via `t('…')`, engelsk nøkkel i `js/i18n/en.js` (mønster fra tidligere commits). All egen-interpolert HTML gjennom `escapeHtml`; MetaInfo-output er ferdig-escapet.
- Testkommandoer (repo-rot): `node --test 'tests/js/*.test.js'`, `cd netlify/edge-functions && deno test --allow-all _lib/`, `python3 -m pytest tests/ -q`.
- Verifisering av index.html-endringer: hard-reload m/ ignoreCache; KLIKK-basert smoke (ikke programmatiske funksjonskall som omgår wiring). node --check på script-blokka (ekstraher og kjør) fanger syntaksfeil.
- Ankere (verifisert 2026-07-26): `updateSidebarDatasets` ~4368, datasett-rad-HTML ~4418-4425, datasett-klikk-wiring ~4464-4480, `metaToggleDataset` ~4561, `metaPopulateDataset` ~4579, `metaRenderDataset` ~4603, `showIndividataModal` ~4119, `showVariableDetail` ~4422-området (modal `varDetailOverlay`), `metaCommunityFrame` ~4532, `closeVariableDetailModal` ~4037, `updateSidebarSources` ~8042, `metaRender` ~7951, `metaToggleSource` ~8011, `metaToggleVar` ~8025, kilde-delegering ~8050-8069, `getShowIndividata` (alltid true) ~1355, tema `body[data-theme="light|dark"]` (app.css:5-6), `js/comments.js` `attrs` ~ toppen.

---

### Task 1: giscus tema/språk + «Kommentarer»-omdøping

**Files:**
- Modify: `js/comments.js`
- Modify: `tests/js/comments.test.js`
- Modify: `index.html` (`metaCommunityFrame` ~4532)
- Modify: `js/i18n/en.js`

**Interfaces:**
- `Comments.attrs(target, opts)` støtter allerede `opts.theme`/`opts.lang` (fra forrige leveranse). Ingen signaturendring — denne oppgaven verifiserer/utvider tema-språk-oppførselen og legger til en hjelper for tema-utledning som kallstedene (Task 2-4) bruker.
- Produces: `Comments.themeForApp()` → `'light'|'dark'` basert på `document.body.getAttribute('data-theme')` (default `'light'` hvis uattributtert). Ren nok til DOM-lesing; testes med en injisert body-stub ELLER dokumenteres som DOM-avhengig og testes manuelt (følg hvordan resten av comments.js testes — `attrs` er den node-testbare delen).

- [ ] **Step 1: Utvid `tests/js/comments.test.js`** — legg til en test som verifiserer at `attrs('x', {theme:'dark'})['data-theme'] === 'dark'` og at `attrs('x', {theme:'light'})['data-theme'] === 'light'`, og at uten `opts.theme` er `data-theme` fortsatt `'preferred_color_scheme'` (standarden beholdes). (Hvis disse allerede finnes fra forrige leveranse, la dem stå og legg til det som mangler.)

- [ ] **Step 2: Kjør → forventet tilstand.** `node --test tests/js/comments.test.js`. Hvis testene alt passerer (attrs støtter theme fra før), er dette et grønt utgangspunkt; hvis en ny assert feiler, implementer i Step 3.

- [ ] **Step 3: Implementer i `js/comments.js`:**
  - Bekreft at `attrs` bruker `opts.theme || 'preferred_color_scheme'` og `opts.lang || 'en'`.
  - Legg til `themeForApp()`:
    ```js
    function themeForApp() {
      try {
        var t = (typeof document !== 'undefined' && document.body)
          ? document.body.getAttribute('data-theme') : null;
        return t === 'dark' ? 'dark' : 'light';
      } catch (e) { return 'light'; }
    }
    ```
    og eksporter den på `global.Comments`.
  - Språk: undersøk giscus' støttede lokaler. Norsk (bokmål) er per 2026 IKKE i giscus' lokalliste → behold `en` som standard-lang. (Ikke send `no` med mindre du bekrefter at giscus har det; en ustøttet lang gir engelsk uansett, men vær eksplisitt.) Dokumentér valget i en kort kommentar.

- [ ] **Step 4: Omdøp i `metaCommunityFrame`** (~index.html:4532): bytt `t('Fra fellesskapet')` → `t('Kommentarer')`. Legg til `"Kommentarer": "Comments"` i `js/i18n/en.js` (og la den gamle «Fra fellesskapet»-nøkkelen stå hvis noen andre bruker den — grep; ellers fjern den).

- [ ] **Step 5: Kjør → PASS** (`node --test tests/js/comments.test.js` + full node-suite). Commit — `feat: giscus tema-bevisst (themeForApp) + «Kommentarer»-overskrift`.

---

### Task 2: Metadata-modal (ny overlay + `showMetadataModal`)

**Files:**
- Modify: `index.html` (ny overlay-HTML ved `varDetailOverlay` ~495; ny `showMetadataModal` nær `metaRenderDataset`; wiring for lukk/Esc/backdrop)
- Modify: `app.css` (modal-stil — gjenbruk `.var-detail-overlay`/`.var-detail-dialog`-reglene der mulig)

**Interfaces:**
- Consumes: `metaPopulateDataset`/`metaRenderDataset` (datasett), `metaRender`/`metaEnsure` (kilder), `metaCommunityFrame`, `Comments.themeForApp` (Task 1), `datasetProvenance`.
- Produces: `showMetadataModal(target, opts)` → åpner overlayen med tittel = `target`, og rendrer metadata i modal-body. `opts = {kind: 'dataset'|'source', entry?}`. For `dataset`: kaller den samme lazy/populate-logikken som `metaPopulateDataset` men med modal-body som `container`. For `source`: samme som dagens `metaRender(body, key, entry)` uten variabellisten (variablene bor nå i navn-toggle, ikke i metadata-modalen). Lukking stopper ev. åpen giscus-tråd (`Comments.close()` når modalens tråd er åpen).

- [ ] **Step 1: Legg til overlay-HTML** ved siden av `varDetailOverlay` (~index.html:495), speilet mønster:
  ```html
  <div class="var-detail-overlay" id="metaModalOverlay" role="dialog" aria-modal="true" aria-labelledby="metaModalTitle" aria-hidden="true">
    <div class="var-detail-dialog" id="metaModalDialog">
      <div class="var-detail-header">
        <h2 class="var-detail-title" id="metaModalTitle"></h2>
        <div class="var-detail-header-actions">
          <button type="button" id="metaModalCloseBtn" title="Lukk" aria-label="Lukk">&#10005;</button>
        </div>
      </div>
      <div class="var-detail-body" id="metaModalBody"></div>
    </div>
  </div>
  ```
  (Gjenbruker `.var-detail-*`-CSS-klassene — ingen ny CSS trengs utover ev. småjusteringer.)

- [ ] **Step 2: Implementer `showMetadataModal(target, opts)`** nær `metaRenderDataset`. Åpner overlayen (`classList.add('open')`, `aria-hidden=false`), setter tittel, og rendrer i `#metaModalBody`:
  - `kind: 'dataset'`: kall den samme logikken som `metaPopulateDataset(bodyEl, target)` — refaktorer `metaPopulateDataset` slik at den tar en container-param (den gjør det allerede: `metaPopulateDataset(container, ds)`), og send `#metaModalBody`. Lazy-fetch + cache uendret.
  - `kind: 'source'`: kall `metaEnsure(target, opts.entry)` for lazy-fetch (som i dag), deretter `metaRender(bodyEl, target, opts.entry)` MEN uten variabellisten-delen (variablene er navn-toggle nå — se Task 4). Enkleste vei: gi `metaRender` en flagg-param `opts2 = {withVarList:false}` eller lag en tynn variant; velg det som holder `metaRender` lesbar. Kommentar-rammen (§3) skal være med.
- [ ] **Step 3: Lukking:** lukk-knapp, klikk på backdrop (overlay selv), og Esc lukker; ved lukk kall `Comments.close()` hvis modalens tråd er åpen. Følg nøyaktig hvordan `varDetailOverlay` gjør dette (`closeVariableDetailModal` ~4037 + dens Esc/backdrop-wiring rundt ~3720/4051 — les og speil).
- [ ] **Step 4: giscus-tema:** når kommentar-knappen i modalen åpner tråden, send `Comments.open(thread, target, {theme: Comments.themeForApp()})`. (Wiring for 💬-knappen i modal-body: samme delegeringsmønster som datasett-containeren brukte — fest på `#metaModalBody` eller deleger fra overlayen.)
- [ ] **Step 5: Verifiser** — `node --check` på script-blokka, full node-suite, les diffen. (Ingen enhetstest — modal er inline; klikk-verifiseres i Task 5.) Commit — `feat: metadata-modal (showMetadataModal) — overlay som gjenbruker metaRender-innholdet`.

---

### Task 3: Datasett-liste — navn-toggle + ⊞ + ⓘ→modal

**Files:**
- Modify: `index.html` (`updateSidebarDatasets` ~4368: rad-HTML ~4418-4425, wiring ~4464-4480; fjern inline `.meta-info-container` og `metaToggleDataset`-veien)
- Modify: `app.css` (ikon-stil for ⊞; toggle-indikator; skjul variabelliste som standard)
- Modify: `js/i18n/en.js`

**Interfaces:**
- Consumes: `showMetadataModal(ds, {kind:'dataset'})` (Task 2), `showIndividataModal(ds)` (~4119), `showVariableDetail(ds, v)`, `showStaleRunExplanation` (~4444).

Ingen enhetstest (inline). Kravene:

- [ ] **Step 1: Rad-HTML** (~4418): `.sidebar-dataset-name` inneholder nå: navnetekst (klikkbar → toggle) + `⊞`-knapp (`class="sidebar-data-btn" data-data-ds="…"`, kun for IKKE-stale datasett — stale har ingen data i denne motoren) + `ⓘ`-knapp (`class="meta-info-btn" data-meta-ds="…"`). Fjern den inline `<div class="meta-info-container">`. Variabellisten (`.sidebar-vars`) rendres fortsatt, men SKJULT som standard (CSS `display:none` til navnet toggler den). Legg en toggle-indikator (▸/▾) på navnet.
- [ ] **Step 2: Wiring:**
  - Navnetekst-klikk: hvis stale → `showStaleRunExplanation`; ellers toggle `.sidebar-vars` (vis/skjul) + oppdater ▸/▾. (Ikke åpne datatabell lenger.)
  - ⊞-klikk (`e.stopPropagation()`): hvis stale → `showStaleRunExplanation`; ellers `showIndividataModal(ds)`.
  - ⓘ-klikk (`e.stopPropagation()`): `showMetadataModal(ds, {kind:'dataset'})` (åpnes også for stale — metadata er motor-uavhengig).
  - Variabelrad-klikk: uendret (`showVariableDetail`, eller stale-forklaring) — men radene er nå skjult til navnet toggler dem.
- [ ] **Step 3: Fjern død kode:** `metaToggleDataset` (~4561) og dens datasett-kallsted (~4494) er erstattet av modal-veien — fjern dem hvis ingen andre kallsteder (grep). `metaPopulateDataset`/`metaRenderDataset` BEHOLDES (Task 2s modal bruker dem). Rydd foreldreløse selektorer.
- [ ] **Step 4: en.js-nøkler** for nye strenger (⊞ title «Vis data», toggle-aria osv.).
- [ ] **Step 5: Verifiser** (node --check + suite + diff-lesing). Commit — `feat: datasett-rad — navn-toggler variabler, ⊞ åpner datatabell, ⓘ åpner metadata-modal`.

---

### Task 4: Kildeliste — navn-toggle + ⓘ→modal

**Files:**
- Modify: `index.html` (`updateSidebarSources` ~8042, `metaRender` ~7951, `metaToggleSource`/`metaToggleVar` ~8011-8025, delegering ~8050-8069)
- Modify: `app.css`, `js/i18n/en.js`

**Interfaces:**
- Consumes: `showMetadataModal(key, {kind:'source', entry})` (Task 2), `metaToggleVar` (beholdes for variabel-detalj), `metaEnsure`.

- [ ] **Step 1: Rad-HTML** (~8100): `.sidebar-src-head` inneholder navnetekst (klikkbar → toggle variabelliste) + `ⓘ`-knapp (metadata-modal). Legg til en skjult `<div class="sidebar-src-vars" style="display:none">` med variabelradene (`.meta-info-var-row`, samme som i dag lå inne i containeren) rett under head. Fjern den samlede `.meta-info-container` (metadata bor nå i modalen; variablene i toggle-lista). Toggle-indikator ▸/▾. Advarselsradene for ukjente `# meta`-mål beholdes uendret.
- [ ] **Step 2: Wiring** (delegering på `#sidebarSources`):
  - Navnetekst-klikk (ikke ⓘ): toggle `.sidebar-src-vars` + ▸/▾. (Lazy: ved første åpning, hvis kilden trenger `/api/metadata`-kolonner som ikke finnes ennå, hent dem via `metaEnsure` og fyll lista — ELLER bruk `entry.columns` som allerede finnes for filkilder. Følg hva `entry` har; for register-kilder uten kolonner ennå, hent lazy.)
  - ⓘ-klikk (`e.stopPropagation()`): `showMetadataModal(key, {kind:'source', entry: srcMap[key]})`.
  - Variabelrad-klikk: `metaToggleVar(vrow)` (uendret — viser kodeliste i sub-container under raden, inne i den togglede lista).
  - 💬-delegering: beholdes for tråd-toggling der den forekommer (nå primært i modalen — men hvis variabel-sub-containeren har en 💬, behold).
- [ ] **Step 3: `metaRender`-justering:** siden metadata (tittel/utgiver/# meta/kommentarer) nå vises i modalen (Task 2) og variablene i toggle-lista, må `metaRender`/`metaToggleSource` splittes: metadata-delen flyttes til modal-veien (Task 2 kaller `metaRender` med `withVarList:false`), variabelliste-delen til `updateSidebarSources`' navn-toggle. Behold `metaToggleVar` for enkelt-variabel-detalj. Fjern `metaToggleSource` hvis den ikke lenger har et kallsted (grep), ellers reduser den til variabelliste-toggling.
- [ ] **Step 4: Rydd død kode** + en.js-nøkler.
- [ ] **Step 5: Verifiser** (node --check + suite + diff-lesing). Commit — `feat: kilderad — navn-toggler variabelliste, ⓘ åpner metadata-modal`.

---

### Task 5: Kontrollør-verifisering (klikk-smoke + full suite)

**Files:** Ingen kodeendringer (småfikser committes separat).

- [ ] **Step 1: Klikk-basert browser-smoke** (netlify dev + Chrome, EKTE klikk) i BÅDE brython og python:
  - Datasett: navn-klikk toggler variabellisten av/på (skjult som standard); ⊞ åpner datatabell-modalen (Tabulator med rader); ⓘ åpner metadata-modalen (# meta + proveniens + kildeberikelse + «Kommentarer»-ramme); variabelklikk (i utvidet liste) åpner variabeldetalj; stale-rad: navn/⊞ gir kjør-forklaring, ⓘ åpner metadata-modal.
  - Kilder: navn-klikk toggler variabellisten; ⓘ åpner metadata-modal; variabelklikk viser kodeliste; ukjent-`# meta`-advarsel består.
  - Kommentarer: overskrift = «Kommentarer»; 💬 åpner giscus i modalen; tema matcher app-tema (bytt lyst/mørkt, sjekk at ny tråd følger); «Åpne på GitHub»-fallback virker.
  - Modal-lukking: lukk-knapp, backdrop, Esc — alle lukker og stopper giscus-tråden.
- [ ] **Step 2: Full suite:** node + deno check + deno test + pytest — alle grønne.
- [ ] **Step 3: Ledger-oppdatering. INGEN push.**

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §1→Task 3 (datasett: navn-toggle/⊞/ⓘ) + Task 4 (kilder: navn-toggle/ⓘ); §2→Task 2 (modal + showMetadataModal, gjenbruker metaRenderDataset/metaRender); §3→Task 1 (Kommentarer-omdøping + giscus tema) + Task 2 (tema sendes ved åpning i modal); §4 uendret; §5→Task 5 + comments-test i Task 1.
- **Plassholder-skann:** Task 2-4 gir krav+ankere for index.html (etablert mønster — implementeren MÅ lese funksjonene; ankere verifisert 2026-07-26). Modul + modal-HTML har komplett kode. Ingen TBD-er.
- **Type-konsistens:** `showMetadataModal(target, {kind, entry})` definert i Task 2, konsumert i Task 3/4; `metaRenderDataset(container,…)`/`metaRender(container,…)` tar container-param (bekreftet i koden) → modal-body sendes uendret; `Comments.themeForApp()` definert i Task 1, brukt i Task 2; giscus-attributtene uendret fra forrige leveranse.
- **Avhengigheter:** 1→2→3→4→5 sekvensielt (2 bruker Task 1s rename+themeForApp; 3/4 bruker Task 2s modal). Passer SDD (én task om gangen).
