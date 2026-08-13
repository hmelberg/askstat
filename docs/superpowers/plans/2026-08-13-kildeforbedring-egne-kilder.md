# Kildeforbedring egne kilder — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementere spec
`docs/superpowers/specs/2026-08-13-kildeforbedring-egne-kilder-design.md`
fullt ut: forslagsbasert forbedring av egendefinerte kildebeskrivelser
(knappeutløst etter svar med friksjon, diff-modal med Bruk/Forkast og
flerrunde-tilbakemelding), egne kopier av innebygde kilder med
guide-fortrengning (§8), og admin-knappen «Send som PR» (§9).

**Architecture:** Ny ren klientmodul `js/kilde-forslag.js` (ES5 IIFE +
module.exports, node-testbar: payloadbygger m/scrub, svarparser, linjediff,
modal). Nytt single-shot-endepunkt `kilde-forslag.ts` etter
dm-vurder/ask-ruter-mønsteret (gate + BYOK + provider-dispatch), promptbygger
i `_lib/kilde-forslag-prompt.ts`. §8: kopi-funksjoner i `js/packs.js`
(fetch-seamen finnes), skip-sett i `makeGuideAttacher`. §9: GitHub-kall i
`_lib/kilde-pr-core.ts` (injisert fetch, deno-testet), endepunkt bak
`adminGate` UTEN BYOK-forbikjøring.

**Tech Stack:** Vanilla ES5-JS (IIFE + module.exports), node:test,
Deno/TypeScript edge functions, Anthropic/OpenAI-kompatible leverandører via
eksisterende `_lib/providers`, GitHub REST v3.

## Global Constraints

- js/-filer: ES5 (`var`, function-uttrykk), `'use strict'`, IIFE med
  `(typeof window !== 'undefined' ? window : globalThis)`, norske kommentarer,
  `module.exports` for node-testbarhet (mønster: `js/feil-telemetri.js`).
- Node-tester: `node --test 'tests/js/*.test.js'` — glob-en MÅ i fnutter.
  Enkeltfil: `node --test tests/js/kilde-forslag.test.js`.
- Deno-tester: `cd netlify/edge-functions && deno test --allow-all _lib/`.
- Caps (spec §2, verbatim): script 20 000 tegn, error 4 000, trace 4 000,
  doc 40 000, sources 60, payload-budsjett 200 000 UTF-8-BYTES (ikke
  .length), server maxBodyBytes 250 000, maxTokens 16 000.
- Scrub er OBLIGATORISK på all utgående script-/feiltekst:
  `DataDirectives.scrubKeys` på script, `FeilTelemetri.maskerNokler` på
  feil/trace/tilbakemelding — injiserbare deps i rene funksjoner.
- i18n: nye UI-strenger er ENGELSKE nøkler via `t('…')`/`T('…')`;
  `lang='no'` faller aldri tilbake til en; ordbøkene får nøklene i Task 13
  (før det vises engelsk fallback — det er OK). data-i18n overskriver
  child-noder — dynamisk tekst (rundeteller) i EGEN node uten data-i18n.
- Ingen nye avhengigheter, ingen npm-pakker, ingen eksterne diff-libs.
- Commit etter hver task; ALDRI push (push er Hans' beslutning i askstat).
- `netlify dev` cacher edge-moduler (restart + 400-smoke før manuell
  evaluering); Chrome cacher js/ (hard reload). Dev-porter 8899/3998.

---

### Task 1: Eksporter `maskerNokler` fra FeilTelemetri

**Files:**
- Modify: `js/feil-telemetri.js` (api-objektet nederst)
- Test: `tests/js/feil-telemetri.test.js`

**Interfaces:**
- Produces: `FeilTelemetri.maskerNokler(s: string): string` — maskerer
  `api_key=/apikey=/token=/key=/access_token=`-verdier til `$1=***`.
  Funksjonen FINNES allerede internt (js/feil-telemetri.js ~linje 25);
  den skal kun eksporteres. Task 2/12 konsumerer den.

- [ ] **Step 1: Skriv feilende test** — legg til i `tests/js/feil-telemetri.test.js`:

```js
test('maskerNokler er eksportert og maskerer nøkkel-parametre', () => {
  assert.equal(typeof FT.maskerNokler, 'function');
  assert.equal(FT.maskerNokler('GET https://x?api_key=hemmelig123&y=1'),
    'GET https://x?api_key=***&y=1');
  assert.equal(FT.maskerNokler('token=abc def access_token=xyz'),
    'token=*** def access_token=***');
  assert.equal(FT.maskerNokler(null), '');
});
```

- [ ] **Step 2: Kjør testen — den skal feile**

Run: `node --test tests/js/feil-telemetri.test.js`
Expected: FAIL — `FT.maskerNokler is not a function` (typeof er 'undefined').

- [ ] **Step 3: Eksporter funksjonen** — i `js/feil-telemetri.js`, utvid
api-objektet nederst:

```js
  var api = { byggFeilrapport: byggFeilrapport, sendFeilrapport: sendFeilrapport,
              telemetriAv: telemetriAv, maskerNokler: maskerNokler };
```

- [ ] **Step 4: Kjør testen — grønn**

Run: `node --test tests/js/feil-telemetri.test.js`
Expected: PASS (alle eksisterende + den nye).

- [ ] **Step 5: Commit**

```bash
git add js/feil-telemetri.js tests/js/feil-telemetri.test.js
git commit -m "feat: eksporter FeilTelemetri.maskerNokler (gjenbruk i kildeforbedring)"
```

---

### Task 2: `js/kilde-forslag.js` — payloadbygger og knappevilkår (ren kjerne)

**Files:**
- Create: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js` (ny)

**Interfaces:**
- Produces: `KildeForslag.byggForslagsPayload(inn, deps) -> payload` der
  `inn = {docs:[{id,name,text}], question, tolkning, mode, depth,
  runs:[{script,error}], ok_script, trace:[str], sources:[str],
  history:[{forslag_raatekst, tilbakemelding}], ui_lang}` og
  `deps = {scrub?, masker?}` (default: `DataDirectives.scrubKeys` /
  `FeilTelemetri.maskerNokler` fra global). Payloadens `trace` er ÉN streng
  (join('\n'), klippet).
- Produces: `KildeForslag.skalViseKnapp(ctx) -> boolean` — `ctx` har samme
  form som `inn` pluss `kastedeTurer: number`.
- Eksport: `global.KildeForslag = api` + `module.exports = api`
  (samme mønster som js/feil-telemetri.js).

- [ ] **Step 1: Skriv feilende tester** — opprett `tests/js/kilde-forslag.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const KF = require('../../js/kilde-forslag.js');

const deps = { scrub: (s) => String(s).replace(/x/g, 'y'), masker: (s) => String(s).replace(/hemmelig/g, '***') };

test('byggForslagsPayload klipper felter og kjører scrub/masker', () => {
  const p = KF.byggForslagsPayload({
    docs: [{ id: 'user:a', name: 'n'.repeat(500), text: 't'.repeat(50000) }],
    question: 'q'.repeat(9000), tolkning: 'i'.repeat(9000), mode: 'python', depth: 'fast',
    runs: [{ script: 'x'.repeat(30000), error: 'hemmelig ' + 'e'.repeat(9000) }],
    ok_script: 'xx', trace: ['a', 'hemmelig b'], sources: Array.from({ length: 100 }, (_, i) => 'u' + i),
    history: [{ forslag_raatekst: 'f'.repeat(60000), tilbakemelding: 'hemmelig tips' }],
    ui_lang: 'no',
  }, deps);
  assert.equal(p.docs[0].text.length, 40000);
  assert.equal(p.docs[0].name.length, 200);
  assert.equal(p.question.length, 4000);
  assert.equal(p.tolkning.length, 2000);
  assert.equal(p.runs[0].script.length, 20000);
  assert.ok(p.runs[0].script.startsWith('yyyy'));          // scrub FØR klipp
  assert.equal(p.runs[0].error.length, 4000);
  assert.ok(p.runs[0].error.startsWith('***'));            // masker FØR klipp
  assert.equal(p.ok_script, 'yy');
  assert.equal(p.trace, 'a\n*** b');                       // join + masker
  assert.equal(p.sources.length, 60);
  assert.equal(p.history[0].forslag_raatekst.length, 45000);
  assert.equal(p.history[0].tilbakemelding, '*** tips');
  assert.equal(p.ui_lang, 'no');
});

test('byggForslagsPayload dropper ELDSTE runs under 200k-BYTE-budsjettet, docs urørt', () => {
  const runs = Array.from({ length: 20 }, (_, i) => ({ script: i + '|' + 'a'.repeat(15000), error: 'e' }));
  const p = KF.byggForslagsPayload({ docs: [{ id: 'user:a', name: 'A', text: 'd'.repeat(39000) }], runs }, deps);
  assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf-8') <= 200000);
  assert.ok(p.runs.length < 20);
  assert.ok(p.runs[p.runs.length - 1].script.startsWith('19|'));   // nyeste beholdes
  assert.equal(p.docs[0].text.length, 39000);                       // aldri klippet av budsjettet
});

test('byggForslagsPayload teller UTF-8-BYTES, ikke UTF-16-lengde', () => {
  const runs = Array.from({ length: 30 }, () => ({ script: 'æøå'.repeat(4000), error: 'e' }));
  const p = KF.byggForslagsPayload({ docs: [], runs }, deps);
  assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf-8') <= 200000);
});

// Drift-test (spec §7, KEYS-regex-lærdommen): DEFAULT-depsene skal være
// koblet til de EKTE scrub-funksjonene — feiler hvis noen senere «rydder
// bort» koblingen. require av feil-telemetri setter globalThis.FeilTelemetri,
// som byggForslagsPayload leser ved kall uten deps.
test('drift: default masker er FeilTelemetri.maskerNokler (scrubben kan ikke ryddes bort)', () => {
  require('../../js/feil-telemetri.js');
  const p = KF.byggForslagsPayload({ runs: [{ script: 's', error: 'GET https://x?api_key=hemmelig123' }] });
  assert.equal(p.runs[0].error, 'GET https://x?api_key=***');
});

test('skalViseKnapp: egne kilder + friksjon', () => {
  const doc = [{ id: 'user:a', name: 'A', text: 't' }];
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [{}], kastedeTurer: 0 }), true);
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [], kastedeTurer: 1 }), true);
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [], kastedeTurer: 0 }), false);  // ingen friksjon
  assert.equal(KF.skalViseKnapp({ docs: [], runs: [{}], kastedeTurer: 3 }), false); // ingen egne kilder
  assert.equal(KF.skalViseKnapp(null), false);
});
```

- [ ] **Step 2: Kjør testene — de skal feile**

Run: `node --test tests/js/kilde-forslag.test.js`
Expected: FAIL — `Cannot find module '../../js/kilde-forslag.js'`.

- [ ] **Step 3: Opprett `js/kilde-forslag.js`** med ren kjerne:

```js
// js/kilde-forslag.js — forslagsbasert forbedring av egendefinerte
// kildebeskrivelser (spec docs/superpowers/specs/2026-08-13-kildeforbedring-
// egne-kilder-design.md). Ren kjerne først (node-testet): payloadbygger
// m/obligatorisk scrub (§2), svarparser, linjediff, knappevilkår.
// DOM-delen (modal, knapp) nederst — bailer i node.
(function (global) {
  'use strict';

  // Caps fra spec §2 — speiler telemetri-tallene i js/feil-telemetri.js.
  var CAPS = {
    DOC: 40000, NAVN: 200, SPORSMAL: 4000, TOLKNING: 2000,
    SCRIPT: 20000, ERROR: 4000, TRACE: 4000, SOURCES: 60,
    HIST_FORSLAG: 45000, HIST_TILBAKE: 4000, PAYLOAD_BYTES: 200000,
  };

  function klipp(s, n) { return String(s == null ? '' : s).slice(0, n); }
  // UTF-8-byte-lengde — norsk tekst (æøå) gjør .length-basert taking
  // løgnaktig trygg (samme lærdom som js/feil-telemetri.js).
  function byteLengde(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }

  function byggForslagsPayload(inn, deps) {
    inn = inn || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) ||
      function (s) { return s; };
    var masker = (deps && deps.masker) ||
      (global.FeilTelemetri && global.FeilTelemetri.maskerNokler) ||
      function (s) { return s; };
    var p = {
      docs: (inn.docs || []).map(function (d) {
        return { id: String(d.id || ''), name: klipp(d.name, CAPS.NAVN), text: klipp(d.text, CAPS.DOC) };
      }),
      question: klipp(inn.question, CAPS.SPORSMAL),
      tolkning: klipp(inn.tolkning, CAPS.TOLKNING),
      mode: inn.mode || '',
      depth: inn.depth || '',
      runs: (inn.runs || []).map(function (r) {
        return { script: klipp(scrub(r.script), CAPS.SCRIPT), error: klipp(masker(r.error), CAPS.ERROR) };
      }),
      ok_script: inn.ok_script ? klipp(scrub(inn.ok_script), CAPS.SCRIPT) : undefined,
      trace: klipp(masker((inn.trace || []).join('\n')), CAPS.TRACE) || undefined,
      sources: (inn.sources || []).slice(0, CAPS.SOURCES),
      history: (inn.history || []).map(function (h) {
        return { forslag_raatekst: klipp(h.forslag_raatekst, CAPS.HIST_FORSLAG),
                 tilbakemelding: klipp(masker(h.tilbakemelding), CAPS.HIST_TILBAKE) };
      }),
      ui_lang: inn.ui_lang || 'en',
    };
    // Budsjett (spec §2): dropp ELDSTE runs først, så trace — docs ALDRI.
    while (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.runs.length) p.runs.shift();
    if (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.trace) delete p.trace;
    return p;
  }

  // Vilkår for forbedringsknappen (spec §1): egne kilder aktive OG friksjon
  // (minst én feilet kjøring ELLER minst ett forkastet resonneringstrinn).
  function skalViseKnapp(ctx) {
    if (!ctx) return false;
    var harKilder = (ctx.docs || []).length >= 1;
    var friksjon = (ctx.runs || []).length >= 1 || (ctx.kastedeTurer | 0) >= 1;
    return !!(harKilder && friksjon);
  }

  var api = {
    byggForslagsPayload: byggForslagsPayload,
    skalViseKnapp: skalViseKnapp,
    _CAPS: CAPS,
  };
  global.KildeForslag = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof global.document === 'undefined') return; // node: kun ren kjerne
  // DOM-delen kommer i senere tasks (registerRun/openModal).
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Kjør testene — grønne**

Run: `node --test tests/js/kilde-forslag.test.js`
Expected: PASS (4 tester).

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: kilde-forslag ren kjerne — payloadbygger m/scrub+budsjett og knappevilkår"
```

---

### Task 3: `parseForslagSvar` — robust svarparser

**Files:**
- Modify: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- Produces: `KildeForslag.parseForslagSvar(text) ->
  {ok, forslag:[{id, ny_tekst, begrunnelse}], melding, raatekst}` —
  `ok:false` + tomt forslag ved parsefeil; `raatekst` alltid hele
  inputteksten (modalens fallback-visning i Task 7).

- [ ] **Step 1: Skriv feilende tester** — legg til i `tests/js/kilde-forslag.test.js`:

```js
test('parseForslagSvar: fenced json-blokk', () => {
  const r = KF.parseForslagSvar('Litt prat.\n```json\n{"forslag":[{"id":"user:a","ny_tekst":"NY","begrunnelse":"fordi"}],"melding":"ok"}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 1);
  assert.deepEqual(r.forslag[0], { id: 'user:a', ny_tekst: 'NY', begrunnelse: 'fordi' });
  assert.equal(r.melding, 'ok');
});

test('parseForslagSvar: naken JSON uten fence (klammespenn)', () => {
  const r = KF.parseForslagSvar('{"forslag":[],"melding":"ingen endring nødvendig"}');
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 0);
  assert.equal(r.melding, 'ingen endring nødvendig');
});

test('parseForslagSvar: søppel gir ok:false med raatekst', () => {
  const r = KF.parseForslagSvar('bare prosa uten json');
  assert.equal(r.ok, false);
  assert.deepEqual(r.forslag, []);
  assert.equal(r.raatekst, 'bare prosa uten json');
});

test('parseForslagSvar: forslag uten id/ny_tekst filtreres, tom ny_tekst filtreres', () => {
  const r = KF.parseForslagSvar(JSON.stringify({
    forslag: [{ id: 'user:a', ny_tekst: 'X' }, { id: 'user:b' }, { ny_tekst: 'Y' }, { id: 'user:c', ny_tekst: '   ' }],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 1);
  assert.equal(r.forslag[0].begrunnelse, '');
});
```

- [ ] **Step 2: Kjør — feiler** (`KF.parseForslagSvar is not a function`).

Run: `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 3: Implementer** i `js/kilde-forslag.js` (før `var api`):

```js
  // Svarparser (spec §3): fenced ```json-blokk foretrekkes; ellers
  // klammespenn (samme naive strategi som parseAskRoute i js/ask-view.js —
  // prompten krever JSON-objektet SIST i svaret). Parsefeil → ok:false og
  // raatekst til fallback-visning; aldri kast.
  function parseForslagSvar(text) {
    var raa = String(text == null ? '' : text);
    var obj = null;
    var m = raa.match(/```json\s*([\s\S]*?)```/);
    if (m) { try { obj = JSON.parse(m[1]); } catch (e) {} }
    if (!obj) {
      var start = raa.indexOf('{');
      var end = raa.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { obj = JSON.parse(raa.slice(start, end + 1)); } catch (e) {}
      }
    }
    if (!obj || typeof obj !== 'object') {
      return { ok: false, forslag: [], melding: '', raatekst: raa };
    }
    var liste = Array.isArray(obj.forslag) ? obj.forslag : [];
    return {
      ok: true,
      forslag: liste.filter(function (f) {
        return f && typeof f.id === 'string' && typeof f.ny_tekst === 'string' && f.ny_tekst.trim();
      }).map(function (f) {
        return { id: f.id, ny_tekst: f.ny_tekst,
                 begrunnelse: typeof f.begrunnelse === 'string' ? f.begrunnelse : '' };
      }),
      melding: typeof obj.melding === 'string' ? obj.melding : '',
      raatekst: raa,
    };
  }
```

…og legg `parseForslagSvar: parseForslagSvar,` inn i `api`-objektet.

- [ ] **Step 4: Kjør — grønne.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: parseForslagSvar — robust JSON-parse m/fence og fallback"
```

---

### Task 4: `linjeDiff` — LCS-linjediff uten avhengigheter

**Files:**
- Modify: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- Produces: `KildeForslag.linjeDiff(gammel, ny) ->
  [{type:'lik'|'ny'|'slettet', tekst}]` — linjebasert, rekkefølgebevarende.
  Task 7 rendrer dette.

- [ ] **Step 1: Skriv feilende tester:**

```js
test('linjeDiff: identisk gir kun lik', () => {
  assert.deepEqual(KF.linjeDiff('a\nb', 'a\nb'),
    [{ type: 'lik', tekst: 'a' }, { type: 'lik', tekst: 'b' }]);
});

test('linjeDiff: innsetting, sletting, erstatning', () => {
  assert.deepEqual(KF.linjeDiff('a\nc', 'a\nb\nc'),
    [{ type: 'lik', tekst: 'a' }, { type: 'ny', tekst: 'b' }, { type: 'lik', tekst: 'c' }]);
  assert.deepEqual(KF.linjeDiff('a\nb\nc', 'a\nc'),
    [{ type: 'lik', tekst: 'a' }, { type: 'slettet', tekst: 'b' }, { type: 'lik', tekst: 'c' }]);
  const er = KF.linjeDiff('a\nGAMMEL\nc', 'a\nNY\nc');
  assert.deepEqual(er.map((d) => d.type), ['lik', 'slettet', 'ny', 'lik']);
});

test('linjeDiff: tomme dokumenter', () => {
  assert.deepEqual(KF.linjeDiff('', ''), [{ type: 'lik', tekst: '' }]);
  assert.deepEqual(KF.linjeDiff('', 'x').filter((d) => d.type === 'ny'),
    [{ type: 'ny', tekst: 'x' }]);
});
```

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 3: Implementer** i `js/kilde-forslag.js` (før `var api`):

```js
  // Linjediff via LCS (spec §4) — dokumentene er ≤40k tegn (~1–2k linjer),
  // så O(n·m)-tabellen er ufarlig (Int32Array holder minnet nede).
  function linjeDiff(gammel, ny) {
    var a = String(gammel == null ? '' : gammel).split('\n');
    var b = String(ny == null ? '' : ny).split('\n');
    var n = a.length, m = b.length, i, j;
    var L = new Array(n + 1);
    for (i = 0; i <= n; i++) L[i] = new Int32Array(m + 1);
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    var ut = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ut.push({ type: 'lik', tekst: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ut.push({ type: 'slettet', tekst: a[i] }); i++; }
      else { ut.push({ type: 'ny', tekst: b[j] }); j++; }
    }
    while (i < n) { ut.push({ type: 'slettet', tekst: a[i] }); i++; }
    while (j < m) { ut.push({ type: 'ny', tekst: b[j] }); j++; }
    return ut;
  }
```

…og legg `linjeDiff: linjeDiff,` inn i `api`.

- [ ] **Step 4: Kjør — grønne.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: linjeDiff — LCS-linjediff for forslags-modalen"
```

---

### Task 5: Endepunktet `/api/kilde-forslag` (prompt + provider-dispatch)

**Files:**
- Create: `netlify/edge-functions/prompts/kilde-forslag.md`
- Create: `netlify/edge-functions/_lib/kilde-forslag-prompt.ts`
- Create: `netlify/edge-functions/_lib/kilde-forslag-prompt.test.ts`
- Create: `netlify/edge-functions/kilde-forslag.ts`
- Modify: `netlify.toml` (nytt `[[edge_functions]]`-innslag)

**Interfaces:**
- Consumes: `gate`, `extractByokKey`, `extractLlmKey`,
  `upstreamErrorResponse` fra `_lib/auth.ts`; `streamAnthropic` fra
  `_lib/anthropic.ts`; `parseProviderConfig` fra `_lib/providers/config.ts`;
  `messageOpenAiCompat`/`messageOpenAiResponses` + `singleTextStream`
  (samme importsett og dispatch som `ask-ruter.ts` — kopier derfra).
- Produces: `byggKildeForslagPrompt(body: KildeForslagBody): string` og
  `KILDE_FORSLAG_SYSTEM` (inlinet fra prompts/kilde-forslag.md). Klienten
  (Task 7) POSTer payloaden fra Task 2 hit og leser SSE-svaret.

- [ ] **Step 1: Skriv prompt-fasiten** `netlify/edge-functions/prompts/kilde-forslag.md`:

```markdown
Denne fila er source of truth for prompt-TEKSTEN; TS-konstanten
KILDE_FORSLAG_SYSTEM i ../kilde-forslag.ts skal holdes byte-lik innholdet
under streken. (Deno Deploy bundler ikke .md ved kjøretid — samme mønster
som dm-vurder.)

---

Du forbedrer BRUKERENS EGNE kildebeskrivelser i askstat. En kildebeskrivelse
er et markdown-dokument (eventuelt med front matter øverst) som forteller en
KI-modell hvordan en datakilde skal brukes: endepunkter, parametre, quirks,
eksempler. Du får beskrivelsen(e), brukerens spørsmål, og loggen fra en
kjøring som krevde omveier (feilede script med feilmeldinger, eventuelt
scriptet som til slutt virket, prosess-spor).

OPPGAVEN

Finn hva i kildebeskrivelsen som KUNNE forhindret omveiene, og foreslå en
revidert beskrivelse. Differansen mellom det som feilet og det som virket ER
quirken — formuler den som en regel i beskrivelsen.

REGLER

1. Endre BARE det evidensen bærer. Behold brukerens struktur, språk,
   overskrifter og front matter urørt — med mindre feilen beviselig sitter
   der (f.eks. feil base_url).
2. Foretrekk å ERSTATTE utdaterte linjer fremfor å legge til nye notater
   (mot notat-oppblåsing).
3. Returner FULL revidert tekst per kilde som trenger endring — aldri
   patch/diff-format.
4. Ærlig tomt svar er gyldig: ligger feilen i modellens kodevaner eller i en
   innebygd kilde du ikke har fått teksten til, skal "forslag" være tom og
   "melding" forklare hvorfor. Dikt ALDRI en endring for å ha noe å levere.
5. Kildetekstens språk følger dokumentet; "melding" og "begrunnelse" skrives
   på UI-språket angitt i forespørselen.
6. Ved TIDLIGERE RUNDER i forespørselen: brukerens tilbakemelding overstyrer
   ditt forrige forslag — juster, ikke gjenta.

SVARFORMAT

Svar med et kort resonnement (maks 5 setninger) etterfulgt av NØYAKTIG én
fenced json-blokk, sist i svaret:

```json
{"forslag": [{"id": "<kilde-id fra forespørselen>", "ny_tekst": "<full revidert tekst>", "begrunnelse": "<1-3 setninger>"}], "melding": "<kort oppsummering, eller hvorfor ingen endring>"}
```
```

- [ ] **Step 2: Skriv feilende deno-test** `netlify/edge-functions/_lib/kilde-forslag-prompt.test.ts`:

```ts
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { byggKildeForslagPrompt } from "./kilde-forslag-prompt.ts";

Deno.test("byggKildeForslagPrompt: alle seksjoner med, i riktig rekkefølge", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "Min kilde", text: "# Doc" }],
    question: "Hva er X?", tolkning: "X per år", mode: "python", depth: "fast",
    runs: [{ script: "kode1", error: "feil1" }],
    ok_script: "kode2", trace: "⏳ probet", sources: ["https://u"],
    history: [{ forslag_raatekst: "forrige", tilbakemelding: "kortere" }],
    ui_lang: "no",
  });
  assertStringIncludes(p, "KILDEBESKRIVELSER");
  assertStringIncludes(p, "### user:a — Min kilde");
  assertStringIncludes(p, "SPØRSMÅL\n\nHva er X?");
  assertStringIncludes(p, "FEILEDE KJØRINGER");
  assertStringIncludes(p, "kode1");
  assertStringIncludes(p, "feil1");
  assertStringIncludes(p, "SCRIPTET SOM TIL SLUTT VIRKET");
  assertStringIncludes(p, "TIDLIGERE RUNDER");
  assertStringIncludes(p, "kortere");
  assertStringIncludes(p, "norsk");
  assert(p.indexOf("KILDEBESKRIVELSER") < p.indexOf("FEILEDE KJØRINGER"));
});

Deno.test("byggKildeForslagPrompt: valgfrie seksjoner utelates når tomme", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }],
    question: "q", runs: [], ui_lang: "en",
  });
  assert(!p.includes("SCRIPTET SOM TIL SLUTT VIRKET"));
  assert(!p.includes("TIDLIGERE RUNDER"));
  assert(!p.includes("PROSESS-SPOR"));
});
```

(Assert-importen over er repoets etablerte —
`source-guides.test.ts` bruker samme `deno.land/std@0.224.0`-URL.)

- [ ] **Step 3: Kjør — feiler** (modul finnes ikke).

Run: `cd netlify/edge-functions && deno test --allow-all _lib/kilde-forslag-prompt.test.ts`

- [ ] **Step 4: Implementer** `netlify/edge-functions/_lib/kilde-forslag-prompt.ts`:

```ts
// Promptbygger for /api/kilde-forslag (spec 2026-08-13-kildeforbedring §3).
// Ren og deno-testet; endepunktet eier auth/provider-dispatch.

export interface ForslagDoc { id: string; name: string; text: string; }
export interface ForslagRun { script: string; error: string; }
export interface ForslagRunde { forslag_raatekst: string; tilbakemelding: string; }
export interface KildeForslagBody {
  docs: ForslagDoc[];
  question: string;
  tolkning?: string;
  mode?: string;
  depth?: string;
  runs: ForslagRun[];
  ok_script?: string;
  trace?: string;
  sources?: string[];
  history?: ForslagRunde[];
  ui_lang?: string;
  provider?: unknown;
}

const LANG_NAVN: Record<string, string> = {
  no: "norsk", en: "English", da: "dansk", sv: "svenska", fi: "suomi",
  is: "íslenska", de: "Deutsch", fr: "français", es: "español",
  pt: "português", zh: "中文", ja: "日本語", hi: "हिन्दी",
};

export function byggKildeForslagPrompt(body: KildeForslagBody): string {
  const deler: string[] = [];
  deler.push("KILDEBESKRIVELSER\n");
  for (const d of body.docs) {
    deler.push(`### ${d.id} — ${d.name}\n\n${d.text}\n`);
  }
  deler.push(`SPØRSMÅL\n\n${body.question}\n`);
  if (body.tolkning) deler.push(`TOLKNING\n\n${body.tolkning}\n`);
  if (body.mode) deler.push(`MODUS: ${body.mode} (dybde: ${body.depth ?? "standard"})\n`);
  if (body.runs.length) {
    deler.push("FEILEDE KJØRINGER\n");
    body.runs.forEach((r, i) => {
      deler.push(`Runde ${i + 1} — script:\n\`\`\`\n${r.script}\n\`\`\`\nFeilmelding:\n${r.error}\n`);
    });
  }
  if (body.ok_script) {
    deler.push(`SCRIPTET SOM TIL SLUTT VIRKET\n\`\`\`\n${body.ok_script}\n\`\`\`\n`);
  }
  if (body.trace) deler.push(`PROSESS-SPOR\n\n${body.trace}\n`);
  if (body.sources?.length) deler.push(`PROBEDE KILDER\n\n${body.sources.join("\n")}\n`);
  if (body.history?.length) {
    deler.push("TIDLIGERE RUNDER\n");
    body.history.forEach((h, i) => {
      deler.push(`Ditt forslag i runde ${i + 1}:\n${h.forslag_raatekst}\n\nBrukerens tilbakemelding:\n${h.tilbakemelding}\n`);
    });
  }
  const lang = LANG_NAVN[body.ui_lang ?? "en"] ?? "English";
  deler.push(`Skriv "melding" og "begrunnelse" på ${lang}.`);
  return deler.join("\n");
}
```

- [ ] **Step 5: Kjør prompt-testene — grønne.**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/kilde-forslag-prompt.test.ts`

- [ ] **Step 6: Skriv endepunktet** `netlify/edge-functions/kilde-forslag.ts`
(dispatch-strukturen er en kopi av `ask-ruter.ts:75–120` — les den først):

```ts
// /api/kilde-forslag — forslagsbasert forbedring av egendefinerte
// kildebeskrivelser (spec 2026-08-13-kildeforbedring §3). Single-shot,
// ingen verktøy; klienten eier flerrunde-historikken (payload.history).
import { streamAnthropic } from "./_lib/anthropic.ts";
import { extractByokKey, extractLlmKey, gate, upstreamErrorResponse } from "./_lib/auth.ts";
import { parseProviderConfig } from "./_lib/providers/config.ts";
import { messageOpenAiCompat } from "./_lib/providers/openai-compat.ts";
import { messageOpenAiResponses } from "./_lib/providers/openai-responses.ts";
import { singleTextStream } from "./_lib/sse-util.ts";
import { byggKildeForslagPrompt, type KildeForslagBody } from "./_lib/kilde-forslag-prompt.ts";

const MAX_BODY_BYTES = 250_000;   // spec §2: 200k-budsjett med margin
const MAX_TOKENS = 16_000;        // spec §3: full retur av stort dokument

// Inlined from ./prompts/kilde-forslag.md (source of truth er .md-fila;
// hold byte-lik — samme konvensjon som dm-vurder.ts).
const KILDE_FORSLAG_SYSTEM = `\
Du forbedrer BRUKERENS EGNE kildebeskrivelser i askstat. [RESTEN AV TEKSTEN
UNDER STREKEN I prompts/kilde-forslag.md — KOPIER ORDRETT INN HER]`;

export default async (request: Request): Promise<Response> => {
  const gateResp = await gate(request, {
    endpoint: "kilde-forslag", maxBodyBytes: MAX_BODY_BYTES,
    allowByok: true, allowLlmKey: true,
  });
  if (gateResp) return gateResp;

  let body: KildeForslagBody;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!Array.isArray(body.docs) || !body.docs.length ||
      !body.docs.every((d) => d && typeof d.id === "string" && typeof d.text === "string")) {
    return new Response("docs mangler", { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return new Response("question mangler", { status: 400 });
  }
  if (!Array.isArray(body.runs)) body.runs = [];

  const provider = parseProviderConfig(body.provider, request);
  if (provider && "error" in provider) return provider.error;
  if (!extractByokKey(request) && extractLlmKey(request) && !provider) {
    return new Response("X-Llm-Key krever komplett leverandørkonfigurasjon (provider-feltet i forespørselen)", { status: 401 });
  }
  const byokKey = extractByokKey(request);
  const apiKey = byokKey ?? Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
  if (!provider && !apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return new Response("Server configuration error", { status: 500 });
  }

  const prompt = byggKildeForslagPrompt(body);
  try {
    let stream: ReadableStream<Uint8Array>;
    if (provider && provider.type === "openai-compat") {
      const r = await messageOpenAiCompat(provider, { system: KILDE_FORSLAG_SYSTEM, prompt, maxTokens: MAX_TOKENS }, { timeoutMs: 120_000 });
      stream = singleTextStream(r.text, r.usage);
    } else if (provider && provider.type === "openai-responses") {
      const r = await messageOpenAiResponses(provider, { system: KILDE_FORSLAG_SYSTEM, prompt, maxTokens: MAX_TOKENS }, { timeoutMs: 120_000 });
      stream = singleTextStream(r.text, r.usage);
    } else {
      stream = await streamAnthropic({
        apiKey: provider ? provider.key : apiKey!,
        model: provider ? provider.model : model,
        prompt,
        maxTokens: MAX_TOKENS,
        system: KILDE_FORSLAG_SYSTEM,
        cacheTtl: "1h",
        apiBase: provider?.type === "anthropic-compat" ? provider.baseUrl : undefined,
      });
    }
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return upstreamErrorResponse(e, byokKey);
  }
};
```

NB: `singleTextStream` bor i `_lib/sse-util.ts` (samme import som
ask-ruter.ts:6 — verifisert). Kopier system-teksten ORDRETT fra
prompts/kilde-forslag.md (alt under `---`-streken) inn i konstanten
`KILDE_FORSLAG_SYSTEM` — plassholderen i skissen over er en
kopi-instruks, ikke tekst som skal stå igjen.

- [ ] **Step 7: Registrer i `netlify.toml`** — etter ask-ruter-innslaget:

```toml
[[edge_functions]]
  function = "kilde-forslag"
  path = "/api/kilde-forslag"
```

- [ ] **Step 8: Typecheck + alle deno-tester**

Run: `cd netlify/edge-functions && deno check kilde-forslag.ts && deno test --allow-all _lib/`
Expected: check OK, alle tester grønne.

- [ ] **Step 9: Commit**

```bash
git add netlify/edge-functions/prompts/kilde-forslag.md netlify/edge-functions/_lib/kilde-forslag-prompt.ts netlify/edge-functions/_lib/kilde-forslag-prompt.test.ts netlify/edge-functions/kilde-forslag.ts netlify.toml
git commit -m "feat: /api/kilde-forslag — single-shot forslag til revidert kildebeskrivelse"
```

---

### Task 6: Fangst i ask-flyten + forbedringsknappen

**Files:**
- Modify: `js/ask-view.js` (runAskFlow + eksponer sseAccumulate)
- Modify: `index.html` (knapp i #askAnswerActions + script-tag)

**Interfaces:**
- Consumes: `KildeForslag.registerRun(ctx)` og `KildeForslag.skalViseKnapp`
  (Task 2; registerRun implementeres i Task 7 — denne tasken kaller den
  defensivt bak `window.KildeForslag && window.KildeForslag.registerRun`).
- Produces: `window.mdSseAccumulate(resp, onText, signal)` (Task 7 bruker
  den); `ctx`-objektet med formen
  `{question, tolkning, mode, depth, docs:[{id,name,text}],
  runs:[{script,error}], ok_script, trace:[str], sources:[str],
  kastedeTurer:number}`; knappen `#askImproveBtn` i DOM.

- [ ] **Step 1: Legg knappen i `index.html`** — i `#askAnswerActions`-raden
(index.html:243), etter `#askFullOutputBtn`:

```html
          <button type="button" class="ai-codeblock-btn" id="askImproveBtn" hidden data-i18n data-i18n-title title="Suggest improvements to your source description, based on this run's errors and detours">Improve source description</button>
```

…og script-taggen for den nye modulen — finn `<script src="js/ask-view.js"`
i index.html og legg linjen RETT FØR den (kilde-forslag må være lastet før
ask-view kaller den):

```html
  <script src="js/kilde-forslag.js"></script>
```

- [ ] **Step 2: Eksponer sseAccumulate** — i `js/ask-view.js`, rett etter
definisjonen av `function sseAccumulate(resp, onText, signal)` (inne i
DOM-wiring-delen, ~linje 527):

```js
  // Delt SSE-leser for enkle text/error-endepunkter — kilde-forslag-modalen
  // (js/kilde-forslag.js) gjenbruker den fremfor å duplisere protokollen.
  window.mdSseAccumulate = sseAccumulate;
```

(Legg linjen umiddelbart etter funksjonens avsluttende `}`.)

- [ ] **Step 3: Fang signalene i runAskFlow** — i `js/ask-view.js`:

3a. Etter `var lastSources = [];` (linje ~970):

```js
      // Kildeforbedring (spec 2026-08-13 §1): friksjonsignaler + payload-
      // sannheten for hvilke EGNE kilder modellen faktisk så. Fanges ved
      // flytstart (som activeProfile) — ikke ved svarslutt.
      var prosesslinjer = [];
      var kastedeTurer = 0;
      var aktiveEgneKilder = hentAktiveEgneKilder();
```

3b. Ny modul-nivå-hjelper (legg den rett før `async function runAskFlow()`):

```js
    // Egne kilder i payload-sannheten (Packs.effectiveIds ∩ user:) med
    // navn+tekst fra Profiles — grunnlaget for forbedringssløyfa.
    function hentAktiveEgneKilder() {
      var ut = [];
      try {
        var ids = (window.Packs && window.Packs.effectiveIds) ? window.Packs.effectiveIds() : [];
        ids.forEach(function (id) {
          if (String(id).indexOf('user:') !== 0) return;
          var pr = window.Profiles && window.Profiles.get ? window.Profiles.get(id.slice(5)) : null;
          if (pr) ut.push({ id: id, name: pr.name, text: pr.text || '' });
        });
      } catch (e) {}
      return ut;
    }
```

3c. I `onProgress`-handleren (linje ~1071), først i funksjonen:

```js
              if (prosesslinjer.length < 400) prosesslinjer.push(String(ev.text || ''));
```

3d. I `onTurnDiscard`-handleren (linje ~1084), etter guard-linjen
(`if (!full || !full.trim()) return;`):

```js
              kastedeTurer++;
              if (prosesslinjer.length < 400) prosesslinjer.push('📝 ' + full.trim().slice(0, 200));
```

3e. Etter `lastSources = (res.sources || []).map(...)` (linje ~1112):

```js
        // Forbedringsknappen (spec §1): registrer kjøringskonteksten —
        // modulen eier vilkåret (skalViseKnapp) og knappens synlighet.
        if (window.KildeForslag && window.KildeForslag.registerRun) {
          window.KildeForslag.registerRun({
            question: question, tolkning: route.tolkning,
            mode: currentAskMode(), depth: askDepth(),
            docs: aktiveEgneKilder, runs: feilRuns, ok_script: lastOkScript,
            trace: prosesslinjer, sources: lastSources, kastedeTurer: kastedeTurer,
          });
        }
```

- [ ] **Step 4: Kjør eksisterende tester — fortsatt grønne**

Run: `node --test 'tests/js/*.test.js'`
Expected: PASS overalt (ingen ny oppførsel testes her — registerRun er
defensiv og KildeForslag har ennå ingen DOM-del; Task 7 tester vilkåret
via skalViseKnapp som allerede er dekket i Task 2).

- [ ] **Step 5: Commit**

```bash
git add js/ask-view.js index.html
git commit -m "feat: fang friksjonssignaler i ask-flyten + forbedringsknapp i svarraden"
```

---

### Task 7: Forslags-modalen — én runde, Bruk/Forkast

**Files:**
- Modify: `js/kilde-forslag.js` (DOM-delen)
- Modify: `css/ask.css`
- Test: `tests/js/kilde-forslag.test.js` (kun rene deler — DOM smokes manuelt)

**Interfaces:**
- Consumes: `window.mdSseAccumulate` (Task 6), `window.mdAiAuthHeaders()`
  og `window.mdAiProviderConfig()` (finnes, js/ai-chat.js:1706),
  `window.Profiles.get/update`, `byggForslagsPayload`/`parseForslagSvar`/
  `linjeDiff`/`skalViseKnapp` (Task 2–4).
- Produces: `KildeForslag.registerRun(ctx)` (kalles fra Task 6) og
  `KildeForslag.openModal()`; `KildeForslag.ferskeDocs(ctx)` (ren,
  node-testet — re-leser docs fra Profiles-lageret).

- [ ] **Step 1: Skriv feilende test for ferskeDocs:**

```js
test('ferskeDocs re-leser tekst fra Profiles-lageret (spec §4: etter delvis aksept)', () => {
  const profiles = { get: (id) => (id === 'a' ? { name: 'A2', text: 'NY TEKST' } : null) };
  const ut = KF.ferskeDocs({ docs: [{ id: 'user:a', name: 'A', text: 'GAMMEL' }, { id: 'user:borte', name: 'B', text: 'x' }] }, profiles);
  assert.deepEqual(ut, [{ id: 'user:a', name: 'A2', text: 'NY TEKST' }]);
});
```

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 3: Implementer.** I `js/kilde-forslag.js`, ren del (før `var api`):

```js
  // Docs re-leses fra Profiles ved HVER runde (spec §4) — etter en delvis
  // aksept skal modellen se den OPPDATERTE teksten. Kilder slettet underveis
  // faller stille ut.
  function ferskeDocs(ctx, profiles) {
    var P = profiles || global.Profiles;
    var ut = [];
    ((ctx && ctx.docs) || []).forEach(function (d) {
      var pr = P && P.get ? P.get(String(d.id).slice(5)) : null;
      if (pr) ut.push({ id: d.id, name: pr.name, text: pr.text || '' });
    });
    return ut;
  }
```

…legg `ferskeDocs: ferskeDocs,` i `api`. Deretter DOM-delen — ERSTATT
sluttkommentaren `// DOM-delen kommer i senere tasks` med:

```js
  // ── DOM-del (kun nettleser) ──────────────────────────────────────────
  var T = function (k, p) { return global.t ? global.t(k, p) : k; };
  var ctxSiste = null;

  function registerRun(ctx) {
    ctxSiste = ctx;
    var btn = document.getElementById('askImproveBtn');
    if (!btn) return;
    btn.hidden = !skalViseKnapp(ctx);
    if (!btn.__kfWired) {
      btn.__kfWired = true;
      btn.addEventListener('click', function () { openModal(); });
    }
  }

  function el(tag, cls, tekst) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (tekst != null) n.textContent = tekst;
    return n;
  }

  function openModal() {
    if (!ctxSiste) return;
    var gammel = document.getElementById('kfBackdrop');
    if (gammel) gammel.remove();

    var state = { history: [], runde: 1, ctrl: null };

    var backdrop = el('div', 'ai-modal-backdrop open');
    backdrop.id = 'kfBackdrop';
    var modal = el('div', 'ai-modal kf-modal');
    backdrop.appendChild(modal);
    var tittel = el('h3', null, T('Improve source description'));
    modal.appendChild(tittel);
    // Rundeteller i EGEN node (data-i18n-fella: oversettelse ville
    // overskrevet dynamiske barn).
    var rundeEl = el('div', 'ask-pop-hint');
    modal.appendChild(rundeEl);
    var innhold = el('div', 'kf-innhold');
    modal.appendChild(innhold);
    var bunn = el('div', 'kf-bunn');
    modal.appendChild(bunn);
    var lukk = el('button', 'ai-modal-btn', T('Close'));
    lukk.type = 'button';
    lukk.addEventListener('click', function () {
      if (state.ctrl) { try { state.ctrl.abort(); } catch (e) {} }
      backdrop.remove();
    });
    bunn.appendChild(lukk);
    document.body.appendChild(backdrop);

    kjorRunde(state, innhold, rundeEl, bunn);
  }

  function kjorRunde(state, innhold, rundeEl, bunn) {
    rundeEl.textContent = T('Round {n}', { n: state.runde });
    innhold.innerHTML = '';
    innhold.appendChild(el('div', 'ai-progress-line', T('Getting suggestions …')));
    state.ctrl = new AbortController();

    var payload = byggForslagsPayload({
      docs: ferskeDocs(ctxSiste),
      question: ctxSiste.question, tolkning: ctxSiste.tolkning,
      mode: ctxSiste.mode, depth: ctxSiste.depth,
      runs: ctxSiste.runs, ok_script: ctxSiste.ok_script,
      trace: ctxSiste.trace, sources: ctxSiste.sources,
      history: state.history,
      ui_lang: global.M2PY_LANG || 'en',
    });
    payload.provider = (global.mdAiProviderConfig && global.mdAiProviderConfig()) || undefined;

    fetch('/api/kilde-forslag', {
      method: 'POST',
      headers: global.mdAiAuthHeaders(),
      body: JSON.stringify(payload),
      signal: state.ctrl.signal,
    }).then(function (resp) {
      if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);
      return global.mdSseAccumulate(resp, null, state.ctrl.signal);
    }).then(function (tekst) {
      state.sisteRaatekst = tekst;
      renderForslag(parseForslagSvar(tekst), state, innhold, rundeEl, bunn);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      innhold.innerHTML = '';
      innhold.appendChild(el('div', 'ai-error', '✗ ' + ((e && e.message) || String(e))));
    });
  }

  function renderForslag(svar, state, innhold, rundeEl, bunn) {
    innhold.innerHTML = '';
    if (!svar.ok) {
      // Ærlig degradering (spec §3): rå-tekst i stedet for krasj.
      innhold.appendChild(el('div', 'ai-error', T('The suggestion could not be parsed — raw answer below')));
      var pre = el('pre', 'kf-raa');
      pre.textContent = svar.raatekst.slice(0, 8000);
      innhold.appendChild(pre);
      return;
    }
    if (svar.melding) innhold.appendChild(el('div', 'ask-pop-hint', svar.melding));
    if (!svar.forslag.length) {
      innhold.appendChild(el('div', 'ai-progress-line', T('No changes suggested')));
    }
    svar.forslag.forEach(function (f) {
      var pr = global.Profiles && global.Profiles.get ? global.Profiles.get(String(f.id).slice(5)) : null;
      var kort = el('div', 'kf-kort');
      kort.appendChild(el('h4', null, pr ? pr.name : f.id));
      var diffBoks = el('div', 'kf-diff');
      linjeDiff(pr ? pr.text : '', f.ny_tekst).forEach(function (d) {
        var linje = el('div', 'kf-diff-' + d.type, (d.type === 'ny' ? '+ ' : d.type === 'slettet' ? '− ' : '  ') + d.tekst);
        diffBoks.appendChild(linje);
      });
      kort.appendChild(diffBoks);
      if (f.begrunnelse) kort.appendChild(el('div', 'ask-pop-hint', f.begrunnelse));
      var rad = el('div', 'sources-info-actions');
      var bruk = el('button', 'ai-response-insert-btn', T('Apply'));
      bruk.type = 'button';
      var forkast = el('button', 'ai-codeblock-btn', T('Discard'));
      forkast.type = 'button';
      bruk.addEventListener('click', function () {
        if (!pr) return;
        global.Profiles.update(String(f.id).slice(5), { text: f.ny_tekst });
        bruk.disabled = true; forkast.disabled = true;
        rad.appendChild(el('span', 'ask-pop-hint', ' ' + T('Applied — takes effect on your next question')));
      });
      forkast.addEventListener('click', function () { kort.remove(); });
      rad.appendChild(bruk);
      rad.appendChild(forkast);
      kort.appendChild(rad);
      innhold.appendChild(kort);
    });
  }
```

…og legg `registerRun: registerRun, openModal: openModal,` i `api`-objektet
FØR node-bail-linjen? NEI — `api` bygges før bail; flytt derfor de to
DOM-funksjonene OVER `var api` men la dem stå — de refererer document kun
NÅR de kalles, så module-load i node er trygg. Legg begge i `api`:

```js
  var api = {
    byggForslagsPayload: byggForslagsPayload,
    skalViseKnapp: skalViseKnapp,
    parseForslagSvar: parseForslagSvar,
    linjeDiff: linjeDiff,
    ferskeDocs: ferskeDocs,
    registerRun: registerRun,
    openModal: openModal,
    _CAPS: CAPS,
  };
```

(Node-bail-linjen `if (typeof global.document === 'undefined') return;`
kan da SLETTES — ingen kode kjører DOM ved load.)

- [ ] **Step 4: CSS** — legg nederst i `css/ask.css`:

```css
/* Kildeforbedring (spec 2026-08-13): forslags-modal med linjediff */
.kf-modal { max-width: 720px; width: 92vw; max-height: 84vh; overflow-y: auto; }
.kf-kort { border: 1px solid var(--border-color, #d5d9df); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
.kf-diff { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; border: 1px solid var(--border-color, #d5d9df); border-radius: 6px; padding: 6px 8px; max-height: 40vh; overflow: auto; margin: 8px 0; }
.kf-diff-ny { background: rgba(46, 160, 67, 0.16); }
.kf-diff-slettet { background: rgba(248, 81, 73, 0.14); opacity: 0.85; }
.kf-diff-lik { opacity: 0.6; }
.kf-raa { white-space: pre-wrap; font-size: 12px; max-height: 50vh; overflow: auto; }
.kf-bunn { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; flex-wrap: wrap; }
```

- [ ] **Step 5: Kjør testene — grønne (inkl. ferskeDocs)**

Run: `node --test tests/js/kilde-forslag.test.js`
Expected: PASS. VIKTIG: kjør også `node --test 'tests/js/*.test.js'` —
module-load av kilde-forslag.js i node må ikke kaste (DOM-referanser kun
inne i funksjoner).

- [ ] **Step 6: Commit**

```bash
git add js/kilde-forslag.js css/ask.css tests/js/kilde-forslag.test.js
git commit -m "feat: forslags-modal — diff-kort med Bruk/Forkast (én runde)"
```

---

### Task 8: Flerrunde — tilbakemelding og «Ny runde»

**Files:**
- Modify: `js/kilde-forslag.js`

**Interfaces:**
- Consumes: `state.history` og `state.sisteRaatekst` fra Task 7.
- Produces: flerrunde-sløyfa (spec §4) — tekstfelt + «Ny runde» som
  re-POSTer med `history: [{forslag_raatekst, tilbakemelding}, …]`.

- [ ] **Step 1: Utvid modalens bunn** — i `openModal()` (Task 7), FØR
`bunn.appendChild(lukk)`, legg:

```js
    var tilbake = document.createElement('textarea');
    tilbake.className = 'kf-tilbake';
    tilbake.rows = 2;
    tilbake.placeholder = T('Feedback — what should change in the next round?');
    var nyRunde = el('button', 'ai-modal-btn primary', T('New round'));
    nyRunde.type = 'button';
    nyRunde.addEventListener('click', function () {
      // Hver runde er et nytt KI-kall på brukerens nøkkel (spec §4) —
      // historikken bærer forrige RÅSVAR + tilbakemeldingen.
      state.history.push({
        forslag_raatekst: state.sisteRaatekst || '',
        tilbakemelding: tilbake.value || '',
      });
      state.runde++;
      tilbake.value = '';
      kjorRunde(state, innhold, rundeEl, bunn);
    });
    bunn.appendChild(tilbake);
    bunn.appendChild(nyRunde);
```

- [ ] **Step 2: CSS** — legg til i `css/ask.css`-blokken fra Task 7:

```css
.kf-tilbake { flex: 1 1 260px; min-height: 40px; font: inherit; padding: 6px 8px; }
```

- [ ] **Step 3: Manuell røyk-test i node** — modul-load skal fortsatt være ren:

Run: `node --test 'tests/js/*.test.js'`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/kilde-forslag.js css/ask.css
git commit -m "feat: flerrunde i forslags-modalen — tilbakemelding + Ny runde"
```

---

### Task 9 (§8): Egne kopier av innebygde kilder — klientmekanikk

**Files:**
- Modify: `js/packs.js` (tre nye funksjoner + eksport)
- Modify: `js/sources-modal.js` (`renderInfo`)
- Test: `tests/js/packs.test.js`

**Interfaces:**
- Consumes: `makePacks(storage, fetchImpl, profiles)`-seamen (packs.js:95);
  `profiles.create(name, text, 'source', origin, tags)` og
  `profiles.get(id)`/`profiles.update(id, fields)` (js/profiles.js).
- Produces (på Packs-objektet):
  - `lagBuiltinKopi(regId) -> Promise<'user:<id>'|null>` — henter
    `data/sources/<regId>.md`, oppretter kilde med
    `origin: {source:'builtin-copy', of: regId}`.
  - `oppdaterKopiFraOriginal(profileId) -> Promise<boolean>`.
  - `builtinOverstyrte() -> string[]` — `of`-idene for AKTIVE kopier
    (Task 10 sender dem som `guides_off`).

- [ ] **Step 1: Skriv feilende tester** — i `tests/js/packs.test.js` (bruk
filas eksisterende `fakeStorage()` og fetch-stub-mønster; les toppen av fila
først og gjenbruk hjelperne der):

```js
test('lagBuiltinKopi henter data/sources/<id>.md og lager builtin-copy-kilde', async () => {
  const opprettet = [];
  const profiles = {
    create: (name, text, kind, origin, tags) => { opprettet.push({ name, text, kind, origin, tags }); return 'nyid'; },
    get: () => null, list: () => [], packsState: () => ({ ids: [] }), countryState: () => ({ mode: 'none' }),
  };
  const fetchStub = async (url) => {
    if (String(url).indexOf('data/sources/ssb.md') >= 0) return { ok: true, text: async () => '# SSB-doc' };
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
  const P = makePacks(fakeStorage(), fetchStub, profiles);
  const id = await P.lagBuiltinKopi('ssb');
  assert.equal(id, 'user:nyid');
  assert.equal(opprettet[0].text, '# SSB-doc');
  assert.equal(opprettet[0].kind, 'source');
  assert.deepEqual(opprettet[0].origin, { source: 'builtin-copy', of: 'ssb' });
  assert.ok(/min kopi|my copy/i.test(opprettet[0].name) || opprettet[0].name.indexOf('ssb') >= 0);
});

test('oppdaterKopiFraOriginal re-henter og overskriver teksten', async () => {
  const oppdatert = [];
  const profiles = {
    get: (id) => (id === 'p1' ? { name: 'K', text: 'GML', origin: { source: 'builtin-copy', of: 'ssb' } } : null),
    update: (id, f) => oppdatert.push({ id, f }),
    create: () => 'x', list: () => [], packsState: () => ({ ids: [] }), countryState: () => ({ mode: 'none' }),
  };
  const fetchStub = async () => ({ ok: true, text: async () => 'FERSK' });
  const P = makePacks(fakeStorage(), fetchStub, profiles);
  assert.equal(await P.oppdaterKopiFraOriginal('p1'), true);
  assert.deepEqual(oppdatert, [{ id: 'p1', f: { text: 'FERSK' } }]);
  assert.equal(await P.oppdaterKopiFraOriginal('finnes-ikke'), false);
});

test('builtinOverstyrte: of-ider for aktive builtin-kopier, dedupet', () => {
  const profiles = {
    get: (id) => ({
      k1: { name: 'A', text: '', origin: { source: 'builtin-copy', of: 'ssb' } },
      k2: { name: 'B', text: '', origin: { source: 'community', id: 'x' } },
      k3: { name: 'C', text: '', origin: { source: 'builtin-copy', of: 'ssb' } },
    })[id] || null,
    packsState: () => ({ ids: ['user:k1', 'user:k2', 'user:k3'] }),
    countryState: () => ({ mode: 'none' }),
    list: () => [], create: () => 'x',
  };
  const P = makePacks(fakeStorage(), async () => ({ ok: false }), profiles);
  assert.deepEqual(P.builtinOverstyrte(), ['ssb']);
});
```

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/packs.test.js`

- [ ] **Step 3: Implementer i `js/packs.js`** — inne i `makePacks`, etter
`importPack` (linje ~458):

```js
    // §8 kildeforbedring (spec 2026-08-13): egen kopi av en innebygd kilde.
    // Kopien er en ORDINÆR egen kilde (Profiles-lageret) med origin.of som
    // peker tilbake — guide-fortrengningen (guides_off) og «Oppdater fra
    // original» leser den. Fasiten er data/sources/<id>.md; 404 → fall
    // tilbake til registerbeskrivelsen (bedre enn ingenting, aldri kast).
    async function lagBuiltinKopi(regId) {
      if (!profiles || !profiles.create) return null;
      // listRegistry() normaliserer de norske registerfeltene (navn →
      // name, tags m/[]-default) — bruk den, IKKE rå `registry`.
      var reg = listRegistry().filter(function (r) { return r.id === regId; })[0];
      var text = '';
      try {
        var res = await fetchImpl('data/sources/' + regId + '.md');
        if (res.ok) text = (await res.text()).slice(0, 40000);
      } catch (e) {}
      if (!text) text = describe('reg:' + regId) || ('# ' + regId);
      var navn = ((reg && reg.name) || regId) + ' (min kopi)';
      var id = profiles.create(navn, text, 'source',
        { source: 'builtin-copy', of: regId }, (reg && reg.tags) || []);
      return 'user:' + id;
    }
    async function oppdaterKopiFraOriginal(profileId) {
      var pr = profiles && profiles.get ? profiles.get(profileId) : null;
      var of = pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of;
      if (!of || !profiles.update) return false;
      try {
        var res = await fetchImpl('data/sources/' + of + '.md');
        if (!res.ok) return false;
        profiles.update(profileId, { text: (await res.text()).slice(0, 40000) });
        return true;
      } catch (e) { return false; }
    }
    // Aktive builtin-kopier → of-ider (payload-feltet guides_off, Task 10).
    function builtinOverstyrte() {
      var ut = [];
      effectiveIds().forEach(function (id) {
        if (String(id).indexOf('user:') !== 0) return;
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        var of = pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of;
        if (of && ut.indexOf(of) < 0) ut.push(of);
      });
      return ut;
    }
```

(I test-oppsettet fra Step 1 er registeret ulastet → `listRegistry()` gir
`[]` → fallback-navnet `regId + ' (min kopi)'` — det er det testen
aksepterer.)

Legg de tre funksjonene i return-objektet (packs.js:488–494):

```js
      lagBuiltinKopi: lagBuiltinKopi,
      oppdaterKopiFraOriginal: oppdaterKopiFraOriginal,
      builtinOverstyrte: builtinOverstyrte,
```

- [ ] **Step 4: Kjør — grønne.** `node --test tests/js/packs.test.js`

- [ ] **Step 5: Knappene i kilde-modalen** — i `js/sources-modal.js`
`renderInfo()` (linje ~287): erstatt den tidlige returen
`if (selectedInfoId.indexOf('user:') !== 0) return;` med:

```js
        // §8 (spec 2026-08-13): innebygde kilder får «Lag egen kopi» —
        // kopien blir en ordinær egen kilde som forbedringssløyfa virker på.
        if (selectedInfoId.indexOf('reg:') === 0) {
          var regId = selectedInfoId.slice(4);
          var regActions = document.createElement('div');
          regActions.className = 'sources-info-actions';
          var kopier = document.createElement('button');
          kopier.type = 'button';
          kopier.className = 'ai-codeblock-btn';
          kopier.textContent = T('Make my own copy');
          kopier.addEventListener('click', function () {
            kopier.disabled = true;
            P.lagBuiltinKopi(regId).then(function (nyId) {
              if (nyId) { Prof.togglePack(nyId); selectedInfoId = nyId; }
              renderAll();   // Profiles.onChange fyrer også — idempotent
            });
          });
          regActions.appendChild(kopier);
          infoEl.appendChild(regActions);
          return;
        }
        if (selectedInfoId.indexOf('user:') !== 0) return;
```

…og i user:-grenen (etter `actions.appendChild(del);`, linje ~315), legg:

```js
        // Kopier har en vei tilbake til originalen (spec §8: billigste
        // drift-mottiltak). To-klikks-bekreftelse — overskriver kopien.
        var prInfo = Prof.get ? Prof.get(pid) : null;
        if (prInfo && prInfo.origin && prInfo.origin.source === 'builtin-copy' && prInfo.origin.of) {
          var oppd = document.createElement('button');
          oppd.type = 'button';
          oppd.className = 'ai-codeblock-btn';
          oppd.textContent = T('Update from original');
          oppd.addEventListener('click', function () {
            if (!oppd.__armert) {
              oppd.__armert = true;
              oppd.textContent = T('Sure? This overwrites the copy');
              return;
            }
            P.oppdaterKopiFraOriginal(pid).then(function () { renderAll(); });
          });
          actions.appendChild(oppd);
        }
```

NB: sjekk at `Prof.get` finnes i Profiles-APIet (js/profiles.js eksporterer
`get` — packs.js bruker `profiles.get(...)` flere steder); hvis navnet
avviker i modal-konteksten, bruk `global.Profiles.get`.

- [ ] **Step 6: Alle tester + modul-load**

Run: `node --test 'tests/js/*.test.js'`
Expected: PASS (inkl. sources-modal.test.js uendret).

- [ ] **Step 7: Commit**

```bash
git add js/packs.js js/sources-modal.js tests/js/packs.test.js
git commit -m "feat(§8): egne kopier av innebygde kilder — lag/oppdater + builtinOverstyrte"
```

---

### Task 10 (§8): `guides_off` — fortreng guiden, aldri verktøyene

**Files:**
- Modify: `netlify/edge-functions/_lib/source-guides.ts`
- Modify: `netlify/edge-functions/_lib/source-guides.test.ts`
- Modify: `netlify/edge-functions/svar.ts` (RequestBody + attacher-kallet)
- Modify: `js/ai-chat.js` (payload-feltet)

**Interfaces:**
- Consumes: `coerceSourcesOff` (registry.ts:192 — GJENBRUKES for
  guides_off, identisk semantikk: id-array, samme regex/tak);
  `Packs.builtinOverstyrte()` (Task 9).
- Produces: `makeGuideAttacher(origin, fetchImpl?, skip?: Set<string>)` —
  tredje parameter hopper over guide-fetch for de idene. Registerlinja og
  verktøy-dispatchen røres IKKE (spec §8-fella: sources_off-chokepointet i
  svar.ts:216 dekker verktøyene — guides_off skal ALDRI dit).

- [ ] **Step 1: Skriv feilende deno-test** — i
`netlify/edge-functions/_lib/source-guides.test.ts` (gjenbruk filas
`fakeFetch`-hjelper):

```ts
Deno.test("attach: skip-settet fortrenger guiden uten fetch (guides_off, spec §8)", async () => {
  let kalt = 0;
  const f = ((..._args: unknown[]) => { kalt++; return Promise.resolve(new Response("# guide", { status: 200 })); }) as typeof fetch;
  const attach = makeGuideAttacher("https://o", f, new Set(["ssb"]));
  const r1: Record<string, unknown> = {};
  await attach("ssb", r1);
  assertEquals(r1.guide, undefined);
  assertEquals(kalt, 0);              // aldri fetch for fortrengte
  const r2: Record<string, unknown> = {};
  await attach("oecd", r2);           // andre kilder upåvirket
  assertEquals(r2.guide, "# guide");
});
```

(Tilpass fetch-stubben til filas eksisterende `fakeFetch`-form — les de
første 30 linjene av testfila og gjenbruk mønsteret derfra.)

- [ ] **Step 2: Kjør — feiler** (signaturen tar ikke tredje param).

Run: `cd netlify/edge-functions && deno test --allow-all _lib/source-guides.test.ts`

- [ ] **Step 3: Implementer** i `_lib/source-guides.ts`:

```ts
export function makeGuideAttacher(origin: string, fetchImpl: typeof fetch = fetch, skip?: Set<string>) {
  const sent = new Set<string>();
  return async function attach(sourceId: string, result: Record<string, unknown>): Promise<void> {
    if (!sourceId || sent.has(sourceId)) return;
    // guides_off (spec 2026-08-13 §8): brukerens builtin-kopi overtar
    // guiderollen — hopp over den innebygde guiden HELT (ingen fetch).
    // Registerlinja og adapterverktøyene er med vilje urørt.
    if (skip && skip.has(sourceId)) return;
    sent.add(sourceId);   // også ved feil: ikke re-fetch en død guide i samme løp
    // …resten uendret…
```

- [ ] **Step 4: Kjør — grønn.** Samme kommando som Step 2. Kjør så HELE
`deno test --allow-all _lib/` (medGuideVedFeil-testene skal være uendret
grønne — wrapperen arver skip via attacheren).

- [ ] **Step 5: Server-siden i `svar.ts`:**

5a. I `RequestBody`-interfacet (ved `sources_off?: unknown;`, linje ~35):

```ts
  guides_off?: unknown;
```

5b. Attacher-kallet (linje ~250) — erstatt
`const attachGuide = makeGuideAttacher(origin);` med:

```ts
  // guides_off (spec 2026-08-13 §8): fortrenger KUN den late guiden for
  // kilder brukeren har aktiv egen kopi av — verktøy-dispatchen og
  // registerblokka er med vilje urørt (motsatsen til sources_off over).
  // coerceSourcesOff gjenbrukes: identisk id-form og tak.
  const attachGuide = makeGuideAttacher(origin, fetch, new Set(coerceSourcesOff(body.guides_off)));
```

- [ ] **Step 6: Klient-siden i `js/ai-chat.js`** — i svar-payloaden, rett
etter `sources_off`-feltet (linje ~716):

```js
              // §8 kildeforbedring: kilder med AKTIV egen kopi får guiden
              // fortrengt server-side (guides_off) — kopiteksten flyter som
              // vanlig pakke i packs-feltet over og overtar guiderollen.
              guides_off: (window.Packs && Packs.builtinOverstyrte && Packs.builtinOverstyrte().length)
                ? Packs.builtinOverstyrte() : undefined,
```

- [ ] **Step 7: Full verifisering begge sider**

Run: `cd netlify/edge-functions && deno check svar.ts && deno test --allow-all _lib/ && cd ../.. && node --test 'tests/js/*.test.js'`
Expected: alt grønt.

- [ ] **Step 8: Commit**

```bash
git add netlify/edge-functions/_lib/source-guides.ts netlify/edge-functions/_lib/source-guides.test.ts netlify/edge-functions/svar.ts js/ai-chat.js
git commit -m "feat(§8): guides_off — egen kopi fortrenger guiden, verktøyene urørt"
```

---

### Task 11 (§9): `/api/kilde-pr` — GitHub-kjernen og endepunktet

**Files:**
- Create: `netlify/edge-functions/_lib/kilde-pr-core.ts`
- Create: `netlify/edge-functions/_lib/kilde-pr-core.test.ts`
- Create: `netlify/edge-functions/kilde-pr.ts`
- Modify: `netlify.toml`

**Interfaces:**
- Consumes: `adminGate` fra `_lib/auth.ts` — kalles UTEN `allowByok`
  (BYOK-forbikjøringen i runAdminGate ville ellers sluppet HVEM SOM HELST
  med egen nøkkel forbi admin-kravet — spec §9: servergaten er den reelle
  sperren).
- Produces:
  - `velgMaal({of?, id, name}) -> {path, create}` — kopi (`of`) →
    oppdater `data/sources/<of>.md`; ellers → opprett
    `data/packs/community/<slug>.md`.
  - `slugify(s)`, `byggBranchNavn(path, dato)`, `base64Utf8(s)`.
  - `opprettPr(deps{fetchImpl, token, repo}, inn{path, create, innhold,
    tittel, kropp, branch}) -> Promise<{url}>` — fire GitHub-kall.
  - Endepunkt: POST `{id, name, of?, ny_tekst, evidens}` →
    `{url}` (JSON), 403 for ikke-admin, 400/502 ellers.
- Env (manuelt oppsett, dokumenteres i Task 13): `GITHUB_PR_TOKEN`
  (fingranulert PAT, kun hmelberg/askstat, Contents RW + Pull requests RW),
  valgfri `GITHUB_PR_REPO` (default `hmelberg/askstat`).

- [ ] **Step 1: Skriv feilende deno-tester**
`netlify/edge-functions/_lib/kilde-pr-core.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { base64Utf8, byggBranchNavn, opprettPr, slugify, velgMaal } from "./kilde-pr-core.ts";

Deno.test("velgMaal: kopi → oppdater data/sources; egen kilde → ny community-pakke", () => {
  assertEquals(velgMaal({ of: "ssb", id: "user:a", name: "SSB (min kopi)" }),
    { path: "data/sources/ssb.md", create: false });
  assertEquals(velgMaal({ id: "user:b", name: "Min Ægen Kilde!" }),
    { path: "data/packs/community/min-aegen-kilde.md", create: true });
});

Deno.test("slugify: norsk + spesialtegn + tak", () => {
  assertEquals(slugify("Blæ/Blø (v2)"), "blae-blo-v2");
  assertEquals(slugify("  "), "kilde");
  assertEquals(slugify("x".repeat(100)).length, 60);
});

Deno.test("byggBranchNavn: fil + tidsstempel", () => {
  const navn = byggBranchNavn("data/sources/ssb.md", new Date("2026-08-13T10:20:30Z"));
  assertEquals(navn, "kilde/ssb-20260813102030");
});

Deno.test("base64Utf8: UTF-8 round-trip med norsk tekst", () => {
  const dekodet = new TextDecoder().decode(
    Uint8Array.from(atob(base64Utf8("blåbær og østers")), (c) => c.charCodeAt(0)));
  assertEquals(dekodet, "blåbær og østers");
});

Deno.test("opprettPr: fire kall i riktig rekkefølge; 422 på branch tolereres", async () => {
  const kall: { url: string; method: string; body?: unknown }[] = [];
  const svar: Record<string, unknown>[] = [
    { object: { sha: "abc" } },          // GET ref
    {},                                   // POST refs (branch)
    { sha: "filsha" },                    // GET contents
    {},                                   // PUT contents
    { html_url: "https://github.com/x/pull/1" }, // POST pulls
  ];
  let i = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify(svar[i++]), { status: kall.length === 2 ? 422 : 200 }));
  }) as typeof fetch;
  const r = await opprettPr({ fetchImpl, token: "tok", repo: "hmelberg/askstat" },
    { path: "data/sources/ssb.md", create: false, innhold: "NY", tittel: "T", kropp: "K", branch: "kilde/ssb-x" });
  assertEquals(r.url, "https://github.com/x/pull/1");
  assertEquals(kall.length, 5);
  assertStringIncludes(kall[0].url, "/git/ref/heads/main");
  assertStringIncludes(kall[1].url, "/git/refs");
  assertStringIncludes(kall[2].url, "/contents/data/sources/ssb.md?ref=main");
  assertEquals(kall[3].method, "PUT");
  assertEquals((kall[3].body as Record<string, unknown>).sha, "filsha");
  assertEquals((kall[3].body as Record<string, unknown>).branch, "kilde/ssb-x");
  assertStringIncludes(kall[4].url, "/pulls");
  assertEquals((kall[4].body as Record<string, unknown>).base, "main");
});

Deno.test("opprettPr: create=true henter ikke fil-sha (fire kall totalt)", async () => {
  const kall: string[] = [];
  const svar = [{ object: { sha: "abc" } }, {}, {}, { html_url: "u" }];
  let i = 0;
  const fetchImpl = ((url: string) => {
    kall.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(svar[i++]), { status: 200 }));
  }) as typeof fetch;
  await opprettPr({ fetchImpl, token: "t", repo: "r/r" },
    { path: "data/packs/community/ny.md", create: true, innhold: "x", tittel: "T", kropp: "K", branch: "b" });
  assertEquals(kall.length, 4);
  assertEquals(kall.filter((u) => u.includes("?ref=main")).length, 0);
});
```

(Import-stil: samme justering mot repoets faktiske assert-import som Task 5.)

- [ ] **Step 2: Kjør — feiler.**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/kilde-pr-core.test.ts`

- [ ] **Step 3: Implementer** `_lib/kilde-pr-core.ts`:

```ts
// GitHub-kjernen for /api/kilde-pr (spec 2026-08-13-kildeforbedring §9):
// branch + commit + PR i fire REST-kall, injisert fetch (deno-testbar,
// samme seam-mønster som hent-core.ts). Aldri merge — kun PR.

export interface PrMaal { path: string; create: boolean; }

export function slugify(s: string): string {
  return String(s ?? "").toLowerCase()
    .replace(/æ/g, "ae").replace(/[åä]/g, "a").replace(/[øö]/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "kilde";
}

// Kopi av innebygd (of) → oppdater fasitfila; ren egen kilde → ny
// community-pakke. GitHubs contents-API skiller de to kun ved sha (spec §9).
export function velgMaal(inn: { of?: string; id: string; name: string }): PrMaal {
  if (inn.of) return { path: `data/sources/${inn.of}.md`, create: false };
  return { path: `data/packs/community/${slugify(inn.name || inn.id)}.md`, create: true };
}

export function byggBranchNavn(path: string, dato: Date): string {
  const base = path.split("/").pop()!.replace(/\.md$/, "");
  const d = dato.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `kilde/${slugify(base)}-${d}`;
}

// btoa tar latin1 — UTF-8-bytes chunkes for å unngå call-stack-taket på
// String.fromCharCode ved store dokumenter.
export function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export interface PrDeps { fetchImpl: typeof fetch; token: string; repo: string; }
export interface PrInn {
  path: string; create: boolean; innhold: string;
  tittel: string; kropp: string; branch: string;
}

export async function opprettPr(deps: PrDeps, inn: PrInn): Promise<{ url: string }> {
  const gh = (sti: string, init?: RequestInit) =>
    deps.fetchImpl(`https://api.github.com/repos/${deps.repo}${sti}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${deps.token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "askstat-kilde-pr",
        ...(init?.headers ?? {}),
      },
    });

  const refRes = await gh(`/git/ref/heads/main`);
  if (!refRes.ok) throw new Error(`GitHub ref: ${refRes.status}`);
  const sha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

  const brRes = await gh(`/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${inn.branch}`, sha }),
  });
  // 422 = branchen finnes fra før — trygt å gjenbruke: PUT under skriver
  // samme filsti, og PR-en peker uansett på branch-hodet.
  if (!brRes.ok && brRes.status !== 422) throw new Error(`GitHub branch: ${brRes.status}`);
  await brRes.body?.cancel();

  let filSha: string | undefined;
  if (!inn.create) {
    const fRes = await gh(`/contents/${inn.path}?ref=main`);
    if (fRes.ok) filSha = ((await fRes.json()) as { sha: string }).sha;
    else await fRes.body?.cancel();
  }

  const putRes = await gh(`/contents/${inn.path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: inn.tittel,
      content: base64Utf8(inn.innhold),
      branch: inn.branch,
      ...(filSha ? { sha: filSha } : {}),
    }),
  });
  if (!putRes.ok) throw new Error(`GitHub contents: ${putRes.status}`);
  await putRes.body?.cancel();

  const prRes = await gh(`/pulls`, {
    method: "POST",
    body: JSON.stringify({ title: inn.tittel, head: inn.branch, base: "main", body: inn.kropp }),
  });
  if (!prRes.ok) throw new Error(`GitHub PR: ${prRes.status}`);
  return { url: ((await prRes.json()) as { html_url: string }).html_url };
}
```

NB: Response-bodies i test-stubbene (`new Response(JSON…)`) er nok —
`body?.cancel()` på uleste/tomme bodies er no-op, og konsumerte bodies
cancelles aldri i koden over.

- [ ] **Step 4: Kjør — grønne.** `cd netlify/edge-functions && deno test --allow-all _lib/kilde-pr-core.test.ts`

- [ ] **Step 5: Endepunktet** `netlify/edge-functions/kilde-pr.ts`:

```ts
// /api/kilde-pr — «Send som PR» (spec 2026-08-13-kildeforbedring §9).
// KUN admin: adminGate UTEN allowByok — BYOK-forbikjøringen i runAdminGate
// ville ellers sluppet enhver nøkkelbruker forbi admin-kravet. Klienten
// sender Authorization: Bearer <login-token>; Anvil-brukerens is_admin
// (eller delt service-token) er den reelle sperren.
import { adminGate } from "./_lib/auth.ts";
import { byggBranchNavn, opprettPr, velgMaal } from "./_lib/kilde-pr-core.ts";

const MAX_BODY_BYTES = 300_000;
const MAX_TEKST = 60_000;
const OF_RE = /^[a-z0-9_-]{1,32}$/;   // samme id-form som coerceSourcesOff

interface RequestBody {
  id?: string; name?: string; of?: string; ny_tekst?: string; evidens?: string;
}

export default async (request: Request): Promise<Response> => {
  const gateResp = await adminGate(request, { endpoint: "kilde-pr", maxBodyBytes: MAX_BODY_BYTES });
  if (gateResp) return gateResp;

  let body: RequestBody;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const tekst = typeof body.ny_tekst === "string" ? body.ny_tekst : "";
  if (!tekst.trim() || tekst.length > MAX_TEKST) {
    return new Response("ny_tekst mangler eller er for stor", { status: 400 });
  }

  const token = Deno.env.get("GITHUB_PR_TOKEN");
  const repo = Deno.env.get("GITHUB_PR_REPO") ?? "hmelberg/askstat";
  if (!token) {
    console.error("kilde-pr: GITHUB_PR_TOKEN er ikke satt");
    return new Response("GITHUB_PR_TOKEN er ikke konfigurert", { status: 500 });
  }

  const of = typeof body.of === "string" && OF_RE.test(body.of) ? body.of : undefined;
  const maal = velgMaal({ of, id: String(body.id ?? ""), name: String(body.name ?? "") });
  const tittel = `kilde: ${maal.create ? "ny community-pakke" : "oppdatert"} ${maal.path.split("/").pop()} (forbedringssløyfa)`;
  // Evidensen er scrubbet KLIENTSIDE (byggEvidens, Task 12) — «hva feilet,
  // hva virket» i PR-kroppen er §9-regelen fra 2026-08-09-specen.
  const kropp = [
    String(body.evidens ?? "").slice(0, 8_000),
    "",
    "Sendt fra askstats forbedringssløyfe (kun admin). Review + repo-lint er formatvaktene; aldri auto-merge.",
  ].join("\n");

  try {
    const r = await opprettPr({ fetchImpl: fetch, token, repo }, {
      path: maal.path, create: maal.create, innhold: tekst,
      tittel, kropp, branch: byggBranchNavn(maal.path, new Date()),
    });
    return new Response(JSON.stringify({ url: r.url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kilde-pr:", e);
    return new Response("GitHub-kall feilet: " + (e instanceof Error ? e.message : String(e)), { status: 502 });
  }
};
```

- [ ] **Step 6: Registrer i `netlify.toml`** — etter kilde-forslag-innslaget:

```toml
[[edge_functions]]
  function = "kilde-pr"
  path = "/api/kilde-pr"
```

- [ ] **Step 7: Typecheck + alle deno-tester**

Run: `cd netlify/edge-functions && deno check kilde-pr.ts && deno test --allow-all _lib/`
Expected: alt grønt.

- [ ] **Step 8: Commit**

```bash
git add netlify/edge-functions/_lib/kilde-pr-core.ts netlify/edge-functions/_lib/kilde-pr-core.test.ts netlify/edge-functions/kilde-pr.ts netlify.toml
git commit -m "feat(§9): /api/kilde-pr — branch+commit+PR bak adminGate (uten BYOK-forbikjøring)"
```

---

### Task 12 (§9): «Send som PR»-knappen i modalen

**Files:**
- Modify: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- Consumes: `window.mdAuth` (js/login.js: `{token, user, isLoggedIn}`);
  `/api/kilde-pr` (Task 11); `Profiles.get` (origin.of for kopier).
- Produces: `KildeForslag.erAdmin()` og
  `KildeForslag.byggEvidens(ctx, deps) -> string` (rene, node-testet);
  admin-knapp per forslags-kort.

- [ ] **Step 1: Skriv feilende tester:**

```js
test('erAdmin: kun is_admin === true, med injisert auth', () => {
  assert.equal(KF.erAdmin({ user: { is_admin: true } }), true);
  assert.equal(KF.erAdmin({ user: { is_admin: 'ja' } }), false);
  assert.equal(KF.erAdmin({ user: {} }), false);
  assert.equal(KF.erAdmin(null), false);
});

test('byggEvidens: scrubbet, klippet, med feiltall og siste feil', () => {
  const ev = KF.byggEvidens({
    question: 'Hva er X?', tolkning: 'X per år',
    runs: [{ script: 's1', error: 'gammel feil' }, { script: 's2', error: 'api_key=hemmelig og mer' }],
    ok_script: 'x'.repeat(5000), kastedeTurer: 2,
  }, deps);
  assert.ok(ev.indexOf('Hva er X?') >= 0);
  assert.ok(ev.indexOf('Feilede kjøringer: 2') >= 0);
  assert.ok(ev.indexOf('forkastede turer: 2') >= 0);
  assert.ok(ev.indexOf('hemmelig og mer') === -1 || ev.indexOf('***') >= 0); // masker kjørte
  assert.ok(ev.length < 4000);
});
```

(`deps` er samme scrub/masker-stub som Task 2 — masker-stubben må da også
maskere `api_key=hemmelig`; enklest: bruk
`masker: (s) => require('../../js/feil-telemetri.js').maskerNokler(s)`.)

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 3: Implementer rene deler** i `js/kilde-forslag.js`:

```js
  // §9: klientsynligheten er kosmetikk — servergaten (adminGate) er den
  // reelle sperren. auth injiseres i test; produksjon leser window.mdAuth.
  function erAdmin(auth) {
    var a = auth !== undefined ? auth : global.mdAuth;
    return !!(a && a.user && a.user.is_admin === true);
  }

  // Evidens til PR-kroppen (spec §9): hva feilet, hva virket — SCRUBBET.
  function byggEvidens(ctx, deps) {
    ctx = ctx || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) || function (s) { return s; };
    var masker = (deps && deps.masker) ||
      (global.FeilTelemetri && global.FeilTelemetri.maskerNokler) || function (s) { return s; };
    var runs = ctx.runs || [];
    var deler = [
      'Spørsmål: ' + klipp(ctx.question, 500),
      ctx.tolkning ? 'Tolkning: ' + klipp(ctx.tolkning, 300) : '',
      'Feilede kjøringer: ' + runs.length +
        ((ctx.kastedeTurer | 0) ? ', forkastede turer: ' + ctx.kastedeTurer : ''),
    ];
    runs.slice(-2).forEach(function (r, i) {
      deler.push('Siste feil ' + (i + 1) + ': ' + klipp(masker(r.error), 600));
    });
    if (ctx.ok_script) deler.push('Virket til slutt:\n' + klipp(scrub(ctx.ok_script), 1500));
    return deler.filter(Boolean).join('\n');
  }
```

…legg begge i `api`.

- [ ] **Step 4: Kjør — grønne.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 5: Knappen i kortet** — i `renderForslag` (Task 7), etter
`rad.appendChild(forkast);`:

```js
      if (erAdmin()) {
        var prBtn = el('button', 'ai-codeblock-btn', T('Send as PR'));
        prBtn.type = 'button';
        prBtn.addEventListener('click', function () {
          prBtn.disabled = true;
          prBtn.textContent = T('Sending …');
          fetch('/api/kilde-pr', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Login-tokenet, IKKE mdAiAuthHeaders — adminGate validerer
              // brukeren mot Anvil (is_admin); BYOK slipper med vilje ikke inn.
              'Authorization': 'Bearer ' + ((global.mdAuth && global.mdAuth.token) || ''),
            },
            body: JSON.stringify({
              id: f.id,
              name: pr ? pr.name : f.id,
              of: (pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of) || undefined,
              ny_tekst: f.ny_tekst,
              evidens: byggEvidens(ctxSiste),
            }),
          }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          }).then(function (d) {
            prBtn.remove();
            var lenke = document.createElement('a');
            lenke.href = d.url;
            lenke.target = '_blank';
            lenke.rel = 'noopener';
            lenke.textContent = T('PR created:') + ' ' + d.url;
            rad.appendChild(lenke);
          }).catch(function (e) {
            prBtn.disabled = false;
            prBtn.textContent = T('PR failed — try again');
          });
        });
        rad.appendChild(prBtn);
      }
```

(`pr` er kortets Profiles-oppslag fra Task 7 — samme variabel.)

- [ ] **Step 6: Alle tester.** `node --test 'tests/js/*.test.js'` → PASS.

- [ ] **Step 7: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat(§9): Send som PR-knapp i forslags-modalen (admin, scrubbet evidens)"
```

---

### Task 13: i18n-runden + dokumentasjon + full verifisering

**Files:**
- Modify: `tools/list_i18n_keys.mjs` (skann-lista)
- Modify: `js/i18n/no.js`, `js/i18n/da.js`, `js/i18n/sv.js`,
  `js/i18n/fi.js`, `js/i18n/is.js`, `js/i18n/de.js`, `js/i18n/fr.js`,
  `js/i18n/es.js`, `js/i18n/pt.js`, `js/i18n/zh.js`, `js/i18n/ja.js`,
  `js/i18n/hi.js` (IKKE en.js — engelsk er ask-nøklenes kildespråk;
  filter-steget i list_i18n_keys.mjs krever at ask-nøkler IKKE står der)
- Modify: `tools/ask_i18n_keys.json` (regenereres)
- Modify: `netlify/edge-functions/README.md` (to endepunkt-linjer)

**Interfaces:**
- Consumes: alle `t('…')`/`T('…')`-literaler fra Task 6–12.
- Produces: grønn `tests/js/i18n-dicts.test.js`; oppdatert fasit.

- [ ] **Step 1: Legg `js/kilde-forslag.js` i skann-lista** — i
`tools/list_i18n_keys.mjs` (linje ~79):

```js
for (const file of ['js/ask-view.js', 'js/profiles.js', 'js/packs.js', 'js/sources-modal.js', 'js/kilde-forslag.js']) {
```

- [ ] **Step 2: Regenerer fasiten og se hvilke nøkler som kom til**

Run: `node tools/list_i18n_keys.mjs && git diff tools/ask_i18n_keys.json`
Expected: disse nøklene er nye (avvik = literaler i koden vant — bruk
git-diffen som fasit, ikke denne lista):

`Improve source description` ·
`Suggest improvements to your source description, based on this run's errors and detours` ·
`Getting suggestions …` · `Round {n}` · `Close` (finnes trolig fra før) ·
`The suggestion could not be parsed — raw answer below` ·
`No changes suggested` · `Apply` · `Discard` ·
`Applied — takes effect on your next question` ·
`Feedback — what should change in the next round?` · `New round` ·
`Make my own copy` · `Update from original` ·
`Sure? This overwrites the copy` · `Send as PR` · `Sending …` ·
`PR created:` · `PR failed — try again`

- [ ] **Step 3: Kjør ordboktesten — den skal nå feile**

Run: `node --test tests/js/i18n-dicts.test.js`
Expected: FAIL — nye nøkler mangler i ordbøkene.

- [ ] **Step 4: Legg nøklene i alle 12 ordbøker** — oversatt til hver
ordboks språk, alfabetisk plassert som resten av fila. Norsk (js/i18n/no.js)
som fasit-eksempel:

```js
  "Improve source description": "Forbedre kildebeskrivelsen",
  "Suggest improvements to your source description, based on this run's errors and detours": "Foreslå forbedringer i kildebeskrivelsen din, basert på feilene og omveiene i denne kjøringen",
  "Getting suggestions …": "Henter forslag …",
  "Round {n}": "Runde {n}",
  "The suggestion could not be parsed — raw answer below": "Forslaget kunne ikke tolkes — rått svar under",
  "No changes suggested": "Ingen endringer foreslått",
  "Apply": "Bruk",
  "Discard": "Forkast",
  "Applied — takes effect on your next question": "Oppdatert — gjelder neste spørsmål",
  "Feedback — what should change in the next round?": "Tilbakemelding — hva bør endres i neste runde?",
  "New round": "Ny runde",
  "Make my own copy": "Lag egen kopi",
  "Update from original": "Oppdater fra original",
  "Sure? This overwrites the copy": "Sikker? Dette overskriver kopien",
  "Send as PR": "Send som PR",
  "PR created:": "PR opprettet:",
  "Sending …": "Sender …",
  "PR failed — try again": "PR feilet — prøv igjen",
  "Close": "Lukk",
```

(Utelat nøkler git-diffen i Step 2 IKKE viste som nye — f.eks. finnes
`Close` kanskje allerede. `{n}`-plassholderen MÅ med i alle oversettelser —
i18n-dicts-testen sjekker plassholder-paritet.) Oversett til da/sv/fi/is/
de/fr/es/pt/zh/ja/hi i de respektive filene.

- [ ] **Step 5: README-dokumentasjon** — i `netlify/edge-functions/README.md`,
etter ask-ruter-linjen:

```markdown
- `kilde-forslag` → `/api/kilde-forslag` — forslag til revidert egen
  kildebeskrivelse fra en kjørings feillogg (single-shot; klienten eier
  flerrunde-historikken via body.history). Body: `{docs, question, runs,
  ok_script?, trace?, sources?, history?, ui_lang?, provider?}`.
- `kilde-pr` → `/api/kilde-pr` — KUN admin (adminGate uten BYOK-forbikjøring):
  branch + commit + PR på GitHub for et akseptert forslag. Env:
  `GITHUB_PR_TOKEN` (fingranulert PAT, kun dette repoet, Contents RW +
  Pull requests RW), valgfri `GITHUB_PR_REPO` (default hmelberg/askstat).
  Body: `{id, name, of?, ny_tekst, evidens}` → `{url}`.
```

- [ ] **Step 6: Full verifisering**

Run:
```bash
node tools/list_i18n_keys.mjs && git diff --exit-code tools/ask_i18n_keys.json; node --test 'tests/js/*.test.js' && cd netlify/edge-functions && deno check kilde-forslag.ts kilde-pr.ts svar.ts && deno test --allow-all _lib/
```
Expected: fasiten stabil (tom diff etter regen), ALLE node- og deno-tester
grønne, typecheck OK.

- [ ] **Step 7: Commit**

```bash
git add tools/list_i18n_keys.mjs tools/ask_i18n_keys.json js/i18n/ netlify/edge-functions/README.md
git commit -m "i18n: kildeforbedringens nøkler i alle ordbøker + regenerert fasit; README-dok"
```

---

### Task 14: Manuell smoke (Hans) — sjekkliste og env-oppsett

Ingen kode — dette er leveransens siste port. Utføres av Hans lokalt
(`netlify dev`, husk restart + hard reload + 400-smoke; porter 8899/3998).

- [ ] **Env-oppsett (én gang):** lag fingranulert GitHub-PAT scopet til KUN
  `hmelberg/askstat` med Contents RW + Pull requests RW; legg som
  `GITHUB_PR_TOKEN` i Netlify-miljøet (og i lokal `.env` for netlify dev).
- [ ] **Grunnsløyfa:** egen kilde med bevisst mangelfull beskrivelse
  (utelatt påkrevd parameter) → spørsmål → reparasjonsrunde skjer →
  «Forbedre kildebeskrivelsen»-knappen synlig → forslaget nevner
  parameteren → diff ser riktig ut.
- [ ] **Flerrunde:** gi tilbakemelding → «Ny runde» → forslaget justerer
  seg → «Bruk» → still spørsmålet igjen → færre/ingen reparasjonsrunder.
- [ ] **§8:** «Lag egen kopi» av ssb → kopien valgt → nytt spørsmål →
  Details-sporet viser at guiden IKKE følger første verktøysvar, mens
  `ssb.read`/search_catalog fortsatt virker → forbedringssløyfa tilbys på
  kopien → «Oppdater fra original» round-trip.
- [ ] **§9:** som admin: «Send som PR» → PR på GitHub med riktig diff mot
  `data/sources/ssb.md` og scrubbet evidens i kroppen → som IKKE-admin
  (utlogget/BYOK-bruker): knappen vises ikke, og et håndlaget POST mot
  `/api/kilde-pr` får 403.
- [ ] **Sikkerhet:** legg en egen nøkkel (KEYS) i et script som feiler →
  åpne forslags-modalen → verifiser i nettverksfanen at payloaden til
  `/api/kilde-forslag` har `***`/scrubbede verdier.

---

## Selvreview-notater (avvik fra spec, besluttet her)

- Modal-markupen bygges DYNAMISK i js/kilde-forslag.js (ikke statisk i
  index.html som spec-filtabellen antydet) — færre filer, og i18n-skannen
  tar t()-literaler fra js-fila (Task 13 Step 1). Kun knappen + script-tag
  ligger i index.html.
- «Rediger selv»-lenken per kort (spec §4) er utelatt i v1: kilde-editorens
  `openEdit` er privat i sources-modal.js, og den eksisterende veien
  (kilde-modalen → Edit) er to klikk unna. Tas ved behov.
- `trace` sendes som ÉN klippet streng (ikke array) — enklere caps og
  prompt-bygging; spec §2s intensjon (≤4 000 tegn prosess-spor) er uendret.
- Prompt-drift (spec §7 «samme lint som søsterpromptene»): søsterpromptene
  (dm-vurder) har i praksis KOMMENTAR-konvensjonen «Inlined from …; source
  of truth er .md-fila», ingen automatisert lint — kilde-forslag følger
  samme konvensjon. Scrub-driften er derimot automatisert (Task 2-testen).
