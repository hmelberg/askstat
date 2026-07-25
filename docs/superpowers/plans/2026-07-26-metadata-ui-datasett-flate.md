# Metadata-UI til Datasett-flaten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flytte metadata-tyngdepunktet til Datasett-listen (ⓘ per datasett, variabelpanel i alle moduser), slanke «Tilkoblede kilder» til én container per kilde, bytte 💬-lenken med innebygd giscus-tråd, håndtere stale datasett — per spec `docs/superpowers/specs/2026-07-25-metadata-ui-datasett-flate-design.md`.

**Architecture:** Gjenbruker leveranse A uendret (MetaInfo-modulen, `# meta`-parseren, `/api/metadata`) — alt her er wiring/plassering i index.html + én ny liten modul `js/comments.js` (giscus) og én ren sorteringsfunksjon i `js/dataset-order.js` (begge node-testbare). CSS i `app.css` ved eksisterende `.meta-info-*`-regler.

**Tech Stack:** Vanilla JS (IIFE-moduler), giscus (GitHub Discussions-widget), node --test, deno test (uendret serverside).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-metadata-ui-datasett-flate-design.md` (§1 datasettflate, §2 kildeflate, §3 giscus, §4 stale, §5 eksempler). A-spec-ens §1–§4 og §7-tillitsregel består.
- **Commit lokalt kun — ALDRI push** (`feedback-openstat-no-autopush`).
- giscus-konfig (verifisert mot repoet 2026-07-26): repo `hmelberg/openstat-metadata`, repo-id `R_kgDOTjfgng`, kategori `Announcements`, kategori-id `DIC_kwDOTjfgns4DB9mu`, mapping `specific`, term = målstrengen (`ssb/05839.Region`, `penguins.species`), `data-strict="1"`, tema `preferred_color_scheme`, språk `en`. Scriptet (`https://giscus.app/client.js`) lastes LAZY — først ved 💬-klikk, aldri ved sideinnlasting.
- Tillitsregel (A-spec §7): giscus-tråden ligger i tydelig «fra fellesskapet»-ramme (`.meta-info-community`), aldri forvekselbar med kildens metadata. Liten «Åpne på GitHub»-lenke (dagens søke-URL fra `MetaInfo.commentUrl`) beholdes i rammen.
- Stats-delen i variabelpanelet: vises KUN for python-runtime; i andre moduser utelates den STILLE — ingen forklaringsmelding (Hans 2026-07-25). `nonPyRuntime`-gaten på inngangen (index.html:4394) fjernes.
- Stale datasett (runtime ≠ aktiv modus): gråes ut m/ merkelapp («fra brython»), sorteres NEDERST; klikk gir vennlig forklaring + én knapp «Kjør scriptet i <modus>» (klikker `#btnRun`) — designavklaring fra planfasen: kjøring via editoren ER overføringsveien (bytene ligger i `_bufCache`, så re-kjøring i ny modus er billig); ingen motor-spesifikk injeksjonskode.
- UI-strenger på norsk via `t('…')`, engelsk nøkkel i `js/i18n/en.js` (mønster fra b125600). All egen-interpolert HTML gjennom `escapeHtml`; MetaInfo-output er ferdig-escapet.
- Lazy henting av `/api/metadata` består (aldri ved sideinnlasting; cache).
- Testkommandoer fra repo-roten: `node --test 'tests/js/*.test.js'`, `cd netlify/edge-functions && deno test --allow-all _lib/`, `python3 -m pytest tests/ -q` (server/python urørt — kjøres i sluttverifisering).
- Verifisering av index.html-endringer: hard-reload m/ ignoreCache (`project-openstat-verify-felle`). Klikk-basert smoke-test — IKKE programmatiske kall på funksjoner som omgår gates (lærdom fra A).
- Kodeankere (verifisert 2026-07-26): `updateSidebarDatasets` index.html:4347, `nonPyRuntime` :4379, klikk-wiring :4390–4398, `showVariableDetail` :4422, `renderVariableDetailHtml` :4253-området, `currentMode()` :2884 (`modeRegistry[activeEditorMode]`), `activeEditorMode`-variabelen nær :2884, A-leveransens metahjelpere :7678–7830 (`metaFreshMetas`, `metaLabels`, `metaEnsure`, `metaRender`, `metaToggleSource`, `metaToggleVar`, `updateSidebarSources`), `refreshDatasetSidebarFromEngineInfo` :8122, runtime-tagging :7899/:8126/:8137/:8193.

---

### Task 1: Comments-modul `js/comments.js` (giscus)

**Files:**
- Create: `js/comments.js`
- Create: `tests/js/comments.test.js`
- Modify: `index.html` (én `<script src="js/comments.js">`-tag rett etter `js/meta-info.js`-tagen, samme stil)

**Interfaces:**
- Produces (global `Comments`-IIFE, samme mønster som `MetaInfo`):
  - `attrs(target, opts)` → objekt med alle giscus `data-*`-attributter (ren, node-testbar). `opts = {theme, lang}` valgfri.
  - `open(container, target, opts)` → fjerner ev. åpen widget (ÉN tråd om gangen, globalt), tømmer `container`, injiserer `<script src="https://giscus.app/client.js">` med attributtene + `crossorigin="anonymous"` + `async` i containeren. Returnerer `true`.
  - `close()` → fjerner åpen widget-container-innhold (om noen). Idempotent.
  - `isOpen(container)` → bool (om DENNE containeren holder den åpne widgeten) — så 💬-knappen kan toggle.

- [ ] **Step 1: Skriv feilende node-tester** (`tests/js/comments.test.js`, samme load-mønster som `tests/js/meta-info.test.js` — les den for oppsettet):

```js
test('attrs: komplett giscus-konfig med term', () => {
  const a = Comments.attrs('ssb/05839.Region');
  assert.equal(a['data-repo'], 'hmelberg/openstat-metadata');
  assert.equal(a['data-repo-id'], 'R_kgDOTjfgng');
  assert.equal(a['data-category'], 'Announcements');
  assert.equal(a['data-category-id'], 'DIC_kwDOTjfgns4DB9mu');
  assert.equal(a['data-mapping'], 'specific');
  assert.equal(a['data-term'], 'ssb/05839.Region');
  assert.equal(a['data-strict'], '1');
  assert.equal(a['data-loading'], 'lazy');
  assert.equal(a['data-theme'], 'preferred_color_scheme');
  assert.equal(a['data-lang'], 'en');
});
test('attrs: theme/lang kan overstyres, tomt mål gir tom term', () => {
  const a = Comments.attrs('', { theme: 'dark', lang: 'en' });
  assert.equal(a['data-term'], '');
  assert.equal(a['data-theme'], 'dark');
});
```

- [ ] **Step 2: Kjør → FAIL** (`node --test tests/js/comments.test.js` — modulen finnes ikke).

- [ ] **Step 3: Implementer** (IIFE `(function (global) { … global.Comments = {…}; })(typeof window !== 'undefined' ? window : globalThis);`):

```js
  var CFG = {
    repo: 'hmelberg/openstat-metadata', repoId: 'R_kgDOTjfgng',
    category: 'Announcements', categoryId: 'DIC_kwDOTjfgns4DB9mu',
    clientJs: 'https://giscus.app/client.js'
  };
  function attrs(target, opts) {
    opts = opts || {};
    return {
      'data-repo': CFG.repo, 'data-repo-id': CFG.repoId,
      'data-category': CFG.category, 'data-category-id': CFG.categoryId,
      'data-mapping': 'specific', 'data-term': String(target || ''),
      'data-strict': '1', 'data-reactions-enabled': '1',
      'data-emit-metadata': '0', 'data-input-position': 'top',
      'data-theme': opts.theme || 'preferred_color_scheme',
      'data-lang': opts.lang || 'en', 'data-loading': 'lazy'
    };
  }
  var _openContainer = null;
  function close() {
    if (_openContainer) { _openContainer.innerHTML = ''; _openContainer = null; }
  }
  function open(container, target, opts) {
    close();
    container.innerHTML = '';
    var s = (container.ownerDocument || document).createElement('script');
    s.src = CFG.clientJs; s.async = true;
    s.setAttribute('crossorigin', 'anonymous');
    var a = attrs(target, opts);
    for (var k in a) s.setAttribute(k, a[k]);
    container.appendChild(s);   // giscus erstatter script-tagen med iframe-widgeten
    _openContainer = container;
    return true;
  }
  function isOpen(container) { return _openContainer === container; }
```

DOM-delen (`open`/`close`) testes ikke i node (ingen DOM) — kun `attrs`. Legg script-tag i index.html.

- [ ] **Step 4: Kjør → PASS.** Full node-suite også.
- [ ] **Step 5: Commit** — `git add js/comments.js tests/js/comments.test.js index.html && git commit -m "feat: Comments-modul — giscus-tråd per mål (én åpen om gangen, lazy)"`

---

### Task 2: Variabelpanelet i alle moduser + 💬-tråd

**Files:**
- Modify: `index.html` (klikk-wiring :4390–4398, `showVariableDetail` :4422, `renderVariableDetailHtml` :4253-området)
- Modify: `js/i18n/en.js` (nye nøkler)
- Modify: `app.css` (`.meta-info-community`-ramme)

**Interfaces:**
- Consumes: `Comments.open/close/isOpen` (Task 1), `MetaInfo.commentUrl` (leveranse A), `nonPyRuntime(ds)` (:4379, beholdes som hjelpefunksjon), `inferKindFromDtype` (:4413), `window.lastDatasetInfo[ds]` (`{columns, dtypes, nrows, runtime}`).

Ingen enhetstest-fil (inline index.html) — klikk-verifiseres i Task 7. Kravene:

- [ ] **Step 1: Fjern inngangs-gaten.** I klikk-handleren (:4390–4398): fjern `if (rt) return rDatasetNotice(rt);` — kall alltid `showVariableDetail(ds, v)`. `rDatasetNotice` slettes hvis ingen andre kallsteder (grep først; individata-modalen har egen R-vei, se kommentaren :4399).
- [ ] **Step 2: Stats-delen gates INNE i panelet.** Les hele `showVariableDetail` før endring. Dagens pyodide-avhengige innhenting (describe/fordeling/kategorier) kjøres KUN når `runtime` for datasettet er python (`!m.runtime || m.runtime === 'python'` — pyodide-datasett har udefinert eller 'python'-runtime; verifiser mot :4111-mønsteret). For andre runtimes bygges `data` fra `lastDatasetInfo` alene: `{dtype: dtypes[varName], kind: inferKindFromDtype(dtypes[varName]), n: nrows}` — INGEN stats-seksjon, INGEN forklaringsmelding (stille utelatelse). Metadata-delen (art, dtype, `variable_metadata`-beskrivelse via `cat`, `# meta`-notater fra Task 5-leveransen i A, lenker, «Mer informasjon») rendres som i dag for alle.
- [ ] **Step 3: 💬 blir tråd-toggle.** I `renderVariableDetailHtml`-lenkeseksjonen (A la inn `MetaInfo.commentUrl`-lenken): erstatt lenken med `<button class="meta-info-comment-btn">💬 …t('Kommentarer')…</button>` + tom `<div class="meta-info-community"></div>` under. Klikk: toggle — `Comments.isOpen(div) ? Comments.close() : Comments.open(div, dsName + '.' + varName)`. I rammen: overskriftslinje `t('Fra fellesskapet')` + liten `Åpne på GitHub`-lenke (`MetaInfo.commentUrl(dsName + '.' + varName)`, `target="_blank"`). CSS: `.meta-info-community` — tydelig ramme (stiplet border + `t('Fra fellesskapet')`-merke), i stil med `.meta-info-user`-reglene i app.css (fra A, app.css:675-området).
- [ ] **Step 4: en.js-nøkler** for alle nye `t('…')`-strenger (grep dine egne nye kall; mønster fra commit b125600).
- [ ] **Step 5: Verifiser** — `node --check` på hoved-script-blokka (mønster fra Task 4/5 i A: ekstraher blokka, kjør node --check), `node --test 'tests/js/*.test.js'` grønn. Re-les diffen hunk for hunk.
- [ ] **Step 6: Commit** — `feat: variabelpanel i alle moduser — stats kun python (stille ellers), giscus-tråd`

---

### Task 3: Datasett-ⓘ + metadata-container i Datasett-listen

**Files:**
- Modify: `index.html` (`updateSidebarDatasets` :4347–4409 + nye hjelpere ved A-hjelperne :7678ff)
- Modify: `app.css`, `js/i18n/en.js`

**Interfaces:**
- Consumes: `MetaInfo.merge/render` + `metaFreshMetas()`/`metaLabels()` (A, :7685–7693), `DataDirectives.parse/resolve`, `Comments` (Task 1), `/api/metadata`.
- Produces: `datasetProvenance(dsName)` → `{url, kind, table, registerId}|null` — slår opp aliasets load-linje i editoren: `var p = DataDirectives.parse(scriptInput.value); var res = DataDirectives.resolve(p, []); var i = res.findIndex(r => r.alias === dsName);` → `{url: res[i].url, kind: res[i].kind, table: res[i].table, registerId: String(p.loads[i].target).split('/')[0]}`. Konsumeres av Task 5 («kjent kilde»-sjekken).

- [ ] **Step 1: ⓘ på datasettraden.** I `updateSidebarDatasets` (:4357–4375): legg `<button class="meta-info-btn" data-meta-ds="…">ⓘ</button>` i `.sidebar-dataset-name`-linjen (title/aria via `t('Vis metadata')` — nøkkelen finnes fra A) + skjult `<div class="meta-info-container" data-meta-ds-container="…">` mellom navnelinjen og `metaLine`. Klikk-wiring i samme funksjon som eksisterende `.sidebar-var-row`-wiring (:4390, per-element-listeners er idiomet her — følg det).
- [ ] **Step 2: Container-innhold ved klikk (lazy).** Rekkefølge per spec §1: (1) `# meta`-innhold for `dsName` (`MetaInfo.merge(apiMeta, metaFreshMetas(), dsName)` → `MetaInfo.render(mi, {commentTarget: dsName, labels: metaLabels()})` — gjenbruk mønsteret fra A:s `metaRender` :7719ff); (2) proveniens-linje: `datasetProvenance(dsName)` → `kilde: <url som lenke> (format)` eller register-form; (3) rader × kolonner fra `lastDatasetInfo`; (4) registerkilde-berikelse: hvis `registerId` finnes og nøkkelform `registerId + '/' + table`-aktig — fetch `/api/metadata?source=<registerId>&table=<tableForMeta>` der `tableForMeta = kind === 'sdmx' ? table.split('/')[0] : table` (sdmx-item.table har `/all`-nøkkelsuffiks — verifiser med curl mot `http://localhost:8888/api/metadata?source=oecd&table=OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE` at 200 kommer); cache svaret i `window.__datasetMetaCache = window.__datasetMetaCache || {}` nøklet på `registerId + '/' + tableForMeta`; 400/feil → stille degradering (vis (1)–(3) uansett + dempet `t('(kunne ikke hente kildemetadata)')` KUN ved faktisk feilet forsøk); (5) 💬-knapp + `.meta-info-community`-div (samme toggle-mønster som Task 2, mål = `dsName`).
- [ ] **Step 3: CSS** — gjenbruk `.meta-info-btn`/`.meta-info-container` fra A; ev. små justeringer for plassering i datasettraden (høyrestilt på navnelinjen).
- [ ] **Step 4: Verifiser** som Task 2 Step 5 (node --check + suite + diff-gjennomlesing).
- [ ] **Step 5: Commit** — `feat: datasett-ⓘ — metadata-container med # meta, proveniens og kildeberikelse i Datasett-listen`

---

### Task 4: Slank kildeflate — én samlet container per kilde

**Files:**
- Modify: `index.html` (`updateSidebarSources` + `metaRender`/`metaToggleSource`/`metaToggleVar` :7678–7830)
- Modify: `app.css`, `js/i18n/en.js`

**Interfaces:**
- Consumes: `MetaInfo.merge/render/forVariable/renderVariable`, `metaFreshMetas`/`metaLabels`/`metaEnsure` (A), `Comments` (Task 1).

- [ ] **Step 1: Fjern alltid-synlige variabelrader.** `updateSidebarSources` rendrer nå per kilde KUN: navnelinje (hele raden klikkbar — navn + ⓘ er ETT målpunkt, `cursor:pointer` på hele `.sidebar-src-head`) + skjult container. Advarselsradene for ukjente `# meta`-mål består uendret (:7770–7791-logikken).
- [ ] **Step 2: Samlet container.** Klikk på raden (event-delegeringen fra A består — utvid selektoren til hele `.sidebar-src-head`): toggle container med, i rekkefølge: (1) `# meta` for kilde-aliaset (filkilder: alias = nøkkel som i dag; registerkilder: connect-aliasets `# meta` — target = `key.split('/')[0]` NÅR aliaset sammenfaller med register-id, ellers nøkkelen som i dag); (2) kildemetadata (dagens `metaEnsure`-vei uendret); (3) **variabelliste INNE i containeren**: `<div class="meta-info-varlist">` med én klikkbar rad per variabel (fra `entry.columns`) — klikk åpner variabelinfo (dagens `MetaInfo.renderVariable(MetaInfo.forVariable(...))`-mønster fra `metaToggleVar` :7761ff) i en sub-container rett under raden, inne i hovedcontaineren; (4) 💬-knapp + community-div (mål = nøkkelen, f.eks. `ssb/05839`).
- [ ] **Step 3: Rydd død kode.** De gamle `data-meta-var`-radene på toppnivå og deres delegering fjernes/flyttes inn i containeren. Grep etter foreldreløse CSS-regler og selektorer.
- [ ] **Step 4: Verifiser** som Task 2 Step 5.
- [ ] **Step 5: Commit** — `feat: kildeflaten slanket — én samlet container per kilde med variabelliste inni`

---

### Task 5: Stale datasett — grå ut, sorter, «Kjør scriptet i <modus>»

**Files:**
- Create: `js/dataset-order.js`
- Create: `tests/js/dataset-order.test.js`
- Modify: `index.html` (`updateSidebarDatasets` :4347 + script-tag ved de andre), `app.css`, `js/i18n/en.js`

**Interfaces:**
- Produces (global `DatasetOrder`-IIFE): `order(info, activeRuntime)` → `{active: [navn…], stale: [navn…]}` — `active` = oppføringer der `entry.runtime` matcher `activeRuntime` (udefinert runtime regnes som `'python'`; `activeRuntime`-verdier er modus-id-ene: `python|r|duckdb|brython|micropython|javascript` — merk at motor-taggingen bruker `'javascript'` (:2858-området tagger JS-datasett), verifiser mot `refreshDatasetSidebarFromEngineInfo`-kallstedene). Begge lister beholder innbyrdes opprinnelig rekkefølge.
- Consumes: `datasetProvenance(dsName)` (Task 3), `currentMode()` (:2884 — bruk `activeEditorMode`-verdien; verifiser nøyaktig variabelnavn/uttrykk ved lesing).

- [ ] **Step 1: Feilende node-tester:**

```js
test('order: aktiv modus først, stale etter, rekkefølge bevart', () => {
  const info = { a: {runtime:'brython'}, b: {}, c: {runtime:'python'}, d: {runtime:'r'} };
  assert.deepEqual(DatasetOrder.order(info, 'python'), { active: ['b','c'], stale: ['a','d'] });
  assert.deepEqual(DatasetOrder.order(info, 'brython'), { active: ['a'], stale: ['b','c','d'] });
});
test('order: tom info gir tomme lister', () => {
  assert.deepEqual(DatasetOrder.order({}, 'python'), { active: [], stale: [] });
});
```

- [ ] **Step 2: FAIL-kjøring.**
- [ ] **Step 3: Implementer modulen** (ren, ~15 linjer) + wiring i `updateSidebarDatasets`: rendre `active`-navnene først, deretter `stale` med klasse `sidebar-dataset-stale` (CSS: `opacity:.55`) og merkelapp `(fra <runtime>)` i navnelinjen (`t('fra {rt}', {rt})`-stil — sjekk i18n-interpolasjonsmønsteret `{mal}` fra A). Variabelrad-klikk og ⓘ på stale datasett: i stedet for panel/container vises en liten inline-forklaring under raden: `t('Datasettet ble lastet i {rt}-modus. Kjør scriptet i denne modusen for å hente det inn (mellomlagrede data gjør det raskt).')` + knapp `t('Kjør scriptet')` som gjør `document.getElementById('btnRun').click()`. (Én knapp for både kilde-datasett og beregnede — kjøringen materialiserer begge; designavklaring i Global Constraints.)
- [ ] **Step 4: PASS + full node-suite + node --check-mønsteret.**
- [ ] **Step 5: Commit** — `feat: stale datasett — grået m/ merkelapp, sortert nederst, kjør-i-modus-knapp`

---

### Task 6: Eksempler — brython-oppdatering + nye pyodide (OECD + SSB)

**Files:**
- Modify: `examples/brython/bry32_meta_csv.txt`, `bry33_meta_ssb.txt`, `bry34_meta_variabelpanel.txt`, `bry35_meta_lenker_advarsel.txt`
- Create: `examples/python/ex_meta_oecd.txt`, `examples/python/ex_meta_ssb.txt`
- Modify: `examples/manifest.json` (via `python3 examples/generate_manifest.py`)

- [ ] **Step 1: Brython-eksemplene.** Bytt alias `peng` → `penguins` overalt i bry32 (så samme data ikke ser ut som to datasett på tvers av eksempler); oppdater kommentartekstene i alle fire til NY UI: ⓘ ligger på datasettraden i Datasett-listen; kilderaden i «Tilkoblede kilder» åpnes med ett klikk og har variabellisten INNE i containeren; 💬 åpner kommentartråd direkte i sidepanelet.
- [ ] **Step 2: `examples/python/ex_meta_oecd.txt`** (pandas, pyodide):

```
# label: «# meta» + OECD — data og metadata fra kilden
# Eksempel: OECD-data via sdmx. ⓘ på datasettraden «le» viser # meta-notatet
# ditt øverst og kildens egne metadata (tittel, utgiver, variabler) hentet
# fra /api/metadata. 💬 åpner kommentartråden for målet.
# connect https://sdmx.oecd.org/public/rest/data as oecd, kind(oecd)
# read oecd/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all?startPeriod=2020 as le
# meta le Forventet levealder (OECD Health Statistics), lastet via SDMX
# meta le https://www.oecd.org/en/data/indicators/life-expectancy-at-birth.html Om indikatoren
import pandas as pd

le.head(10)
```

- [ ] **Step 3: `examples/python/ex_meta_ssb.txt`** — samme innhold som bry33 men pandas/pyodide (`import pandas as pd`, `bef.head(10)`), inkl. `indicators(Personer)` (ContentsCode er obligatorisk hos SSB) og v2-URL-en.
- [ ] **Step 4: Regenerer manifest** (`python3 examples/generate_manifest.py`) og bekreft at de nye/endrede oppføringene står der.
- [ ] **Step 5: Kjør begge python-eksemplene i browser** (netlify dev): verifiser at dataene faktisk laster (OECD-CSV-en og SSB-json-stat2-en) og at ⓘ-containeren viser både `# meta`-innholdet og kildemetadata. Fiks ev. query-detaljer (OECD-nøkkelen er verifisert i tests/js-fixturene, men live-endring kan skje).
- [ ] **Step 6: Commit** — `docs: # meta-eksempler oppdatert til ny UI + pyodide-eksempler (OECD sdmx, SSB)`

---

### Task 7: Kontrollør-verifisering (giscus-app + klikk-smoke + full suite)

**Files:** Ingen kodeendringer (ev. småfikser committes separat).

- [ ] **Step 1 (HANS, engangs — subagent skal IKKE):** Installer giscus-appen: åpne `https://github.com/apps/giscus` → Install → velg `hmelberg/openstat-metadata`. (Kategorien Announcements + ID-ene er allerede verifisert.) Til dette er gjort viser 💬-widgeten en «giscus is not installed»-feil — akseptabel midlertidig degradering.
- [ ] **Step 2: Klikk-basert smoke-test** (kontrollør, netlify dev + Chrome, EKTE klikk — aldri programmatiske funksjonskall som omgår gates): i BÅDE brython- og python-modus: (a) datasett-ⓘ åpner container med # meta øverst + proveniens + kildeberikelse (OECD/SSB-eksemplene); (b) variabelklikk åpner panel — stats KUN i python, stille utelatt i brython; (c) kildeflate: ett klikk på raden → samlet container m/ variabelliste inni, variabelklikk der viser kodeliste; (d) 💬 i alle tre flater laster giscus-iframe (etter Step 1) med riktig term, «Åpne på GitHub»-lenken virker; (e) stale-flyt: kjør i brython, bytt til python → grået + nederst + merkelapp; klikk → forklaring + «Kjør scriptet»-knapp som materialiserer datasettene; (f) ukjent `# meta`-mål-advarselen består; (g) NETTVERK: ingen giscus-/metadata-kall ved sideinnlasting (lazy-kravet).
- [ ] **Step 3: Full suite:** `node --test 'tests/js/*.test.js'`, `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`, `python3 -m pytest tests/ -q` — alle grønne.
- [ ] **Step 4: Ledger-oppdatering. INGEN push** — push er Hans' beslutning etter egen prøving.

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §1→Task 3 (ⓘ/container) + Task 2 (variabelpanel alle moduser, stille stats-utelatelse); §2→Task 4; §3→Task 1 (modul) + Task 2/3/4 (knapp i alle tre flater) + Task 7 Step 1 (app-installasjon); §4→Task 5 (grå/sorter/kjør-knapp — «Hent inn»-valget konkretisert til kjør-scriptet-knappen, avklart som planfase-beslutning i Global Constraints); §5→Task 6; §6 roadmap → bevisst uimplementert; §7→Task 7 + node-tester i Task 1/5.
- **Plassholder-skann:** Task 2–4 gir krav+ankere for index.html (etablert A-mønster — implementeren MÅ lese de faktiske funksjonene; linjeankere verifisert 2026-07-26); moduler og eksempler har komplett kode. Ingen TBD-er.
- **Type-konsistens:** `Comments.attrs/open/close/isOpen` brukt likt i Task 1-definisjon og Task 2/3/4-konsum; `datasetProvenance` definert i Task 3, konsumert i Task 5; `DatasetOrder.order(info, activeRuntime)` → `{active, stale}` konsistent; giscus-ID-ene identiske i Global Constraints, Task 1-test og -kode.
