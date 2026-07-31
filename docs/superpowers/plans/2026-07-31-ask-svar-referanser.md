# Ask-svar med output-referanser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sluttsvaret i ask-visningen refererer levende output-noder (`{{fig:1}}` m.fl.) i stedet for å gjenta dem; ureferert output bak «Full output»-fold; KaTeX-matte; OUTPUTS-manifest til modellen.

**Architecture:** Ren halvdel (referansetildeling, plassholder-stripping, resolusjonsplan) i `js/ask-view.js` med node-tester; tynn DOM-halvdel (klassifisering via wrapper-selektorer, flytting med anker/hjemreise, re-resolve-observer) samme fil. Manifest-linjen legges på i `mdAskExecuteScript` (`js/ai-chat.js`). Svarkontrakten endres i RUN-blokken (`svar-prompt.ts`) + speiles i `prompts/svar.md`.

**Tech Stack:** Vanilla JS (IIFE + module.exports-seam), `node:test`, markdown-it, KaTeX 0.16.21 (lazy fra jsdelivr), MutationObserver.

**Spec:** `docs/superpowers/specs/2026-07-31-ask-svar-referanser-design.md`

## Global Constraints

- Repo-stil: `var`-basert IIFE-kode i js/, norske kommentarer, module.exports-seam nederst for rene funksjoner.
- Tester kjøres med `node --test tests/js/<fil>` fra repo-rota; hele suiten: `node --test tests/js/`.
- ALDRI push — askstat-push er Hans' beslutning (commit lokalt per task).
- Ingen bakoverkompat-hensyn utover fallbacken spec-en krever (null plassholdere → dagens oppførsel).
- `svar-prompt.ts`-blokker og `netlify/edge-functions/prompts/svar.md` skal holdes byte-nært synkrone (unescapet TS-template-literal).
- Python-først: prompt-tillegget «design for svaret» kun i MODE_PY.

## Avvik fra spec §9 (begrunnet)

Spec-en nevner DOM-tester etter `ui-dom.test.js`-mønsteret. Resolveren krever
`querySelectorAll`/`closest`/`matches`/`replaceWith` — en selektor-motor de
håndstubbede FakeEl-ene i repoet bevisst ikke har, og jsdom finnes ikke i
repoet. Planen følger derfor repo-mønsteret strengt i stedet: MAKSIMAL ren
halvdel (all nummerering/dedupe/plan-logikk node-testes), tynnest mulig
DOM-lim, manuell smoke (Hans) for DOM-delen.

## Filstruktur

| Fil | Ansvar |
| --- | --- |
| `js/ask-view.js` | Ren halvdel: `assignRefs`, `formatOutputsManifest`, `stripRefs`, `planRefResolution`. DOM-halvdel: `mdClassifyAskOutput`, resolver/slots/ankre, mount-generalisering, re-resolve-observer, KaTeX-lazy |
| `js/ai-chat.js` | OUTPUTS-linje i `mdAskExecuteScript`-resultatet |
| `index.html` | `#askFullOutput`-details-markup + CSS for `.ask-out-slot`/`.ask-out-anchor` |
| `netlify/edge-functions/_lib/svar-prompt.ts` | Ny RUN-blokk (svarkontrakt) + MODE_PY-tillegg |
| `netlify/edge-functions/prompts/svar.md` | Speil av samme to blokker |
| `tests/js/ask-view.test.js` | Node-tester for den rene halvdelen |

Referanseklasser ↔ DOM-wrappere (verifisert mot `buildOutputNodes`/`mdRender*` i index.html):

| Selektor | kind | klasse |
| --- | --- | --- |
| `.plotly-container` | plotly | fig |
| `img.output-matplotlib-img` | png | fig |
| `.vegalite-container` | vegalite | fig |
| `.tabulator-embed` | tabulator | table |
| `.output-table-wrap` | table | table |
| `.leafletmap-container` | map | map |
| `.ipw-view` | widget | widget |
| `.output-html-embed` | html | html |
| `.param-form`, `.ui-controls` | controls | controls |

Nøkkelinnsikt for re-kjøringer (låst i design her): ask-script med `#@param`
notatbok-wrappes (`computeParamFormsWrap`, ai-chat.js) — re-kjøringer treffer
cellens `.nb-output-body` via `renderOutput(…, target)`, IKKE hele
`#outputArea`. Ankre (`.ask-out-anchor`) OPPTAR derfor referansenummeret sitt
i klassifiseringen, slik at numre forblir stabile når noen noder er flyttet
ut og bare deler av outputen re-rendres.

---

### Task 1: Ren referansekjerne i ask-view.js + node-tester

**Files:**
- Modify: `js/ask-view.js` (nye rene funksjoner over DOM-delen + module.exports)
- Test: `tests/js/ask-view.test.js`

**Interfaces:**
- Produces: `assignRefs(items)` — items er `[{kind:'plotly'}|{anchor:'fig:1'}|{}]` i dokumentrekkefølge → `[{ref:'fig:1', kind:'plotly', idx:0}, …]`; ankre opptar nummeret sitt, ukjente/tomme hoppes over.
- Produces: `formatOutputsManifest(refs)` → `'OUTPUTS: fig:1 (plotly), table:1'` eller `''`; kind i parentes KUN når kind ≠ klassenavnet.
- Produces: `stripRefs(markdown)` → plassholder-alene-linjer byttet til `[fig 1]`.
- Produces: `planRefResolution(availableRefs, placeholderRefs)` → `[{ref, action:'resolve'|'drop-dup'|'drop-unknown'}]`.
- Produces: `ASK_REF_LINE_RE` (delt regex, også brukt av resolveren i Task 3).

- [ ] **Step 1: Skriv de feilende testene** — legg til nederst i `tests/js/ask-view.test.js`:

```js
test('assignRefs: nummerering per klasse i dokumentrekkefølge', () => {
  const refs = askView.assignRefs([
    { kind: 'plotly' }, { kind: 'table' }, { kind: 'png' },
    { kind: 'tabulator' }, { kind: 'controls' }]);
  assert.deepStrictEqual(refs.map(r => r.ref),
    ['fig:1', 'table:1', 'fig:2', 'table:2', 'controls:1']);
  assert.deepStrictEqual(refs.map(r => r.idx), [0, 1, 2, 3, 4]);
});

test('assignRefs: anker opptar nummeret sitt', () => {
  // fig:1 er flyttet ut (anker står igjen) → neste fig blir fig:2
  const refs = askView.assignRefs([{ anchor: 'fig:1' }, { kind: 'plotly' }]);
  assert.deepStrictEqual(refs.map(r => r.ref), ['fig:2']);
  assert.strictEqual(refs[0].idx, 1);
});

test('assignRefs: anker med høyt nummer + ukjent kind hoppes over', () => {
  const refs = askView.assignRefs([
    { kind: 'plotly' }, { anchor: 'fig:2' }, { kind: 'png' }, {}, { anchor: 'tull' }]);
  assert.deepStrictEqual(refs.map(r => r.ref), ['fig:1', 'fig:3']);
});

test('formatOutputsManifest: parentes kun når kind ≠ klasse', () => {
  assert.strictEqual(askView.formatOutputsManifest([]), '');
  assert.strictEqual(
    askView.formatOutputsManifest(askView.assignRefs([
      { kind: 'plotly' }, { kind: 'table' }, { kind: 'tabulator' }])),
    'OUTPUTS: fig:1 (plotly), table:1, table:2 (tabulator)');
});

test('stripRefs: plassholder-alene-linjer → klammetekst', () => {
  assert.strictEqual(askView.stripRefs('a\n{{fig:1}}\n tekst {{fig:2}} inni\n{{table:3}} \nb'),
    'a\n[fig 1]\n tekst {{fig:2}} inni\n[table 3]\nb');
  assert.strictEqual(askView.stripRefs(null), '');
});

test('planRefResolution: først-vinner, ukjent droppes', () => {
  assert.deepStrictEqual(
    askView.planRefResolution(['fig:1', 'table:1'], ['fig:1', 'fig:1', 'fig:9', 'table:1']),
    [{ ref: 'fig:1', action: 'resolve' },
     { ref: 'fig:1', action: 'drop-dup' },
     { ref: 'fig:9', action: 'drop-unknown' },
     { ref: 'table:1', action: 'resolve' }]);
});
```

- [ ] **Step 2: Kjør — verifiser at de feiler**

Run: `node --test tests/js/ask-view.test.js`
Expected: FAIL — `askView.assignRefs is not a function`

- [ ] **Step 3: Implementer den rene kjernen** — i `js/ask-view.js`, rett etter `coerceAskDepth` (før mount-seksjonen):

```js
  /* ── Output-referanser (spec 2026-07-31-ask-svar-referanser): svaret
     peker på levende output-noder. Ren halvdel her (node-testet);
     DOM-resolveren lenger ned. ─────────────────────────────────────── */
  var ASK_REF_LINE_RE = /^\{\{(fig|table|map|widget|html|controls):([1-9]\d*)\}\}$/;
  // kind (elementtype fra klassifisereren) → referanseklasse
  var KIND_TO_CLASS = {
    plotly: 'fig', png: 'fig', vegalite: 'fig',
    table: 'table', tabulator: 'table',
    map: 'map', widget: 'widget', html: 'html', controls: 'controls',
  };
  var REF_CLASSES = { fig: 1, table: 1, map: 1, widget: 1, html: 1, controls: 1 };

  // assignRefs(items): items er dokumentrekkefølgen av output-elementer —
  // {kind: 'plotly'} for et levende element, {anchor: 'fig:1'} for et
  // hjemreise-anker etter en utflyttet node. Ankre OPPTAR nummeret sitt
  // (utflyttede noder beholder referansen på tvers av delvise
  // re-rendringer) uten selv å bli med i resultatet.
  function assignRefs(items) {
    var counts = {};
    var out = [];
    (items || []).forEach(function (it, i) {
      if (it && it.anchor) {
        var parts = String(it.anchor).split(':');
        var n = parseInt(parts[1], 10);
        if (REF_CLASSES[parts[0]] && n > 0) {
          counts[parts[0]] = Math.max(counts[parts[0]] || 0, n);
        }
        return;
      }
      var cls = it && KIND_TO_CLASS[it.kind];
      if (!cls) return;
      counts[cls] = (counts[cls] || 0) + 1;
      out.push({ ref: cls + ':' + counts[cls], kind: it.kind, idx: i });
    });
    return out;
  }

  // OUTPUTS-linjen i run_code-resultatet (les i sammenheng med
  // svar-prompt.ts sin RUN-blokk — de forteller samme historie).
  function formatOutputsManifest(refs) {
    if (!refs || !refs.length) return '';
    return 'OUTPUTS: ' + refs.map(function (r) {
      return r.kind === r.ref.split(':')[0] ? r.ref : r.ref + ' (' + r.kind + ')';
    }).join(', ');
  }

  // stripRefs: plassholder-alene-linjer → «[fig 1]» (utklippstavle +
  // feilede kjøringer der ingen output finnes å peke på).
  function stripRefs(markdown) {
    return String(markdown == null ? '' : markdown).split('\n').map(function (line) {
      var m = ASK_REF_LINE_RE.exec(line.trim());
      return m ? '[' + m[1] + ' ' + m[2] + ']' : line;
    }).join('\n');
  }

  // planRefResolution: hva skjer med hver plassholder — første forekomst
  // av en referanse vinner (noden kan bare bo ett sted), ukjente droppes.
  function planRefResolution(availableRefs, placeholderRefs) {
    var avail = {};
    (availableRefs || []).forEach(function (r) { avail[r] = true; });
    var used = {};
    return (placeholderRefs || []).map(function (ref) {
      if (!avail[ref]) return { ref: ref, action: 'drop-unknown' };
      if (used[ref]) return { ref: ref, action: 'drop-dup' };
      used[ref] = true;
      return { ref: ref, action: 'resolve' };
    });
  }
```

Og i module.exports-blokken nederst, legg til:

```js
      assignRefs: assignRefs,
      formatOutputsManifest: formatOutputsManifest,
      stripRefs: stripRefs,
      planRefResolution: planRefResolution,
```

- [ ] **Step 4: Kjør — verifiser at de passerer**

Run: `node --test tests/js/ask-view.test.js`
Expected: PASS (alle, inkl. de eksisterende parseAskRoute/buildAskProvenance-testene)

- [ ] **Step 5: Commit**

```bash
git add js/ask-view.js tests/js/ask-view.test.js
git commit -m "feat(ask): ren referansekjerne — assignRefs/manifest/stripRefs/plan"
```

---

### Task 2: DOM-klassifisering + OUTPUTS-manifest i run_code-resultatet

**Files:**
- Modify: `js/ask-view.js` (DOM-halvdel, etter den rene kjernen fra Task 1)
- Modify: `js/ai-chat.js:1478-1489` (`mdAskExecuteScript`)

**Interfaces:**
- Consumes: `assignRefs`, `formatOutputsManifest` (Task 1).
- Produces: `window.mdClassifyAskOutput(container)` → `[{ref, kind, el}]` i dokumentrekkefølge (ankre opptar numre, nøstede treff hoppes over).
- Produces: `window.mdAskManifest(refs)` (= `formatOutputsManifest`, eksponert for ai-chat.js).

- [ ] **Step 1: Klassifisereren i ask-view.js** — rett under den rene kjernen:

```js
  // DOM-klassifisereren: wrapper-selektorene fra buildOutputNodes/mdRender*
  // (index.html). Rekkefølgen er også kind-prioritet ved treff.
  var ASK_OUT_SELECTORS = [
    ['.plotly-container', 'plotly'],
    ['img.output-matplotlib-img', 'png'],
    ['.vegalite-container', 'vegalite'],
    ['.tabulator-embed', 'tabulator'],
    ['.output-table-wrap', 'table'],
    ['.leafletmap-container', 'map'],
    ['.ipw-view', 'widget'],
    ['.output-html-embed', 'html'],
    ['.param-form', 'controls'],
    ['.ui-controls', 'controls'],
  ];
  var ASK_OUT_SELECTOR_ALL = ASK_OUT_SELECTORS.map(function (s) { return s[0]; }).join(', ');
  var ASK_SCAN_SELECTOR = ASK_OUT_SELECTOR_ALL + ', .ask-out-anchor';

  // mdClassifyAskOutput(container) → [{ref, kind, el}] i dokumentrekkefølge.
  // Nøstede treff (element inni et annet treff) hoppes over — wrapperen er
  // referansen. Ankre telles med i nummereringen (se assignRefs) men
  // returneres ikke.
  function classifyAskOutput(container) {
    if (!container || !container.querySelectorAll) return [];
    var els = Array.prototype.slice.call(container.querySelectorAll(ASK_SCAN_SELECTOR));
    els = els.filter(function (el) {
      return !(el.parentElement && el.parentElement.closest &&
               el.parentElement.closest(ASK_OUT_SELECTOR_ALL));
    });
    var items = els.map(function (el) {
      if (el.classList && el.classList.contains('ask-out-anchor')) {
        return { anchor: (el.dataset && el.dataset.ref) || '' };
      }
      for (var i = 0; i < ASK_OUT_SELECTORS.length; i++) {
        if (el.matches && el.matches(ASK_OUT_SELECTORS[i][0])) {
          return { kind: ASK_OUT_SELECTORS[i][1] };
        }
      }
      return {};
    });
    return assignRefs(items).map(function (r) {
      return { ref: r.ref, kind: r.kind, el: els[r.idx] };
    });
  }
  if (typeof window !== 'undefined') {
    window.mdClassifyAskOutput = classifyAskOutput;
    window.mdAskManifest = formatOutputsManifest;
  }
```

MERK: ask-view.js kjører også i node-teststubben der `window = global` og
`document` er en stubb — `typeof window !== 'undefined'`-guarden er nok
(stubben HAR window; tilordningen er harmløs der).

- [ ] **Step 2: Manifest-linjen i mdAskExecuteScript** — `js/ai-chat.js:1478`, erstatt funksjonen:

```js
        window.mdAskExecuteScript = async function (script, signal) {
          insertScriptIntoEditor(script);
          var err = await runScriptAndCaptureError(signal);
          var out = document.getElementById('outputArea');
          var outText = ((out && out.innerText) || '').trim();
          // OUTPUTS-manifest (spec 2026-07-31-ask-svar-referanser §2):
          // forteller modellen HVA den kan referere med {{fig:1}} osv. —
          // samme klassifiseringsfunksjon som resolveren bruker, så
          // nummereringen kan aldri sprike.
          var manifest = '';
          if (!err && out && window.mdClassifyAskOutput && window.mdAskManifest) {
            try { manifest = window.mdAskManifest(window.mdClassifyAskOutput(out)); }
            catch (e) { manifest = ''; }
          }
          return {
            ok: !err,
            result: err
              ? 'FEIL:\n' + String(err).slice(0, 20000)
              : 'OK. OUTPUT (truncated):\n' + outText.slice(0, 20000) +
                (manifest ? '\n' + manifest : ''),
          };
        };
```

- [ ] **Step 3: Kjør hele js-suiten (regresjon)**

Run: `node --test tests/js/`
Expected: PASS — ingen eksisterende tester berøres (klassifisereren er
DOM-lim over den testede kjernen; manuell smoke i Task 7)

- [ ] **Step 4: Commit**

```bash
git add js/ask-view.js js/ai-chat.js
git commit -m "feat(ask): DOM-klassifisering + OUTPUTS-manifest i run_code-resultatet"
```

---

### Task 3: Resolver, slots/ankre, «Full output»-fold og livssyklus

**Files:**
- Modify: `index.html` (markup ved `#askLiveOutput` (~linje 154) + CSS i ask-seksjonen)
- Modify: `js/ask-view.js` (mount-generalisering, resolver, hjemreise, kopier/feil-stripping)

**Interfaces:**
- Consumes: `classifyAskOutput`, `planRefResolution`, `stripRefs`, `ASK_REF_LINE_RE` (Task 1-2).
- Produces: `resolveAnswerRefs()` → antall resolvede slots; `returnSlotNodesHome()`; `mountFullOutput()`; `moveIntoSlot(slot, el)` og `resizePlotlyIn(root)` (gjenbrukes av Task 4).
- Produces (DOM): `.ask-out-slot[data-ref]` i `#askAnswer`; `.ask-out-anchor[data-ref]` i `#outputArea`; `#askFullOutput`/`#askFullOutputHost`.

- [ ] **Step 1: Markup** — i `index.html`, rett etter `<div id="askLiveOutput" …>` (linje ~154):

```html
        <details id="askFullOutput" class="ask-details ask-full-output" hidden>
          <summary>Full output</summary>
          <div id="askFullOutputHost"></div>
        </details>
```

- [ ] **Step 2: CSS** — i ask-visningens CSS-blokk (søk `.ask-live-output` i index.html, legg inntil):

```css
.ask-out-slot { margin: 0.75rem 0; max-width: 100%; overflow-x: auto; }
.ask-out-anchor { display: none; }
.ask-full-output { margin-top: 0.75rem; }
```

- [ ] **Step 3: Mount-generalisering + resolver + hjemreise i ask-view.js** — erstatt hele `mountLiveOutput`/`unmountLiveOutput`-seksjonen (linje ~51-80):

```js
  /* Levende output i svarkortet (spec §Output + 2026-07-31-referanser):
     #outputArea-noden FLYTTES (ikke klones) etter vellykket kjøring —
     til #askLiveOutput (synlig, fallback uten plassholdere) eller inn i
     «Full output»-folden (#askFullOutputHost) når svaret refererer
     enkeltnoder. Flyttes tilbake ved nytt spørsmål/kodevisning. */
  var outputHome = null;
  function resizePlotlyIn(root) {
    if (!window.Plotly || !window.Plotly.Plots || !root.querySelectorAll) return;
    root.querySelectorAll('.js-plotly-plot').forEach(function (p) {
      try { window.Plotly.Plots.resize(p); } catch (_) { /* plotly borte */ }
    });
  }
  function mountOutputInto(hostId) {
    var out = document.getElementById('outputArea');
    var host = document.getElementById(hostId);
    if (!out || !host || out.dataset.askMounted === '1') return;
    outputHome = { parent: out.parentNode, next: out.nextSibling };
    out.dataset.askMounted = '1';
    var details = host.closest && host.closest('details');
    if (details) details.hidden = false; else host.hidden = false;
    host.appendChild(out);
    window.dispatchEvent(new Event('resize'));
    resizePlotlyIn(out);
  }
  function mountLiveOutput() { mountOutputInto('askLiveOutput'); }
  function mountFullOutput() { mountOutputInto('askFullOutputHost'); }
  function unmountLiveOutput() {
    stopReResolveObserver();
    returnSlotNodesHome();
    var out = document.getElementById('outputArea');
    var live = document.getElementById('askLiveOutput');
    var details = document.getElementById('askFullOutput');
    if (live) live.hidden = true;
    if (details) { details.hidden = true; details.open = false; }
    if (!out || out.dataset.askMounted !== '1' || !outputHome) return;
    delete out.dataset.askMounted;
    outputHome.parent.insertBefore(out, outputHome.next);
    outputHome = null;
    window.dispatchEvent(new Event('resize'));
  }
```

(`stopReResolveObserver` kommer i Task 4 — legg inn en tom
`function stopReResolveObserver() {}` nå, Task 4 erstatter den.)

Deretter, under klassifisereren fra Task 2:

```js
  // Flytt en levende output-node inn i en slot; etterlat et anker
  // (hjemreisebillett + nummer-plassholder for classifyAskOutput).
  function moveIntoSlot(slot, el) {
    var anchor = document.createElement('span');
    anchor.className = 'ask-out-anchor';
    anchor.dataset.ref = slot.dataset.ref;
    el.parentNode.insertBefore(anchor, el);
    slot.appendChild(el);
    resizePlotlyIn(slot);
  }

  function askAnswerSlots() {
    var box = document.getElementById('askAnswer');
    return box ? Array.prototype.slice.call(box.querySelectorAll('.ask-out-slot')) : [];
  }

  // resolveAnswerRefs: bytt {{fig:1}}-avsnitt i #askAnswer mot slots med
  // levende noder fra #outputArea. Returnerer antall resolvede slots —
  // 0 → kalleren faller tilbake til dagens mountLiveOutput-oppførsel.
  function resolveAnswerRefs() {
    var box = document.getElementById('askAnswer');
    var out = document.getElementById('outputArea');
    if (!box || !out) return 0;
    var byRef = {};
    classifyAskOutput(out).forEach(function (r) { byRef[r.ref] = r.el; });
    var candidates = Array.prototype.slice.call(box.querySelectorAll('p'))
      .map(function (p) {
        var m = ASK_REF_LINE_RE.exec((p.textContent || '').trim());
        return m ? { p: p, ref: m[1] + ':' + m[2] } : null;
      }).filter(Boolean);
    var plan = planRefResolution(Object.keys(byRef),
      candidates.map(function (c) { return c.ref; }));
    var resolved = 0;
    plan.forEach(function (step, i) {
      var p = candidates[i].p;
      if (step.action !== 'resolve') { p.remove(); return; }
      var slot = document.createElement('div');
      slot.className = 'ask-out-slot';
      slot.dataset.ref = step.ref;
      p.replaceWith(slot);
      moveIntoSlot(slot, byRef[step.ref]);
      resolved++;
    });
    return resolved;
  }

  // Hjemreise (spec §4): slot-noder tilbake til ankrene sine FØR svaret
  // tømmes eller #outputArea flyttes hjem — slik forblir purgePlots +
  // renderOutput sin innerHTML='' den ENESTE oppryddingsveien, ingen
  // plotly-lekkasje fra noder som bor utenfor #outputArea.
  function returnSlotNodesHome() {
    var out = document.getElementById('outputArea');
    askAnswerSlots().forEach(function (slot) {
      var node = slot.firstElementChild;
      if (node && out) {
        var anchor = out.querySelector('.ask-out-anchor[data-ref="' + slot.dataset.ref + '"]');
        if (anchor) anchor.replaceWith(node);
        else out.appendChild(node);   // anker re-rendret bort → bakerst
      }
      slot.remove();
    });
    if (out) {
      Array.prototype.slice.call(out.querySelectorAll('.ask-out-anchor'))
        .forEach(function (a) { a.remove(); });
    }
  }
```

- [ ] **Step 4: Suksess-/feilgrenene i runAskFlow + kopier-knappen** — i `initAskView`:

Suksessgrenen (linje ~419-440) erstattes med:

```js
        if (lastRunOk) {
          showAnswer(res.markdown, null, false);
          renderSources(res.sources);
          // Kuratert svar (spec 2026-07-31): plassholdere → levende noder.
          // ≥1 resolvet → resten bak «Full output»-folden; 0 → dagens
          // synlige mount (trygg degradering når modellen ignorerer
          // kontrakten).
          if (resolveAnswerRefs() > 0) {
            mountFullOutput();
            startReResolveObserver();
          } else {
            mountLiveOutput();
          }
        } else if (ranAny) {
          // Kjøring forsøkt og feilet — plassholdere har ingen pålitelig
          // output å peke på: strip til klammetekst.
          showAnswer(stripRefs(res.markdown),
            '⚠ The code did not run successfully — treat numbers with caution', true);
          renderSources(res.sources);
        } else {
          showAnswer(stripRefs(res.markdown),
            res.sources && res.sources.length
              ? '⚠ Source-based answer — the code did not run successfully'
              : null,
            true);
          renderSources(res.sources);
        }
```

(`startReResolveObserver` kommer i Task 4 — legg inn tom
`function startReResolveObserver() {}` nå.)

Kopier-knappen (linje ~224-228): erstatt tekstuttrykket:

```js
      var text = lastAnswerMd ? stripRefs(lastAnswerMd) : (answerBox ? answerBox.innerText : '');
```

- [ ] **Step 5: Kjør suiten (regresjon)**

Run: `node --test tests/js/`
Expected: PASS (node-stubben når aldri DOM-delen; eksisterende
ask-view-tester upåvirket)

- [ ] **Step 6: Commit**

```bash
git add index.html js/ask-view.js
git commit -m "feat(ask): resolver med slots/ankre + Full output-fold + hjemreise"
```

---

### Task 4: Re-resolve ved `#@param`-/celle-re-kjøringer

**Files:**
- Modify: `js/ask-view.js` (erstatt de tomme `start/stopReResolveObserver`-stubbene fra Task 3)

**Interfaces:**
- Consumes: `classifyAskOutput`, `askAnswerSlots`, `moveIntoSlot`, `window.purgePlots` (global fra index.html:6740).
- Produces: `startReResolveObserver()` / `stopReResolveObserver()` (kalles fra runAskFlow-suksessgrenen og `unmountLiveOutput`, wiret i Task 3).

- [ ] **Step 1: Implementer observeren** — erstatt stubbene:

```js
  /* Re-resolve (spec §5): renderOutput/celle-re-kjøringer bygger NYE noder
     i #outputArea — slots re-fylles med ferske noder med samme referanse.
     Samme debounce-mønster som observeOutputAreaForCopyButtons
     (index.html): {childList, subtree}, 150 ms. disconnect/observe-paret
     rundt egne mutasjoner hindrer selv-trigging (observer-løkke). */
  var _reResolveObserver = null;
  var _reResolveTimer = null;
  function startReResolveObserver() {
    var out = document.getElementById('outputArea');
    if (!out || typeof MutationObserver === 'undefined' || _reResolveObserver) return;
    _reResolveObserver = new MutationObserver(function () {
      if (_reResolveTimer) clearTimeout(_reResolveTimer);
      _reResolveTimer = setTimeout(reResolveSlots, 150);
    });
    _reResolveObserver.observe(out, { childList: true, subtree: true });
  }
  function stopReResolveObserver() {
    if (_reResolveTimer) { clearTimeout(_reResolveTimer); _reResolveTimer = null; }
    if (_reResolveObserver) { _reResolveObserver.disconnect(); _reResolveObserver = null; }
  }
  function reResolveSlots() {
    var out = document.getElementById('outputArea');
    var slots = askAnswerSlots();
    var obs = _reResolveObserver;
    if (!out || !slots.length) return;
    if (obs) obs.disconnect();
    try {
      var byRef = {};
      classifyAskOutput(out).forEach(function (r) { byRef[r.ref] = r.el; });
      slots.forEach(function (slot) {
        var ref = slot.dataset.ref;
        var fresh = byRef[ref];
        if (fresh) {
          // Ny node med denne referansen finnes i outputen → bytt.
          // purgePlots her: slotten er UTENFOR #outputArea, så
          // renderOutput sin egen purge nådde aldri den gamle noden.
          if (window.purgePlots) window.purgePlots(slot);
          slot.innerHTML = '';
          moveIntoSlot(slot, fresh);
          return;
        }
        // Ingen fersk node: lever ankeret? → noden i slotten lever videre
        // (re-rendringen traff en annen celle). Anker borte → referansen
        // finnes ikke lenger (f.eks. færre figurer med ny param-verdi) →
        // slotten står tom (spec §5 pkt 4).
        var anchor = out.querySelector('.ask-out-anchor[data-ref="' + ref + '"]');
        if (!anchor) {
          if (window.purgePlots) window.purgePlots(slot);
          slot.innerHTML = '';
        }
      });
    } finally {
      if (obs && _reResolveObserver === obs) {
        obs.observe(out, { childList: true, subtree: true });
      }
    }
  }
```

- [ ] **Step 2: Kjør suiten (regresjon)**

Run: `node --test tests/js/`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add js/ask-view.js
git commit -m "feat(ask): re-resolve av slots ved #@param-/celle-re-kjøringer"
```

---

### Task 5: KaTeX — lazy matte-rendring

**Files:**
- Modify: `js/ask-view.js` (lazy-loader + `maybeRenderMath`; kall fra alle tre svar-grenene i Task 3)

**Interfaces:**
- Consumes: jsdelivr (allerede i sw.js sin CDN_HOSTS-allowlist → cache-first).
- Produces: `maybeRenderMath(markdown)` — no-op uten matte-hint; ellers KaTeX-autorender over `#askAnswer` + best-effort `.output-markdown`.

- [ ] **Step 1: Implementer** — under resolveren:

```js
  /* KaTeX (spec §6): lazy — lastes KUN når svaret ser ut til å inneholde
     matte. Idempotent per fane (promise-cache, samme mønster som
     _loadImportScript i index.html). CDN-feil → rå LaTeX blir stående,
     aldri kast. */
  var KATEX_BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/';
  var _katexP = null;
  function _addTag(make) {
    return new Promise(function (resolve, reject) {
      var el = make();
      el.onload = resolve;
      el.onerror = function () { reject(new Error('KaTeX-lasting feilet')); };
      document.head.appendChild(el);
    });
  }
  function ensureKatex() {
    if (_katexP) return _katexP;
    _katexP = _addTag(function () {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = KATEX_BASE + 'katex.min.css'; return l;
    }).then(function () {
      return _addTag(function () {
        var s = document.createElement('script');
        s.src = KATEX_BASE + 'katex.min.js'; return s;
      });
    }).then(function () {
      return _addTag(function () {
        var s = document.createElement('script');
        s.src = KATEX_BASE + 'contrib/auto-render.min.js'; return s;
      });
    }).catch(function (e) { _katexP = null; throw e; });
    return _katexP;
  }
  var MATH_HINT_RE = /\$|\\\(|\\\[/;
  function maybeRenderMath(markdown) {
    if (!MATH_HINT_RE.test(String(markdown || ''))) return;
    ensureKatex().then(function () {
      if (typeof renderMathInElement !== 'function') return;
      var opts = {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      };
      var box = document.getElementById('askAnswer');
      if (box) { try { renderMathInElement(box, opts); } catch (_) {} }
      // Best effort (spec §6): matte i kjøringens egne markdown-embeds.
      Array.prototype.slice.call(
        document.querySelectorAll('#outputArea .output-markdown, .ask-out-slot .output-markdown')
      ).forEach(function (el) {
        try { renderMathInElement(el, opts); } catch (_) {}
      });
    }).catch(function () { /* CDN nede → rå LaTeX står igjen */ });
  }
```

- [ ] **Step 2: Kall fra svar-grenene** — i runAskFlow (Task 3-koden): legg
`maybeRenderMath(res.markdown);` som SISTE linje i hver av de tre grenene
(etter mount/renderSources) — resolveren har da alt byttet plassholder-`<p>`-ene,
så KaTeX aldri ser dem.

- [ ] **Step 3: Kjør suiten (regresjon)**

Run: `node --test tests/js/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add js/ask-view.js
git commit -m "feat(ask): lazy KaTeX-rendring av matte i svaret"
```

---

### Task 6: Svarkontrakten — RUN-blokken + MODE_PY (svar-prompt.ts + svar.md-speilet)

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (RUN-konstanten linje ~321-342 + MODE_PY-konstanten linje ~386-423)
- Modify: `netlify/edge-functions/prompts/svar.md` (speil samme to blokker, unescapet)

**Interfaces:**
- Consumes: OUTPUTS-linjeformatet fra Task 2 (`OUTPUTS: fig:1 (plotly), table:1`).
- Produces: prompt-tekst modellene styres av — plassholdergrammatikken MÅ matche `ASK_REF_LINE_RE` (klassene fig/table/map/widget/html/controls, 1-basert).

- [ ] **Step 1: Erstatt RUN-konstanten** i svar-prompt.ts med:

```ts
const RUN = `\
## Kjøring og sluttsvar (run_code)

Du har verktøyet run_code: det kjører ETT komplett script i brukerens miljø
og returnerer kjøringens tekst-output og eventuell feilmelding. Arbeidsmåte:

1. Skriv HELE scriptet og kall run_code med det. ALDRI legg scriptet som
   kodeblokk i svarteksten i stedet for å kalle run_code.
2. Les outputen. Feil, eller output som ikke besvarer spørsmålet → rett
   scriptet og kall run_code igjen (innenfor kjørebudsjettet).
3. Når outputen faktisk besvarer spørsmålet: skriv SLUTTSVARET som ren
   markdown — ingen kodeblokk (koden ligger allerede i kodevisningen).

Sluttsvarets form:
- REFERER kjøringens figurer/tabeller i stedet for å gjenta dem:
  run_code-resultatet slutter med en OUTPUTS-linje (f.eks. «OUTPUTS: fig:1
  (plotly), table:1»). Sett plassholderen på EGEN linje der elementet skal
  stå i svaret: {{fig:1}}, {{table:1}}, {{controls:1}} … Bruk KUN
  referanser som står i OUTPUTS-linjen. Ureferert output vises bak en
  «Full output»-fold under svaret — referer det som bærer svaret, la
  resten ligge der.
- ALDRI gjengi tall/rader et referert element allerede viser — pek på
  elementet og TOLK det i stedet.
- Typisk form: funn (1–3 setninger) → {{fig:1}} → tolkning → ev.
  {{table:1}} → forbehold + kilder.
- Matte rendres: skriv formler som $…$ (inline) / $$…$$ (blokk).
- Har du omformet spørsmålet: åpne med «Slik tolker jeg spørsmålet: …» og
  oppgi antakelsene eksplisitt.
- Alle tall skal komme fra run_code-OUTPUT eller verifiserte kilder — aldri
  fra hukommelsen. Tomt for kjørebudsjett? Si ærlig hva som ikke ble
  verifisert.
- Oppgi kilder med URL der data er brukt, og nevn viktige forbehold kort.
- Svar på brukerens språk (norsk/engelsk følger spørsmålet).`;
```

- [ ] **Step 2: MODE_PY-tillegget** — legg til som nytt siste avsnitt i MODE_PY-konstanten (etter INTERAKTIVITET-avsnittet, før avsluttende backtick):

```ts

DESIGN OUTPUT FOR SVARET: en liten oppsummeringstabell (≤ ~10 rader) laget
for svaret slår en rå ramme-dump; velg plotly fremfor statisk matplotlib
når zoom/hover gir verdi (begge refereres som {{fig:n}}); i simuleringer:
referer #@param-stripen som {{controls:n}} rett ved figuren den driver;
ipywidgets ({{widget:n}}) for finkornet interaktivitet uten re-kjøring.`;
```

(Escaping-sjekk: blokkene inneholder ingen backticks eller `${` — trygt i
TS-template-literal uendret.)

- [ ] **Step 3: Speil i prompts/svar.md** — finn `<!-- RUN -->`- og
`<!-- MODE_PY -->`-blokkene og oppdater dem byte-nært (samme tekst,
unescapet — disse blokkene har ingen escapes).

- [ ] **Step 4: Deno-typecheck (om deno finnes lokalt; ellers hopp over — Netlify bygger)**

Run: `deno check netlify/edge-functions/svar.ts 2>/dev/null || echo "deno ikke tilgjengelig — Netlify-bygget verifiserer"`
Expected: OK eller skip-melding

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/prompts/svar.md
git commit -m "feat(svar): svarkontrakt med output-referanser i RUN + design-for-svaret i MODE_PY"
```

---

### Task 7: Full regresjon + manuell smoke-sjekkliste

**Files:**
- Ingen nye endringer (rettelser ved funn committes her)

- [ ] **Step 1: Full js-suite**

Run: `node --test tests/js/`
Expected: PASS — alle

- [ ] **Step 2: Python-suiten (uendret av dette arbeidet, men billig vern)**

Run: `python3 -m pytest tests/ -x -q --ignore=tests/manual 2>/dev/null | tail -3`
Expected: PASS (eller uendret kjent status)

- [ ] **Step 3: Legg smoke-sjekklisten fram for Hans** (manuell — token-økonomi; IKKE automatiser nettleseren):

```
Smoke (localhost via netlify dev — RESTART netlify dev først: edge-TS
caches; hard-reload m/ «ignore cache» i Chrome for js/):
1. Mattespørsmål (f.eks. «vis formelen for renters rente og beregn …»)
   → formler rendres, ikke rå $-tekst.
2. Standard dataspørsmål → svartekst med figur/tabell INNE i svaret,
   «Full output»-fold under, ingen duplisert visning; plotly-zoom virker
   i svaret.
3. Simuleringsspørsmål («belyse … dra i antakelsene») → {{controls}}-
   stripe + figur i svaret; dra i slider → figuren i svaret oppdateres
   (re-resolve), ikke bare i Full output.
4. «View code» og tilbake → output står i editor-visningen som før
   (hjemreise), ingen tomme hull; nytt spørsmål → rent kort.
5. Copy answer → plassholdere er [fig 1]-tekst, ikke {{fig:1}}.
```

- [ ] **Step 4: Sluttcommit ved ev. rettelser**

```bash
git add -A && git commit -m "fix(ask): rettelser fra regresjon/smoke"
```

IKKE push — Hans beslutter push i askstat.
