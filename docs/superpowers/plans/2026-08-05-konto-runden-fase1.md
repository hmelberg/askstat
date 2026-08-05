# Konto-runden fase 1 (lokal historikk + profiler) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historikk-sidebar (klikk = gjenopprett svar, «Run code again» regenererer figurer lokalt) og profiler (navngitt tekst som automatisk legges i prompten) — alt lokalt, null backend.

**Architecture:** To nye rene lagringsmoduler (IIFE + `makeX(storage)`-fabrikk, node-testbare uten DOM); all DOM-wiring i eksisterende `initAskView`-closure i ask-view.js og en DOM-seksjon i profiles.js. Aktiv profil gjenbruker det EKSISTERENDE `preferences`-feltet til `/api/svar` og ERSTATTER md_ask_prefs.

**Tech Stack:** Vanilla JS (IIFE + `node --test`), Deno/TS edge-funksjon (kun cap-endring), statisk index.html + css.

**Spec:** `docs/superpowers/specs/2026-08-05-konto-runden-design.md` (§Fase 1a, §Fase 1b)

## Global Constraints

- Testkommandoer: `node --test tests/js/*.test.js` (Node 26: ALDRI bar katalog), `cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/`.
- Ask-visningens UI-strenger er native ENGELSK uten data-i18n (konvensjon 2026-07-29). Innstillingsmodalen (editor-delt) beholder i18n der den ikke røres.
- Nye moduler følger husmønsteret: `(function (global) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);` med `module.exports`-seam nederst og DOM-kode bak `typeof document`-guard.
- Historikk-caps: 50 innslag, 2 MB serialisert. Profil-caps: name ≤ 60, text ≤ 8 000.
- Historikk/profil-skriving er best-effort: try/catch rundt alt storage-arbeid, feil blokkerer ALDRI svar-flyten.
- `.ask-sidebar` er skjult ≤ 720 px (eksisterende) — historikk utilgjengelig på mobil er akseptert v1.
- Kjente feller: modal-stacking (alle `.ai-modal-backdrop` har z-index 300, senere DOM vinner — noter i markup-kommentar); Chrome HTTP-cacher js/ på localhost (hard reload m/ignoreCache ved manuell verifisering).
- Commit-stil: `feat(ask): …` / `test(ask): …`, co-author-traileren fra husets konvensjon.

---

### Task 1: `js/ask-history.js` — ren lagringsmodul

**Files:**
- Create: `js/ask-history.js`
- Test: `tests/js/ask-history.test.js`
- Modify: `index.html` (script-tag rett etter `<script src="js/feil-telemetri.js"></script>`, linje ~12464)

**Interfaces:**
- Produces: `window.AskHistory` med `save(fields) → id`, `list() → [entry]` (nyeste først), `get(id) → entry|null`, `remove(id)`, `clear()`. Node-seam: `module.exports = { makeStore, MAX_ENTRIES, MAX_BYTES }`; `makeStore(storage, {now, newId})`.
- Entry-form (fra spec §Fase 1a): `{id, ts, updated, question, route, tolkning, markdown, script|null, sources, badge, badgeText|null, badgeWarn, depth, mode, profileId|null, profileName|null}` — `save` setter `id/ts/updated`, resten kommer fra caller.

- [ ] **Step 1: Skriv failende tester** — `tests/js/ask-history.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { makeStore, MAX_ENTRIES, MAX_BYTES } = require('../../js/ask-history.js');

function fakeStorage(failSets) {
  let fails = failSets || 0;
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (fails > 0) { fails--; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
}
function makeSeq() { // injiserbar klokke: monotone ISO-tider
  let i = 0;
  return () => '2026-08-05T00:00:' + String(i++).padStart(2, '0') + '.000Z';
}

test('save/list: nyeste først, get/remove/clear', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  const a = s.save({ question: 'first' });
  const b = s.save({ question: 'second' });
  assert.deepEqual(s.list().map((e) => e.question), ['second', 'first']);
  assert.equal(s.get(a).question, 'first');
  assert.equal(s.get('finnes-ikke'), null);
  s.remove(a);
  assert.equal(s.list().length, 1);
  s.clear();
  assert.equal(s.list().length, 0);
  assert.equal(s.get(b), null);
});

test('evict: aldri mer enn MAX_ENTRIES, eldste kastes', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  for (let i = 0; i < MAX_ENTRIES + 3; i++) s.save({ question: 'q' + i });
  const l = s.list();
  assert.equal(l.length, MAX_ENTRIES);
  assert.equal(l[l.length - 1].question, 'q3'); // q0..q2 kastet
});

test('evict: byte-taket kaster eldste', () => {
  const s = makeStore(fakeStorage(), { now: makeSeq() });
  const big = 'x'.repeat(Math.ceil(MAX_BYTES / 3));
  s.save({ question: 'old', markdown: big });
  s.save({ question: 'mid', markdown: big });
  s.save({ question: 'new', markdown: big });
  const qs = s.list().map((e) => e.question);
  assert.ok(!qs.includes('old'));
  assert.ok(qs.includes('new'));
});

test('kvotefeil: kast eldste og prøv én gang til, deretter stille', () => {
  const s = makeStore(fakeStorage(1), { now: makeSeq() });
  s.save({ question: 'a' });          // første set feiler → retry tom-minus-eldste
  const s2 = makeStore(fakeStorage(99), { now: makeSeq() });
  assert.doesNotThrow(() => s2.save({ question: 'b' })); // alt feiler → stille
});

test('korrupt JSON i lagringen → tomt dokument, ikke kast', () => {
  const st = fakeStorage();
  st.setItem('md_ask_history', '{skrot');
  const s = makeStore(st, { now: makeSeq() });
  assert.deepEqual(s.list(), []);
  s.save({ question: 'ok' });
  assert.equal(s.list().length, 1);
});
```

- [ ] **Step 2: Kjør — FAIL** (`node --test tests/js/ask-history.test.js`, forventer «Cannot find module»)

- [ ] **Step 3: Implementer `js/ask-history.js`:**

```js
// js/ask-history.js — lokal spørrehistorikk for ask-visningen
// (spec 2026-08-05-konto-runden §Fase 1a). Ren lagringsmodul uten DOM —
// ask-view.js eier all rendering/gjenoppretting. Best-effort: feil her
// skal aldri nå svar-flyten. `updated` = ts i fase 1 (endres først ved
// tombstoning i fase 2-synken).
(function (global) {
  'use strict';
  var LS = 'md_ask_history';
  var MAX_ENTRIES = 50;
  var MAX_BYTES = 2 * 1024 * 1024;

  function makeStore(storage, opts) {
    var now = (opts && opts.now) || function () { return new Date().toISOString(); };
    var newId = (opts && opts.newId) || function () {
      return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'h' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };
    function readDoc() {
      try {
        var doc = JSON.parse(storage.getItem(LS) || 'null');
        if (doc && doc.v === 1 && doc.entries && typeof doc.entries === 'object') return doc;
      } catch (e) {}
      return { v: 1, entries: {} };
    }
    function idsNewestFirst(doc) {
      return Object.keys(doc.entries).sort(function (a, b) {
        return doc.entries[a].ts < doc.entries[b].ts ? 1 : -1;
      });
    }
    function evict(doc) {
      var order = idsNewestFirst(doc);
      while (order.length > MAX_ENTRIES ||
             (order.length && JSON.stringify(doc).length > MAX_BYTES)) {
        delete doc.entries[order.pop()]; // pop = eldste
      }
    }
    function writeDoc(doc) {
      evict(doc);
      try {
        storage.setItem(LS, JSON.stringify(doc));
      } catch (e) { // kvote: kast eldste, prøv ÉN gang til, deretter stille
        var order = idsNewestFirst(doc);
        if (!order.length) return;
        delete doc.entries[order.pop()];
        try { storage.setItem(LS, JSON.stringify(doc)); } catch (e2) {}
      }
    }
    return {
      save: function (fields) {
        var doc = readDoc();
        var id = newId();
        var ts = now();
        doc.entries[id] = Object.assign({}, fields, { id: id, ts: ts, updated: ts });
        writeDoc(doc);
        return id;
      },
      list: function () {
        var doc = readDoc();
        return idsNewestFirst(doc).map(function (i) { return doc.entries[i]; });
      },
      get: function (id) { return readDoc().entries[id] || null; },
      remove: function (id) {
        var doc = readDoc();
        delete doc.entries[id];
        writeDoc(doc);
      },
      clear: function () { try { storage.removeItem(LS); } catch (e) {} },
    };
  }

  if (global.localStorage) global.AskHistory = makeStore(global.localStorage);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeStore: makeStore, MAX_ENTRIES: MAX_ENTRIES, MAX_BYTES: MAX_BYTES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

NB `global.localStorage`-grenen kjører også i node ≥ 22 (global localStorage finnes der) — det er ufarlig, seamen er `makeStore`.

- [ ] **Step 4: Script-tag i index.html** — rett etter `<script src="js/feil-telemetri.js"></script>`:

```html
  <script src="js/ask-history.js"></script>
```

- [ ] **Step 5: Kjør — PASS** (`node --test tests/js/ask-history.test.js`)

- [ ] **Step 6: Commit** — `git add js/ask-history.js tests/js/ask-history.test.js index.html && git commit -m "feat(ask): lokal historikk-lagring (md_ask_history, 50/2MB-caps)"`

---

### Task 2: fangst i ask-view.js — `buildHistoryEntry` + lagring på alle utfallsgrener

**Files:**
- Modify: `js/ask-view.js` (modulnivå-helper + runAskFlow linje ~729–933 + module.exports linje ~948)
- Test: `tests/js/ask-view.test.js` (append)

**Interfaces:**
- Consumes: `window.AskHistory.save(fields)` (Task 1).
- Produces: modulnivå `buildHistoryEntry(ctx) → fields` (eksportert; ctx = `{question, route, tolkning, markdown, script, sources, badge, badgeText, badgeWarn, depth, mode, profile}`); i runAskFlow: `lastOkScript`, `activeProfile`, `saveHistory(...)`, og at HVERT fullført svar (unntatt catch-gren/nøkkelmangel/abort) lagrer et innslag. Kaller `renderHistoryList()` når den finnes (Task 3 definerer den; guard med typeof).

- [ ] **Step 1: Failende tester** — append i `tests/js/ask-view.test.js` (samme require-stil som fila bruker øverst; utvid eksisterende destructuring eller legg til `const { buildHistoryEntry } = require('../../js/ask-view.js');`):

```js
test('buildHistoryEntry: mapper alle felter + profil', () => {
  const e = buildHistoryEntry({
    question: 'q', route: 'data', tolkning: 't', markdown: 'md {{fig:1}}',
    script: 's', sources: [{ url: 'u', ok: true }], badge: 'ok',
    badgeText: null, badgeWarn: false, depth: 'deep', mode: 'python',
    profile: { id: 'p1', name: 'OECD only', text: '…' },
  });
  assert.equal(e.question, 'q');
  assert.equal(e.script, 's');
  assert.equal(e.badge, 'ok');
  assert.equal(e.profileId, 'p1');
  assert.equal(e.profileName, 'OECD only');
  assert.equal(e.depth, 'deep');
});

test('buildHistoryEntry: defaults uten profil/script', () => {
  const e = buildHistoryEntry({ question: 'q', badge: 'ingen-kjøring' });
  assert.equal(e.script, null);
  assert.equal(e.profileId, null);
  assert.equal(e.profileName, null);
  assert.deepEqual(e.sources, []);
  assert.equal(e.route, 'data');
  assert.equal(e.badgeText, null);
  assert.equal(e.badgeWarn, false);
});
```

- [ ] **Step 2: Kjør — FAIL** (`node --test tests/js/ask-view.test.js`, «buildHistoryEntry is not defined»)

- [ ] **Step 3: Implementer.** (a) Modulnivå (f.eks. rett etter `badgeFor`, linje ~76):

```js
  // Fase 1 konto-runden (spec 2026-08-05): map runAskFlow-utfall → historikk-
  // innslag. Ren funksjon — DOM-fangsten i runAskFlow kaller denne; id/ts
  // settes av AskHistory.save. badgeText/badgeWarn lagres VERBATIM slik de
  // ble vist (tapsfri gjenoppretting; badge-enumen er til fase 2-semantikk).
  function buildHistoryEntry(ctx) {
    return {
      question: ctx.question,
      route: ctx.route || 'data',
      tolkning: ctx.tolkning || '',
      markdown: ctx.markdown || '',
      script: ctx.script || null,
      sources: ctx.sources || [],
      badge: ctx.badge,
      badgeText: ctx.badgeText || null,
      badgeWarn: !!ctx.badgeWarn,
      depth: ctx.depth,
      mode: ctx.mode,
      profileId: ctx.profile ? ctx.profile.id : null,
      profileName: ctx.profile ? ctx.profile.name : null,
    };
  }
```

(b) I `runAskFlow`: rett etter `var route = { rute: 'data', … };` (linje ~756):

```js
      var lastOkScript = null;
      var activeProfile = (window.Profiles && window.Profiles.active && window.Profiles.active()) || null;
      function saveHistory(markdown, badge, badgeText, badgeWarn, script, sources) {
        if (!window.AskHistory) return;
        try {
          window.AskHistory.save(buildHistoryEntry({
            question: question, route: route.rute, tolkning: route.tolkning,
            markdown: markdown, script: script, sources: sources,
            badge: badge, badgeText: badgeText, badgeWarn: badgeWarn,
            depth: askDepth(), mode: currentAskMode(), profile: activeProfile,
          }));
          if (typeof renderHistoryList === 'function') renderHistoryList();
        } catch (e) {}
      }
```

(c) I `onRunCode`, etter `runHistory.push(r.ok);` (linje ~849): `if (r.ok) lastOkScript = prefix + script;`

(d) Etter `progressLine('Route: …')` (linje ~787): `if (activeProfile) progressLine('Profile applied: ' + activeProfile.name);` (spec §Fase 1b synlighet — linjen arkiveres til Details).

(e) Lagringskall — FEM steder, med badgeText VERBATIM lik strengen som vises:
   - språk-grenen, etter `showAnswer(…)` før `return`: `saveHistory(route.svar || 'This question could not be formalized, and the router gave no direct answer.', 'ingen-kjøring', '⚠ Not verified with code or data — plain model answer', true, null, []);`
   - `case 'ok'`-grenen, etter `maybeRenderMath(res.markdown);`: `saveHistory(res.markdown, 'ok', null, false, lastOkScript, res.sources || []);`
   - `case 'feilet-etter-suksess'`: `saveHistory(res.markdown, 'feilet-etter-suksess', '⚠ Last polish run failed — the numbers come from an earlier successful run', false, lastOkScript, res.sources || []);`
   - `case 'feilet'`/default: `saveHistory(res.markdown, 'feilet', '⚠ The code did not run successfully — treat numbers with caution', true, null, res.sources || []);`
   - else-grenen (ikke ranAny), etter `maybeRenderMath(res.markdown);`: `saveHistory(res.markdown, 'ingen-kjøring', (res.sources && res.sources.length ? '⚠ Source-based answer — the code did not run successfully' : null), true, null, res.sources || []);`
   Catch-grenen og nøkkelmangel-kortet lagrer IKKE (spec).

(f) module.exports (linje ~948): legg til `buildHistoryEntry: buildHistoryEntry,`.

- [ ] **Step 4: Kjør — PASS** (`node --test tests/js/ask-view.test.js`, hele fila grønn)

- [ ] **Step 5: Commit** — `git commit -am "feat(ask): historikk-fangst på alle svar-utfall (buildHistoryEntry)"`

---

### Task 3: historikk-liste i sidebaren

**Files:**
- Modify: `index.html` (`.ask-sidebar`, etter `#askSettingsBtn` linje ~140), `js/ask-view.js` (initAskView), `css/ask.css`

**Interfaces:**
- Consumes: `window.AskHistory.list()/remove()/clear()` (Task 1).
- Produces: `renderHistoryList()` inne i initAskView (hoisted function declaration — Task 2s `saveHistory` og Task 4s restore bruker den); kaller `restoreEntry(id)` (Task 4 — inntil Task 4 er gjort, definer en tom stub `function restoreEntry(id) {}` som Task 4 erstatter).

- [ ] **Step 1: Markup** — i `index.html` rett etter `<button … id="askSettingsBtn">⚙ API key &amp; settings</button>`:

```html
      <div class="ask-history" id="askHistoryWrap" hidden>
        <div class="ask-history-head">History</div>
        <div id="askHistoryList"></div>
        <button type="button" class="ask-side-btn ask-history-clear" id="askHistoryClear" title="Delete all saved questions and answers in this browser">Clear history</button>
      </div>
```

- [ ] **Step 2: CSS** — append i `css/ask.css`:

```css
/* Historikk (konto-runden fase 1) */
.ask-history { display: flex; flex-direction: column; min-height: 0; margin-top: 14px;
  border-top: 1px solid var(--border); padding-top: 10px; }
.ask-history-head { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em;
  opacity: 0.6; padding: 0 8px 6px; }
#askHistoryList { overflow-y: auto; min-height: 0; flex: 1 1 auto; }
.ask-hist-item { display: flex; align-items: center; gap: 2px; }
.ask-hist-open { flex: 1 1 auto; min-width: 0; text-align: left; background: none;
  border: 1px solid transparent; border-radius: 6px; padding: 5px 8px; cursor: pointer;
  color: inherit; font-size: 0.85rem; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.ask-hist-open:hover { background: var(--bg-code); }
.ask-hist-del { flex: 0 0 auto; visibility: hidden; background: none; border: none;
  cursor: pointer; color: inherit; opacity: 0.55; font-size: 0.95rem; padding: 2px 6px; }
.ask-hist-item:hover .ask-hist-del { visibility: visible; }
.ask-hist-del:hover { opacity: 1; }
.ask-history-clear { font-size: 0.78rem; opacity: 0.7; margin-top: 4px; }
```

- [ ] **Step 3: Wiring i initAskView** (etter `syncDepthUi();`, linje ~613):

```js
    // Historikk-sidebar (konto-runden fase 1). renderHistoryList kalles også
    // fra saveHistory i runAskFlow (function declaration → hoistet).
    var histWrap = document.getElementById('askHistoryWrap');
    var histList = document.getElementById('askHistoryList');
    function renderHistoryList() {
      if (!histWrap || !histList || !window.AskHistory) return;
      var items = window.AskHistory.list();
      histWrap.hidden = !items.length;
      histList.innerHTML = '';
      items.forEach(function (e) {
        var row = document.createElement('div');
        row.className = 'ask-hist-item';
        var open = document.createElement('button');
        open.type = 'button';
        open.className = 'ask-hist-open';
        open.title = e.question + ' (' + String(e.ts).slice(0, 10) + ')'; // dato i tooltip (spec: dato synlig ved orientering)
        open.textContent = e.question.length > 60 ? e.question.slice(0, 57) + '…' : e.question;
        open.addEventListener('click', function () { restoreEntry(e.id); });
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'ask-hist-del';
        del.textContent = '×';
        del.title = 'Delete';
        del.addEventListener('click', function (ev) {
          ev.stopPropagation();
          window.AskHistory.remove(e.id);
          renderHistoryList();
        });
        row.appendChild(open);
        row.appendChild(del);
        histList.appendChild(row);
      });
    }
    document.getElementById('askHistoryClear').addEventListener('click', function () {
      if (window.AskHistory) window.AskHistory.clear();
      renderHistoryList();
    });
    function restoreEntry(id) {} // stub — erstattes i Task 4
    renderHistoryList();
```

- [ ] **Step 4: Verifiser** — `node --test tests/js/*.test.js` grønt (ingen DOM-tester her; manuell røyk kommer i Task 9).

- [ ] **Step 5: Commit** — `git commit -am "feat(ask): historikk-liste i sidebaren (åpne/slett/tøm)"`

---

### Task 4: gjenoppretting + «Run code again»

**Files:**
- Modify: `index.html` (`.ask-answer-actions`, linje ~165–169), `js/ask-view.js` (initAskView: erstatt stubben fra Task 3 + rerun-wiring + reset-punkter)

**Interfaces:**
- Consumes: `window.AskHistory.get(id)` (Task 1); eksisterende closure-helpers `showAnswer`, `renderMd`, `renderSources`, `progressLine`, `archiveStatus`; modulnivå `stripRefs`, `maybeRenderMath`, `resolveAnswerRefs`, `sweepUnresolvedRefs`, `mountFullOutput`, `mountLiveOutput`, `unmountLiveOutput`, `startReResolveObserver`, `stopReResolveObserver`; `window.mdAskExecuteScript(script, signal)`.
- Produces: `restoreEntry(id)` (erstatter Task 3-stubben), `#askRerunBtn`.

- [ ] **Step 1: Markup** — i `.ask-answer-actions`, etter `#askFullOutputBtn`:

```html
          <button type="button" class="ai-codeblock-btn" id="askRerunBtn" hidden title="Re-run the saved code locally (no AI cost) to regenerate figures and output">Run code again</button>
```

- [ ] **Step 2: Erstatt stubben** `function restoreEntry(id) {}` fra Task 3 med:

```js
    var rerunBtn = document.getElementById('askRerunBtn');
    var restoredEntry = null;
    function restoreEntry(id) {
      if (running) return;
      var e = window.AskHistory && window.AskHistory.get(id);
      if (!e) return;
      restoredEntry = e;
      stopReResolveObserver();
      unmountLiveOutput();
      fullOutBtn.hidden = true;
      statusBox.innerHTML = '';
      processBox.innerHTML = '';
      detailsEl.open = false;
      input.value = e.question;
      // Uten levende output-noder vises {{fig:N}} som [fig N]-klammer;
      // «Run code again» regenererer og resolver dem (spec §Fase 1a).
      showAnswer(stripRefs(e.markdown), e.badgeText, e.badgeWarn);
      renderSources(e.sources);
      maybeRenderMath(e.markdown);
      var note = document.createElement('div');
      note.className = 'ai-progress-line';
      note.textContent = '↩ Restored from history (asked ' + String(e.ts).slice(0, 10) + ')';
      processBox.appendChild(note);
      detailsEl.hidden = false;
      rerunBtn.hidden = !e.script;
    }
    async function rerunRestored() {
      var e = restoredEntry;
      if (!e || !e.script || running || !window.mdAskExecuteScript) return;
      running = true;
      sendBtn.disabled = true;
      rerunBtn.disabled = true;
      abortBtn.style.display = '';
      var ctrl = new AbortController();
      var onAbort = function () { ctrl.abort(); };
      abortBtn.addEventListener('click', onAbort);
      progressLine('Running the code …');
      try {
        var r = await window.mdAskExecuteScript(e.script, ctrl.signal);
        archiveStatus();
        if (r.ok) {
          // Samme montering som ok-grenen i runAskFlow: rå markdown m/
          // {{fig:N}} → levende slots (ref-nummerering er deterministisk
          // DOM-orden i classifyAskOutput).
          renderMd(answerBox, e.markdown);
          if (e.badgeText) {
            var b = document.createElement('div');
            b.className = 'ask-badge' + (e.badgeWarn ? ' ask-badge-warn' : '');
            b.textContent = e.badgeText;
            answerBox.insertBefore(b, answerBox.firstChild);
          }
          lastAnswerMd = e.markdown;
          renderSources(e.sources);
          fullOutBtn.hidden = false;
          if (resolveAnswerRefs() > 0) {
            mountFullOutput();
            startReResolveObserver();
          } else {
            mountLiveOutput();
          }
          sweepUnresolvedRefs();
          maybeRenderMath(e.markdown);
        } else {
          var d = document.createElement('div');
          d.className = 'ai-progress-line';
          d.textContent = '✗ Run failed — the restored text above is unchanged. ' +
            String(r && r.result || '').slice(0, 300);
          processBox.appendChild(d);
          detailsEl.hidden = false;
          detailsEl.open = true;
        }
      } catch (err) { /* abort → stille; teksten står */ }
      finally {
        abortBtn.removeEventListener('click', onAbort);
        abortBtn.style.display = 'none';
        sendBtn.disabled = false;
        rerunBtn.disabled = false;
        running = false;
      }
    }
    rerunBtn.addEventListener('click', rerunRestored);
```

- [ ] **Step 3: Reset-punkter.** (a) I `askNewBtn`-handleren (linje ~637), etter `lastAnswerMd = '';`: `rerunBtn.hidden = true; restoredEntry = null;` (b) I runAskFlow-reset (etter `lastAnswerMd = '';`, linje ~748): samme to linjer.

- [ ] **Step 4: Verifiser** — `node --test tests/js/*.test.js` grønt.

- [ ] **Step 5: Commit** — `git commit -am "feat(ask): gjenopprett svar fra historikk + Run code again (lokal re-kjøring)"`

---

### Task 5: `js/profiles.js` — lagringsdel + seed-migrering

**Files:**
- Create: `js/profiles.js` (kun lagringsdelen i denne tasken; DOM-delen kommer i Task 6)
- Test: `tests/js/profiles.test.js`
- Modify: `index.html` (script-tag rett etter ask-history.js-taggen fra Task 1)

**Interfaces:**
- Produces: `window.Profiles` = `makeProfiles(storage)` med `list() → [{id,name,text,updated}]` (sortert på navn), `get(id)`, `create(name, text) → id`, `update(id, {name, text})`, `remove(id)`, `setActive(id|null)`, `active() → {id,name,text}|null`, `activeText() → string|undefined`, `onChange(cb)`, `seedFromLegacy()`, `NAME_MAX`, `TEXT_MAX`. Node-seam: `module.exports = { makeProfiles }`.
- `activeText()` returnerer `undefined` (ALDRI tom streng) når ingen aktiv/tom tekst — matcher preferences-feltets `|| undefined`-kontrakt i ai-chat.js.

- [ ] **Step 1: Failende tester** — `tests/js/profiles.test.js` (gjenbruk `fakeStorage`-formen fra Task 1 — kopier funksjonen inn, IKKE del på tvers av testfiler):

```js
const test = require('node:test');
const assert = require('node:assert');
const { makeProfiles } = require('../../js/profiles.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('CRUD + caps + sortering', () => {
  const p = makeProfiles(fakeStorage());
  const a = p.create('B-profil', 'tekst b');
  const b = p.create('A-profil', 'x'.repeat(9000));
  assert.deepEqual(p.list().map((x) => x.name), ['A-profil', 'B-profil']);
  assert.equal(p.get(b).text.length, 8000);                    // TEXT_MAX
  assert.equal(p.create('n'.repeat(80), 't'), p.list().find((x) => x.name.length === 60).id); // NAME_MAX
  p.update(a, { name: 'Nytt navn', text: 'ny' });
  assert.equal(p.get(a).name, 'Nytt navn');
  p.remove(a);
  assert.equal(p.get(a), null);
});

test('active/activeText: undefined uten aktiv, deaktiveres ved sletting', () => {
  const p = makeProfiles(fakeStorage());
  assert.equal(p.active(), null);
  assert.equal(p.activeText(), undefined);
  const id = p.create('OECD only', 'Use only OECD as a data source.');
  p.setActive(id);
  assert.equal(p.active().name, 'OECD only');
  assert.equal(p.activeText(), 'Use only OECD as a data source.');
  p.setActive('finnes-ikke');                 // ignoreres
  assert.equal(p.active().id, id);
  p.remove(id);
  assert.equal(p.active(), null);
  assert.equal(p.activeText(), undefined);
});

test('seedFromLegacy: md_ask_prefs → aktiv «My preferences», legacy slettes', () => {
  const st = fakeStorage();
  st.setItem('md_ask_prefs', 'standardland Norge');
  const p = makeProfiles(st);
  p.seedFromLegacy();
  assert.equal(p.active().name, 'My preferences');
  assert.equal(p.activeText(), 'standardland Norge');
  assert.equal(st.getItem('md_ask_prefs'), null);
  // idempotent + rører ikke eksisterende profiler:
  st.setItem('md_ask_prefs', 'noe annet');
  p.seedFromLegacy();
  assert.equal(p.list().length, 1);
  assert.equal(st.getItem('md_ask_prefs'), null);
});

test('onChange fyrer på mutasjoner, korrupt JSON → tomt dokument', () => {
  const st = fakeStorage();
  st.setItem('md_profiles', '{skrot');
  const p = makeProfiles(st);
  let fired = 0;
  p.onChange(() => { fired++; });
  assert.deepEqual(p.list(), []);
  const id = p.create('x', 'y');
  p.setActive(id);
  assert.ok(fired >= 2);
});
```

- [ ] **Step 2: Kjør — FAIL** (`node --test tests/js/profiles.test.js`)

- [ ] **Step 3: Implementer `js/profiles.js`:**

```js
// js/profiles.js — profiler: navngitte prompt-tekster som automatisk legges
// til hvert spørsmål (spec 2026-08-05-konto-runden §Fase 1b). Lagringsdel +
// modal/chip-UI (DOM-delen bak document-guard). ERSTATTER md_ask_prefs —
// eksisterende verdi seedes som første profil ved oppstart. Aktiv profils
// tekst leses av ai-chat.js via Profiles.activeText() → preferences-feltet.
(function (global) {
  'use strict';
  var LS = 'md_profiles';
  var LEGACY = 'md_ask_prefs';
  var NAME_MAX = 60;
  var TEXT_MAX = 8000;

  function makeProfiles(storage, opts) {
    var now = (opts && opts.now) || function () { return new Date().toISOString(); };
    var newId = (opts && opts.newId) || function () {
      return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };
    var listeners = [];
    function fire() {
      listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
    }
    function readDoc() {
      try {
        var doc = JSON.parse(storage.getItem(LS) || 'null');
        if (doc && doc.v === 1 && doc.profiles && typeof doc.profiles === 'object') return doc;
      } catch (e) {}
      return { v: 1, active: null, updated: '', profiles: {} };
    }
    function writeDoc(doc) {
      doc.updated = now();
      try { storage.setItem(LS, JSON.stringify(doc)); } catch (e) {}
      fire();
    }
    function clampName(s) { return String(s || 'Untitled').trim().slice(0, NAME_MAX) || 'Untitled'; }
    function clampText(s) { return String(s == null ? '' : s).slice(0, TEXT_MAX); }
    return {
      NAME_MAX: NAME_MAX,
      TEXT_MAX: TEXT_MAX,
      list: function () {
        var doc = readDoc();
        return Object.keys(doc.profiles).map(function (id) {
          return Object.assign({ id: id }, doc.profiles[id]);
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      get: function (id) {
        var doc = readDoc();
        return doc.profiles[id] ? Object.assign({ id: id }, doc.profiles[id]) : null;
      },
      create: function (name, text) {
        var doc = readDoc();
        var id = newId();
        doc.profiles[id] = { name: clampName(name), text: clampText(text), updated: now() };
        writeDoc(doc);
        return id;
      },
      update: function (id, fields) {
        var doc = readDoc();
        if (!doc.profiles[id]) return;
        if (fields && 'name' in fields) doc.profiles[id].name = clampName(fields.name);
        if (fields && 'text' in fields) doc.profiles[id].text = clampText(fields.text);
        doc.profiles[id].updated = now();
        writeDoc(doc);
      },
      remove: function (id) {
        var doc = readDoc();
        delete doc.profiles[id];
        if (doc.active === id) doc.active = null;
        writeDoc(doc);
      },
      setActive: function (id) {
        var doc = readDoc();
        if (id !== null && !doc.profiles[id]) return;
        doc.active = id;
        writeDoc(doc);
      },
      active: function () {
        var doc = readDoc();
        if (!doc.active || !doc.profiles[doc.active]) return null;
        return Object.assign({ id: doc.active }, doc.profiles[doc.active]);
      },
      activeText: function () {
        var doc = readDoc();
        var p = doc.active && doc.profiles[doc.active];
        var t = p && String(p.text || '').trim();
        return t ? t : undefined;
      },
      onChange: function (cb) { listeners.push(cb); },
      seedFromLegacy: function () {
        try {
          var raw = storage.getItem(LEGACY);
          if (raw == null) return;
          storage.removeItem(LEGACY);
          if (!String(raw).trim()) return;
          var doc = readDoc();
          if (Object.keys(doc.profiles).length) return; // aldri overskriv
          var id = newId();
          doc.profiles[id] = { name: 'My preferences', text: clampText(raw), updated: now() };
          doc.active = id;
          writeDoc(doc);
        } catch (e) {}
      },
    };
  }

  if (global.localStorage) {
    global.Profiles = makeProfiles(global.localStorage);
    global.Profiles.seedFromLegacy();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeProfiles: makeProfiles };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Script-tag** — i index.html, rett etter ask-history.js-taggen: `  <script src="js/profiles.js"></script>`

- [ ] **Step 5: Kjør — PASS** (`node --test tests/js/profiles.test.js`)

- [ ] **Step 6: Commit** — `git add js/profiles.js tests/js/profiles.test.js index.html && git commit -m "feat(ask): profil-lagring (md_profiles) m/seed-migrering fra md_ask_prefs"`

---

### Task 6: Profiles-modal, sidebar-knapp og aktiv-chip

**Files:**
- Modify: `index.html` (sidebar-knapp, chip, modal-markup), `js/profiles.js` (DOM-seksjon), `css/ask.css`

**Interfaces:**
- Consumes: `window.Profiles` (Task 5).
- Produces: `window.Profiles.openModal()`; `#askProfilesBtn`, `#askProfileChip`, `#profilesBackdrop`.

- [ ] **Step 1: Markup.** (a) Sidebar-knapp i index.html, rett etter `#askSettingsBtn`-knappen (FØR historikk-blokken fra Task 3):

```html
      <button type="button" class="ask-side-btn" id="askProfilesBtn" title="Named texts that are automatically added to every question you ask">☰ Profiles</button>
```

(b) Chip — rett ETTER `</div>` som lukker `.ask-input-row` (linje ~156):

```html
      <div class="ask-profile-chip" id="askProfileChip" hidden>
        <button type="button" class="ask-profile-chip-name" id="askProfileChipName" title="Active profile — its text is added to every ask. Click to manage."></button>
        <button type="button" class="ask-profile-chip-off" id="askProfileChipOff" title="Deactivate profile">×</button>
      </div>
```

(c) Modal — rett FØR `<div class="ai-modal-backdrop" id="aiSettingsBackdrop">` (linje ~281):

```html
  <!-- Profiles (ask-visningen; engelsk uten i18n, konvensjon 2026-07-29).
       Modal-stacking-felle: alle .ai-modal-backdrop har z-index 300 og senere
       DOM vinner — åpnes denne noen gang OPPÅ en annen modal, trenger den
       egen høyere z-index (jf. safestats pwPromptBackdrop = 310). -->
  <div class="ai-modal-backdrop" id="profilesBackdrop">
    <div class="ai-modal">
      <h3>Profiles</h3>
      <div class="ai-modal-help">A profile is a text that is automatically added to every question you ask — for example “Use only OECD as a data source”, documentation of your dataset's variables, or the URL of an extra source. Refer to stored keys as key(name) — never paste raw secrets here.</div>
      <div id="profilesList" class="profiles-list"></div>
      <div id="profilesEdit" hidden>
        <label for="profileName">Name</label>
        <input type="text" id="profileName" maxlength="60">
        <label for="profileText">Text added to every ask</label>
        <textarea id="profileText" rows="7" maxlength="8000"></textarea>
        <div class="ai-modal-help"><span id="profileCount">0</span> / 8000</div>
      </div>
      <div class="ai-modal-actions">
        <button type="button" class="ai-modal-btn" id="profileNewBtn">New profile</button>
        <button type="button" class="ai-modal-btn" id="profileDeleteBtn" hidden>Delete</button>
        <button type="button" class="ai-modal-btn primary" id="profileSaveBtn" hidden>Save</button>
        <button type="button" class="ai-modal-btn" id="profilesCloseBtn">Close</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: DOM-seksjon i js/profiles.js** — rett før module.exports-blokken, ERSTATT den enkle browser-init-grenen fra Task 5 med:

```js
  if (global.localStorage) {
    global.Profiles = makeProfiles(global.localStorage);
    global.Profiles.seedFromLegacy();
  }

  // ---- DOM: modal + chip (kun browser; ask-visningen, engelske strenger).
  if (typeof document !== 'undefined' && document.getElementById) {
    var initProfilesUi = function () {
      var P = global.Profiles;
      var backdrop = document.getElementById('profilesBackdrop');
      if (!P || !backdrop) return;
      var listEl = document.getElementById('profilesList');
      var editEl = document.getElementById('profilesEdit');
      var nameEl = document.getElementById('profileName');
      var textEl = document.getElementById('profileText');
      var countEl = document.getElementById('profileCount');
      var newBtn = document.getElementById('profileNewBtn');
      var saveBtn = document.getElementById('profileSaveBtn');
      var delBtn = document.getElementById('profileDeleteBtn');
      var editingId = null; // null = ingen redigering; 'NY' = ny profil

      function renderList() {
        var act = P.active();
        listEl.innerHTML = '';
        var none = document.createElement('label');
        none.className = 'profiles-row';
        none.innerHTML = '<input type="radio" name="profileActive"' + (act ? '' : ' checked') + '> <span>No profile</span>';
        none.querySelector('input').addEventListener('change', function () { P.setActive(null); });
        listEl.appendChild(none);
        P.list().forEach(function (pr) {
          var row = document.createElement('label');
          row.className = 'profiles-row';
          var r = document.createElement('input');
          r.type = 'radio';
          r.name = 'profileActive';
          r.checked = !!(act && act.id === pr.id);
          r.addEventListener('change', function () { P.setActive(pr.id); });
          var nm = document.createElement('span');
          nm.textContent = pr.name;
          var edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'ai-codeblock-btn';
          edit.textContent = 'Edit';
          edit.addEventListener('click', function (ev) {
            ev.preventDefault();
            openEdit(pr.id);
          });
          row.appendChild(r); row.appendChild(nm); row.appendChild(edit);
          listEl.appendChild(row);
        });
      }
      function openEdit(id) {
        editingId = id;
        var pr = id === 'NY' ? { name: '', text: '' } : (P.get(id) || { name: '', text: '' });
        nameEl.value = pr.name;
        textEl.value = pr.text;
        countEl.textContent = String(textEl.value.length);
        editEl.hidden = false;
        saveBtn.hidden = false;
        delBtn.hidden = id === 'NY';
        nameEl.focus();
      }
      function closeEdit() {
        editingId = null;
        editEl.hidden = true;
        saveBtn.hidden = true;
        delBtn.hidden = true;
      }
      textEl.addEventListener('input', function () { countEl.textContent = String(textEl.value.length); });
      newBtn.addEventListener('click', function () { openEdit('NY'); });
      saveBtn.addEventListener('click', function () {
        if (editingId === 'NY') {
          var id = P.create(nameEl.value, textEl.value);
          if (!P.active()) P.setActive(id); // første profil aktiveres direkte
        } else if (editingId) {
          P.update(editingId, { name: nameEl.value, text: textEl.value });
        }
        closeEdit();
        renderList();
      });
      delBtn.addEventListener('click', function () {
        if (editingId && editingId !== 'NY') P.remove(editingId);
        closeEdit();
        renderList();
      });
      document.getElementById('profilesCloseBtn').addEventListener('click', function () {
        closeEdit();
        backdrop.classList.remove('open');
      });
      P.openModal = function () {
        closeEdit();
        renderList();
        backdrop.classList.add('open');
      };
      var sideBtn = document.getElementById('askProfilesBtn');
      if (sideBtn) sideBtn.addEventListener('click', function () { P.openModal(); });

      // Chip ved spørrefeltet (spec: aktiv profil skal aldri usynlig forme svar).
      var chip = document.getElementById('askProfileChip');
      var chipName = document.getElementById('askProfileChipName');
      var chipOff = document.getElementById('askProfileChipOff');
      function renderChip() {
        if (!chip) return;
        var a = P.active();
        chip.hidden = !a;
        if (a) chipName.textContent = 'Profile: ' + a.name;
      }
      if (chipName) chipName.addEventListener('click', function () { P.openModal(); });
      if (chipOff) chipOff.addEventListener('click', function () { P.setActive(null); });
      P.onChange(function () { renderChip(); renderList(); });
      renderChip();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfilesUi);
    else initProfilesUi();
  }
```

- [ ] **Step 3: CSS** — append i `css/ask.css`:

```css
/* Profiler (konto-runden fase 1) */
.ask-profile-chip { display: flex; align-items: center; gap: 2px; margin-top: 6px;
  align-self: flex-start; border: 1px solid var(--border); border-radius: 999px;
  padding: 2px 4px 2px 10px; font-size: 0.8rem; background: var(--bg-code); }
.ask-profile-chip-name { background: none; border: none; cursor: pointer;
  color: inherit; font-size: inherit; padding: 2px 2px; }
.ask-profile-chip-off { background: none; border: none; cursor: pointer;
  color: inherit; opacity: 0.55; padding: 2px 6px; }
.ask-profile-chip-off:hover { opacity: 1; }
.profiles-list { display: flex; flex-direction: column; gap: 2px; margin: 10px 0; }
.profiles-row { display: flex; align-items: center; gap: 8px; padding: 4px 2px;
  cursor: pointer; }
.profiles-row span { flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
#profilesEdit label { display: block; margin: 8px 0 3px; font-size: 0.85rem; }
#profilesEdit input, #profilesEdit textarea { width: 100%; box-sizing: border-box; }
```

- [ ] **Step 4: Verifiser** — `node --test tests/js/*.test.js` grønt (DOM-delen røyk-testes i Task 9).

- [ ] **Step 5: Commit** — `git commit -am "feat(ask): Profiles-modal, sidebar-knapp og aktiv-chip"`

---

### Task 7: prompt-integrasjon — preferences fra aktiv profil, md_ask_prefs-feltet bort

**Files:**
- Modify: `js/ai-chat.js` (linje ~689 preferences-IIFE; linje 41 dom-registry; linje ~1320 openSettings; linje ~1337–1343 saveSettings), `index.html` (linje ~297–302: hele div-blokken rundt `aiCfgDataPrefs`)

**Interfaces:**
- Consumes: `window.Profiles.activeText()` (Task 5) — returnerer `string | undefined`.
- Produces: `/api/svar`-body der `preferences` = aktiv profils tekst; innstillingsmodal uten Datapreferanser-felt.

- [ ] **Step 1: ai-chat.js preferences-lesing** — erstatt IIFE-en (linje ~689–692):

```js
              // Konto-runden fase 1: preferences = aktiv PROFILS tekst
              // (js/profiles.js erstatter md_ask_prefs; seedes ved oppstart).
              preferences: (window.Profiles && window.Profiles.activeText && window.Profiles.activeText()) || undefined,
```

- [ ] **Step 2: Fjern feltet.** (a) index.html: slett hele `<div>`-blokken som inneholder `aiCfgDataPrefs`-label/textarea/hjelpetekst (finn med `grep -n aiCfgDataPrefs index.html`; blokken er `<div …>…<label for="aiCfgDataPrefs">…<textarea id="aiCfgDataPrefs"…>…<div class="ai-modal-help">…</div>\n      </div>`). (b) ai-chat.js: fjern `'aiCfgDataPrefs',` fra dom-registry-lista (linje 41); fjern openSettings-linja `if (dom.aiCfgDataPrefs) { … }` (linje ~1320); fjern hele `if (dom.aiCfgDataPrefs) { … }`-blokken i saveSettings (linje ~1337–1343). INGEN andre spor av md_ask_prefs skal finnes i js/ etterpå: `grep -rn md_ask_prefs js/` skal KUN treffe profiles.js (LEGACY-konstanten).

- [ ] **Step 3: Verifiser** — `node --test tests/js/*.test.js` grønt; `grep -rn "md_ask_prefs" js/ index.html` viser kun profiles.js.

- [ ] **Step 4: Commit** — `git commit -am "feat(ask): preferences-feltet leses fra aktiv profil; Datapreferanser-feltet fjernet"`

---

### Task 8: coercePreferences-cap 2 000 → 8 000

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts:19`, `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts:4-8`

- [ ] **Step 1: Oppdater testen** — i `svar-prompt-prefs.test.ts`: testnavn «…tak 2000» → «…tak 8000»; `coercePreferences("a".repeat(3000)).length, 2000` → `coercePreferences("a".repeat(9000)).length, 8000`.

- [ ] **Step 2: Kjør — FAIL** (`cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt-prefs.test.ts`)

- [ ] **Step 3: Implementer** — `svar-prompt.ts:19`: `slice(0, 2000)` → `slice(0, 8000)` (profil-tekster kan romme datasettdokumentasjon; klient-cap i profiles.js er samme 8 000).

- [ ] **Step 4: Kjør — PASS** (`deno test --allow-all _lib/svar-prompt-prefs.test.ts`)

- [ ] **Step 5: Commit** — `git commit -am "feat(svar): preferences-cap 8000 (profil-tekster)"`

---

### Task 9: sluttverifisering

- [ ] **Step 1: Full testpakke:**

```bash
node --test tests/js/*.test.js
cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/ && cd ../..
```

Forventet: alt grønt (1075+-klassen node, 331+-klassen deno).

- [ ] **Step 2: Manuell røyk (lokalt, `netlify dev` på port 8899; Chrome hard-reload m/ignoreCache — js/ HTTP-caches):**
  1. Spør noe lett («Is 7919 a prime number?») → svar → innslag øverst i History-lista.
  2. Klikk innslaget → tekst + badge tilbake, `[fig N]`-klammer hvis figur, «Run code again» synlig → klikk → figur i slot, Full output virker.
  3. Ny ask fra gjenopprettet tilstand → normalt løp, nytt innslag.
  4. Slett ett innslag (×), «Clear history» → lista tom + skjult.
  5. Profiles → New profile («OECD only» / «Use only OECD as a data source.») → chip vises; spør → Details har «Profile applied: OECD only»; nettverksfanen viser `preferences` i /api/svar-body.
  6. × på chipen → deaktivert; innstillingsmodalen har IKKE Datapreferanser-felt.
  7. Legg `md_ask_prefs`-verdi i localStorage manuelt, reload → profil «My preferences» finnes og er aktiv.

- [ ] **Step 3: Rapporter til Hans** — push er hans beslutning (deploy = live på ask.melberg.app).
