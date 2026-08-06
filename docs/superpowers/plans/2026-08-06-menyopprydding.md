# Menyopprydding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profil flyttes til sidemenyen, kildepillen rendyrkes med faste valg først, kildemodalen blir biblioteksmanager, og import/landvelger får søk — per spec `docs/superpowers/specs/2026-08-06-menyopprydding-design.md`.

**Architecture:** Ren UI-omflytting i askstat sine tre menyfiler (`js/context-pill.js`, `js/profiles.js`, `js/packs.js`) + markup i `index.html`. Én reell tilstandsendring: «Standard (automatisk)» skrives som eksplisitt `doc.packs = {auto:true, updated}` (sletting ville blitt resurrektert av sync-mergen). Payload-kontrakten mot `/api/svar` endres IKKE.

**Tech Stack:** Vanilla ES5 i browser-filene (IIFE-er med globaler, ingen bundler), `node:test` for logikk, hånd-stubbet DOM kun der den finnes fra før.

## Global Constraints

- **ES5 i `js/*.js`**: `var` + `function`, ingen arrow/`let`/template literals (testfilene kan bruke moderne JS).
- **i18n**: engelske literaler er nøkler. HVER oppgave som endrer T()-strenger eller `data-i18n`-markup skal: (1) kjøre `node tools/list_i18n_keys.mjs` (regenererer `tools/ask_i18n_keys.json`), (2) legge oversettelser i ALLE 12 ordbøker `js/i18n/{no,da,sv,fi,is,de,fr,es,pt,zh,ja,hi}.js`. Vokter: `node --test tests/js/i18n-dicts.test.js`.
- **`md_ask_discover`-NØKKELEN endres ALDRI** — kun etiketten. `js/ai-chat.js` leser literalen direkte; vokter: `tests/js/run-kontrakt.test.js`.
- **Ingen push** — kun lokale commits; push er kontrollørens beslutning i dette repoet.
- **Popover-radanatomi**: gjenbruk dagens mønster — `<button>` med `<span class="ask-pop-check">` + navn-`<span>` (se `checkRow`/`navRow` i `js/packs.js`).
- Full testkommando: `node --test 'tests/js/*.test.js'` (samme som CI `.github/workflows/app-tests.yml`).
- `assert.deepEqual(P.packsState(), …)` finnes i dag i `tests/js/profiles.test.js` (linjene ~114–139) og `tests/js/konto-sync.test.js:169` — nytt `manual`-felt MÅ inn i disse forventningene, ellers rødt.

## Filkart

| Fil | Ansvar i denne runden |
|---|---|
| `js/profiles.js` | Task 1: `{auto:true}`-tilstand (lagringsdel). Task 2: sidemenyknapp-wiring. Task 3: slett popover-`ProfilesUi`. Task 4: source-modus delegerer lista til `SourcesUi` |
| `js/packs.js` | Task 3: ny popover-rekkefølge. Task 4: `SourcesUi.renderLibrary` + `describe(id)`. Task 5: landvelger-undervisning + `filterCatalog`. Task 6: Explore-søk/to-steg |
| `js/context-pill.js` | Task 3: kun kildeseksjon + ren kilde-etikett |
| `index.html` | Task 2: profilknapp. Task 3: slank popover. Task 4: infopanel + manager-knapper. Task 6: Explore-søk/tilbake |
| `css/ask.css` | Task 3: `.ask-ctx-scroll`. Task 4: `.sources-row`/`.sources-info` + rulleliste + Explore-over-manager z-index |
| `tests/js/profiles.test.js`, `tests/js/konto-sync.test.js` | Task 1 |
| `tests/js/packs.test.js` | Task 4 (`describe`), Task 5 (`filterCatalog`) |
| `tests/js/context-pill-dom.test.js` | Task 3: ny renderSections-kontrakt |
| `js/i18n/*.js` + `tools/ask_i18n_keys.json` | Task 2, 3, 4, 5, 6 |

---

### Task 1: `{auto:true}`-tilstanden i Profiles

**Files:**
- Modify: `js/profiles.js` (packsState ~linje 160, setAutoPack ~189, mergeRemote ~217)
- Test: `tests/js/profiles.test.js`, `tests/js/konto-sync.test.js:169`

**Interfaces:**
- Consumes: dagens `makeProfiles(storage, opts)` fra `js/profiles.js`.
- Produces: `packsState() → {ids: string[], auto: boolean, manual: boolean}` (nytt felt `manual` = eksplisitt manuelt sett finnes); `setPacksAuto()` → skriver `doc.packs = {auto:true, updated}`; `setAutoPack(id)` no-op'er KUN når manuelt ids-sett finnes; `mergeRemote` aksepterer begge packs-fasonger. Task 3 bruker `manual` og `setPacksAuto`.

- [ ] **Step 1: Skriv de nye testene (rød først)**

I `tests/js/profiles.test.js`, etter `mergeRemote hele-settet`-testen (bruk filas eksisterende `fakeStorage()`-helper øverst i fila):

```js
test('packs: setPacksAuto gjenoppretter auto som eksplisitt, synkbar verdi', () => {
  const s = fakeStorage();
  const P = makeProfiles(s);
  P.setAutoPack('norway');
  P.setPacks(['a']);
  assert.deepEqual(P.packsState(), { ids: ['a'], auto: false, manual: true });
  P.setPacksAuto();
  assert.equal(P.exportDoc().packs.auto, true);        // eksplisitt verdi, ikke slettet felt
  P.setAutoPack('norway');                             // ikke lenger blokkert av doc.packs
  assert.deepEqual(P.packsState(), { ids: ['norway'], auto: true, manual: false });
});

test('packs: mergeRemote — nyere {auto:true} vinner over eldre manuelt sett, og omvendt', () => {
  const P = makeProfiles(fakeStorage());
  P.setPacks(['a']);
  const autoNyere = { v: 1, active: null, updated: '', profiles: {},
    packs: { auto: true, updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(autoNyere), true);
  assert.deepEqual(P.packsState().ids, []);            // auto uten md_pack_auto = tomt her
  assert.equal(P.packsState().manual, false);
  const manueltEldre = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['z'], updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(manueltEldre), false);    // eldre taper — ingen resurreksjon
  assert.equal(P.packsState().manual, false);
});
```

Oppdater samtidig de eksisterende deepEqual-forventningene med `manual`:
- `profiles.test.js` «tomt default»-testen: `{ ids: [], auto: false, manual: false }` og `{ ids: ['norway'], auto: true, manual: false }`.
- `profiles.test.js` «setPacks vinner over auto»: begge til `manual: true`.
- `profiles.test.js` «togglePack»-testen siste assert: `{ ids: [], auto: false, manual: true }`.
- `konto-sync.test.js:169`: `{ ids: ['finland'], auto: false, manual: true }`.

- [ ] **Step 2: Kjør testene — forvent rødt**

Run: `node --test tests/js/profiles.test.js`
Expected: FAIL — `setPacksAuto is not a function` + deepEqual-avvik på `manual`.

- [ ] **Step 3: Implementer i `js/profiles.js`**

`packsState` (behold `{auto:true}`-fallthrough til md_pack_auto — sjekken på `Array.isArray` gjør det allerede):

```js
      packsState: function () {
        var doc = readDoc();
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) {
          return { ids: doc.packs.ids.map(String), auto: false, manual: true };
        }
        var a = null;
        try { a = storage.getItem(PACK_AUTO); } catch (e) {}
        return a ? { ids: [String(a)], auto: true, manual: false }
                 : { ids: [], auto: false, manual: false };
      },
```

Ny funksjon rett etter `setPacks` (med denne kommentaren — resurreksjonsfella er grunnen til designet):

```js
      // «Standard (automatisk)» (spec 2026-08-06-menyopprydding §2): auto
      // gjenopprettes som EKSPLISITT verdi {auto:true} — å slette doc.packs
      // ville blitt resurrektert av mergeRemote (remote manuelt sett med
      // timestamp vinner alltid over et fraværende lokalt felt).
      setPacksAuto: function () {
        var doc = readDoc();
        doc.packs = { auto: true, updated: now() };
        writeDoc(doc);
      },
```

`setAutoPack`-guarden — blokker kun ekte manuelt sett:

```js
      setAutoPack: function (id) {
        var doc = readDoc();
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) return; // manuelt valg vinner
```

`mergeRemote` packs-blokka erstattes (normaliser begge fasonger; nyeste `updated` vinner; likhet → uendret):

```js
        var rp = remoteDoc.packs;
        if (rp && typeof rp === 'object' && (Array.isArray(rp.ids) || rp.auto === true)) {
          var normPacks = function (p) {
            return p.auto === true
              ? { auto: true, updated: String(p.updated || '') }
              : { ids: (p.ids || []).map(String), updated: String(p.updated || '') };
          };
          var lp = doc.packs;
          var rN = normPacks(rp);
          if ((!lp || rN.updated > String(lp.updated || '')) &&
              JSON.stringify(lp ? normPacks(lp) : null) !== JSON.stringify(rN)) {
            doc.packs = rN;
            changed = true;
          }
        }
```

- [ ] **Step 4: Kjør testene — forvent grønt**

Run: `node --test tests/js/profiles.test.js tests/js/konto-sync.test.js`
Expected: PASS (alle).

- [ ] **Step 5: Full js-suite + commit**

Run: `node --test 'tests/js/*.test.js'` — Expected: PASS.

```bash
git add js/profiles.js tests/js/profiles.test.js tests/js/konto-sync.test.js
git commit -m "feat: eksplisitt {auto:true}-pakketilstand — vei tilbake til Standard uten sync-resurreksjon"
```

---

### Task 2: Profilknapp i sidemenyen

**Files:**
- Modify: `index.html` (`.ask-side-bottom`, rett FØR `askSettingsBtn`-knappen, ~linje 166)
- Modify: `js/profiles.js` (`initProfilesUi`)
- Modify: `tools/ask_i18n_keys.json` (regenerert) + `js/i18n/*.js` (12 filer)

**Interfaces:**
- Consumes: `Profiles.openModal()`, `Profiles.active()`, `Profiles.onChange(cb)` — finnes.
- Produces: knapp `#askProfileBtn` med `<span id="askProfileLabel">`; profilinngangen popoveren mister i Task 3. (Rekkefølgen Task 2 → Task 3 er bevisst: ny inngang før gammel fjernes.)

- [ ] **Step 1: Markup i `index.html`**

Inn i `.ask-side-bottom`, over «API key & settings»-knappen (person-ikonet er samme SVG som `askLoginBtn` bruker):

```html
        <button type="button" class="ask-side-btn" id="askProfileBtn" data-i18n-title title="Profile — instructions added to every question. Click to manage.">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="ask-side-label" id="askProfileLabel">Profile</span>
        </button>
```

(Merk: IKKE `data-i18n` på label-spanet — teksten settes dynamisk av JS i Step 2, ellers overskriver i18n-passet den.)

- [ ] **Step 2: Wiring i `js/profiles.js` `initProfilesUi`**

Etter `profilesCloseBtn`-lytteren:

```js
      // Menyopprydding (spec 2026-08-06-menyopprydding §3): profilinngangen
      // bor i sidemenyen og åpner modalen direkte — radioene der ER velgeren.
      var sideBtn = document.getElementById('askProfileBtn');
      var sideLabel = document.getElementById('askProfileLabel');
      function renderSideLabel() {
        if (!sideLabel) return;
        var a = P.active();
        sideLabel.textContent = a ? T('Profile: {name}', { name: a.name }) : T('Profile');
      }
      if (sideBtn) sideBtn.addEventListener('click', function () { P.openModal(); });
      renderSideLabel();
```

og utvid den eksisterende `P.onChange(function () { renderList(); });` til:

```js
      P.onChange(function () { renderList(); renderSideLabel(); });
```

- [ ] **Step 3: i18n — rød først**

Run: `node tools/list_i18n_keys.mjs && node --test tests/js/i18n-dicts.test.js`
Expected: FAIL — 12 ordbøker mangler `"Profile: {name}"` og title-nøkkelen. («Profile» finnes fra før.)

- [ ] **Step 4: Legg nøklene i alle 12 ordbøker**

Norsk (`js/i18n/no.js`) — de andre 11 (da, sv, fi, is, de, fr, es, pt, zh, ja, hi) oversettes tilsvarende, i hver fils alfabetiske nøkkelorden:

```js
  "Profile — instructions added to every question. Click to manage.": "Profil — instruksjoner som legges til hvert spørsmål. Klikk for å administrere.",
  "Profile: {name}": "Profil: {name}",
```

({name}-plassholderen skal stå UOVERSATT i alle språk — drift-testen sjekker plassholder-settet per nøkkel.)

- [ ] **Step 5: Kjør i18n-testen — forvent grønt**

Run: `node --test tests/js/i18n-dicts.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html js/profiles.js js/i18n/*.js tools/ask_i18n_keys.json
git commit -m "feat: profilknapp i sidemenyen — åpner profilmodalen direkte"
```

---

### Task 3: Ren kildepille — faste valg først, Standard-rad, intern rulling

**Files:**
- Modify: `index.html` (`#askContextMenu`, ~linje 213–227)
- Modify: `js/context-pill.js`
- Modify: `js/packs.js` (DOM-delen: `renderInto`)
- Modify: `js/profiles.js` (slett `global.ProfilesUi`-blokka)
- Modify: `css/ask.css`
- Test: `tests/js/context-pill-dom.test.js`
- Modify: `tools/ask_i18n_keys.json` (regenerert) + `js/i18n/*.js` (12 filer)

**Interfaces:**
- Consumes: `packsState().manual` og `setPacksAuto()` fra Task 1; `Packs.onLangChange(locales)` (finnes — applyAuto + ensureSelected); `Prof.openModal({kind:'source'})` (finnes; blir manager i Task 4).
- Produces: `PacksUi.renderInto(container, close)` — opts/`fresh`-parameteren FJERNES (ingen drill-inn-tilstand igjen); `ContextPill.refresh()` uendret navn. `localeCandidates` (array) hoistes i `initPacksUi` — Task 3 definerer, Standard-raden bruker.

- [ ] **Step 1: Slank markupen i `index.html`**

`#askContextMenu` mister profil-delen — slett `ask-pop-sep`-diven, Profile-`ask-ctx-head`, Profile-`ask-ctx-explain` og `<div id="askCtxProfileSection"></div>`. Oppdater pill-tittelen (linje ~208):

```html
              <button type="button" class="ask-pill-btn" id="askContextBtn" data-i18n-title title="Sources — where the AI should look for data. Click to adjust.">
```

(behold SVG + `<span id="askContextLabel">Sources</span>` — bytt default-teksten fra `Context` til `Sources`).

- [ ] **Step 2: `js/context-pill.js` — kun kilder**

- `renderLabel`: fjern `Prof.active()`-delen og ` (auto)`-suffikset; fallback `T('Sources')`:

```js
    function renderLabel() {
      var lbl = null;
      if (P) {
        var st = Prof.packsState();
        if (st.ids.length) {
          lbl = P.displayName(st.ids[0]) + (st.ids.length > 1 ? ' +' + (st.ids.length - 1) : '');
        }
      }
      labelEl.textContent = lbl || T('Sources');
    }
```

- `renderSections(fresh)` → `renderSections()`; slett `fresh`-kommentaren og ProfilesUi-kallet:

```js
    function renderSections() {
      if (global.PacksUi && packSec) global.PacksUi.renderInto(packSec, close);
    }
```

- Oppdater de to kallstedene (`btn`-klikk og `Prof.onChange`) til `renderSections()`. `profSec`-oppslaget og filhode-kommentaren om ProfilesUi ryddes. Behold `menuSawClick`-mekanismen UENDRET (regresjonsvernet).

- [ ] **Step 3: `js/packs.js` — ny `renderInto`**

Slett: `var view = 'main';`, hele `view === 'countries'`-grenen, `navRow`-bruken for «Choose country →», community-`modalRow`-ene («allerede importert»-matchingen flyttes til Task 4-manageren), «New source…»- og «View/Import shared packs…»-radene, og `opts`/`fresh`-parameteren. `checkRow` mister `autoOk`-parameteren (` (auto)`-suffikset erstattes av Standard-raden). Hoist locale-kandidatene som `initPacksUi`-variabel (i dag inline i `P.boot`-kallet):

```js
      var localeCandidates = [storedLang || '', (typeof navigator !== 'undefined' && navigator.language) || ''];
```

(`storedLang`-oppslaget flyttes følgelig OVER `renderInto`; `P.boot(localeCandidates)` nederst bruker samme variabel.)

Ny struktur:

```js
      function renderInto(container, close) {
        container.innerHTML = '';
        var st = Prof.packsState();
        var ids = st.ids;

        // Faste valg (spec menyopprydding §1): alltid øverst, ruller aldri vekk.
        function standardRow() {
          var b = document.createElement('button');
          b.type = 'button';
          var check = document.createElement('span');
          check.className = 'ask-pop-check';
          check.textContent = st.manual ? '' : '✓';
          var nm = document.createElement('span');
          nm.textContent = T('Standard (automatic)');
          b.appendChild(check);
          b.appendChild(nm);
          b.addEventListener('click', function () {
            if (!st.manual) return;
            Prof.setPacksAuto();            // fyrer onChange → re-render
            P.onLangChange(localeCandidates); // gjenoppretter md_pack_auto + preloader
          });
          container.appendChild(b);
        }
        standardRow();
        discoverRow();
        modalRow(T('Manage sources…'), function () { Prof.openModal({ kind: 'source' }); });
        sep();

        // Biblioteket: KUN sjekkboksrader, i egen rulle-div (§1).
        var scroll = document.createElement('div');
        scroll.className = 'ask-ctx-scroll';
        container.appendChild(scroll);
        var entries = P.list();
        entries.filter(function (e) { return e.group === 'builtin'; }).forEach(function (e) {
          checkRow(scroll, e.id, e.name, ids.indexOf(e.id) >= 0);
        });
        entries.filter(function (e) { return e.group === 'imported'; }).forEach(function (e) {
          checkRow(scroll, e.id, e.name, ids.indexOf(e.id) >= 0);
        });
        ids.filter(function (id) { return id.indexOf('country:') === 0; }).forEach(function (id) {
          checkRow(scroll, id, P.displayName(id), true);
        });

        var info = P.composeInfo();
        if (info.shortForm > 0) { /* budsjett-hintet uendret, appended på container */ }
      }
```

(`checkRow`/`discoverRow`/`modalRow`/`sep` beholder dagens implementasjon, men `checkRow` får container som første parameter slik at biblioteksradene kan legges i `scroll`-diven mens de faste radene ligger rett på `container`. `discoverRow`-etiketten byttes til `T('Extended internet search — also look beyond the built-in sources (slower)')` — localStorage-NØKKELEN `md_ask_discover` er uendret. `discoverRow` sin interne re-render kaller `renderInto(container, close)` som før.)

- [ ] **Step 4: Slett `global.ProfilesUi` i `js/profiles.js`**

Fjern hele `global.ProfilesUi = { renderInto: … }`-blokka (popover-velgeren) og kommentaren over — modalen + sidemenyknappen er nå eneste profilflate.

- [ ] **Step 5: CSS i `css/ask.css`**

Ved `.ask-pop-menu`-reglene (~linje 140):

```css
/* Menyopprydding (spec 2026-08-06): biblioteket ruller internt — de faste
   valgene over skillet er alltid synlige uansett bibliotekstørrelse. */
.ask-ctx-scroll { max-height: 240px; overflow-y: auto; }
```

- [ ] **Step 6: Oppdater `tests/js/context-pill-dom.test.js`**

Kjør `node --test tests/js/context-pill-dom.test.js` først. Forventede brudd og fiksene:
- Stubben `global.ProfilesUi = { renderInto: … }` (linje ~154) og assertions på at profSec rendres → slett; `askCtxProfileSection` i getElementById-mappen kan bli stående (context-pill slår den ikke lenger opp) eller ryddes.
- Assertions på `{fresh:true}`-opts til `PacksUi.renderInto` → ny kontrakt er `renderInto(packSec, close)` uten opts.
- Regresjonstestene for `menuSawClick` (klikk-inni-meny/utenfor-meny) skal bestå UENDRET i oppførsel — de tester menyens åpne/lukke, ikke seksjonene. Behold profSec som «et barn av menu»-klikkmål der den brukes slik.

Expected etter fiks: PASS.

- [ ] **Step 7: i18n — rød, oversett, grønn**

Run: `node tools/list_i18n_keys.mjs && node --test tests/js/i18n-dicts.test.js` — Expected: FAIL på nye nøkler.

Nye nøkler, norsk (de andre 11 tilsvarende; fjern gjerne de nå døde oppføringene «Context», «Context — which sources…», « (auto)», «Extended search — also look beyond the built-in sources (slower)», «Choose country →», «Manage profiles…», «No profile» beholdes — modalen bruker den fortsatt):

```js
  "Extended internet search — also look beyond the built-in sources (slower)": "Utvidet internettsøk — let også utenfor kildegrunnlaget (tregere)",
  "Manage sources…": "Administrer kilder …",
  "Sources — where the AI should look for data. Click to adjust.": "Kilder — hvor KI-en bør lete etter data. Klikk for å endre.",
  "Standard (automatic)": "Standard (automatisk)",
```

(«Sources» finnes fra før.) Re-run: PASS.

- [ ] **Step 8: Full suite + commit**

Run: `node --test 'tests/js/*.test.js'` — Expected: PASS (spesielt `run-kontrakt.test.js` urørt grønn).

```bash
git add index.html js/context-pill.js js/packs.js js/profiles.js css/ask.css tests/js/context-pill-dom.test.js js/i18n/*.js tools/ask_i18n_keys.json
git commit -m "feat: ren kildepille — faste valg først, Standard (automatisk), intern rulling"
```

---

### Task 4: Biblioteksmanageren («Administrer kilder»)

**Files:**
- Modify: `index.html` (`#profilesBackdrop`-modalen, ~linje 453)
- Modify: `js/profiles.js` (`renderList`/`openModal` source-modus)
- Modify: `js/packs.js` (`describe(id)` i makePacks; `SourcesUi` i DOM-delen)
- Modify: `css/ask.css`
- Test: `tests/js/packs.test.js`
- Modify: `tools/ask_i18n_keys.json` + `js/i18n/*.js`

**Interfaces:**
- Consumes: `P.list()` (grupper builtin/country/imported), `P.listCommunity()`, `Prof.list('source')` (origin-matching), `Prof.togglePack(id)`, `Prof.remove(id)`, `openEdit(id)` (profiles.js-intern — sendes inn som hook), `openExplore()` (packs.js-intern, finnes).
- Produces: `Packs.describe(id) → string` (node-testet); `global.SourcesUi.renderLibrary(container, {onEdit})`; knappene `#sourcesImportBtn`, `#sourcesCountryBtn`, infopanel `#sourcesInfo`. Task 5 utvider `SourcesUi` med landvisningen.

- [ ] **Step 1: Node-test for `describe` (rød først)**

I `tests/js/packs.test.js` (gjenbruk filas `fakeStorage`/`fakeFetch(FILES)`/`fakeProfiles`-helpers; utvid `fakeProfiles`-mocken med en `get`-funksjon om den mangler):

```js
test('describe: katalogbeskrivelse, landnote, egen kilde m/origin-prefiks', async () => {
  const prof = fakeProfiles({ ids: [], auto: false });
  prof.get = (id) => (id === 'egen1'
    ? { id: 'egen1', name: 'Min', text: 'Første linje.\nMer.', kind: 'source',
        origin: { source: 'community', id: 'x' } }
    : null);
  const P = makePacks(fakeStorage(), fakeFetch(FILES), prof);
  await P.load();
  assert.ok(P.describe('norway').length > 0);            // description fra index.json
  assert.ok(P.describe('country:SE').length > 0);        // note/mal fra countries.json
  assert.match(P.describe('user:egen1'), /Første linje/);
  assert.equal(P.describe('finnes:ikke'), '');
});
```

Run: `node --test tests/js/packs.test.js` — Expected: FAIL (`describe is not a function`).

- [ ] **Step 2: Implementer `describe` i `makePacks` (`js/packs.js`)**

Etter `displayName`:

```js
    // Infopanelet i biblioteksmanageren (spec menyopprydding §4).
    function describe(id) {
      if (id.indexOf('country:') === 0) {
        var e = countryMap()[id.slice(8)];
        return e ? (e.note || renderTemplate(id.slice(8))) : '';
      }
      if (id.indexOf('user:') === 0) {
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        if (!pr) return '';
        var pre = pr.origin && pr.origin.source === 'community' ? 'Imported from shared sources. ' : '';
        return pre + String(pr.text || '').slice(0, 400);
      }
      var c = curated().filter(function (p) { return p.id === id; })[0];
      return c ? (c.description || '') : '';
    }
```

Legg `describe: describe` i return-objektet. Run: PASS.

- [ ] **Step 3: Markup i `index.html`**

I `#profilesBackdrop`, rett etter `<div id="profilesList" …></div>`:

```html
      <div id="sourcesInfo" class="sources-info" hidden></div>
```

I `.ai-modal-actions` (samme modal), FØR `profileNewBtn`:

```html
        <button type="button" class="ai-modal-btn" data-i18n id="sourcesImportBtn" hidden>Import shared sources…</button>
        <button type="button" class="ai-modal-btn" data-i18n id="sourcesCountryBtn" hidden>Add country…</button>
```

- [ ] **Step 4: `js/profiles.js` — source-modus delegerer**

Øverst i `renderList()`:

```js
      function renderList() {
        if (modalKind === 'source' && global.SourcesUi) {
          global.SourcesUi.renderLibrary(listEl, { onEdit: openEdit });
          return;
        }
        // …profil-grenen uendret…
```

I `P.openModal`: tittel `T('Sources')` i source-modus (erstatter `T('My sources')`), og synliggjør manager-knappene:

```js
        var impBtn = document.getElementById('sourcesImportBtn');
        var ctyBtn = document.getElementById('sourcesCountryBtn');
        if (impBtn) impBtn.hidden = modalKind !== 'source';
        if (ctyBtn) ctyBtn.hidden = modalKind !== 'source';
```

(`P.onChange(renderList)` finnes — sletting/import/toggle re-rendrer manageren gratis.)

- [ ] **Step 5: `SourcesUi.renderLibrary` i `js/packs.js` (DOM-delen)**

```js
      // Biblioteksmanageren (spec menyopprydding §4): profilesBackdrop i
      // source-modus. selectedInfoId overlever re-render (P.onChange).
      var selectedInfoId = null;
      function renderLibrary(container, hooks) {
        container.innerHTML = '';
        container.classList.add('sources-scroll');
        var infoEl = document.getElementById('sourcesInfo');
        var st = Prof.packsState();
        var ids = st.ids;
        var entries = P.list().filter(function (e) {
          return e.group !== 'country' || ids.indexOf(e.id) >= 0; // land: kun valgte (§4)
        });
        entries.forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'sources-row' + (selectedInfoId === e.id ? ' active' : '');
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = ids.indexOf(e.id) >= 0;
          cb.addEventListener('change', function () { Prof.togglePack(e.id); P.ensureSelected(); });
          var nm = document.createElement('button');
          nm.type = 'button';
          nm.className = 'sources-name';
          nm.textContent = e.name;
          nm.addEventListener('click', function () {
            selectedInfoId = selectedInfoId === e.id ? null : e.id;
            renderLibrary(container, hooks);
          });
          row.appendChild(cb);
          row.appendChild(nm);
          container.appendChild(row);
        });
        if (infoEl) {
          infoEl.hidden = !selectedInfoId;
          infoEl.innerHTML = '';
          if (selectedInfoId) {
            var txt = document.createElement('div');
            txt.textContent = P.describe(selectedInfoId) || '';
            infoEl.appendChild(txt);
            if (selectedInfoId.indexOf('user:') === 0) {
              var pid = selectedInfoId.slice(5);
              var actions = document.createElement('div');
              actions.className = 'sources-info-actions';
              var edit = document.createElement('button');
              edit.type = 'button';
              edit.className = 'ai-codeblock-btn';
              edit.textContent = T('Edit');
              edit.addEventListener('click', function () { hooks.onEdit(pid); });
              var del = document.createElement('button');
              del.type = 'button';
              del.className = 'ai-codeblock-btn';
              del.textContent = T('Delete');
              del.addEventListener('click', function () {
                selectedInfoId = null;
                Prof.remove(pid);           // fyrer onChange → profiles.js renderList → hit
              });
              actions.appendChild(edit);
              actions.appendChild(del);
              infoEl.appendChild(actions);  // knapperad — «Del …» kan legges til her senere
            }
          }
        }
      }
      global.SourcesUi = { renderLibrary: renderLibrary };
```

Wiring av manager-knappene (i `initPacksUi`, ved Explore-koden):

```js
      var impBtn = document.getElementById('sourcesImportBtn');
      if (impBtn) impBtn.addEventListener('click', function () { openExplore(); });
```

(`sourcesCountryBtn` wires i Task 5.)

- [ ] **Step 6: CSS i `css/ask.css`**

Ved `.profiles-list`-reglene (~linje 261):

```css
/* Biblioteksmanageren (spec 2026-08-06-menyopprydding §4): lista ruller
   internt; modal-actions under er de faste, alltid synlige valgene. */
.sources-scroll { max-height: 300px; overflow-y: auto; }
.sources-row { display: flex; align-items: center; gap: 8px; padding: 4px 2px; }
.sources-row.active { background: var(--bg-code); border-radius: 6px; }
.sources-name { flex: 1 1 auto; min-width: 0; text-align: left; background: none;
  border: none; color: inherit; font: inherit; cursor: pointer; padding: 2px 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sources-info { border-top: 1px solid var(--border); margin: 8px 0; padding: 8px 2px;
  font-size: 12.5px; color: var(--text-muted); white-space: pre-wrap; }
.sources-info-actions { display: flex; gap: 8px; margin-top: 8px; }
/* Explore åpnes OVER manageren (z-index-fella fra spec §Kjente feller) */
#packsExploreBackdrop { z-index: 1002; }
```

(Sjekk først hvilken z-index `.ai-modal-backdrop` har i fila og legg Explore ett hakk over.)

- [ ] **Step 7: i18n — rød, oversett, grønn**

Run: `node tools/list_i18n_keys.mjs && node --test tests/js/i18n-dicts.test.js` — FAIL, så legg inn (norsk; 11 andre tilsvarende — «Sources», «Edit», «Delete», «New source» finnes fra før; «My sources»-oppføringen kan slettes):

```js
  "Add country…": "Legg til land …",
  "Import shared sources…": "Importer delte kilder …",
  "Imported from shared sources. ": "Importert fra delte kilder. ",
```

Re-run: PASS.

- [ ] **Step 8: Full suite + commit**

Run: `node --test 'tests/js/*.test.js'` — Expected: PASS.

```bash
git add index.html js/profiles.js js/packs.js css/ask.css tests/js/packs.test.js js/i18n/*.js tools/ask_i18n_keys.json
git commit -m "feat: biblioteksmanager — én liste med info, Rediger/Slett og faste bunnknapper"
```

---

### Task 5: «Legg til land …» med søk

**Files:**
- Modify: `js/packs.js` (`filterCatalog` topp-nivå + landvisning i `SourcesUi`)
- Test: `tests/js/packs.test.js`
- Modify: `tools/ask_i18n_keys.json` + `js/i18n/*.js`

**Interfaces:**
- Consumes: `P.list()` group `'country'` (alle land), `Prof.togglePack`, `renderLibrary` fra Task 4.
- Produces: `filterCatalog(entries, q) → entries` (PURE, i module.exports — Task 6 gjenbruker den); `SourcesUi`-intern `view`-tilstand `'library' | 'countries'`.

- [ ] **Step 1: Node-test for `filterCatalog` (rød først)**

Require-linja øverst i `tests/js/packs.test.js` utvides:

```js
const { makePacks, compose, filterCatalog } = require('../../js/packs.js');
```

(tilpass til det fila faktisk destrukturerer i dag — behold eksisterende navn, legg til `filterCatalog`). Ny test:

```js
test('filterCatalog: navn+beskrivelse, case-insensitiv, tom query = alt', () => {
  const entries = [
    { name: 'Norway', description: 'SSB core' },
    { name: 'Sweden', description: 'SCB' },
    { name: 'Helse', description: 'FHI og NPR' },
  ];
  assert.equal(filterCatalog(entries, '').length, 3);
  assert.deepEqual(filterCatalog(entries, 'ssb').map((e) => e.name), ['Norway']);
  assert.deepEqual(filterCatalog(entries, 'FHI').map((e) => e.name), ['Helse']);
  assert.equal(filterCatalog(entries, 'zzz').length, 0);
});
```

Run: `node --test tests/js/packs.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementer (topp-nivå i `js/packs.js`, ved `compose`)**

```js
  // Søkefilter for import-/landvelgerne (spec menyopprydding §5–6). PURE —
  // node-testes direkte, deles av Explore-søket og «Legg til land …».
  function filterCatalog(entries, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return entries;
    return entries.filter(function (e) {
      return (String(e.name || '') + ' ' + String(e.description || ''))
        .toLowerCase().indexOf(s) >= 0;
    });
  }
```

`module.exports = { makePacks: makePacks, compose: compose, filterCatalog: filterCatalog };`
Run: PASS.

- [ ] **Step 3: Landvisning i `SourcesUi`**

Utvid Task 4-koden med view-tilstand og søk (samme mønster som `renderLibrary`; `countryQuery` nullstilles ved åpning):

```js
      var managerView = 'library'; // 'library' | 'countries'
      var countryQuery = '';
      function renderCountries(container, hooks) {
        container.innerHTML = '';
        var back = document.createElement('button');
        back.type = 'button';
        back.className = 'sources-name';
        back.textContent = T('← Back to list');
        back.addEventListener('click', function () {
          managerView = 'library';
          renderLibrary(container, hooks);
        });
        container.appendChild(back);
        var search = document.createElement('input');
        search.type = 'search';
        search.className = 'sources-search';
        search.placeholder = T('Search…');
        search.value = countryQuery;
        search.addEventListener('input', function () {
          countryQuery = search.value;
          renderCountries(container, hooks);
          var s2 = container.querySelector ? container.querySelector('.sources-search') : null;
          if (s2) s2.focus();
        });
        container.appendChild(search);
        var ids = Prof.packsState().ids;
        var all = P.list().filter(function (e) { return e.group === 'country'; });
        filterCatalog(all, countryQuery).forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'sources-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = ids.indexOf(e.id) >= 0;
          cb.addEventListener('change', function () { Prof.togglePack(e.id); P.ensureSelected(); });
          var nm = document.createElement('button');
          nm.type = 'button';
          nm.className = 'sources-name';
          nm.textContent = e.name;
          nm.addEventListener('click', function () { Prof.togglePack(e.id); P.ensureSelected(); });
          row.appendChild(cb);
          row.appendChild(nm);
          container.appendChild(row);
        });
      }
```

(Navn-klikk toggler her — landinfo hører til infopanelet i biblioteksvisningen, først når landet er valgt. `Prof.togglePack` fyrer onChange → profiles.js `renderList` → `renderLibrary` → `renderCountries` (managerView står), så avkrysningen oppdateres uten egen re-render.)

`renderLibrary` starter med `if (managerView === 'countries') return renderCountries(container, hooks);` og `sourcesCountryBtn` wires:

```js
      var ctyBtn = document.getElementById('sourcesCountryBtn');
      if (ctyBtn) ctyBtn.addEventListener('click', function () {
        managerView = 'countries';
        countryQuery = '';
        var listEl = document.getElementById('profilesList');
        if (listEl) renderCountries(listEl, { onEdit: function () {} });
      });
```

`SourcesUi` skal starte i biblioteket ved hver modal-åpning — eksponer:

```js
      global.SourcesUi = {
        renderLibrary: renderLibrary,
        reset: function () { managerView = 'library'; selectedInfoId = null; countryQuery = ''; },
      };
```

og i `js/profiles.js` `P.openModal`, i source-grenen (rett etter `modalKind`-settingen):

```js
        if (modalKind === 'source' && global.SourcesUi && global.SourcesUi.reset) global.SourcesUi.reset();
```

CSS-tillegg i `css/ask.css`:

```css
.sources-search { width: 100%; margin: 6px 0; padding: 6px 8px; font: inherit;
  border: 1px solid var(--border); border-radius: 6px; background: var(--bg);
  color: inherit; }
```

- [ ] **Step 4: i18n — rød, oversett, grønn**

`node tools/list_i18n_keys.mjs && node --test tests/js/i18n-dicts.test.js` — FAIL, legg inn (norsk; 11 andre tilsvarende):

```js
  "Search…": "Søk …",
  "← Back to list": "← Tilbake til lista",
```

Re-run: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `node --test 'tests/js/*.test.js'` — Expected: PASS.

```bash
git add js/packs.js css/ask.css tests/js/packs.test.js js/i18n/*.js tools/ask_i18n_keys.json
git commit -m "feat: Legg til land med søk i biblioteksmanageren; filterCatalog (delt med Explore)"
```

---

### Task 6: Import med søk — to-stegs Explore

**Files:**
- Modify: `index.html` (`#packsExploreBackdrop`, ~linje 438)
- Modify: `js/packs.js` (Explore-koden: `openExplore`/`expSelectEntry`)
- Modify: `tools/ask_i18n_keys.json` + `js/i18n/*.js` (kun hvis nye nøkler — «Search…»/«← Back to list» finnes fra Task 5)

**Interfaces:**
- Consumes: `filterCatalog` (Task 5), `P.listCommunity()`, `P.importPack` — finnes.
- Produces: to-stegs Explore; `openExplore(preselect)`-signaturen uendret (preselect hopper rett til detaljsteget).

- [ ] **Step 1: Markup**

I `#packsExploreBackdrop` — over `packsExploreList`:

```html
      <input type="search" id="packsExploreSearch" class="sources-search" data-i18n-placeholder placeholder="Search…">
```

og i `.ai-modal-actions`, FØR Import-knappen:

```html
        <button type="button" class="ai-modal-btn" data-i18n id="packsExploreBackBtn" hidden>← Back to list</button>
```

- [ ] **Step 2: To-stegslogikken i `js/packs.js`**

Explore-variablene får søkefeltet og back-knappen; listesteget og detaljsteget veksler på `hidden`:

```js
      var expSearch = document.getElementById('packsExploreSearch');
      var expBack = document.getElementById('packsExploreBackBtn');
      function renderExploreList() {
        expList.innerHTML = '';
        filterCatalog(P.listCommunity(), expSearch ? expSearch.value : '').forEach(function (e) {
          // dagens radbygging (ask-explore-row med navn + beskrivelse) uendret,
          // klikk → expSelectEntry(e)
        });
      }
      function showExploreStep(detail) {
        if (expSearch) expSearch.hidden = detail;
        expList.hidden = detail;
        expPrevWrap.hidden = !detail;
        expImport.hidden = !detail;
        if (expBack) expBack.hidden = !detail;
      }
      function expSelectEntry(e) {
        P.resolve(e.id).then(function (got) {
          if (!got) return;
          expSelected = { entry: e, text: got.text };
          expMeta.textContent = T('by {author}, updated {updated}', { author: e.author || '?', updated: e.updated || '?' });
          expPrev.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(got.text) : '';
          showExploreStep(true);
        });
      }
      function openExplore(preselect) {
        if (!expBackdrop) return;
        expSelected = null;
        if (expSearch) expSearch.value = '';
        showExploreStep(false);
        renderExploreList();
        expBackdrop.classList.add('open');
        if (preselect) expSelectEntry(preselect);
      }
      if (expSearch) expSearch.addEventListener('input', renderExploreList);
      if (expBack) expBack.addEventListener('click', function () {
        expSelected = null;
        showExploreStep(false);
      });
```

(Import-lytteren uendret; etter import lukkes Explore og manageren under re-rendrer via onChange.)

- [ ] **Step 3: i18n-sanity + full suite**

Run: `node tools/list_i18n_keys.mjs && node --test 'tests/js/*.test.js'`
Expected: PASS uten nye ordboksoppføringer (placeholder-nøkkelen «Search…» og «← Back to list» kom i Task 5; `data-i18n-placeholder`-attributtet plukkes av samme ekstraktor).

- [ ] **Step 4: Commit**

```bash
git add index.html js/packs.js tools/ask_i18n_keys.json
git commit -m "feat: Explore med søk og to-stegs les-før-importer"
```

---

### Task 7: Sluttføring — full verifisering + e2e-smoke

**Files:**
- Ingen nye endringer forventet (kun fikser av det smoken avdekker).

**Merk (bevisst avvik fra speccens testliste):** popover-rekkefølgen og
manager≡popover-toggle-speilingen dekkes av smoke-punktene 2 og 5 under, ikke
av node-DOM-tester — packs.js sin DOM-del har ingen FakeEl-harness i dag, og
å bygge én for dette ville vært en større rigg enn endringen selv.

- [ ] **Step 1: Full testkjøring**

Run: `node --test 'tests/js/*.test.js'` — Expected: PASS, alle filer.
Run: `python -m pytest tests/ -x -q` — Expected: PASS (ingen python-flater berørt; kjøres som regresjonsvakt).

- [ ] **Step 2: E2e-smoke i browser (smoke = pre-push-port)**

Start dev-server (askstat: `netlify dev` — husk edge-cache-fella: restart serveren og gjør hard-reload m/ignoreCache i Chrome før evaluering). Sjekkliste:

1. Pillen viser kun kilder; tom tilstand viser «Sources»/«Kilder».
2. Popover: Standard (automatisk) → Utvidet internettsøk → Administrer kilder … → skille → kun sjekkbokser; lang liste ruller mens de faste står.
3. Manuelt valg → Standard-raden mister hake; klikk Standard → auto-pakken (locale) tilbake med hake.
4. Sidemenyen: «Profil»-knapp åpner modalen; aktiv profil vises i etiketten og oppdateres ved bytte.
5. Manager: sjekkboks i modalen speiles i popoveren; klikk på navn viser info; egen kilde har Rediger/Slett; Slett fjerner også fra valgt-settet.
6. «Legg til land …»: søk filtrerer; valgt land dukker opp i biblioteket og popoveren.
7. «Importer delte kilder …»: søk filtrerer; klikk → detalj med preview; ← Tilbake; Importer → kilden aktiv i lista (Explore ligger OVER manageren, ikke bak).
8. Send et spørsmål: svaret kommer, og nettverkskallet til `/api/svar` har `packs`/`preferences`/`discover` som før.

- [ ] **Step 3: Eventuelle smoke-fikser committes**

```bash
git add -A && git commit -m "fix: smoke-funn fra menyopprydding-runden"
```

(Kun hvis smoken avdekket noe; ellers hopp over. IKKE push — kontrollørens beslutning.)
