# R-URL-bro-oppfølgingene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lukk R-URL-bro-slutt-reviewens fire kodeoppfølginger: Forklar-inngangens manglende bro-kall, stille 50MB-trunkering (alle fire proxy-konsumenter), kontrolltegn i .ost_json_str, BASE_R-lista.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-r-url-bro-oppfolging-design.md. Task 1 = js-filene + node-tester (TDD); Task 2 = index.html (ikke node-testbart — desk+review+smoke).

**Tech Stack:** js/data-loader.js (fetchRawUrl:106, fetchLoadTarget:72, L2-cache-avlesningen ~:166), js/read-bridge.js (syncXhr:112, forPyodideSync:128, rPatchSource `.ost_json_str`:278 og `.ost_fetch`-payloaden:~320), index.html (forklarRunOneRBlock:12023, BASE_R:9065), tests/js/read-bridge.test.js + tests/js/data-directives-use.test.js el.l. (finn fila som alt tester fetchLoadTarget/fetchRawUrl — grep).

## Global Constraints

- ALDRI push; gren `r-url-bro-oppfolging` fra main; ALDRI git add under .superpowers/.
- Trunkering er alltid HØYLYTT FEIL (throw/error/ERR) — aldri warn, aldri stille (avkortet CSV = feil data).
- Feilmeldingsform: «avkortet ved proxyens 50MB-grense (x-hent-truncated) for <hva>».
- Ingen TS-endringer (hent-core setter alt headeren) — deno røres ikke (289/0).
- Suiter: node 1060/0 ved start + nye tester; pytest 1447/0 urørt.

---

### Task 1: Trunkerings-sveipet + .ost_json_str (js + tester)

**Files:**
- Modify: `js/data-loader.js`, `js/read-bridge.js`
- Test: `tests/js/read-bridge.test.js` (append) + testfila som dekker fetchRawUrl/fetchLoadTarget (grep `fetchRawUrl` i tests/js/ — append der)

**Interfaces:**
- Produces: `syncXhr` returnerer nå `{status, bytes, truncated}` (truncated = `getResponseHeader('x-hent-truncated') === '1'`); feilveiene uendret `{status, bytes: null}`.
- `_setXhr`-fakes kan sette `truncated: true`.

- [ ] **Step 1: Røde tester**

(a) fetchRawUrl (i fila som alt tester den — følg dens fake-fetchImpl-mønster):

```js
test('fetchRawUrl: x-hent-truncated → høylytt feil, aldri stille avkortet data', async () => {
  const resp = { ok: true, headers: { get: (h) => h === 'x-hent-truncated' ? '1' : (h === 'content-type' ? 'text/csv' : null) },
                 arrayBuffer: async () => new ArrayBuffer(8) };
  await assert.rejects(
    () => DL.fetchRawUrl('/api/hent?url=x', { fetchImpl: async () => resp }),
    /50MB-grense/);
});
```

(b) fetchLoadTarget proxy-gren: samme fake, forvent reject /50MB-grense/.

(c) forPyodideSync (read-bridge.test.js):

```js
test('forPyodideSync: truncated-flagg fra XHR → error-retur, ingen cache-skriv', () => {
  RB._reset();
  RB._setXhr(() => ({ status: 200, bytes: new Uint8Array([1]), truncated: true }));
  const r = RB.forPyodideSync('/api/hent?url=stor');
  assert.equal(r.bytes, null);
  assert.match(r.error, /50MB-grense/);
  assert.equal(RB.getCached('/api/hent?url=stor'), null);
});
```

(d) kildetekst-asserter (read-bridge.test.js): rPatchSource inneholder `x-hent-truncated` (i .ost_fetch-payloaden) og kontrolltegn-escaping i .ost_json_str (`\\n`-gsub + C0-stripping).

Kjør → FAIL.

- [ ] **Step 2: Implementer**

data-loader.js — hjelper ved proxyHeaders:

```js
  // x-hent-truncated (R-URL-bro-oppfølging §2): proxyen avkorter ved 50MB
  // og flagger det — en avkortet CSV er FEIL DATA og skal feile høylytt,
  // aldri leveres stille (husets aldri-stille-feil-data).
  function assertNotTruncated(resp, what) {
    if (resp && resp.headers && typeof resp.headers.get === 'function' &&
        resp.headers.get('x-hent-truncated')) {
      throw new Error('avkortet ved proxyens 50MB-grense (x-hent-truncated) for ' + what);
    }
  }
```

Kall: i `fetchRawUrl` rett før `resp.arrayBuffer()`; i `fetchLoadTarget` etter ok-sjekken i viaProxy-funksjonen og i r0-grenen (r1-direkte har aldri headeren — fremmede verter); ved L2-cache-avlesningen (`hit.arrayBuffer` ~:166) — Cache API bevarer headere, så sjekken renser også stale trunkerte oppføringer (verifiser lokalt at `hit` er Response-aktig før du antar).

read-bridge.js — syncXhr suksesslinje:

```js
    return { status: xhr.status, bytes: u8,
             truncated: xhr.getResponseHeader('x-hent-truncated') === '1' };
```

forPyodideSync — etter proxy-retry-blokken, FØR `if (r.bytes === null)`-sjekken (dekker begge legg, hindrer cache-skriv):

```js
    if (r.bytes !== null && r.truncated) {
      return { bytes: null, error: 'avkortet ved proxyens 50MB-grense (x-hent-truncated) for ' + url };
    }
```

rPatchSource `.ost_fetch`-payload — etter status-sjekklinja:

```js
      '    "    if (x.getResponseHeader(\\"x-hent-truncated\\")) return \\"ERR:avkortet ved proxyens 50MB-grense (x-hent-truncated)\\";",',
```

(NB: transkriber sitatlagene mot nabolinjene i samme array.)

rPatchSource `.ost_json_str` — MÅL-R-kilden (skriv om til fixed=TRUE-form, semantisk lik for de to eksisterende):

```r
.ost_json_str <- function(s) {
  s <- gsub("\\", "\\\\", s, fixed = TRUE)
  s <- gsub("\"", "\\\"", s, fixed = TRUE)
  s <- gsub("\n", "\\n", s, fixed = TRUE)
  s <- gsub("\r", "\\r", s, fixed = TRUE)
  s <- gsub("\t", "\\t", s, fixed = TRUE)
  s <- gsub("[\x01-\x1f]", "", s)
  paste0("\"", s, "\"")
}
```

Kommentar (norsk): kontrolltegn i input knakk den genererte JS-strengen; \n/\r/\t escapes, øvrige C0 droppes (ugyldige i URL/sti uansett). VERIFISER: dump rPatchSource til fil (node -e) og `Rscript --vanilla -e 'parse(...)'` + kjør funksjonen i Rscript med input som inneholder `\n` og sjekk at output er gyldig JS-strengliteral.

- [ ] **Step 3: Suiter → PASS** — node (1060 + nye, forventet ~1065/0), pytest 1447/0.

- [ ] **Step 4: Commit** — `fix(bro): x-hent-truncated håndheves høylytt i alle fire proxy-konsumenter; .ost_json_str tåler kontrolltegn (r-url-bro-oppfølging §2-3)`

---

### Task 2: Forklar-inngangen + BASE_R (index.html)

**Files:** Modify: `index.html` (forklarRunOneRBlock:12023, BASE_R:9065)

- [ ] **Step 1: Bro-kallene i forklarRunOneRBlock**

Rett FØR `try {`-blokken som kjører captureR (etter UI_R-init-blokken):

```js
          // R-URL-broen (oppfølging §1): Forklar er TREDJE R-inngang — samme
          // pre/post-kall som runHybridR (:9358/:9793) og notatbokcellene
          // (:10985), ellers mangler .ost_bridge_config (origin/auth) og
          // proxy-retry feiler ved tom origin. Begge er feiltolerante
          // (egen try/catch + console.warn) — ingen ny feilflate her.
          await rBridgePreRun(block.codeTrim);
```

Etter `finally`-blokken, FØR `scrollOutputToTop();`:

```js
          await rBridgePostRun();
```

Verifiser scope: rBridgePreRun/PostRun (definert :9282/:9309) må være synlige fra forklarRunOneRBlock — sjekk at begge ligger i samme funksjonsscope (notatbokcellen :10985 bruker dem alt; er Forklar i et dypere scope er de fortsatt synlige via closure).

- [ ] **Step 2: BASE_R-utvidelsen**

```js
      var BASE_R = { base: 1, utils: 1, stats: 1, graphics: 1, grDevices: 1,
                     methods: 1, datasets: 1, tools: 1, parallel: 1,
                     compiler: 1, webr: 1,
                     // basetilbehør + recommended-settet følger med webR —
                     // install-forsøk er bomskudd (r-url-bro-oppfølging §4)
                     grid: 1, splines: 1, stats4: 1, tcltk: 1,
                     MASS: 1, Matrix: 1, boot: 1, class: 1, cluster: 1,
                     codetools: 1, foreign: 1, KernSmooth: 1, lattice: 1,
                     mgcv: 1, nlme: 1, nnet: 1, rpart: 1, spatial: 1,
                     survival: 1 };
```

- [ ] **Step 3: Suiter uendret grønne + commit** — `fix(forklar+r): Forklar-inngangen får bro-kallene (tredje R-inngang); BASE_R dekker basetilbehør+recommended (r-url-bro-oppfølging §1+§4)`

---

## Kontrollørens sluttsteg

Slutt-review (hele diffen), lett live-smoke (normal R-kjøring m/ URL — regresjonsvern for .ost_json_str/bro; Forklar-E2E ligger hos Hans i §8d-løpet), merge+push+ledger.
