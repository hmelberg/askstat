# AskStat architecture

A short map of how a question becomes an answer, and where the main debt
sits. For the layout and commands, see the root `README.md`. For the request
bodies and the SSE protocol, see `netlify/edge-functions/README.md`.

## The Ask flow, end to end

```
ask-view.js ──POST──> /api/ask-ruter            (route + interpretation)
     │
     └─ mdSvarRun (ai-chat.js runSvarLoop) ──POST/SSE──> /api/svar  (agentic loop)
             ▲                                   │ server tools: search_catalog, table_metadata,
             │                                   │   probe, search_datasets, search_literature,
             │                                   │   hosted web_search / web_fetch
             │  run_result + resume state        │ client tools: run_code, get_pack
             └──────── mdAskExecuteScript <──────┘ event {type:"run_code", script}
                         │ inserts script in editor, clicks Run
                         ▼
                 index.html run pipeline ─ data-directives.js / data-loader.js / read-bridge.js
                         │                         └─ direct fetch, or fallback to /api/hent (proxy)
                         ▼
                 Pyodide / WebR / DuckDB-WASM ─> output + OUTPUTS manifest ─> back to /api/svar
```

1. **Router.** `js/ask-view.js` POSTs the question to `/api/ask-ruter`.
   The router returns JSON with `rute` (`beregning` = pure computation,
   `data`, `oppslag` = lookup, `utforsk` = explore, `språk` = cannot be
   formalised) and an operational interpretation `tolkning`. Any failure
   falls back to `data`. For `språk`, the view shows the router's direct
   answer, labelled as unverified, and stops there.
2. **Agentic loop.** `window.mdSvarRun` (`runSvarLoop` in `js/ai-chat.js`)
   POSTs `{question, route, mode, depth, packs, user_keys, provider…}` to
   `/api/svar`. `svar.ts` builds the system prompt (`_lib/svar-prompt.ts`,
   source text in `prompts/svar.md`). For the `data` route, the prompt
   includes the registry block from `data/data-sources.json`. Sources whose
   server key is missing are filtered out, and so are sources the user
   turned off. The prompt also includes the selected packs, profile text and
   the names of the user's own keys (never their values). The route decides
   which tools the model gets (`buildRouteToolDefs`). Only the `data` route
   gets the catalog tools. Server tools run inside the edge function:
   - `search_catalog` / `table_metadata` call live adapters (PxWeb/SSB,
     Eurostat, SDMX, …) or static catalogs (`_lib/tools/catalogs/`).
   - `search_datasets` searches dataset portals (Data Commons, data.europa,
     Zenodo, CESSDA, DataCite, …).
   - `probe` checks that a URL exists, reports its observed schema and
     whether CORS allows a direct fetch.
   - `search_literature` searches OpenAlex.
   - `web_search` / `web_fetch` are Anthropic-hosted tools. They are absent
     for `openai-compat` providers.

   The first `search_catalog` or `table_metadata` result for a source also
   carries that source's guide, `data/source-guides/<id>.md`
   (`_lib/source-guides.ts`). The guide is attached on errors too.
3. **Client execution.** When the model calls `run_code`, the server ends the
   SSE stream with `{type:"run_code", script}`. The client then runs the
   script in the user's browser through `window.mdAskExecuteScript`
   (`ai-chat.js`). This function:
   - prepends `KEYS = {...}` for the user's own keys (Python only);
   - rejects hand-written HTTP calls to "steered" hosts
     (`DataLoader.styrtKildeIScript`);
   - puts the script in the editor and drives the normal Run button
     (`runScriptAndCaptureError`);
   - returns `OK. OUTPUT:` + stdout (masked for key values) + an OUTPUTS
     manifest, or `FEIL:` + the error.

   The client re-POSTs this as `run_result` together with the `resume` state,
   sending the `X-Svar-Resume: 1` header so the hop is exempt from the rate
   limit. A `{type:"continue"}` event (the edge CPU budget ran out) is
   re-POSTed the same way. The limits are 4 `run_code` calls per question
   and 8 or 12 client tool calls (standard or deep depth). `_lib/run-disiplin.ts`
   closes `run_code` after two successful runs and appends a "write the
   answer now" reminder.
4. **Data inside the run.** Directive lines such as
   `# df = ost.read("https://…")`, `ost.connect(…, kind="pxweb")` and
   `ost.use("df", source="r")` are parsed by `js/directive-parser.js` and
   `js/data-directives.js`, then resolved and fetched by `js/data-loader.js`.
   The loader fetches directly when CORS allows and otherwise falls back to
   `/api/hent?url=…`. Fetched bytes are cached for the session, and
   encrypted sources are decrypted by `enc-crypto.js`. Bare
   `pd.read_csv("https://…")` calls in the engines go through
   `js/read-bridge.js`. It scans and prefetches URLs while the engine boots
   and exposes synchronous facades, because Pyodide runs on the main thread.
   `/api/hent` (`_lib/hent-core.ts`) is SSRF-hardened (`_lib/ssrf.ts`), GET
   only, and wraps POST bodies for PxWeb v1. For registry sources it injects
   server-side keys by host match. In Python, `openstat.py` (`ost`) offers
   the same verbs and runs unchanged outside the app.
5. **Answer.** The final assistant turn streams in as markdown. The answer
   can contain placeholders such as `{{fig:1}}`, which `ask-view.js`
   resolves to live output nodes from the run. A three-level badge
   (`badgeFor` over the whole run history) marks answers whose code failed.
   The answer, script and sources are saved to `ask-history.js`.
   `/api/tolk-resultat` is not part of this loop. It backs the AI panel's
   "interpret this output" action.

### Source registry and guides

`data/sources/<id>.md` is the canonical source document, with front matter
plus `## Kort`, `## Guide` and `## Om kilden` sections.
`node tools/source_docs.mjs generate` produces `data/data-sources.json` (read
by `svar`, `hent`, `metadata` and `data-loader.js`) and
`data/source-guides/<id>.md` (attached by `svar`). Drift tests guard the
generated files: node `tests/js/source-docs-drift.test.js` and deno
`_lib/source-guides-drift.test.ts`. CI also regenerates them and fails on
any diff. Packs (`data/packs/`) are user-selectable prompt context, and the
model can fetch one with `get_pack`.

### Improving sources: kilde-forslag / kilde-pr

When a run needed detours (failed scripts, discarded turns),
`js/kilde-forslag.js` offers to improve the user's own source document. It
sends the docs, the question, the failed runs, the working script and the
trace to `/api/kilde-forslag`, which makes a single-shot suggestion; the
client keeps the multi-round history. The user accepts the result locally.
For admins, "send as PR" calls `/api/kilde-pr`, which creates a branch,
commit and PR (or an issue) with `GITHUB_PR_TOKEN`.

### Telemetry

`js/feil-telemetri.js` reports failures only, fire-and-forget, to the Anvil
endpoint `/_/api/feil`. A report holds the question, interpretation, failed
scripts and errors, route/mode/depth, the probed sources and the provider
type, all size-capped. Successful runs are not reported, and the module
swallows its own errors.

### Eval harness (`tools/harness/`)

- `utforsk.py` is the free half. It queries a source's API directly (CPython
  + `openstat.py`, at most 15 polite calls) and writes measured raw drafts
  to `tools/harness/utkast/<source>.md`. These drafts are later merged into
  `data/sources/`.
- `evalrun.md` is the paid half. It is a cold-runnable procedure that drives
  the real Ask loop in a browser (BYOK) over `sporsmal.json` and writes one
  JSON file per question to `tools/harness/kjoringer/<date>-r<round>/`.
  Reports go to `docs/eval/`. No script reads `kjoringer/`; it is history.

## Known performance/structure debt

**Render-blocking scripts.** `pyodide.js`, `plotly-2.32.0.min.js` (~3.5 MB)
and `markdown-it` are plain synchronous `<script>` tags at
`index.html:~874-889`. They sit at the end of `<body>`, right before the
main inline script, so the HTML paints first, but no app code runs until all
three have downloaded and executed. Here is what actually depends on them
being synchronous:

- **markdown-it: yes, at evaluation time.** `const md = window.markdownit ? … : null`
  is evaluated once when the inline script runs (`index.html:~6438`), and
  the same pattern appears in `js/ai-chat.js:32`, `js/ask-view.js:611`,
  `js/cells.js` and `js/ui.js`. With `defer` or `async`, `md` would stay
  `null` and markdown would fall back to plain text. To fix this, make those
  sites lazy (`getMd()`) before changing the tag. markdown-it is small, so
  this matters least.
- **Plotly: no.** Every use is guarded at call time
  (`typeof Plotly === 'undefined'` → return), and it is only needed when
  output is rendered. It can be loaded on demand through an
  `ensurePlotly()` promise awaited in the figure renderers (`index.html`
  ~6477/6569, `js/ui.js` ~1933). Without that await, an early figure would
  silently not render. This is the biggest win, since Plotly blocks every
  first load, including Ask-only visits.
- **pyodide.js: no.** `loadPyodide()` is only called inside
  `_loadPyodideAndM2pyImpl` (`index.html:~10849`), which is memoised and
  async. It runs when a Pyodide mode activates (`switchEditorMode`'s warm
  load, ~3290) or on the first run. The script can be injected on demand
  inside that function. The `<link rel=preload>` in `<head>` and the
  service-worker precache already keep it warm.

**The ~640 KB inline script.** `index.html:915-13113` (~12,200 lines) holds
the mode registry, the run orchestration, the output renderers, settings,
autosave and more. It has no tests and is hard to review, and it is why
`js/*` modules reach back into globals (`activeEditorMode`,
`scriptRunInProgress`). `mdAskExecuteScript` even drives the Run button by
DOM. The suggested plan is incremental, with no bundler, keeping classic
`<script src>` files:

1. Move pure helpers out first, with node tests, following the existing
   `js/*.js` pattern (pure top half + `module.exports`): output
   classification, draft autosave, hash/share parsing.
2. Then move the self-contained subsystems: `js/app-output.js` (renderers,
   Plotly/markdown embedding), `js/app-settings.js`, `js/app-modes.js`
   (mode registry + `switchEditorMode`).
3. Last, `js/app-run.js`: the run pipeline behind an explicit
   `window.AppRun.run(script, {signal})`. `mdAskExecuteScript` would call
   this instead of clicking `#btnRun`.

   Each step is a pure move, with `window.*` names kept as shims, so that
   `tests/js/run-kontrakt.test.js` and other index.html-scraping tests keep
   working.

**Pyodide on the main thread.** Python runs on the UI thread. Package
installs, wasm initialisation and long computations freeze the page,
including the Ask view's progress lines. Interrupting a run needs
`SharedArrayBuffer`, which needs cross-origin isolation (COOP/COEP), and
the site does not send those headers today, so Stop does not interrupt
CPU-bound Python. `js/read-bridge.js`'s synchronous facades are built on
this model. The decision is to keep Pyodide on the main thread. Mitigations
within that model:

- defer the warm load and `schedulePrefetchLazyPackages` until idle or the
  first Ask;
- yield to the event loop between hybrid segments and between the cells of
  a run;
- evaluate COOP/COEP headers (they affect cross-origin CDN and iframe
  loads) so that `setInterruptBuffer` works.
