# Edge Functions — lokal testing

AI-endepunkter (se `netlify.toml` for path-mapping):

- `ask-ruter` → `/api/ask-ruter` — ruter et spørsmål (beregning/data/oppslag)
  før `svar` (single-shot).
- `tolk-resultat` → `/api/tolk-resultat` — tolker output fra en kjøring
- `svar` → `/api/svar` — samlet ask-pipeline (kun admin/BYOK): ETT agentisk
  løp for rutene fra `/api/ask-ruter` (beregning/data/oppslag), med
  `run_code` som klientutført verktøy (Pyodide/WebR/duckdb-wasm) i tillegg
  til search_catalog/table_metadata/probe/search_literature + web_search/
  web_fetch (kun data-ruten bruker katalogverktøyene/registeret). Body:
  `{question, route, mode, depth, script?, resume?, run_result?, provider?}`
  — `route` ∈ beregning/data/oppslag, `mode` ∈ python/r/duckdb, `depth` ∈
  standard/deep. SSE-events: progress/delta/turn_discard/sources/run_code/
  continue/done/error. Fortsettelsesprotokoll: serveren kjører turer til den
  enten trenger `run_code` (event `{type:"run_code", script}`; klienten
  kjører scriptet og re-POSTer med `run_result` + `resume:{state, probed}`)
  eller har et ferdig svar; ved CPU-tak avslutter den i stedet med
  `{type:"continue", state, probed}`, og klienten re-POSTer samme body.
  Alle continuation-POSTer (både run_code- og CPU-tak-hopp) SKAL sette
  headeren `X-Svar-Resume: 1` — den er unntatt rate-limiten (samme spørsmål
  telles kun én gang, ikke per hop); uten den spiser hvert hopp av samme
  per-IP-kvote som et nytt spørsmål.
  Staten i hvert `continue`-event er HMAC-signert (`state.mac`, gyldig 2 t,
  `_lib/resume-mac.ts`) og må ekkoes uendret: et hopp med forfalsket,
  usignert eller utløpt state telles i tillegg i spørsmålsbøtta (`svar`), så
  en fersk spørring ikke kan forkle seg som hopp. Nøkkel: env
  `SVAR_RESUME_SECRET`, ellers avledet fra `ANTHROPIC_API_KEY`/
  `M2PY_ACCESS_TOKEN`; uten noen av dem er signeringen av (som før).
  Erstatter de gamle `data-svar`- og `tolk-ask`-endepunktene (ett kall,
  ingen eget tolke-steg). Prompt-kilde: `_lib/svar-prompt.ts` (speilet i
  `prompts/svar.md`, låst av `svar-md-drift.test.ts`); register:
  `data/data-sources.json`; evalsett: `docs/eval/ask-evalsett.md`.
- `kilde-forslag` → `/api/kilde-forslag` — forslag til revidert egen
  kildebeskrivelse fra en kjørings feillogg (single-shot; klienten eier
  flerrunde-historikken via body.history). Body: `{docs, question, runs,
  ok_script?, trace?, sources?, history?, ui_lang?, provider?}`.
- `kilde-pr` → `/api/kilde-pr` — KUN admin (adminGate uten BYOK-forbikjøring):
  branch + commit + PR på GitHub for et akseptert forslag. Env:
  `GITHUB_PR_TOKEN` (fingranulert PAT, kun dette repoet, Contents RW +
  Pull requests RW), valgfri `GITHUB_PR_REPO` (default hmelberg/askstat).
  Body: `{id, name, of?, ny_tekst, evidens}` → `{url}`; issue-modus: body
  `{issue:{tittel,kropp}}` → GitHub-issue m/etikett kilde-kodesak (PAT trenger
  da også Issues RW).
- `hent` → `/api/hent?url=…[&body=…]` — SSRF-herdet GET-proxy (admin, eller
  BYOK/X-Llm-Key — de to siste får aldri sitens env-nøkler). Injiserer
  API-nøkler server-side for register-kilder (host-matchet, KUN over https);
  `body` GET-innpakker POST-json (PxWeb v1 o.l.) og er kun tillatt mot
  register-verter. Svar får `X-Content-Type-Options: nosniff` og
  `Content-Security-Policy: sandbox`.
- `metadata` → `/api/metadata` — offentlig MetaInfo-oppslag (kilde+tabell) for
  sidebaren, rate-limited.

## Forutsetninger

1. Installer Netlify CLI: `npm install -g netlify-cli`
2. Sett env-vars: `cp .env.example .env`, fyll inn `ANTHROPIC_API_KEY` og
   `M2PY_ACCESS_TOKEN` (delt token for lokal/admin-tilgang). Samme variabler må
   settes i Netlify-konsollen før prod-deploy.
   - `FRED_API_KEY` (valgfri) — server-side nøkkel `hent`/`svar` injiserer
     for FRED-kilder i registeret (host-matchet, aldri sendt til klienten).
   - `DATA_SVAR_MODEL` (valgfri) — override av modellen `svar` bruker
     (standard: samme som `ANTHROPIC_MODEL`/`claude-sonnet-4-6`).

## Start lokal dev-server

```
netlify dev
```

Server starter typisk på `http://localhost:8888`.

## Auth

AI-endepunktene krever `Authorization: Bearer <token>` (felles
`_lib/auth.ts`-gate: token-sjekk → metode → body-grense → rate-limit → Anvil-
validering, med konstant-tid-sammenligning og positiv-cache), eller brukerens
egen nøkkel (`X-Anthropic-Key` / `X-Llm-Key` + `provider`). Bruk det delte
`M2PY_ACCESS_TOKEN` lokalt, eller et gyldig brukertoken fra Anvil.

## Test tolk-resultat med curl

```bash
curl -N -X POST http://localhost:8888/api/tolk-resultat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $M2PY_ACCESS_TOKEN" \
  -d '{"script": "df.describe()", "output": "count 10\nmean 4.2", "språk": "python"}'
```

Forventet output: en strøm av `data: {"type":"text","text":"..."}`-linjer,
deretter ett terminal-event (se under).

## SSE-terminalkontrakt

Gjelder alle AI-strømmer (`svar`, `ask-ruter`, `tolk-resultat`,
`kilde-forslag`), alle leverandører. Kilde til sannhet: toppen av
`_lib/sse-util.ts`.

- Strømmen ender med **nøyaktig ett** terminal-event: `{"type":"done", …usage}`
  (suksess — svaret er helt) eller `{"type":"error","message":…,"code"?:…}`.
  `svar` kan i stedet ende med `{"type":"continue", state}` (et hopp).
  `done` og `error` sendes aldri i samme strøm.
- **Avkortet svar** (token-taket nådd: Anthropic `stop_reason:"max_tokens"`,
  OpenAI `finish_reason:"length"`, Responses `status:"incomplete"`,
  uparsbare verktøyargumenter) gir aldri `done`, men
  `{"type":"error","code":"AVKORTET","message":"Svaret ble avkortet …"}`.
  Tekst/delta som alt er sendt står — klienten kan vise den med et
  «avkortet»-merke.
- `code:"AVVIST"` — modellen/leverandøren nektet (`refusal`/`content_filter`).
- `code:"STROMFEIL"` — oppstrøms-strømmen feilet midt i (in-stream
  `{"type":"error"}`) eller ble brutt uten `stop_reason`.
- Uten `code` — øvrige feil (meldingen er skrubbet for nøkler).
- En strøm som slutter uten terminal-event er en brutt forbindelse → feil.

## Feil-scenarioer

- Mangler/ugyldig token → 401
- Feil metode (ikke POST) → 405
- For stor body (`content-length` over grensen) → 413
- For mange kall fra samme IP → 429 (med `Retry-After`)

## Struktur

- `svar.ts`, `ask-ruter.ts`, `tolk-resultat.ts`, `kilde-forslag.ts`,
  `kilde-pr.ts`, `hent.ts`, `metadata.ts` — endepunktene
- `_lib/auth.ts` — felles request-gate (auth + rate-limit + body-guard)
- `_lib/rate-limit.ts` — per-IP token-bucket (Netlify Blobs; failer åpent)
- `_lib/anthropic.ts` — Anthropic streaming-klient (timeout + 429/529-retry)
- `_lib/sse-util.ts` — SSE-hjelpere + terminalkontrakten (done/error-koder)
- `_lib/tolk-prompt.ts` — brukerturen + språkdeteksjon for tolk-resultat
- `prompts/` — lesbare speilinger av prompt-tekstene (TS-konstantene er det
  som sendes, siden Deno Deploy ikke bundler .md i runtime; oppdater begge
  stedene ved endring — for `svar` håndhever `svar-md-drift.test.ts` det)

## Tester

```
deno check *.ts _lib/*.ts
deno test --allow-all _lib/
```
(kjøres også i CI via `.github/workflows/edge-tests.yml`)
