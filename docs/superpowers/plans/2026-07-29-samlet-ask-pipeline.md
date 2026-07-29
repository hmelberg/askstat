# Samlet ask-pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt dagens tre-stegs ask-pipeline (ruter → data-svar → tolk-ask + reparasjonsrunder) med ruter + ETT agentisk løp der `run_code` er et klientutført verktøy, strømmet sluttsvar, rutespesifikke prompts, split-knapp Ask/Deep og levende output i svarkortet.

**Architecture:** Serveren (`/api/svar`) kjører mange strømmede LLM-turer per HTTP-kall; tilbake til klienten går det bare ved heartbeat, token-deltaer, `run_code` (nettleseren kjører scriptet og re-POST-er resultatet inn i samme kontekst) og `continue`. `tolk-ask` og alle fra-null-reparasjonsrunder slettes — feilretting er bare neste tur i løpet. Spec: `docs/superpowers/specs/2026-07-29-samlet-ask-pipeline-design.md`.

**Tech Stack:** Deno edge functions (TypeScript, colocated `*.test.ts`, kjøres med `deno test --allow-all netlify/edge-functions/_lib/`), Anthropic Messages API (streaming + tool use), vanilla JS (`js/ask-view.js`, `js/ai-chat.js`, node-tester i `tests/js/*.test.js` via `node --test tests/js/`), Netlify dev lokalt (port 8899 / staticServerPort 3998).

## Global Constraints

- **Ingen bakoverkompatibilitet**: gamle filer/veier SLETTES, ikke fryses (`data-svar.ts`, `tolk-ask.ts`, reparasjonsløkkene, kloning-til-statisk).
- **Ask-UI er engelsk-først**: nye UI-strenger skrives native engelsk uten i18n-nøkler (etablert 2026-07-29). Server-prompter er norske (etablert stil).
- **Prompt-konvensjon**: strengene som sendes er TS-konstanter; `netlify/edge-functions/prompts/*.md` er source-of-truth-dokument + changelog og skal holdes synkron (Deno Deploy bundler ikke .md).
- **Budsjetter (spec)**: standard = ≤4 klientverktøykall (søk/metadata/probe/litteratur), ≤2 web_search, ≤1 web_fetch (15k tokens), ≤2 run_code. deep = ≤12 / ≤5 / ≤5 (30k) / ≤4.
- **Dev-server**: askstat kjører på 8899/3998 samtidig med openstat (8888/3999). Drep ALDRI servere med `pkill -f "netlify dev"` — bruk `lsof -ti tcp:8899`.
- **Ingen push uten Hans' beslutning** (openstat-familiens regel). Commit lokalt per task.
- **Modell-defaults uendret**: `ANTHROPIC_MODEL` / `DATA_SVAR_MODEL` env-oppførselen beholdes i det nye endepunktet.
- Test-nøkkel for E2E ligger i `askstat/.env` (`ANTHROPIC_API_KEY=`) — aldri echo/logg den.

## Filstruktur (mål)

| Fil | Skjebne |
|---|---|
| `netlify/edge-functions/_lib/anthropic.ts` | UTVIDES: strømmede turer (`delta`/`turn_discard`), klientutført verktøy (`run_code`-protokollen) |
| `netlify/edge-functions/_lib/svar-prompt.ts` | NY (git mv fra `data-svar-prompt.ts`): rutespesifikk montering, RUN/REFORM/PARTIAL-blokker |
| `netlify/edge-functions/svar.ts` | NY: `/api/svar`, erstatter data-svar + tolk-ask |
| `netlify/edge-functions/data-svar.ts` | SLETTES |
| `netlify/edge-functions/tolk-ask.ts` | SLETTES |
| `netlify/edge-functions/_lib/providers/agentic.ts` | UTVIDES: samme klientverktøy-protokoll |
| `netlify/edge-functions/_lib/auth.ts` | UTVIDES: `skipRateLimit` |
| `js/ai-chat.js` | `runSvarLoop` + seams; `runWebAnswer`/`webAnswerWithRepair`/`mdAskRun`/`aiDepth` SLETTES |
| `js/ask-view.js` | Omskrevet flyt; tolk/semantikk/kloning SLETTES; split-knapp + levende output |
| `index.html` | Split-knapp-markup; Dybde-blokken i settings SLETTES |
| `css/ask.css` | Split-knapp + levende output; klone-CSS SLETTES |
| `netlify/edge-functions/prompts/svar.md` | NY source-of-truth; `data-svar.md`/`tolk-ask.md` SLETTES |

---

### Task 1: Strømmede agentiske turer i `_lib/anthropic.ts`

**Files:**
- Modify: `netlify/edge-functions/_lib/anthropic.ts` (agentisk seksjon, l. 316–512)
- Test: `netlify/edge-functions/_lib/anthropic.test.ts`

**Interfaces:**
- Consumes: eksisterende `fetchWithRetry`, `apiTarget`, `scrubDetail`.
- Produces: `runAgenticStream` emitterer nå `{type:"delta", text}` (token-delta i pågående tur) og `{type:"turn_discard"}` (turen endte i tool_use — deltaene var arbeidsnotater). Den emitterer IKKE lenger `{type:"text"}` for sluttsvaret (deltaene ER svaret; `done` markerer slutt). Alle andre eventtyper uendret. Task 2 bygger klientverktøy oppå denne.

**Bakgrunn:** I dag er turene `stream:false` — sluttsvaret kommer som én blokk, og lange turer er tause vinduer. Nå strømmes hver tur: text-deltaer forwardes live, innholdsblokker rekonstrueres troféast for `state.messages` (SDK-mønsteret: blokk fra `content_block_start`, kjente deltatyper akkumulert, `input_json_delta` parses ved `content_block_stop`).

- [ ] **Step 1: Skriv failende tester (SSE-mock + delta-emisjon)**

Legg til nederst i `anthropic.test.ts` (behold `collectSse`-helperen som er der):

```ts
// ── Streaming-turer (samlet ask-pipeline, spec 2026-07-29) ────────────────
function sseUpstream(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) {
        c.enqueue(enc.encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`));
      }
      c.close();
    },
  });
}

function streamedTextTurn(text: string) {
  return [
    { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...text.split(" ").map((w, i) => ({
      type: "content_block_delta", index: 0,
      delta: { type: "text_delta", text: (i ? " " : "") + w },
    })),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ];
}

function streamedToolTurn(toolName: string, id: string, inputJson: string) {
  return [
    { type: "message_start", message: { usage: { input_tokens: 8 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Jeg sjekker kilden." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id, name: toolName, input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: inputJson.slice(0, 8) } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: inputJson.slice(8) } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } },
    { type: "message_stop" },
  ];
}

function sseFetch(turns: unknown[][]): typeof fetch {
  let call = 0;
  return (() =>
    Promise.resolve(new Response(sseUpstream(turns[call++]), { status: 200 }))
  ) as unknown as typeof fetch;
}

Deno.test("runAgenticStream(stream): text-turn emitterer delta-events og done", async () => {
  const events = await collectSse(runAgenticStream({
    apiKey: "k", model: "m", system: "s", userContent: "q",
    tools: [], executeTool: () => Promise.resolve(""),
    turnsPerCall: 8,
    deps: { fetchImpl: sseFetch([streamedTextTurn("Svaret er 42")]) },
  }));
  const deltas = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
  assertEquals(deltas, "Svaret er 42");
  assertEquals(events.some((e) => e.type === "text"), false);
  const done = events.find((e) => e.type === "done");
  assertEquals(done?.outputTokens, 5);
  assertEquals(done?.inputTokens, 10);
});

Deno.test("runAgenticStream(stream): tool-tur akkumulerer input_json_delta, kjører verktøyet og emitterer turn_discard", async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const events = await collectSse(runAgenticStream({
    apiKey: "k", model: "m", system: "s", userContent: "q",
    tools: [], turnsPerCall: 8,
    executeTool: (name, input) => { calls.push([name, input]); return Promise.resolve("OK"); },
    deps: { fetchImpl: sseFetch([
      streamedToolTurn("probe", "tu_1", JSON.stringify({ url: "https://x.no/a.csv" })),
      streamedTextTurn("Ferdig"),
    ]) },
  }));
  assertEquals(calls, [["probe", { url: "https://x.no/a.csv" }]]);
  assertEquals(events.some((e) => e.type === "turn_discard"), true);
  const deltas = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
  // Deltaene fra tool-turen kom FØR turn_discard; sluttsvarets deltaer etter.
  assertEquals(deltas, "Jeg sjekker kilden.Ferdig");
  assertEquals(events.at(-1)?.type, "done");
});
```

- [ ] **Step 2: Kjør testene — de skal feile**

Run: `deno test --allow-all netlify/edge-functions/_lib/anthropic.test.ts`
Expected: FAIL — de nye testene får `text`-events/ingen `delta`-events (og de GAMLE runAgenticStream-testene består fortsatt, de mocker JSON-svar).

- [ ] **Step 3: Implementer streamOneTurn + delta-emisjon**

I `anthropic.ts`, rett under `AGENTIC_TIMEOUT_MS`/`HEARTBEAT_MS` (l. ~368–374), legg til:

```ts
// En strømmet tur som stallerer (ingen chunks) lenger enn dette avbrytes —
// fetchWithRetry-timeouten dekker bare tiden fram til response-headerne.
const STREAM_IDLE_MS = 120_000;

interface TurnResult {
  content: Record<string, unknown>[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

// Strømmer ÉN API-tur. Text-deltaer forwardes live via onDelta; alle
// innholdsblokker (text, tool_use, server_tool_use, web_search_tool_result …)
// rekonstrueres for state.messages etter SDK-mønsteret: blokken fra
// content_block_start + kjente deltatyper akkumulert (text_delta,
// input_json_delta — parses ved content_block_stop, citations_delta).
async function streamOneTurn(
  target: { url: string; init: Pick<RequestInit, "redirect"> },
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  deps: RetryDeps,
  apiKey: string,
  onDelta: (text: string) => void,
): Promise<TurnResult> {
  const resp = await fetchWithRetry(target.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...requestBody, stream: true }),
    ...target.init,
  }, deps);
  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    console.error(`Anthropic API error ${resp.status}: ${scrubDetail(detail, apiKey)}`);
    throw new Error(`Anthropic API error ${resp.status}`);
  }

  const blocks: Record<string, unknown>[] = [];
  const partialJson = new Map<number, string>();
  let stopReason = "";
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  const handle = (obj: Record<string, unknown>) => {
    const t = obj.type;
    if (t === "message_start") {
      const u = (obj.message as Record<string, unknown> | undefined)?.usage as Record<string, number> | undefined;
      usage.inputTokens = u?.input_tokens ?? 0;
      usage.cacheReadTokens = u?.cache_read_input_tokens ?? 0;
      usage.cacheCreationTokens = u?.cache_creation_input_tokens ?? 0;
    } else if (t === "content_block_start") {
      const idx = obj.index as number;
      blocks[idx] = { ...(obj.content_block as Record<string, unknown> ?? {}) };
      const bt = blocks[idx].type;
      if (bt === "tool_use" || bt === "server_tool_use") partialJson.set(idx, "");
    } else if (t === "content_block_delta") {
      const idx = obj.index as number;
      const blk = blocks[idx];
      const d = obj.delta as Record<string, unknown> | undefined;
      if (!blk || !d) return;
      if (d.type === "text_delta") {
        blk.text = String(blk.text ?? "") + String(d.text ?? "");
        onDelta(String(d.text ?? ""));
      } else if (d.type === "input_json_delta") {
        partialJson.set(idx, (partialJson.get(idx) ?? "") + String(d.partial_json ?? ""));
      } else if (d.type === "citations_delta" && d.citation) {
        blk.citations = [...(blk.citations as unknown[] ?? []), d.citation];
      }
    } else if (t === "content_block_stop") {
      const idx = obj.index as number;
      const blk = blocks[idx];
      if (blk && partialJson.has(idx)) {
        const raw = partialJson.get(idx) ?? "";
        try { blk.input = raw ? JSON.parse(raw) : (blk.input ?? {}); }
        catch { blk.input = blk.input ?? {}; }
        partialJson.delete(idx);
      }
    } else if (t === "message_delta") {
      const d = obj.delta as Record<string, unknown> | undefined;
      if (d?.stop_reason) stopReason = String(d.stop_reason);
      const u = obj.usage as Record<string, number> | undefined;
      if (u?.output_tokens !== undefined) usage.outputTokens = u.output_tokens;
    } else if (t === "error") {
      const e = obj.error as Record<string, unknown> | undefined;
      throw new Error(`Anthropic stream error: ${e?.message ?? "ukjent"}`);
    }
  };

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      let timer: number | undefined;
      const r = await Promise.race([
        reader.read(),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error("Anthropic-strømmen stallet (> 120 s uten data)")), STREAM_IDLE_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      if (r.done) break;
      buffer += decoder.decode(r.value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try { handle(JSON.parse(payload)); }
        catch (e) {
          if (e instanceof Error && e.message.startsWith("Anthropic stream error")) throw e;
          /* ignorér uparsbare keep-alives */
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* allerede lukket */ }
  }
  return { content: blocks.filter(Boolean), stopReason, usage };
}
```

- [ ] **Step 4: Skift runAgenticStream over til streamOneTurn**

I `runAgenticStream` (l. 376–512): erstatt fetch-blokken og json-parsingen inne i for-løkka (fra `let resp: Response;` t.o.m. `const content = Array.isArray(json?.content) ? json.content : [];`) med:

```ts
          // Heartbeat trengs bare til første delta — deretter holder deltaene
          // SSE-strømmen i live.
          let sawDelta = false;
          let turnHadText = false;
          let turn: TurnResult;
          try {
            turn = await streamOneTurn(target, headers, {
              model: opts.model,
              max_tokens: opts.maxTokens ?? 8192,
              system,
              tools: opts.tools,
              messages: state.messages,
            }, deps, opts.apiKey, (text) => {
              sawDelta = true;
              turnHadText = true;
              emit({ type: "delta", text });
            });
          } finally {
            clearInterval(beat);
          }
          state.turn++;
          state.usage.inputTokens += turn.usage.inputTokens;
          state.usage.outputTokens += turn.usage.outputTokens;
          state.usage.cacheReadTokens += turn.usage.cacheReadTokens;
          state.usage.cacheCreationTokens += turn.usage.cacheCreationTokens;
          const content = turn.content;
```

Oppdater heartbeat-callbacken (rett over) til å tie etter første delta:

```ts
          const beat = setInterval(() => {
            if (sawDelta) return;
            const s = Math.round((Date.now() - turnStart) / 1000);
            try {
              emit({ type: "progress", text: `${turnLabel} … (${s} s)`, replace: true });
            } catch (_) { /* stream already closed */ }
          }, HEARTBEAT_MS);
```

(NB: `let sawDelta`-deklarasjonen må stå FØR `const beat = setInterval(...)` — flytt deklarasjonslinjene øverst i for-kroppen, etter `emit({type:"progress", …})`.)

Videre i for-kroppen:
- Erstatt `if (json.stop_reason === "pause_turn")` med `if (turn.stopReason === "pause_turn")` (uendret ellers — ingen turn_discard her; turen fortsetter visuelt).
- Erstatt `if (json.stop_reason === "tool_use" && toolUses.length)` med `if (turn.stopReason === "tool_use" && toolUses.length)`, og legg som FØRSTE linjer i den grenen (rett etter `state.messages.push({ role: "assistant", content });`):

```ts
            if (turnHadText) emit({ type: "turn_discard" });
```

- Erstatt sluttsvar-emisjonen (`for (const b of content) { if (b.type === "text" && b.text) emit({ type: "text", text: b.text }); }`) med ingenting — deltaene er allerede sendt. Behold `emit({ type: "done", ...state.usage }); controller.close(); return;`.

- [ ] **Step 5: Oppdater de gamle runAgenticStream-testene til SSE-mocker**

De eksisterende testene på l. 131–247 i `anthropic.test.ts` mocker `stream:false`-JSON-svar og vil nå feile. Skriv dem om til `sseFetch`/`streamedTextTurn`/`streamedToolTurn`-helperne fra Step 1 (flytt helperne opp over testene):
- «tool round-trip then final text» → behold navn/intensjon; assert på `delta`-events i stedet for `text`.
- «hosted web_search/web_fetch surface as progress labels» → server_tool_use-blokker leveres som `content_block_start` med `{type:"server_tool_use", name:"web_search", input:{}}` + `input_json_delta` med `{"query":"x"}`; assert at progress-eventen «🔎 Websøk: x» fortsatt emitteres.
- «budget exhausts into forced generation» → samme logikk, SSE-mock.
- «default one turn per call — continue carries state, resume finishes» → uendret intensjon (utelat `turnsPerCall` → default 1 gjelder fortsatt).
- «API error surfaces as error event» → mock `fetchImpl` som returnerer `new Response("boom", {status: 500})`.

- [ ] **Step 6: Kjør testene**

Run: `deno test --allow-all netlify/edge-functions/_lib/anthropic.test.ts`
Expected: PASS (alle).

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/anthropic.ts netlify/edge-functions/_lib/anthropic.test.ts
git commit -m "feat: strømmede agentiske turer (delta/turn_discard) i runAgenticStream"
```

---

### Task 2: Klientutført verktøy (`run_code`-protokollen) i `_lib/anthropic.ts`

**Files:**
- Modify: `netlify/edge-functions/_lib/anthropic.ts`
- Test: `netlify/edge-functions/_lib/anthropic.test.ts`

**Interfaces:**
- Produces (brukes av Task 4 og 6):
  - `AgenticOptions` får `clientTools?: string[]`, `runResult?: string`, `maxRunCode?: number` (default 2).
  - `AgenticResumeState` får `runCalls?: number` og `pending?: { results: { tool_use_id: string; content: string }[]; awaitingId: string }`.
  - Nye SSE-events: `{type:"run_code", script}` — klienten skal kjøre scriptet og re-POST-e med `resume` + `run_result` (verktøyresultat-streng). `run_code` avslutter ALLTID invokasjonen med en `continue` rett etter.

- [ ] **Step 1: Skriv failende tester**

```ts
Deno.test("runAgenticStream: run_code emitterer run_code + continue med pending-state", async () => {
  const events = await collectSse(runAgenticStream({
    apiKey: "k", model: "m", system: "s", userContent: "q",
    tools: [], turnsPerCall: 8, clientTools: ["run_code"],
    executeTool: () => Promise.reject(new Error("skal ikke kalles")),
    deps: { fetchImpl: sseFetch([
      streamedToolTurn("run_code", "tu_run1", JSON.stringify({ script: "print(1)" })),
    ]) },
  }));
  const rc = events.find((e) => e.type === "run_code");
  assertEquals(rc?.script, "print(1)");
  const cont = events.find((e) => e.type === "continue");
  const st = cont?.state as Record<string, unknown>;
  assertEquals((st.pending as Record<string, unknown>).awaitingId, "tu_run1");
  assertEquals(st.runCalls, 1);
});

Deno.test("runAgenticStream: resume med runResult fletter tool_result og fortsetter", async () => {
  // Første invokasjon: run_code → pending. Andre: resume + runResult → svar.
  const base = {
    apiKey: "k", model: "m", system: "s", userContent: "q",
    tools: [], turnsPerCall: 8, clientTools: ["run_code"],
    executeTool: () => Promise.resolve(""),
  };
  const ev1 = await collectSse(runAgenticStream({
    ...base,
    deps: { fetchImpl: sseFetch([streamedToolTurn("run_code", "tu_r", JSON.stringify({ script: "x" }))]) },
  }));
  const st = (ev1.find((e) => e.type === "continue")?.state ?? {}) as never;
  let capturedBody: Record<string, unknown> | null = null;
  const capturingFetch = ((_u: string, init: RequestInit) => {
    capturedBody = JSON.parse(String(init.body));
    return Promise.resolve(new Response(sseUpstream(streamedTextTurn("Ferdig")), { status: 200 }));
  }) as unknown as typeof fetch;
  const ev2 = await collectSse(runAgenticStream({
    ...base, resume: st, runResult: "OK. OUTPUT:\n42",
    deps: { fetchImpl: capturingFetch },
  }));
  assertEquals(ev2.at(-1)?.type, "done");
  // tool_result for tu_r ligger i meldingsarrayet som ble sendt oppstrøms.
  const msgs = (capturedBody?.messages ?? []) as Record<string, unknown>[];
  const lastUser = msgs.at(-1) as { role: string; content: { type: string; tool_use_id: string; content: string }[] };
  assertEquals(lastUser.role, "user");
  assertEquals(lastUser.content[0].tool_use_id, "tu_r");
  assertEquals(lastUser.content[0].content, "OK. OUTPUT:\n42");
});

Deno.test("runAgenticStream: run_code over budsjett får server-side tool_result i stedet for event", async () => {
  const events = await collectSse(runAgenticStream({
    apiKey: "k", model: "m", system: "s", userContent: "q",
    tools: [], turnsPerCall: 8, clientTools: ["run_code"], maxRunCode: 2,
    executeTool: () => Promise.resolve(""),
    resume: {
      messages: [{ role: "user", content: "q" }], turn: 1, clientCalls: 0, runCalls: 2,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    } as never,
    deps: { fetchImpl: sseFetch([
      streamedToolTurn("run_code", "tu_over", JSON.stringify({ script: "x" })),
      streamedTextTurn("Svar uten flere kjøringer"),
    ]) },
  }));
  assertEquals(events.some((e) => e.type === "run_code"), false);
  assertEquals(events.at(-1)?.type, "done");
});
```

- [ ] **Step 2: Kjør — de skal feile**

Run: `deno test --allow-all netlify/edge-functions/_lib/anthropic.test.ts`
Expected: FAIL («run_code»-events finnes ikke).

- [ ] **Step 3: Implementer**

I `AgenticOptions` (etter `continueExtra`):

```ts
  // Klientutførte verktøy (run_code): verktøykall med disse navnene utføres
  // IKKE av executeTool — de emitteres som {type:"run_code", script} fulgt av
  // {type:"continue", state} (state.pending husker hva vi venter på), og
  // klienten re-POST-er med resume + run_result (verktøyresultat-strengen).
  clientTools?: string[];
  runResult?: string;
  maxRunCode?: number;
```

I `AgenticResumeState` (etter `prevResponseId`):

```ts
  runCalls?: number;
  pending?: { results: { tool_use_id: string; content: string }[]; awaitingId: string };
```

I `runAgenticStream`, rett etter `const turnsPerCall = opts.turnsPerCall ?? 1;`:

```ts
      const clientToolNames = new Set(opts.clientTools ?? []);
      const maxRunCode = opts.maxRunCode ?? 2;
      // Resume etter run_code: flett klientens kjøreresultat inn som
      // tool_result sammen med eventuelle server-verktøyresultater fra samme tur.
      if (state.pending) {
        if (typeof opts.runResult !== "string") {
          throw new Error("resume med ventende run_code mangler run_result");
        }
        const merged = [...state.pending.results,
          { tool_use_id: state.pending.awaitingId, content: opts.runResult }];
        state.messages.push({
          role: "user",
          content: merged.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content })),
        });
        delete state.pending;
      }
```

(NB: `throw` her skjer inne i stream-`start` — den fanges av den eksisterende catch-en og blir et `error`-event. Det er riktig oppførsel.)

Erstatt tool_use-grenen (fra `const toolUses = …` t.o.m. `continue;`) med:

```ts
          const toolUses = content.filter((b: { type?: string }) => b.type === "tool_use");
          if (turn.stopReason === "tool_use" && toolUses.length) {
            state.messages.push({ role: "assistant", content });
            if (turnHadText) emit({ type: "turn_discard" });
            const results: { tool_use_id: string; content: string }[] = [];
            let clientCall: { id: string; input: Record<string, unknown> } | null = null;
            for (const tu of toolUses) {
              if (clientToolNames.has(tu.name)) {
                state.runCalls = (state.runCalls ?? 0) + 1;
                if (state.runCalls > maxRunCode) {
                  results.push({ tool_use_id: tu.id, content:
                    "Kjøre-budsjettet er brukt opp — skriv sluttsvaret NÅ basert på det du allerede vet. Vær ærlig om hva som ikke ble verifisert." });
                } else if (clientCall) {
                  results.push({ tool_use_id: tu.id, content: "Kall run_code én gang per tur." });
                } else {
                  clientCall = { id: tu.id, input: (tu.input ?? {}) as Record<string, unknown> };
                }
                continue;
              }
              state.clientCalls++;
              const label = opts.progressLabel?.(tu.name, tu.input ?? {}) ?? `Kjører ${tu.name} …`;
              emit({ type: "progress", text: label });
              let out: string;
              if (state.clientCalls > maxClientCalls) {
                out = "Verktøy-budsjettet er brukt opp — generer svaret NÅ med det du allerede har funnet. Vær ærlig om hva som mangler.";
              } else {
                try {
                  out = await opts.executeTool(tu.name, tu.input ?? {});
                } catch (e) {
                  out = `Verktøyfeil: ${String(e).slice(0, 300)}`;
                }
              }
              results.push({ tool_use_id: tu.id, content: out });
            }
            if (clientCall) {
              state.pending = { results, awaitingId: clientCall.id };
              emit({ type: "run_code", script: String(clientCall.input.script ?? "") });
              emit({ type: "continue", state, ...(opts.continueExtra?.() ?? {}) });
              controller.close();
              return;
            }
            state.messages.push({
              role: "user",
              content: results.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content })),
            });
            continue;
          }
```

(Dette ERSTATTER `turn_discard`-linja fra Task 1 Step 4 — den flyttes hit, samme plassering.)

- [ ] **Step 4: Kjør alle anthropic-testene**

Run: `deno test --allow-all netlify/edge-functions/_lib/anthropic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/anthropic.ts netlify/edge-functions/_lib/anthropic.test.ts
git commit -m "feat: klientutført run_code-verktøy med pending/resume i runAgenticStream"
```

---

### Task 3: Rutespesifikke prompts — `_lib/svar-prompt.ts`

**Files:**
- Rename: `netlify/edge-functions/_lib/data-svar-prompt.ts` → `netlify/edge-functions/_lib/svar-prompt.ts` (`git mv`)
- Rename: `netlify/edge-functions/_lib/data-svar-prompt.test.ts` → `netlify/edge-functions/_lib/svar-prompt.test.ts` (`git mv`)

**Interfaces:**
- Produces (brukes av Task 4):
  - `export type AskRoute = "beregning" | "data" | "oppslag"` + `coerceRoute(r: unknown): AskRoute` (ukjent → `"data"`).
  - `export type Depth = "standard" | "deep"` + `coerceDepth(d: unknown): Depth` (ukjent → `"standard"`).
  - `buildSvarSystem(route: AskRoute, mode: DataMode, registryBlock: string, opts?: { memoryUrls?: boolean; depth?: Depth }): string`.
  - `buildRouteToolDefs(route: AskRoute, depth: Depth, opts?: { hostedWeb?: boolean }): unknown[]`.
  - `depthClientToolCalls(depth): number` (4/12), `depthRunCodeCalls(depth): number` (2/4).
  - `RUN_CODE_TOOL` (verktøydef), `CLIENT_TOOL_DEFS`, `questionTurn`, `progressLabel`, `coerceDataMode` beholdes.
  - SLETTES: `repairTurn`, `buildDataSvarSystem`, `buildToolDefs`, `TOOL_DEFS`, `DEPTH_FAST`-navnet (blir `DEPTH_STANDARD`).

- [ ] **Step 1: git mv + skriv failende tester**

```bash
git mv netlify/edge-functions/_lib/data-svar-prompt.ts netlify/edge-functions/_lib/svar-prompt.ts
git mv netlify/edge-functions/_lib/data-svar-prompt.test.ts netlify/edge-functions/_lib/svar-prompt.test.ts
```

Erstatt HELE innholdet i `svar-prompt.test.ts` med:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRouteToolDefs, buildSvarSystem, coerceDepth, coerceRoute,
  depthClientToolCalls, depthRunCodeCalls, progressLabel, questionTurn,
} from "./svar-prompt.ts";

Deno.test("coerceRoute: ukjent → data", () => {
  assertEquals(coerceRoute("beregning"), "beregning");
  assertEquals(coerceRoute("oppslag"), "oppslag");
  assertEquals(coerceRoute("språk"), "data");
  assertEquals(coerceRoute(undefined), "data");
});

Deno.test("coerceDepth: standard er default", () => {
  assertEquals(coerceDepth("deep"), "deep");
  assertEquals(coerceDepth("fast"), "standard");
  assertEquals(coerceDepth(undefined), "standard");
});

Deno.test("buildSvarSystem(beregning): omforming + run_code, INGEN register/EVAL/ost", () => {
  const s = buildSvarSystem("beregning", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("Omforming"));
  assert(s.includes("run_code"));
  assert(s.includes("#@param"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(!s.includes("EVAL-REGLER"));
  assert(!s.includes("ost.connect"));
});

Deno.test("buildSvarSystem(data): beholder EVAL-regler, register, delvis-regel og run_code", () => {
  const s = buildSvarSystem("data", "python", "REGISTERBLOKK-MARKØR", { depth: "standard" });
  assert(s.includes("EVAL-REGLER"));
  assert(s.includes("REGISTERBLOKK-MARKØR"));
  assert(s.includes("Delvise resultater"));
  assert(s.includes("run_code"));
  assert(s.includes("Dybde: STANDARD"));
});

Deno.test("buildSvarSystem(oppslag): minimal — websøk-krav, ingen register", () => {
  const s = buildSvarSystem("oppslag", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("kilde-URL"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(s.length < 4000);
});

Deno.test("buildSvarSystem: svarformatet sier ingen kodeblokk i sluttsvaret", () => {
  const s = buildSvarSystem("data", "python", "");
  assert(s.includes("ingen kodeblokk"));
  assert(!s.includes("ÉN kjørbar"));
});

Deno.test("buildRouteToolDefs: beregning = kun run_code", () => {
  const defs = buildRouteToolDefs("beregning", "standard") as { name?: string }[];
  assertEquals(defs.length, 1);
  assertEquals(defs[0].name, "run_code");
});

Deno.test("buildRouteToolDefs: data har katalogverktøy + run_code + hostede webverktøy m/ budsjett", () => {
  const defs = buildRouteToolDefs("data", "standard") as { name?: string; max_uses?: number; max_content_tokens?: number }[];
  const names = defs.map((d) => d.name);
  assert(names.includes("search_catalog") && names.includes("probe") && names.includes("run_code"));
  const ws = defs.find((d) => d.name === "web_search");
  const wf = defs.find((d) => d.name === "web_fetch");
  assertEquals(ws?.max_uses, 2);
  assertEquals(wf?.max_uses, 1);
  assertEquals(wf?.max_content_tokens, 15_000);
});

Deno.test("buildRouteToolDefs: hostedWeb:false dropper webverktøyene", () => {
  const defs = buildRouteToolDefs("oppslag", "deep", { hostedWeb: false }) as { name?: string }[];
  assertEquals(defs.map((d) => d.name), ["run_code"]);
});

Deno.test("budsjetter per dybde", () => {
  assertEquals(depthClientToolCalls("standard"), 4);
  assertEquals(depthClientToolCalls("deep"), 12);
  assertEquals(depthRunCodeCalls("standard"), 2);
  assertEquals(depthRunCodeCalls("deep"), 4);
});

Deno.test("questionTurn: med og uten script-kontekst", () => {
  assert(questionTurn("Hva?", "x=1").includes("x=1"));
  assert(!questionTurn("Hva?").includes("Gjeldende script"));
});

Deno.test("progressLabel: run_code har egen etikett", () => {
  assert(progressLabel("run_code", {}).includes("Kjører scriptet"));
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `deno test --allow-all netlify/edge-functions/_lib/svar-prompt.test.ts`
Expected: FAIL (eksportene finnes ikke ennå).

- [ ] **Step 3: Skriv om `svar-prompt.ts`**

Endringer i filen (behold `INTRO`, `DELIVERY`, `QUERYLOGIC`, `SCIENCE`, `INLINE`, `MULTI`, `SEARCH_HINTS`, `MEMORY_URLS`, `CLIENT_TOOL_DEFS`, `coerceDataMode`, `questionTurn` som de er, unntatt det som nevnes):

1. Toppkommentar: `// System prompt + tool definitions for /api/svar (samlet ask-pipeline). // Source doc + changelog: netlify/edge-functions/prompts/svar.md`

2. Depth-typen:

```ts
// Dybde: "standard" er default (slank/rask); "deep" øker budsjettene.
// Gamle verdien "fast" finnes ikke lenger — alt ukjent blir standard.
export type Depth = "standard" | "deep";

export function coerceDepth(d: unknown): Depth {
  return d === "deep" ? "deep" : "standard";
}
```

3. Rute-typen (ny, under Depth):

```ts
// Ruter fra /api/ask-ruter. "språk" når aldri hit (besvares av ruteren).
export type AskRoute = "beregning" | "data" | "oppslag";

export function coerceRoute(r: unknown): AskRoute {
  return r === "beregning" || r === "oppslag" ? r : "data";
}
```

4. `DEPTH_FAST` → `DEPTH_STANDARD` med oppdatert overskrift/tabell (run_code-raden er ny):

```ts
const DEPTH_STANDARD = `\
## Dybde: STANDARD (hurtig)

Budsjett og ambisjon:

| Ressurs | Budsjett |
| --- | --- |
| Klientverktøykall (katalog/metadata/probe/litteratur) | ≤ 4 totalt |
| web_search | ≤ 2 |
| web_fetch | ≤ 1 |
| run_code | ≤ 2 kjøringer |
| Kilder | ÉN er nok (to kun ved eksplisitt sammenligning) |
| Metode | enkleste troverdige; dropp heterogenitet og sekundæranalyser |
| Svartekst | kort — funn, én figur, forbehold |

Standard reduserer AMBISJON, ALDRI ÆRLIGHET: probe-✅-kravet,
fabrikasjonsvernet, variabelplan-gaten ved kausale spørsmål og ærlig
degradering gjelder UENDRET. Rekker du ikke å verifisere innenfor budsjettet:
SI det og lever mindre — aldri lat som.`;
```

`DEPTH_DEEP` beholdes, men oppdater tallene: «inntil 12 klientverktøykall, 5 web_search/web_fetch og 4 run_code-kjøringer». `const DEPTH: Record<Depth, string> = { standard: DEPTH_STANDARD, deep: DEPTH_DEEP };`

5. Nye blokker (legg etter `SEARCH_HINTS`):

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
   markdown — ingen kodeblokk (koden ligger allerede i kodevisningen, og
   figurer/tabeller fra kjøringen vises automatisk under svaret).

Sluttsvarets form:
- Har du omformet spørsmålet: åpne med «Slik tolker jeg spørsmålet: …» og
  oppgi antakelsene eksplisitt.
- Alle tall skal komme fra run_code-OUTPUT eller verifiserte kilder — aldri
  fra hukommelsen. Tomt for kjørebudsjett? Si ærlig hva som ikke ble
  verifisert.
- Oppgi kilder med URL der data er brukt, og nevn viktige forbehold kort.
- Svar på brukerens språk (norsk/engelsk følger spørsmålet).`;

const REFORM = `\
## Omforming: verdi- og teorispørsmål kan belyses med kode

Mange spørsmål som ser ubesvarbare ut («er X rettferdig?», «kan teori T
forklare fenomen F?») kan omformes til noe kode kan belyse. Gjør det når det
gir innsikt:

1. Si eksplisitt hvordan du omformer spørsmålet (én–to setninger), og at
   svaret BELYSER — ikke avgjør — spørsmålet.
2. Velg en ENKEL, forståelig modell/simulering med få, navngitte parametre
   og plausible startverdier. Enkelhet slår realisme: leseren skal kunne
   forstå mekanismen.
3. Vis hvordan konklusjonen avhenger av antakelsene — varier de 1–3
   viktigste parametrene, og bruk interaktive kontroller (se modusblokken)
   så brukeren kan dra i antakelsene selv.
4. Skill klart mellom hva simuleringen viser og hva som forblir et
   verdivalg eller empirisk spørsmål.`;

const PARTIAL = `\
## Delvise resultater og kildesprik

- Fant du bare deler av det spørsmålet ber om (8 av 12 land, kortere
  tidsserie, grovere inndeling): lever det du fant og SI presist hva som
  mangler og hvorfor. Et ærlig delsvar slår nye leterunder.
- Gir ulike kilder ulike tall for samme størrelse: ikke velg stille én —
  vis kort hva hver kilde sier (kilde, tall, definisjonsforskjell om kjent)
  og hvilken du legger til grunn.`;

const INTRO_CALC = `\
Du er en forsknings- og beregningsassistent. Spørsmålet er rutet som
BEREGNING: det kan besvares (eller belyses) med kode alene — ingen eksterne
datakilder trengs. Tolk spørsmålet operasjonelt, skriv ett komplett script,
kjør det med run_code, og skriv sluttsvaret basert på outputen. Du svarer på
brukerens språk (norsk/engelsk).`;

const INTRO_LOOKUP = `\
Du er en faktasjekkende oppslagsassistent. Spørsmålet er rutet som OPPSLAG:
et faktaspørsmål som skal VERIFISERES med websøk — aldri besvares rent fra
hukommelsen, selv for velkjente fakta. Søk, les ved behov (web_fetch), og
oppgi minst én autoritativ kilde-URL i svaret. Skriv kode (run_code) kun når
en faktisk beregning trengs. Du svarer på brukerens språk (norsk/engelsk).`;
```

6. `MODE_PY`: fjern hele `## Svarformat`-seksjonen (siste avsnitt) og legg i stedet til, etter dtype-listen:

```
INTERAKTIVITET: i simuleringer og modeller kan brukeren dra i antakelsene
selv — bruk #@param-skjemaer for 1–3 nøkkelparametre, f.eks.
\`rente = 0.05  #@param {type:"slider", min:0, max:0.2, step:0.005}\`.
Kjøringen re-kjøres automatisk når brukeren endrer verdien.
```

`MODE_R` og `MODE_DUCK`: fjern `## Svarformat`-seksjonene (RUN-blokken eier nå svarformatet).

7. Montering — ERSTATT `buildDataSvarSystem` med:

```ts
export function buildSvarSystem(
  route: AskRoute,
  mode: DataMode,
  registryBlock: string,
  opts?: { memoryUrls?: boolean; depth?: Depth },
): string {
  const depth = opts?.depth ?? "standard";
  if (route === "beregning") {
    return [INTRO_CALC, REFORM, MODE[mode], RUN].join("\n\n");
  }
  if (route === "oppslag") {
    return [INTRO_LOOKUP, RUN].join("\n\n");
  }
  const blocks = [INTRO, DEPTH[depth], DELIVERY, QUERYLOGIC, SCIENCE, INLINE, MULTI, MODE[mode], SEARCH_HINTS, RUN, PARTIAL];
  if (opts?.memoryUrls) blocks.push(MEMORY_URLS);
  blocks.push(registryBlock);
  return blocks.join("\n\n");
}
```

8. Verktøydefs — ERSTATT `buildToolDefs` + `TOOL_DEFS` med:

```ts
export const RUN_CODE_TOOL = {
  name: "run_code",
  description:
    "Kjør et komplett script i brukerens miljø (python/r/duckdb — modusblokken sier hvilket). Returnerer kjøringens tekst-output og eventuell feilmelding. Kall med HELE scriptet; rett og kall igjen ved feil (innenfor kjørebudsjettet).",
  input_schema: {
    type: "object",
    properties: { script: { type: "string", description: "hele scriptet, klart til kjøring" } },
    required: ["script"],
  },
};

// hostedWeb:false brukes for leverandører uten Anthropic-hostede verktøy
// (openai-compat/responses) — MEMORY_URLS-blokka tar over veiledningen.
export function buildRouteToolDefs(
  route: AskRoute,
  depth: Depth,
  opts?: { hostedWeb?: boolean },
): unknown[] {
  const hosted = opts?.hostedWeb !== false;
  const uses = depth === "standard"
    ? { search: 2, fetch: 1, fetchTokens: 15_000 }
    : { search: 5, fetch: 5, fetchTokens: 30_000 };
  const web = hosted
    ? [
      { type: "web_search_20250305", name: "web_search", max_uses: uses.search },
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: uses.fetch, max_content_tokens: uses.fetchTokens },
    ]
    : [];
  if (route === "beregning") return [RUN_CODE_TOOL];
  if (route === "oppslag") return [RUN_CODE_TOOL, ...web];
  return [...CLIENT_TOOL_DEFS, RUN_CODE_TOOL, ...web];
}
```

9. Budsjett-hjelpere:

```ts
export function depthClientToolCalls(depth: Depth): number {
  return depth === "standard" ? 4 : 12;
}

export function depthRunCodeCalls(depth: Depth): number {
  return depth === "standard" ? 2 : 4;
}
```

10. SLETT `repairTurn` (hele funksjonen). `progressLabel` får ny case øverst i switchen:

```ts
    case "run_code": return "▶ Kjører scriptet …";
```

11. `INTRO` (data-ruten): oppdater fase 3 til run_code-flyten — erstatt hele punkt 3 («**GENERER** ett komplett …») med:

```
3. **GENERER OG KJØR**: skriv ett komplett script i brukerens modus (se
   Leveringsregler og modus-blokken) og kjør det med run_code. Rett ved
   behov, og skriv sluttsvaret fra outputen (se Kjøring og sluttsvar).
   Finner du ikke data: si det ærlig, vis hva du søkte på, og foreslå
   omformuleringer. ALDRI fabrikker.
```

- [ ] **Step 4: Kjør prompttestene**

Run: `deno test --allow-all netlify/edge-functions/_lib/svar-prompt.test.ts`
Expected: PASS.

(NB: `deno test --allow-all netlify/edge-functions/_lib/` vil nå feile på `data-svar.ts`-importen — den fikses i Task 4. Kjør kun promptfilen her.)

- [ ] **Step 5: Commit**

```bash
git add -A netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt.test.ts
git commit -m "feat: rutespesifikk promptmontering (svar-prompt) med RUN/REFORM/PARTIAL-blokker"
```

---

### Task 4: Endepunktet `/api/svar` + skipRateLimit; slett data-svar og tolk-ask

**Files:**
- Create: `netlify/edge-functions/svar.ts`
- Modify: `netlify/edge-functions/_lib/auth.ts` (GateOptions + runBaseChecks)
- Modify: `netlify.toml` (l. 95–108)
- Delete: `netlify/edge-functions/data-svar.ts`, `netlify/edge-functions/tolk-ask.ts`
- Test: `netlify/edge-functions/_lib/auth.test.ts`

**Interfaces:**
- Consumes: `runAgenticStream` m/ `clientTools`/`runResult`/`maxRunCode` (Task 2), `buildSvarSystem`/`buildRouteToolDefs`/`coerceRoute`/`coerceDepth`/`depthClientToolCalls`/`depthRunCodeCalls` (Task 3).
- Produces: `POST /api/svar` med body `{question, route, mode, depth, available_keys, provider, script, resume: {state, probed}, run_result}`. SSE-kontrakt: `progress | delta | turn_discard | run_code | continue | sources | text | done | error` (`text` kun fra leverandørstien). Header `X-Svar-Resume: 1` på continuation-hops → ratelimit hoppes over (spec: teller per spørsmål, ikke per hop).

- [ ] **Step 1: Failende auth-test for skipRateLimit**

I `auth.test.ts`, finn testene som kaller `runGate` (gjenbruk filens eksisterende request-bygger-helper) og legg til:

```ts
Deno.test("runGate: skipRateLimit hopper over ratelimit-sjekken", async () => {
  let called = false;
  const req = new Request("https://x/api/svar", {
    method: "POST",
    headers: { "Authorization": "Bearer tok", "content-length": "10" },
  });
  const resp = await runGate(req, { endpoint: "svar", maxBodyBytes: 1000, skipRateLimit: true }, {
    sharedToken: "tok",
    checkRateLimit: () => { called = true; return Promise.resolve({ allowed: false, retryAfterSeconds: 9 }); },
    validateToken: () => Promise.resolve(false),
    now: () => 0,
    cache: new Map(),
  });
  assertEquals(resp, null);
  assertEquals(called, false);
});
```

Run: `deno test --allow-all netlify/edge-functions/_lib/auth.test.ts` → Expected: FAIL (ukjent felt/limit kjøres).

- [ ] **Step 2: Implementer skipRateLimit i auth.ts**

I `GateOptions`-interfacet: legg til feltet

```ts
  // Continuation-hops i /api/svar bærer allerede en påbegynt kjøring —
  // ratelimiten skal telle SPØRSMÅL, ikke hops (spec 2026-07-29).
  skipRateLimit?: boolean;
```

I `runBaseChecks`, pakk steg 4 inn:

```ts
  // 4. rate-limit BEFORE the expensive Anvil validation (no amplification)
  if (!opts.skipRateLimit) {
    const rate = await checkRateLimit(opts.endpoint, clientIp(request));
    if (!rate.allowed) {
      return {
        presentedToken,
        failure: new Response("Rate limited", {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }),
      };
    }
  }
```

Run: `deno test --allow-all netlify/edge-functions/_lib/auth.test.ts` → Expected: PASS.

- [ ] **Step 3: Skriv `svar.ts`**

Hele filen (mønsteret er data-svar.ts; forskjellene: rute-parameter, run_code-opsjoner, register kun for data-ruten, skipRateLimit på resume, turnsPerCall 8):

```ts
// /api/svar — samlet ask-pipeline: ETT agentisk løp med run_code som
// klientutført verktøy. Erstatter data-svar + tolk-ask.
// Spec: docs/superpowers/specs/2026-07-29-samlet-ask-pipeline-design.md
import { adminGate, extractByokKey, extractLlmKey } from "./_lib/auth.ts";
import { type AgenticResumeState, runAgenticStream } from "./_lib/anthropic.ts";
import { loadRegistry, renderRegistryBlock } from "./_lib/registry.ts";
import { searchCatalog } from "./_lib/tools/search-catalog.ts";
import { tableMetadata } from "./_lib/tools/table-metadata.ts";
import { probeUrl } from "./_lib/tools/probe.ts";
import { injectBeforeDone } from "./_lib/sse-util.ts";
import {
  buildRouteToolDefs, buildSvarSystem, CLIENT_TOOL_DEFS, coerceDataMode,
  coerceDepth, coerceRoute, depthClientToolCalls, depthRunCodeCalls,
  progressLabel, questionTurn, RUN_CODE_TOOL,
} from "./_lib/svar-prompt.ts";
import { searchLiterature } from "./_lib/tools/search-literature.ts";
import { parseProviderConfig } from "./_lib/providers/config.ts";
import { runProviderAgenticStream } from "./_lib/providers/agentic.ts";
import { makeOpenAiCompatTurn } from "./_lib/providers/openai-compat.ts";
import { makeOpenAiResponsesTurn } from "./_lib/providers/openai-responses.ts";

interface ResumeBody { state?: AgenticResumeState; probed?: unknown; }
interface RequestBody {
  question?: string;
  route?: string;
  mode?: string;
  depth?: string;
  script?: string;
  available_keys?: unknown;
  provider?: unknown;
  resume?: ResumeBody;
  run_result?: string;
}

// Resume-bodies bærer hele samtaletilstanden (tool-results, websøk-blokker).
const MAX_BODY_BYTES = 2_000_000;

function validResumeState(s: AgenticResumeState | undefined): s is AgenticResumeState {
  if (!s || !Array.isArray(s.messages) || s.messages.length < 1 || s.messages.length > 400) return false;
  if (!Number.isInteger(s.turn) || s.turn < 1 || s.turn > 64) return false;
  if (!Number.isInteger(s.clientCalls) || s.clientCalls < 0 || s.clientCalls > 200) return false;
  if (s.runCalls !== undefined && (!Number.isInteger(s.runCalls) || s.runCalls < 0 || s.runCalls > 50)) return false;
  if (s.prevResponseId !== undefined &&
    (typeof s.prevResponseId !== "string" || s.prevResponseId.length > 200)) return false;
  if (s.pending !== undefined) {
    const p = s.pending as Record<string, unknown>;
    if (!p || typeof p.awaitingId !== "string" || p.awaitingId.length > 200 ||
      !Array.isArray(p.results) || (p.results as unknown[]).length > 20) return false;
  }
  return typeof s.usage === "object" && s.usage !== null;
}

export default async (request: Request): Promise<Response> => {
  const gateResp = await adminGate(request, {
    endpoint: "svar",
    maxBodyBytes: MAX_BODY_BYTES,
    allowByok: true,
    allowLlmKey: true,
    // Ratelimiten teller SPØRSMÅL: continuation-hops er samme spørsmål.
    skipRateLimit: request.headers.get("x-svar-resume") === "1",
  });
  if (gateResp) return gateResp;

  let body: RequestBody;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const question = (body.question ?? "").trim();
  if (!question) return new Response("Missing question", { status: 400 });

  let resumeState: AgenticResumeState | undefined;
  if (body.resume) {
    if (!validResumeState(body.resume.state)) {
      return new Response("Invalid resume payload", { status: 400 });
    }
    const s = body.resume.state;
    const u = s.usage as Record<string, unknown>;
    resumeState = {
      messages: s.messages,
      turn: s.turn,
      clientCalls: s.clientCalls,
      runCalls: s.runCalls,
      pending: s.pending,
      prevResponseId: s.prevResponseId,
      usage: {
        inputTokens: Number(u.inputTokens) || 0,
        outputTokens: Number(u.outputTokens) || 0,
        cacheReadTokens: Number(u.cacheReadTokens) || 0,
        cacheCreationTokens: Number(u.cacheCreationTokens) || 0,
      },
    };
  }
  const runResult = typeof body.run_result === "string"
    ? body.run_result.slice(0, 30_000)
    : undefined;

  const provider = parseProviderConfig(body.provider, request);
  if (provider && "error" in provider) return provider.error;
  if (!extractByokKey(request) && extractLlmKey(request) && !provider) {
    return new Response("X-Llm-Key krever komplett leverandørkonfigurasjon (provider-feltet i forespørselen)", { status: 401 });
  }

  const byokKey = extractByokKey(request);
  const apiKey = provider ? provider.key : (byokKey ?? Deno.env.get("ANTHROPIC_API_KEY"));
  const model = provider
    ? provider.model
    : (Deno.env.get("DATA_SVAR_MODEL") ?? Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6");
  if (!apiKey) {
    console.error("svar: mangler API-nøkkel (env ANTHROPIC_API_KEY eller leverandørnøkkel)");
    return new Response("Server configuration error", { status: 500 });
  }

  const route = coerceRoute(body.route);
  const mode = coerceDataMode(body.mode);
  const depth = coerceDepth(body.depth);

  // Registeret trengs bare i data-ruten (beregning/oppslag har verken
  // katalogverktøy eller registerblokk i prompten) — sparer et nettkall.
  const origin = new URL(request.url).origin;
  let registryBlock = "";
  let registry: Awaited<ReturnType<typeof loadRegistry>> | null = null;
  if (route === "data") {
    try { registry = await loadRegistry(origin); } catch (e) {
      console.error("svar: registry load failed:", e);
      return new Response("Kilderegister utilgjengelig", { status: 502 });
    }
    const availableKeys = Array.isArray(body.available_keys)
      ? (body.available_keys as unknown[])
        .filter((k): k is string => typeof k === "string" && /^[a-z0-9_-]{1,32}$/.test(k))
        .slice(0, 20)
      : [];
    registryBlock = renderRegistryBlock(registry, availableKeys);
  }

  const memoryUrls = provider ? provider.webSearch === "none" : false;
  const system = buildSvarSystem(route, mode, registryBlock, { memoryUrls, depth });

  const probed: { url: string; ok: boolean; cors: boolean; viaProxy: boolean }[] = [];
  if (body.resume && Array.isArray(body.resume.probed)) {
    for (const p of (body.resume.probed as Record<string, unknown>[]).slice(0, 60)) {
      if (p && typeof p.url === "string") {
        probed.push({ url: p.url, ok: !!p.ok, cors: !!p.cors, viaProxy: !!p.viaProxy });
      }
    }
  }

  const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === "search_catalog" && registry) {
      return JSON.stringify(await searchCatalog(String(input.source ?? ""), String(input.query ?? ""), { registry, origin }));
    }
    if (name === "table_metadata" && registry) {
      return JSON.stringify(await tableMetadata(String(input.source ?? ""), String(input.table_id ?? ""), { registry }));
    }
    if (name === "probe") {
      const url = String(input.url ?? "");
      const r = await probeUrl(url);
      probed.push({ url, ok: r.ok, cors: r.cors, viaProxy: r.ok && !r.cors });
      return JSON.stringify(r);
    }
    if (name === "search_literature") {
      const fromYear = Number.isInteger(input.from_year) ? Number(input.from_year) : undefined;
      return JSON.stringify(await searchLiterature(String(input.query ?? ""), fromYear, {
        mailto: Deno.env.get("OPENALEX_MAILTO") || undefined,
      }));
    }
    throw new Error(`ukjent verktøy: ${name}`);
  };

  const commonOpts = {
    system,
    userContent: questionTurn(question, body.script),
    executeTool,
    progressLabel,
    maxTokens: 8192,
    maxClientToolCalls: depthClientToolCalls(depth),
    clientTools: ["run_code"],
    maxRunCode: depthRunCodeCalls(depth),
    runResult,
    resume: resumeState,
    continueExtra: () => ({ probed }),
  };
  const providerDeps = { timeoutMs: 180_000, retries: 1 };
  let inner: ReadableStream<Uint8Array>;
  if (provider && provider.type === "openai-compat") {
    inner = runProviderAgenticStream({
      ...commonOpts, deps: providerDeps, runTurn: makeOpenAiCompatTurn(provider),
      tools: route === "data" ? [...CLIENT_TOOL_DEFS, RUN_CODE_TOOL] : buildRouteToolDefs(route, depth, { hostedWeb: false }),
    });
  } else if (provider && provider.type === "openai-responses") {
    inner = runProviderAgenticStream({
      ...commonOpts, deps: providerDeps, runTurn: makeOpenAiResponsesTurn(provider),
      tools: route === "data" ? [...CLIENT_TOOL_DEFS, RUN_CODE_TOOL] : buildRouteToolDefs(route, depth, { hostedWeb: false }),
    });
  } else {
    inner = runAgenticStream({
      ...commonOpts,
      apiKey, model,
      tools: buildRouteToolDefs(route, depth),
      turnsPerCall: 8,
      cacheTtl: "1h",
      apiBase: provider?.type === "anthropic-compat" ? provider.baseUrl : undefined,
    });
  }

  const stream = injectBeforeDone(inner, () =>
    probed.length ? { type: "sources", sources: probed } : null);

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
};
```

- [ ] **Step 4: netlify.toml + slett gamle filer**

I `netlify.toml`: erstatt data-svar-blokken (l. 94–96) med

```toml
  function = "svar"
  path = "/api/svar"
```

og SLETT tolk-ask-blokken (hele `[[edge_functions]]`-oppføringen på l. 106–108; ask-ruter-blokken beholdes).

```bash
git rm netlify/edge-functions/data-svar.ts netlify/edge-functions/tolk-ask.ts
```

- [ ] **Step 5: Kjør hele edge-testsuiten**

Run: `deno test --allow-all netlify/edge-functions/_lib/`
Expected: PASS (ingen fil importerer lenger data-svar-prompt/data-svar).
Run også: `deno check netlify/edge-functions/svar.ts`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add -A netlify.toml netlify/edge-functions/
git commit -m "feat: /api/svar erstatter data-svar + tolk-ask; ratelimit per spørsmål"
```

---

### Task 5: Klientverktøy-protokollen i leverandørløkka

**Files:**
- Modify: `netlify/edge-functions/_lib/providers/agentic.ts`
- Create: `netlify/edge-functions/_lib/providers/agentic.test.ts`

**Interfaces:**
- Consumes: `AgenticResumeState` med `runCalls`/`pending` (Task 2).
- Produces: `ProviderAgenticOptions` får `clientTools?: string[]`, `runResult?: string`, `maxRunCode?: number` — samme semantikk og SSE-events som runAgenticStream (run_code → continue m/ pending). (Leverandørløkka forblir bufret — ingen delta/turn_discard.)

- [ ] **Step 1: Failende test**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runProviderAgenticStream } from "./agentic.ts";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data:"));
      buf = buf.slice(nl + 2);
      if (line) out.push(JSON.parse(line.slice(5).trim()));
    }
  }
  return out;
}

Deno.test("provider-løkka: run_code → run_code+continue m/ pending; resume m/ runResult fullfører", async () => {
  const turns = [
    { text: "", toolUses: [{ id: "p1", name: "run_code", input: { script: "1+1" } }], searchNotes: [], stop: "tool_use" as const, usage: { inputTokens: 1, outputTokens: 1 } },
    { text: "Ferdig", toolUses: [], searchNotes: [], stop: "end" as const, usage: { inputTokens: 1, outputTokens: 1 } },
  ];
  let call = 0;
  const runTurn = () => Promise.resolve(turns[call++]);
  const base = {
    runTurn, system: "s", userContent: "q", tools: [],
    executeTool: () => Promise.reject(new Error("skal ikke kalles")),
    clientTools: ["run_code"], turnsPerCall: 8,
  };
  const ev1 = await collect(runProviderAgenticStream(base));
  assertEquals(ev1.find((e) => e.type === "run_code")?.script, "1+1");
  const st = ev1.find((e) => e.type === "continue")?.state as never;
  const ev2 = await collect(runProviderAgenticStream({ ...base, resume: st, runResult: "OK:\n2" }));
  assertEquals(ev2.find((e) => e.type === "text")?.text, "Ferdig");
  assertEquals(ev2.at(-1)?.type, "done");
});
```

Run: `deno test --allow-all netlify/edge-functions/_lib/providers/agentic.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementer (speil av Task 2)**

I `ProviderAgenticOptions`: legg til `clientTools?: string[]; runResult?: string; maxRunCode?: number;`

I `runProviderAgenticStream`, etter `const state: AgenticResumeState = …`-blokken:

```ts
      const clientToolNames = new Set(opts.clientTools ?? []);
      const maxRunCode = opts.maxRunCode ?? 2;
      if (state.pending) {
        if (typeof opts.runResult !== "string") {
          throw new Error("resume med ventende run_code mangler run_result");
        }
        const merged = [...state.pending.results,
          { tool_use_id: state.pending.awaitingId, content: opts.runResult }];
        state.messages.push({
          role: "user",
          content: merged.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content })),
        });
        delete state.pending;
      }
```

(NB: `throw` her må skje inne i try-blokken — flytt pending-håndteringen til rett etter `try {`.)

Erstatt tool_use-grenen (l. 94–120) med samme struktur som Task 2 Step 3: klientverktøy samles i `clientCall`, server-verktøy kjøres som før, og til slutt:

```ts
            if (clientCall) {
              state.pending = { results, awaitingId: clientCall.id };
              emit({ type: "run_code", script: String(clientCall.input.script ?? "") });
              emit({ type: "continue", state, ...(opts.continueExtra?.() ?? {}) });
              controller.close();
              return;
            }
            state.messages.push({
              role: "user",
              content: results.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content })),
            });
            continue;
```

(`results` bygges her som `{ tool_use_id, content }`-par, som i Task 2 — dagens kode pusher ferdige tool_result-objekter; endre til par + map ved push.)

- [ ] **Step 3: Kjør**

Run: `deno test --allow-all netlify/edge-functions/_lib/providers/` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add netlify/edge-functions/_lib/providers/
git commit -m "feat: run_code-protokollen i leverandørløkka (openai-compat/responses)"
```

---

### Task 6: Klientdriveren `runSvarLoop` i `js/ai-chat.js`

**Files:**
- Modify: `js/ai-chat.js`

**Interfaces:**
- Consumes: `/api/svar`-kontrakten (Task 4), eksisterende `consumeSse`, `insertScriptIntoEditor`, `runScriptAndCaptureError`, `providerAuthHeaders`, `providerConfig`, `streamRenderMd`, `confirmAutoRun`, `scrubScript`.
- Produces (brukes av Task 7):
  - `window.mdSvarRun(params)` → `Promise<{markdown, sources}>` der `params = {question, route, depth, mode?, scriptContext?, signal, handlers}` og `handlers = {onDelta(fullText)?, onTurnDiscard(fullText)?, onProgress(ev)?, onRunCode(script) -> Promise<string>}`.
  - `window.mdAskExecuteScript(script, signal)` → `Promise<{ok, result}>` (setter inn + kjører + formaterer run_code-resultatet).
- SLETTES: `runWebAnswer`, `webAnswerWithRepair`, `extractWebScriptBlock` + `WEB_FENCE_LANGS`, `window.mdAskRun`, `aiDepth`/`LS_DEPTH` og alle `aiCfgDepth`-referanser.

- [ ] **Step 1: Skriv runSvarLoop**

Erstatt hele `runWebAnswer` (l. 663–776) med:

```js
      // One full /api/svar run (samlet ask-pipeline). SSE contract
      // (netlify/edge-functions/svar.ts):
      //   progress {text, replace?} — process lines (heartbeats replace in place)
      //   delta {text}              — token delta of the CURRENT assistant turn
      //   turn_discard {}           — deltas so far were an intermediate
      //                               (tool-calling) turn; archive them
      //   run_code {script}         — run client-side, re-POST resume + run_result
      //   continue {state, probed}  — server turn budget spent; re-POST resume
      //   sources {sources: [...]}  — deterministic probe manifest
      //   text {text}               — whole-answer chunk (custom-provider path)
      //   done {usage} / error {message}
      // handlers: onRunCode(script)->Promise<string> is required; onDelta(full),
      // onTurnDiscard(full), onProgress(ev) are optional.
      async function runSvarLoop(params) {
        var handlers = params.handlers || {};
        var mode = params.mode ||
          ((typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python');
        var buffer = '', sources = null, resume = null, runResult = null;
        for (var hop = 0; ; hop++) {
          if (hop > 60) throw new Error('Aborted: the answer was not finished after 60 continuation rounds.');
          var headers = providerAuthHeaders();
          if (resume) headers['X-Svar-Resume'] = '1';
          var resp = await fetch('/api/svar', {
            method: 'POST',
            headers: headers,
            signal: params.signal,
            body: JSON.stringify({
              question: params.question,
              route: params.route,
              mode: mode,
              depth: params.depth || 'standard',
              available_keys: (window.Keys ? window.Keys.registered() : []),
              script: params.scriptContext || undefined,
              resume: resume || undefined,
              run_result: runResult == null ? undefined : runResult,
              provider: providerConfig() || undefined,
            }),
          });
          runResult = null;
          if (resp.status === 401) {
            throw new Error(customProviderReady()
              ? T('AI-leverandøren avviste nøkkelen (401) — sjekk i AI-innstillingene.')
              : T('Ugyldig Anthropic-nøkkel. Sjekk nøkkelen i AI-innstillingene.'));
          }
          if (resp.status === 429) throw new Error('Rate limited — wait a bit and ask again.');
          if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()));

          var cont = null, pendingRun = null;
          await consumeSse(resp, function (ev) {
            if (ev.type === 'continue') { cont = { state: ev.state, probed: ev.probed }; return; }
            if (ev.type === 'run_code') { pendingRun = ev.script || ''; return; }
            if (ev.type === 'delta' || ev.type === 'text') {
              buffer += ev.text;
              if (handlers.onDelta) handlers.onDelta(buffer);
              return;
            }
            if (ev.type === 'turn_discard') {
              if (handlers.onTurnDiscard) handlers.onTurnDiscard(buffer);
              buffer = '';
              if (handlers.onDelta) handlers.onDelta('');
              return;
            }
            if (ev.type === 'sources') { sources = ev.sources; return; }
            if (ev.type === 'progress') { if (handlers.onProgress) handlers.onProgress(ev); return; }
            if (ev.type === 'error') {
              var msg = ev.message || 'unknown server error';
              if (state.anthropicKey && msg.indexOf('Anthropic API error 401') !== -1) {
                msg = T('Ugyldig Anthropic-nøkkel. Sjekk nøkkelen i AI-innstillingene.');
              }
              throw new Error(msg);
            }
          });
          if (pendingRun != null) {
            if (params.signal && params.signal.aborted) {
              throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
            }
            runResult = await handlers.onRunCode(pendingRun);
            resume = cont;   // run_code ender alltid invokasjonen med en continue
            continue;
          }
          if (!cont) break;
          resume = cont;
        }
        return { markdown: buffer, sources: sources };
      }
```

- [ ] **Step 2: Rewire AI-sidepanelet (sendWebMessage)**

Erstatt hele `webAnswerWithRepair` (l. 944–996) med:

```js
      // AI-sidepanelets svar-flyt: samme /api/svar-løp som ask-visningen, men
      // rendret i chat-bobler. Panelet har ingen ruter — full verktøykasse
      // (route 'data') og deep dybde.
      async function panelSvarAnswer(question, thinkingNode, signal) {
        thinkingNode.innerHTML = '';
        const progressBox = document.createElement('div');
        progressBox.className = 'ai-progress';
        thinkingNode.appendChild(progressBox);
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        thinkingNode.appendChild(bubble);
        if (!state.anthropicKey && !customProviderReady()) {
          throw new Error(T('Web-modus krever egen Anthropic-nøkkel eller en konfigurert AI-leverandør.'));
        }
        let confirmed = false;
        let _lastRender = 0;
        const res = await runSvarLoop({
          question: question,
          route: 'data',
          depth: 'deep',
          scriptContext: scrubScript((dom.scriptInput && dom.scriptInput.value) || ''),
          signal: signal,
          handlers: {
            onProgress: function (ev) {
              const last = progressBox.lastElementChild;
              if (ev.replace && last && last.dataset.replace === '1') {
                last.textContent = '⏳ ' + ev.text;
              } else {
                const line = document.createElement('div');
                line.className = 'ai-progress-line';
                if (ev.replace) line.dataset.replace = '1';
                line.textContent = '⏳ ' + ev.text;
                progressBox.appendChild(line);
              }
              scrollToBottom();
            },
            onDelta: function (full) {
              const now = Date.now();
              if (now - _lastRender > 70) {
                _lastRender = now;
                streamRenderMd(bubble, full);
                scrollToBottom();
              }
            },
            onTurnDiscard: function (full) {
              if (full && full.trim()) {
                const line = document.createElement('div');
                line.className = 'ai-progress-line';
                line.textContent = '📝 ' + full.trim().slice(0, 160);
                progressBox.appendChild(line);
              }
              streamRenderMd(bubble, '');
            },
            onRunCode: async function (script) {
              insertScriptIntoEditor(script);
              if (!confirmed) {
                const ok = await confirmAutoRun(signal);
                if (!ok) return 'Brukeren avbrøt kjøringen — skriv sluttsvaret uten kjøring, og si at koden ikke er kjørt.';
                confirmed = true;
              }
              const r = await window.mdAskExecuteScript(script, signal);
              return r.result;
            },
          },
        });
        streamRenderMd(bubble, res.markdown);
        attachCodeBlockActions(bubble);
        bubble._rawMd = res.markdown;
        if (res.sources && res.sources.length) {
          const list = document.createElement('div');
          list.className = 'ai-sources';
          list.innerHTML = '<b>' + T('Kilder:') + '</b> ' + res.sources.map(s =>
            (s.ok ? '✅ ' : '⚠️ ') +
            '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' +
            escapeHtml(s.url.replace(/^https?:\/\//, '').slice(0, 60)) + '</a>' +
            (s.viaProxy ? ' (via proxy)' : '')
          ).join(' · ');
          thinkingNode.appendChild(list);
        }
      }
```

I `sendWebMessage`: erstatt kallet `webAnswerWithRepair(text, thinkingNode, ctrl.signal)` med `panelSvarAnswer(text, thinkingNode, ctrl.signal)` (finn linja med grep — den ligger i try-blokken etter `appendThinking()`).

Merk: `onRunCode` kalles med scriptet UTEN prefix i panelet (proveniens-prefixet er ask-visningens greie) — `mdAskExecuteScript` (Step 3) tar scriptet som gitt.

- [ ] **Step 3: mdAskExecuteScript-seamen + slettinger**

I seam-seksjonen (l. 1437–1492): SLETT hele `window.mdAskRun` og legg inn:

```js
        // Kjør et script via Kjør-knappens vei og formater run_code-
        // verktøyresultatet. Innsetting + kjøring + output-lesing i ett —
        // både ask-visningen og AI-panelet bruker denne.
        window.mdAskExecuteScript = async function (script, signal) {
          insertScriptIntoEditor(script);
          var err = await runScriptAndCaptureError(signal);
          var out = document.getElementById('outputArea');
          var outText = ((out && out.innerText) || '').trim();
          return {
            ok: !err,
            result: err
              ? 'FEIL:\n' + String(err).slice(0, 20000)
              : 'OK. OUTPUT (truncated):\n' + outText.slice(0, 20000),
          };
        };
        window.mdSvarRun = runSvarLoop;
```

SLETT dessuten:
- `extractWebScriptBlock` + `WEB_FENCE_LANGS` (l. 783–797) — scriptet kommer nå fra run_code-inputen, ikke fra markdown-fences.
- `aiDepth`/`LS_DEPTH` (l. 1231–1235), `depth: aiDepth()`-feltet finnes ikke lenger (runSvarLoop tar depth som parameter), `if (dom.aiCfgDepth) dom.aiCfgDepth.value = aiDepth();` i `openSettings` (l. 1276) og tilsvarende lagringslinje i `saveSettings` (grep `aiCfgDepth` — fjern alle treff, inkl. dom-oppslaget der dom-objektet bygges).

- [ ] **Step 4: Kjør node-testene**

Run: `node --test tests/js/`
Expected: PASS — `ai-chat-validators.test.js` tester bare de eksporterte valideringsfunksjonene, som er urørt. Feiler noe her: en sletting traff en eksportert funksjon — gjenopprett den.

- [ ] **Step 5: Commit**

```bash
git add js/ai-chat.js
git commit -m "feat: runSvarLoop-klientdriver; sletter runWebAnswer/webAnswerWithRepair/mdAskRun"
```

---

### Task 7: Ask-visningen — ny flyt, split-knapp, levende output

**Files:**
- Modify: `js/ask-view.js`
- Modify: `index.html` (l. 135–139 input-raden; l. 291–298 Dybde-blokken i settings)
- Modify: `css/ask.css`
- Test: `tests/js/ask-view.test.js`

**Interfaces:**
- Consumes: `window.mdSvarRun`, `window.mdAskExecuteScript` (Task 6), `/api/ask-ruter` (uendret).
- Produces: pure-eksporter for node-test: `parseAskRoute`, `buildAskProvenance`, `coerceAskDepth` (NY). `parseTolkAnswer` SLETTES.

- [ ] **Step 1: Failende node-test**

I `tests/js/ask-view.test.js`: SLETT testene som refererer `parseTolkAnswer`, og legg til (samme import-/assert-stil som filens øvrige tester):

```js
test('coerceAskDepth: kun deep er deep', () => {
  assert.equal(mod.coerceAskDepth('deep'), 'deep');
  assert.equal(mod.coerceAskDepth('fast'), 'standard');
  assert.equal(mod.coerceAskDepth(null), 'standard');
});
```

Run: `node --test tests/js/ask-view.test.js` → Expected: FAIL.

- [ ] **Step 2: index.html-endringene**

Erstatt input-raden (l. 135–139) med:

```html
      <div class="ask-input-row">
        <textarea id="askInput" class="ask-input" rows="2" placeholder="What do you want to find out?"></textarea>
        <div class="ask-send-wrap">
          <button type="button" class="btn btn-primary" id="askSendBtn">Ask</button>
          <button type="button" class="btn btn-primary ask-caret-btn" id="askDepthBtn" aria-label="Choose answer depth"><span class="chevron">▾</span></button>
          <div class="mode-dropdown-menu ask-depth-menu" id="askDepthMenu" hidden>
            <button type="button" data-depth="standard">Standard — quick, few sources</button>
            <button type="button" data-depth="deep">Deep — more sources and patience</button>
          </div>
        </div>
        <button type="button" class="btn" id="askAbortBtn" style="display:none">Stop</button>
      </div>
```

I svarkortet (etter `<div id="askAnswer" …></div>`, l. 142) legg til:

```html
        <div id="askLiveOutput" class="ask-live-output" hidden></div>
```

SLETT hele Dybde-blokken i settings-modalen (l. 291–298, `<div style="margin-bottom:18px;">` med `aiCfgDepth`).

- [ ] **Step 3: Skriv om ask-view.js**

Endringer (behold `parseAskRoute`, `buildAskProvenance`, `sseAccumulate`, `switchToEditor`/`switchToAsk`, `injectTopbarSwitch`, hamburger/copy/new-wiring, `askConfirm`/`confirmChoice`, `renderMd`, `progressLine`, `archiveStatus`, `showAnswer` som de er, unntatt det som nevnes):

1. SLETT `parseTolkAnswer` og `appendRunVisuals` (hele funksjonene).

2. Nye modul-nivå-funksjoner (under `buildAskProvenance`):

```js
  // Dybde for /api/svar: 'standard' er default; velges på split-knappen.
  function coerceAskDepth(v) { return v === 'deep' ? 'deep' : 'standard'; }

  /* Levende output i svarkortet (spec §Output): selve #outputArea-noden
     FLYTTES inn i kortet etter vellykket kjøring (ikke klones) — interaktiv
     plotly og widgets/#@param-re-kjøringer virker der den står. Flyttes
     tilbake ved nytt spørsmål eller bytte til kodevisningen. */
  var outputHome = null;
  function mountLiveOutput() {
    var out = document.getElementById('outputArea');
    var host = document.getElementById('askLiveOutput');
    if (!out || !host || out.dataset.askMounted === '1') return;
    outputHome = { parent: out.parentNode, next: out.nextSibling };
    out.dataset.askMounted = '1';
    host.hidden = false;
    host.appendChild(out);
    window.dispatchEvent(new Event('resize'));
    if (window.Plotly && window.Plotly.Plots) {
      out.querySelectorAll('.js-plotly-plot').forEach(function (p) {
        try { window.Plotly.Plots.resize(p); } catch (_) { /* plotly borte */ }
      });
    }
  }
  function unmountLiveOutput() {
    var out = document.getElementById('outputArea');
    var host = document.getElementById('askLiveOutput');
    if (!out || out.dataset.askMounted !== '1' || !outputHome) return;
    delete out.dataset.askMounted;
    if (host) host.hidden = true;
    outputHome.parent.insertBefore(out, outputHome.next);
    outputHome = null;
    window.dispatchEvent(new Event('resize'));
  }
```

3. `switchToEditor`: legg `unmountLiveOutput();` som FØRSTE linje. `askNewBtn`-handleren: legg `unmountLiveOutput();` først.

4. I `initAskView`: SLETT den tvungne `md_ai_depth='fast'`-blokken (l. 141–144). Legg til dybde-wiring (etter hamburger-wiringen):

```js
    var LS_ASK_DEPTH = 'md_ask_depth';
    function askDepth() {
      try { return coerceAskDepth(localStorage.getItem(LS_ASK_DEPTH)); } catch (e) { return 'standard'; }
    }
    var depthBtn = document.getElementById('askDepthBtn');
    var depthMenu = document.getElementById('askDepthMenu');
    function syncDepthUi() {
      var d = askDepth();
      sendBtn.textContent = d === 'deep' ? 'Ask (deep)' : 'Ask';
      depthMenu.querySelectorAll('button[data-depth]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.depth === d);
      });
    }
    depthBtn.addEventListener('click', function (e) { e.stopPropagation(); depthMenu.hidden = !depthMenu.hidden; });
    document.addEventListener('click', function (e) {
      if (!depthMenu.hidden && !depthMenu.contains(e.target) && e.target !== depthBtn) depthMenu.hidden = true;
    });
    depthMenu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-depth]');
      if (!b) return;
      try { localStorage.setItem(LS_ASK_DEPTH, b.dataset.depth); } catch (_) {}
      depthMenu.hidden = true;
      syncDepthUi();
    });
    syncDepthUi();
```

5. Kildeliste-hjelper (i initAskView, ved `renderMd`):

```js
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function renderSources(list) {
      if (!list || !list.length) return;
      var div = document.createElement('div');
      div.className = 'ai-sources';
      div.innerHTML = '<b>Sources:</b> ' + list.map(function (s) {
        return (s.ok ? '✅ ' : '⚠️ ') +
          '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
          esc(s.url.replace(/^https?:\/\//, '').slice(0, 60)) + '</a>' +
          (s.viaProxy ? ' (via proxy)' : '');
      }).join(' · ');
      answerBox.appendChild(div);
    }
```

6. ERSTATT hele `runAskFlow` med:

```js
    async function runAskFlow() {
      var question = input.value.trim();
      if (!question || running) return;
      if (!window.mdAiHasKey || !window.mdAiHasKey()) {
        showAnswer('Ask needs your own API key (stored only in this browser; usage is billed to your own account).', 'API key required', true);
        if (window.mdOpenAiSettings) window.mdOpenAiSettings();
        return;
      }
      running = true;
      sendBtn.disabled = true;
      abortBtn.style.display = '';
      unmountLiveOutput();
      answerCard.hidden = false;
      statusBox.innerHTML = '';
      answerBox.innerHTML = '';
      processBox.innerHTML = '';
      detailsEl.hidden = true;
      detailsEl.open = false;
      lastAnswerMd = '';
      var ctrl = new AbortController();
      var onAbort = function () { ctrl.abort(); };
      abortBtn.addEventListener('click', onAbort);
      var uiLang = (window.M2PY_LANG === 'en') ? 'en' : 'no';
      try {
        // 1) Ruter (uendret): rute + operasjonell tolkning.
        progressLine('Interpreting the question …');
        var route = { rute: 'data', tolkning: '', begrunnelse: '', svar: '' };
        try {
          var resp = await fetch('/api/ask-ruter', {
            method: 'POST',
            headers: window.mdAiAuthHeaders(),
            signal: ctrl.signal,
            body: JSON.stringify({ question: question, ui_lang: uiLang, provider: window.mdAiProviderConfig() || undefined }),
          });
          if (resp.ok && resp.body) route = parseAskRoute(await sseAccumulate(resp, null, ctrl.signal));
        } catch (e) { if (e && e.name === 'AbortError') throw e; /* ruterfeil → data-ruten */ }
        progressLine('Route: ' + route.rute + '. Interpretation: ' + (route.tolkning || '—'));

        // 2) Språk-ruten: direkte svar med merking, ingen kode (uendret).
        if (route.rute === 'språk') {
          showAnswer(route.svar || 'This question could not be formalized, and the router gave no direct answer.',
            '⚠ Not verified with code or data — plain model answer', true);
          return;
        }

        // 3) Ett agentisk løp: /api/svar med run_code som klientverktøy.
        var fullQuestion = question +
          (route.tolkning ? '\n\nOperational interpretation (from the router): ' + route.tolkning : '');
        var prefix = buildAskProvenance({ question: question, tolkning: route.tolkning, rute: route.rute },
          currentAskMode());
        var confirm = confirmChoice();
        var confirmed = false;
        var lastRunOk = false;
        var res = await window.mdSvarRun({
          question: fullQuestion,
          route: route.rute,
          depth: askDepth(),
          mode: currentAskMode(),
          signal: ctrl.signal,
          handlers: {
            onProgress: function (ev) {
              var last = statusBox.lastElementChild;
              if (ev.replace && last && last.dataset && last.dataset.replace === '1') {
                last.textContent = '⏳ ' + ev.text;
                return;
              }
              var line = document.createElement('div');
              line.className = 'ai-progress-line';
              if (ev.replace) line.dataset.replace = '1';
              line.textContent = '⏳ ' + ev.text;
              statusBox.appendChild(line);
            },
            onDelta: function (full) { renderMd(answerBox, full); },
            onTurnDiscard: function (full) {
              if (!full || !full.trim()) return;
              var d = document.createElement('div');
              d.className = 'ai-progress-line';
              d.textContent = '📝 ' + full.trim().slice(0, 200);
              statusBox.appendChild(d);
            },
            onRunCode: async function (script) {
              if (!confirmed) {
                var ok = await confirm();
                if (!ok) {
                  ctrl.abort();
                  throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
                }
                confirmed = true;
              }
              progressLine('Running the code …');
              var r = await window.mdAskExecuteScript(prefix + script, ctrl.signal);
              lastRunOk = r.ok;
              return r.result;
            },
          },
        });

        // 4) Sluttsvaret er allerede strømmet inn — arkiver prosess-sporet,
        //    vis kilder, og monter levende output ved vellykket kjøring.
        if (lastRunOk) {
          showAnswer(res.markdown, null, false);
          renderSources(res.sources);
          mountLiveOutput();
        } else {
          showAnswer(res.markdown,
            res.sources && res.sources.length
              ? '⚠ Source-based answer — the code did not run successfully'
              : null,
            true);
          renderSources(res.sources);
        }
      } catch (e) {
        if (e && e.name === 'AbortError') { progressLine('Stopped.'); archiveStatus(); }
        else showAnswer('✗ ' + ((e && e.message) ? e.message : String(e)) +
          '\n\nThis is usually a transient stream error — try asking again.', 'Error', true);
      } finally {
        abortBtn.removeEventListener('click', onAbort);
        abortBtn.style.display = 'none';
        sendBtn.disabled = false;
        running = false;
      }
    }
```

7. `showAnswer`: SLETT de to siste linjene som flytter `.ai-sources` fra processBox (kildene rendres nå direkte av `renderSources`).

8. module.exports: `{ parseAskRoute: parseAskRoute, buildAskProvenance: buildAskProvenance, coerceAskDepth: coerceAskDepth }`.

- [ ] **Step 4: ask.css**

SLETT `.ask-figure`- og `.ask-table-wrap`-reglene (l. 23–26) og kommentaren over dem; oppdater off-screen-kommentaren (l. 15–18) til:

```css
/* Editor-/output-panelene ligger usynlig off-screen med ekte bredde MENS
   kjøringen pågår (plotly trenger ekte bredde). Etter vellykket kjøring
   FLYTTES #outputArea inn i svarkortet (levende — widgets og interaktiv
   plotly virker); den flyttes hjem ved nytt spørsmål / bytte til kode. */
```

Legg til nederst:

```css
/* Split-knappen Ask ▾ (gjenbruker .mode-dropdown-menu for menyen) */
.ask-send-wrap { position: relative; display: flex; }
.ask-send-wrap #askSendBtn { border-top-right-radius: 0; border-bottom-right-radius: 0; white-space: nowrap; }
.ask-caret-btn { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: 1px; padding: 6px 8px; }
.ask-depth-menu { position: absolute; right: 0; bottom: 100%; margin-bottom: 6px; min-width: 240px; }
.ask-depth-menu[hidden] { display: none; }

/* Levende output i svarkortet */
.ask-live-output { margin-top: 12px; }
.ask-live-output[hidden] { display: none; }
.ask-live-output #outputArea { max-height: 560px; overflow: auto; }
```

- [ ] **Step 5: Kjør node-testene**

Run: `node --test tests/js/`
Expected: PASS (inkl. den nye coerceAskDepth-testen; ask-view.test.js har ingen parseTolkAnswer-referanser igjen).

- [ ] **Step 6: Commit**

```bash
git add js/ask-view.js index.html css/ask.css tests/js/ask-view.test.js
git commit -m "feat: ask-visningen på /api/svar — split-knapp Ask/Deep, levende output, tolk/kloning slettet"
```

---

### Task 8: Prompt-dokumenter og opprydding

**Files:**
- Create: `netlify/edge-functions/prompts/svar.md`
- Delete: `netlify/edge-functions/prompts/data-svar.md`, `netlify/edge-functions/prompts/tolk-ask.md`
- Modify: `netlify/edge-functions/prompts/ask-ruter.md` (kun changelog-notat)

- [ ] **Step 1: Skriv `prompts/svar.md`**

Innhold: header som i data-svar.md («.md-filen er source of truth for prompt-TEKSTEN; TS-konstantene i `_lib/svar-prompt.ts` er det som sendes — hold synkront»), deretter blokkene ordrett fra Task 3 (INTRO m/ ny fase 3, DEPTH_STANDARD, DEPTH_DEEP, DELIVERY, QUERYLOGIC, SCIENCE, INLINE, MULTI, MODE_PY/R/DUCK uten Svarformat + interaktivitetslinja, SEARCH_HINTS, RUN, REFORM, PARTIAL, INTRO_CALC, INTRO_LOOKUP, MEMORY_URLS) og en «Montering per rute»-tabell + changelog-seksjon med dagens dato og lenke til spec-en. Kopiér blokktekstene fra `svar-prompt.ts` (ikke omskriv dem — synk-kravet er byte-nært for blokkinnholdet).

- [ ] **Step 2: Slett gamle dokumenter + changelog-notat**

```bash
git rm netlify/edge-functions/prompts/data-svar.md netlify/edge-functions/prompts/tolk-ask.md
```

I `prompts/ask-ruter.md`: legg én changelog-linje: «2026-07-29: pipeline samlet — rutene sendes nå til /api/svar (spec 2026-07-29-samlet-ask-pipeline-design); ruterprompten uendret.»

- [ ] **Step 3: Sjekk at ingenting refererer de døde filene**

Run: `grep -rn "data-svar\|tolk-ask" --include="*.ts" --include="*.js" --include="*.toml" netlify/ js/ index.html | grep -v "_lib/svar-prompt\|svar.ts:"`
Expected: ingen treff utenom historiske kommentarer i docs/. Fjern eventuelle gjenlevende kodereferanser.

- [ ] **Step 4: Commit**

```bash
git add -A netlify/edge-functions/prompts/
git commit -m "docs: prompts/svar.md source-of-truth; data-svar/tolk-ask-dokumentene slettet"
```

---

### Task 9: Ende-til-ende-verifisering (evalsett + smoke + widgets)

**Files:**
- Modify: `docs/eval/ask-evalsett.md` (ny målingstabell)

Dette er verifiserings-gaten fra spec §Verifisering. Ingen mocking — ekte nøkkel fra `.env`, ekte kilder.

- [ ] **Step 1: Full testsuite**

Run: `deno test --allow-all netlify/edge-functions/_lib/ && node --test tests/js/`
Expected: PASS begge.

- [ ] **Step 2: Restart dev-server + 400-smoke**

```bash
kill $(lsof -ti tcp:8899) 2>/dev/null; sleep 1
(cd /Users/hom/Documents/GitHub/askstat && npx netlify dev --port 8899 &) && sleep 15
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8899/api/svar -H "Content-Type: application/json" -d '{}'
```
Expected: `400` (Missing question — beviser at ny edge-kode er lastet; netlify dev cacher edge-TS-moduler, derav restart). Sjekk også at `/api/tolk-ask` nå gir 404.

- [ ] **Step 3: Playwright-eval Q1–Q10**

Kjør eval-settet i `docs/eval/ask-evalsett.md` med playwright-pluginen mot `http://localhost:8899` (nøkkel: inject `localStorage.md_keys = JSON.stringify({anthropic: "<fra .env>"})` som i forrige kjøring; aldri echo nøkkelen). Per spørsmål: noter rute, latens, PASS/FAIL, antall run_code-kall. Suksesskriterier (spec):
- data-ruten (Q4–Q6): **< 90 s** per spørsmål, riktig innhold (Q5 skal IKKE gi tall fra korrupt uttrekk — modellen ser nå outputen selv).
- beregning (Q1–Q3): ≤ 35 s, ingen regresjon.
- oppslag/språk (Q7–Q10): ≤ 15 s; Q7–Q8 skal fortsatt sitere kilde-URL.

- [ ] **Step 4: Widget-røyk (nytt)**

Spørsmål: «Simulate how 100 000 kr grows over 30 years — let me adjust the interest rate.» Forventet: beregning-ruten, svar med levende `#@param`-slider i svarkortet; dra slideren → kjøringen re-kjøres og figuren oppdateres I KORTET. Verifiser også at «Code & output»-pillen flytter outputen tilbake og at nytt spørsmål tømmer kortet.

- [ ] **Step 5: Oppdater eval-dokumentet + commit**

Legg ny tabell i `docs/eval/ask-evalsett.md` (dato, per-spørsmål latens før/etter, run_code-antall, funn). Nye feilmønstre → egne F-punkter som før.

```bash
git add docs/eval/ask-evalsett.md
git commit -m "eval: før/etter-målinger for samlet pipeline (Q1-Q10 + widget-røyk)"
```

- [ ] **Step 6: Rapportér til Hans**

Ikke push. Oppsummer: latens-tabellen før/etter, hva som ble slettet, kjente avvik. Hans beslutter push/deploy.

---

## Self-review-notater (kjørt ved planskriving)

- **Spec-dekning**: dataflyt (Task 1–2, 4, 6), ruter/prompts (3), reparasjon-i-løpet (2+6), ratelimit per spørsmål (4), split-knapp + dybde ut av settings (6–7), levende output + kloning slettet (7), sletteliste (4, 6–8), verifisering (9). Alle spec-punkter har en task.
- **Typekonsistens**: `pending.results` er `{tool_use_id, content}`-par begge steder; `Depth = "standard"|"deep"` overalt (gammel `"fast"` coerces til standard); `mdSvarRun`/`mdAskExecuteScript` navngis likt i Task 6 (produsent) og 7 (konsument).
- **Kjent risiko 1**: strømmet rekonstruksjon av server_tool_use/web_search_tool_result-blokker ved `pause_turn`-replay. Mitigering: blokkene bevares fra `content_block_start` + kjente deltatyper; Task 9 Step 3 (Q7–Q8 bruker websøk) verifiserer mot ekte API.
- **Kjent risiko 2**: Netlify-invokasjonstak med `turnsPerCall: 8`. Mitigering: continuation-protokollen består som backstop; heartbeat + deltaer holder strømmen i live. Observeres drops i Task 9: senk til 4 før andre tiltak.
- **Kjent risiko 3**: `#@param`-re-kjøring skriver til `#outputArea` mens den står i svarkortet — noden er den samme, så re-render lander riktig; verifiseres eksplisitt i Task 9 Step 4.
