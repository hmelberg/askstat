const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function apiTarget(apiBase?: string): { url: string; init: Pick<RequestInit, "redirect"> } {
  return apiBase
    ? { url: `${apiBase}/messages`, init: { redirect: "error" } }
    : { url: ANTHROPIC_API, init: {} };
}

// With apiBase set, the upstream is a user-chosen gateway rather than
// api.anthropic.com — its error `detail` could echo the request back
// (including the x-api-key header), so scrub the key out before it is
// logged. No-op for the default path (empty/undefined key never matches).
function scrubDetail(detail: string, key: string): string {
  return key ? detail.split(key).join("***") : detail;
}

export interface AnthropicStreamOptions {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  // Optional cached system prefix. When set, it is sent as a `system` block
  // with a cache_control breakpoint so the (large, stable) prefix is billed
  // at cache-read rates on repeat requests instead of full input rates.
  system?: string;
  // Cache TTL for the system block. "1h" needs the extended-cache-ttl beta
  // header; "5m" (default) is GA. Ignored when `system` is unset.
  cacheTtl?: "5m" | "1h";
  // Tier 1 (spec A1/A3): anthropic-compat base-URL override. Convention:
  // everything before the endpoint name — we call `${apiBase}/messages`.
  // Custom bases get redirect:"error" (a redirecting LLM API is abnormal and
  // could leak the auth header); the default path is left byte-for-byte as-is.
  apiBase?: string;
}

export interface StreamEvent {
  type: "text" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  message?: string;
}

const ANTHROPIC_TIMEOUT_MS = 30_000;
const ANTHROPIC_RETRIES = 2;

export interface RetryDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
}

/**
 * POST with an abort timeout and retry/backoff on 429 (rate limited) and 529
 * (overloaded). Honours a numeric Retry-After when present. Network errors are
 * retried too; the final error propagates. Injectable for tests.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  deps: RetryDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retries = deps.retries ?? ANTHROPIC_RETRIES;
  const timeoutMs = deps.timeoutMs ?? ANTHROPIC_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetchImpl(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if ((resp.status === 429 || resp.status === 529) && attempt < retries) {
        const ra = parseInt(resp.headers.get("retry-after") ?? "", 10);
        const delay = Number.isFinite(ra) && ra > 0
          ? Math.min(ra * 1000, 10_000)
          : Math.min(1000 * 2 ** attempt, 8000);
        await sleep(delay);
        continue;
      }
      return resp;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (attempt < retries) {
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export async function streamAnthropic(
  opts: AnthropicStreamOptions,
): Promise<ReadableStream<Uint8Array>> {
  const useLongTtl = opts.cacheTtl === "1h";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (opts.system && useLongTtl) {
    headers["anthropic-beta"] = "extended-cache-ttl-2025-04-11";
  }

  const requestBody: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2000,
    stream: true,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.system) {
    requestBody.system = [
      {
        type: "text",
        text: opts.system,
        cache_control: useLongTtl
          ? { type: "ephemeral", ttl: "1h" }
          : { type: "ephemeral" },
      },
    ];
  }

  const target = apiTarget(opts.apiBase);
  const upstream = await fetchWithRetry(target.url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    ...target.init,
  });

  if (!upstream.ok || !upstream.body) {
    // Log the upstream detail server-side, but do NOT echo it to the client
    // (it can contain account/key diagnostics). Callers surface a generic 502.
    const detail = await upstream.text().catch(() => "");
    console.error(`Anthropic API error ${upstream.status}: ${scrubDetail(detail, opts.apiKey)}`);
    throw new Error(`Anthropic API error ${upstream.status}`);
  }

  return transformAnthropicStream(upstream.body);
}

export interface AnthropicMessageResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

/**
 * Single, non-streaming completion. Used by the v2 variable-picker pass, which
 * needs the full result (a JSON array of variable names) before generation can
 * start. Reuses fetchWithRetry for timeout + 429/529 backoff. `deps` is
 * injectable for tests.
 */
export async function messageAnthropic(
  opts: AnthropicStreamOptions,
  deps: RetryDeps = {},
): Promise<AnthropicMessageResult> {
  const useLongTtl = opts.cacheTtl === "1h";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (opts.system && useLongTtl) {
    headers["anthropic-beta"] = "extended-cache-ttl-2025-04-11";
  }
  const requestBody: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    stream: false,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.system) {
    requestBody.system = [
      {
        type: "text",
        text: opts.system,
        cache_control: useLongTtl ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
      },
    ];
  }

  const target = apiTarget(opts.apiBase);
  const resp = await fetchWithRetry(
    target.url,
    { method: "POST", headers, body: JSON.stringify(requestBody), ...target.init },
    deps,
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error(`Anthropic API error ${resp.status}: ${scrubDetail(detail, opts.apiKey)}`);
    throw new Error(`Anthropic API error ${resp.status}`);
  }
  const json = await resp.json();
  const text = Array.isArray(json?.content)
    ? json.content.filter((b: { type?: string }) => b?.type === "text")
        .map((b: { text?: string }) => b.text ?? "").join("")
    : "";
  const u = json?.usage ?? {};
  return {
    text,
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}

function transformAnthropicStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx;
          while ((nlIdx = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
                const out: StreamEvent = { type: "text", text: obj.delta.text };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
              } else if (obj.type === "message_start" && obj.message?.usage) {
                inputTokens = obj.message.usage.input_tokens ?? 0;
                cacheReadTokens = obj.message.usage.cache_read_input_tokens ?? 0;
                cacheCreationTokens = obj.message.usage.cache_creation_input_tokens ?? 0;
              } else if (obj.type === "message_delta" && obj.usage) {
                outputTokens = obj.usage.output_tokens ?? outputTokens;
              }
            } catch (_e) {
              // ignore non-JSON event data
            }
          }
        }
        // Drain any residual buffer content not yet terminated by \n\n
        if (buffer.trim()) {
          buffer += "\n\n";
          let nlIdx;
          while ((nlIdx = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
                const out: StreamEvent = { type: "text", text: obj.delta.text };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
              } else if (obj.type === "message_start" && obj.message?.usage) {
                inputTokens = obj.message.usage.input_tokens ?? 0;
                cacheReadTokens = obj.message.usage.cache_read_input_tokens ?? 0;
                cacheCreationTokens = obj.message.usage.cache_creation_input_tokens ?? 0;
              } else if (obj.type === "message_delta" && obj.usage) {
                outputTokens = obj.usage.output_tokens ?? outputTokens;
              }
            } catch (_e) {
              // ignore non-JSON event data
            }
          }
        }
        const done: StreamEvent = {
          type: "done",
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
      } catch (e) {
        const err: StreamEvent = { type: "error", message: String(e) };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(err)}\n\n`));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

// ── Agentic tool loop (Web mode / svar) ───────────────────────────────────
// Each turn is streamed; text deltas forward live as {type:"delta", text}.
// A turn that ends in tool_use had its text as scratch work only — it is
// followed by {type:"turn_discard"} so the client can drop it. The final
// turn's deltas ARE the answer; there is no separate {type:"text"} emission.
// Hosted tools (web_search) run inside the API; stop_reason "pause_turn" is
// resumed.

export interface AgenticOptions {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
  tools: unknown[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  progressLabel?: (name: string, input: Record<string, unknown>) => string;
  maxTokens?: number;
  cacheTtl?: "5m" | "1h";
  apiBase?: string;
  maxClientToolCalls?: number;
  maxTurns?: number;
  // Continuation protocol: Netlify caps CPU per edge invocation, so a run
  // that needs many API turns must be split across invocations. When the
  // per-call turn budget (turnsPerCall, default 1) is spent without a final
  // answer, the stream ends with {type:"continue", state, ...continueExtra()}
  // and the client re-POSTs with `resume` = that state.
  resume?: AgenticResumeState;
  turnsPerCall?: number;
  continueExtra?: () => Record<string, unknown>;
  // Klientutførte verktøy (run_code, get_pack — kontekstrunden fase 2 §4):
  // verktøykall med disse navnene utføres IKKE av executeTool. run_code
  // emitteres som {type:"run_code", script} og get_pack som
  // {type:"get_pack", id}, begge fulgt av {type:"continue", state}
  // (state.pending husker HVILKET verktøy og hva vi venter på). Klienten
  // re-POST-er med resume + run_result (run_code) eller get_pack_result
  // (get_pack) — se resume-fletten i start() lenger ned.
  clientTools?: string[];
  runResult?: string;
  getPackResult?: { id: string; text: string };
  maxRunCode?: number;
  // get_pack har EGEN budsjett-teller (state.getPackCalls), atskilt fra
  // run_code sin runCalls/maxRunCode (funn ved review 2026-08-06: delt
  // teller tømte run_code-budsjettet på 1-2 pakke-hentinger, uten at
  // modellen fikk kjørt kode i det hele tatt). Default 5 (pakkesplitting
  // 2026-08-07: et spørsmål kan trenge 2–3 enkeltkilder pluss re-henting).
  maxGetPack?: number;
  deps?: RetryDeps;
}

// Everything the loop needs to pick up where a previous invocation stopped.
// Round-trips through the client verbatim; contains only the question, tool
// results and model output — never the system prompt or API keys.
export interface AgenticResumeState {
  messages: Record<string, unknown>[];
  turn: number;
  clientCalls: number;
  // openai-responses (spec A6): server-side samtaletilstand — bare id-en
  // rundtures via klienten; meldingsarrayet bærer da kun siste tool-results.
  prevResponseId?: string;
  runCalls?: number;
  // getPackCalls: EGEN teller for get_pack (review-fiks 2026-08-06) — holdes
  // atskilt fra runCalls slik at pakke-henting aldri spiser av run_code sitt
  // budsjett. Må rekonstrueres av svar.ts på lik linje med runCalls. Default
  // 5 (pakkesplitting 2026-08-07: et spørsmål kan trenge 2–3 enkeltkilder
  // pluss re-henting).
  getPackCalls?: number;
  // name: hvilket klientverktøy vi venter på ('run_code'/'get_pack') —
  // avgjør hvilket resume-felt (runResult/getPackResult) som fletter inn
  // svaret. expectedId: for get_pack, id-en som ble forespurt — resume MÅ
  // levere get_pack_result med SAMME id (kontekstrunden fase 2 §4).
  pending?: {
    results: { tool_use_id: string; content: string }[];
    awaitingId: string;
    name?: string;
    expectedId?: string;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

// Long final generations (multi-tool-call context, big final script) can
// exceed a 90s non-streaming turn. 180s trades a longer worst-case wait for
// fewer AbortErrors; the proper future fix is streaming the final turn
// instead of buffering it whole.
const AGENTIC_TIMEOUT_MS = 180_000;

// Netlify/CDN kills streamed responses that go silent for too long (~40-60s).
// Non-streaming API turns are exactly such silent windows, so while a turn is
// in flight we emit a progress event every 10s. `replace: true` tells the
// client to update the previous progress line in place instead of appending.
const HEARTBEAT_MS = 10_000;

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
// ── PDF-vedleggs-saniteringen (issue #4, målt eval-rundene 7-8) ──────────────
// web_fetch av en PDF legger et dokument i assistant-historikken; på neste
// API-kall validerer Anthropic dokumentet på nytt og avviser hele kallet
// («The PDF specified was not valid» — 2/2 deterministisk i runde 8, hele
// svaret tapt). Kuren: konverter det ugyldige dokument-resultatet til
// web_fetch-verktøyets DOKUMENTERTE feilform ({type: web_fetch_tool_error})
// — skjemagyldig på rundtur, og modellen ser et ærlig «unavailable» i
// stedet for at strømmen dør.

// Matcher både stream-feilens fulle sti (runde 7) og HTTP 400-detaljen
// (runde 8, nå med i feilteksten fra streamOneTurn).
export const PDF_FEIL_RE = /The PDF specified was not valid|\.pdf\.source|document\.source\.base64/i;

function harPdfDokument(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.media_type === "application/pdf") return true;
  return Object.values(o).some((x) =>
    x && typeof x === "object" && harPdfDokument(x));
}

function tilFeilform(blokk: Record<string, unknown>): boolean {
  if (blokk.type !== "web_fetch_tool_result" || !harPdfDokument(blokk.content)) return false;
  blokk.content = { type: "web_fetch_tool_error", error_code: "unavailable" };
  return true;
}

export function sanitizePdfBlocks(
  messages: Record<string, unknown>[],
  feiltekst: string,
): number {
  let endret = 0;
  // Feilens sti («messages.1.content.2.…») peker på den skyldige blokka —
  // prøv den kirurgisk først, så fallback-sveip (stien kan mangle, f.eks.
  // når bare «The PDF specified was not valid» overlevde til kalleren).
  const m = /messages\.(\d+)\.content\.(\d+)/.exec(feiltekst);
  if (m) {
    const innhold = messages[Number(m[1])]?.content;
    const blokk = Array.isArray(innhold) ? innhold[Number(m[2])] : undefined;
    if (blokk && tilFeilform(blokk as Record<string, unknown>)) endret++;
  }
  if (!endret) {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue;
      for (const blokk of msg.content) {
        if (blokk && typeof blokk === "object" &&
            tilFeilform(blokk as Record<string, unknown>)) endret++;
      }
    }
  }
  return endret;
}

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
    // Detaljen MÅ med i selve feilen (skrubbet): PDF-vedleggs-retryen i
    // agentloopen klassifiserer på teksten («The PDF specified was not
    // valid») — runde 8 målte at bare statuskoden nådde kalleren, så
    // 400-klassen var usynlig for retry-logikk (issue #4).
    throw new Error(`Anthropic API error ${resp.status}: ${scrubDetail(detail, apiKey).slice(0, 300)}`);
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

export function runAgenticStream(opts: AgenticOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const maxClientCalls = opts.maxClientToolCalls ?? 12;
  const maxTurns = opts.maxTurns ?? 24;
  const deps: RetryDeps = { timeoutMs: AGENTIC_TIMEOUT_MS, ...opts.deps };
  const target = apiTarget(opts.apiBase);
  const useLongTtl = opts.cacheTtl === "1h";

  return new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      };
      if (useLongTtl) headers["anthropic-beta"] = "extended-cache-ttl-2025-04-11";
      const system = [{
        type: "text",
        text: opts.system,
        cache_control: useLongTtl ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
      }];

      const state: AgenticResumeState = opts.resume ?? {
        messages: [{ role: "user", content: opts.userContent }],
        turn: 0,
        clientCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      };
      const turnsPerCall = opts.turnsPerCall ?? 1;
      const clientToolNames = new Set(opts.clientTools ?? []);
      const maxRunCode = opts.maxRunCode ?? 2;
      const maxGetPack = opts.maxGetPack ?? 5;
      // A pause_turn segment's text is scratch work just like a tool_use
      // segment's — but turnHadText is scoped per for-iteration, so text
      // streamed before a pause_turn would otherwise be forgotten by the time
      // the continued segment (often tool_use with no new text of its own) is
      // handled, silently skipping the turn_discard that should drop it from
      // the client's answer buffer. carryHadText remembers it across
      // pause_turn continuations within this run.
      let carryHadText = false;

      try {
        // Resume etter run_code/get_pack: flett klientens resultat inn som
        // tool_result sammen med eventuelle server-verktøyresultater fra samme tur.
        if (state.pending) {
          let pendingContent: string;
          if (state.pending.name === "get_pack") {
            const gp = opts.getPackResult;
            if (!gp || typeof gp.text !== "string" || typeof gp.id !== "string") {
              throw new Error("resume med ventende get_pack mangler get_pack_result");
            }
            if (gp.id !== state.pending.expectedId) {
              throw new Error("get_pack_result.id samsvarer ikke med utestående forespørsel");
            }
            // Server-side vern (review-funn 2026-08-06): tom text ville gitt
            // en tom tool_result-content-blokk, som Messages-API-et avviser
            // med 400 — dødelig for HELE svaret. Klienten setter allerede en
            // markørstreng ved ukjent id (js/ai-chat.js), men denne fanger
            // ALLE veier inn (fremtidige klienter, manipulert payload).
            pendingContent = gp.text.slice(0, 40_000) || "(fant ikke pakken — svar med det du har)";
          } else {
            if (typeof opts.runResult !== "string") {
              throw new Error("resume med ventende run_code mangler run_result");
            }
            pendingContent = opts.runResult;
          }
          const merged = [...state.pending.results,
            { tool_use_id: state.pending.awaitingId, content: pendingContent }];
          state.messages.push({
            role: "user",
            content: merged.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content })),
          });
          delete state.pending;
        }
        for (let i = 0; i < turnsPerCall; i++) {
          if (state.turn >= maxTurns) throw new Error("tool-loopen nådde maks antall turer");
          const turnLabel = state.turn === 0
            ? "🧠 Tolker spørsmålet og planlegger"
            : `🤔 Arbeider med svaret (tur ${state.turn + 1})`;
          emit({ type: "progress", text: `${turnLabel} …`, replace: true });
          const turnStart = Date.now();
          // Heartbeat trengs bare til første delta — deretter holder deltaene
          // SSE-strømmen i live.
          let sawDelta = false;
          let turnHadText = false;
          const beat = setInterval(() => {
            if (sawDelta) return;
            const s = Math.round((Date.now() - turnStart) / 1000);
            try {
              emit({ type: "progress", text: `${turnLabel} … (${s} s)`, replace: true });
            } catch (_) { /* stream already closed */ }
          }, HEARTBEAT_MS);
          let turn: TurnResult;
          try {
            const kjorTur = () => streamOneTurn(target, headers, {
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
            try {
              turn = await kjorTur();
            } catch (e) {
              // Issue #4: et web_fetch-hentet PDF-dokument i historikken
              // avvises på rundturen og dreper ellers HELE svaret. Sanitér
              // og prøv ÉN gang til uten vedlegget — degradering, ikke død.
              const msg = String(e);
              if (!PDF_FEIL_RE.test(msg) || sanitizePdfBlocks(state.messages, msg) === 0) throw e;
              emit({ type: "progress",
                text: "⚠️ Et hentet PDF-dokument ble avvist av API-et — fjerner vedlegget og prøver igjen" });
              turn = await kjorTur();
            }
          } finally {
            clearInterval(beat);
          }
          state.turn++;
          state.usage.inputTokens += turn.usage.inputTokens;
          state.usage.outputTokens += turn.usage.outputTokens;
          state.usage.cacheReadTokens += turn.usage.cacheReadTokens;
          state.usage.cacheCreationTokens += turn.usage.cacheCreationTokens;
          const content = turn.content;

          // Hosted tools (web_search/web_fetch) run inside the API and are
          // otherwise invisible to the user — surface what was searched/read.
          for (const b of content) {
            if (b?.type !== "server_tool_use") continue;
            const inp = (b.input ?? {}) as Record<string, unknown>;
            const what = String(inp.query ?? inp.url ?? "").slice(0, 120);
            emit({
              type: "progress",
              text: b.name === "web_fetch" ? `🌐 Leser ${what}` : `🔎 Websøk: ${what}`,
            });
          }

          if (turn.stopReason === "pause_turn") {
            state.messages.push({ role: "assistant", content });
            carryHadText = carryHadText || turnHadText;
            continue;
          }
          const toolUses = content.filter(
            (b: { type?: string }): b is { type: string; id: string; name: string; input?: Record<string, unknown> } =>
              b.type === "tool_use",
          );
          if (turn.stopReason === "tool_use" && toolUses.length) {
            state.messages.push({ role: "assistant", content });
            if (turnHadText || carryHadText) emit({ type: "turn_discard" });
            carryHadText = false;
            const results: { tool_use_id: string; content: string }[] = [];
            let clientCall: { id: string; name: string; input: Record<string, unknown> } | null = null;
            for (const tu of toolUses) {
              if (clientToolNames.has(tu.name)) {
                // get_pack har EGEN teller (getPackCalls) — review-funn
                // 2026-08-06: en delt teller med run_code tømte
                // kjørebudsjettet etter 1-2 pakke-hentinger, uten at
                // modellen fikk kjørt kode i det hele tatt.
                if (tu.name === "get_pack") {
                  state.getPackCalls = (state.getPackCalls ?? 0) + 1;
                  if (state.getPackCalls > maxGetPack) {
                    results.push({ tool_use_id: tu.id, content:
                      "get_pack-budsjettet er brukt opp — bruk det du allerede har, eller skriv sluttsvaret NÅ." });
                  } else if (clientCall) {
                    results.push({ tool_use_id: tu.id, content: "Kall ett klientverktøy (run_code/get_pack) én gang per tur." });
                  } else {
                    clientCall = { id: tu.id, name: tu.name, input: (tu.input ?? {}) as Record<string, unknown> };
                  }
                } else {
                  state.runCalls = (state.runCalls ?? 0) + 1;
                  if (state.runCalls > maxRunCode) {
                    results.push({ tool_use_id: tu.id, content:
                      "Kjøre-budsjettet er brukt opp — skriv sluttsvaret NÅ basert på det du allerede vet. Vær ærlig om hva som ikke ble verifisert." });
                  } else if (clientCall) {
                    results.push({ tool_use_id: tu.id, content: "Kall ett klientverktøy (run_code/get_pack) én gang per tur." });
                  } else {
                    clientCall = { id: tu.id, name: tu.name, input: (tu.input ?? {}) as Record<string, unknown> };
                  }
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
              if (clientCall.name === "get_pack") {
                // Samme id-regel som coercePacks i svar-prompt.ts (id ≤100,
                // [A-Za-z0-9:_-]) — sanert HER, ikke bare der: id-en
                // rundtures i state.pending.expectedId og valideres av
                // svar.ts sin validResumeState (review-funn 2026-08-06). En
                // usanert modell-emittert id ville fått SERVERENS EGEN
                // continue-token avvist på neste hop.
                const id = String(clientCall.input.id ?? "")
                  .replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 100);
                state.pending = { results, awaitingId: clientCall.id, name: "get_pack", expectedId: id };
                emit({ type: "get_pack", id });
              } else {
                state.pending = { results, awaitingId: clientCall.id, name: "run_code" };
                emit({ type: "run_code", script: String(clientCall.input.script ?? "") });
              }
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
          // Final answer — its deltas were already forwarded live above.
          carryHadText = false;
          emit({ type: "done", ...state.usage });
          controller.close();
          return;
        }
        // Turn budget for THIS invocation spent without a final answer: hand
        // the state back so the client can continue in a fresh invocation.
        emit({ type: "continue", state, ...(opts.continueExtra?.() ?? {}) });
        controller.close();
        return;
      } catch (e) {
        emit({ type: "error", message: String(e) });
        controller.close();
      }
    },
  });
}
