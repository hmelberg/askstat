// Avkorting/strømfeil skal ALDRI meldes som suksess (review 2026-10-10, port
// av microdata aa5892c). Kontrakten (se toppen av sse-util.ts): hver strøm
// ender med NØYAKTIG ett terminal-event — `done` ved suksess, ellers
// `{type:"error", code?, message}`. Avkorting = code "AVKORTET".
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runAgenticStream, transformAnthropicStream } from "./anthropic.ts";
import { errorEvent, SseFeil, singleTextStream } from "./sse-util.ts";
import { runProviderAgenticStream, type ProviderTurnResult } from "./providers/agentic.ts";
import { makeOpenAiCompatTurn, messageOpenAiCompat } from "./providers/openai-compat.ts";
import { makeOpenAiResponsesTurn, messageOpenAiResponses } from "./providers/openai-responses.ts";
import type { ProviderConfig } from "./providers/config.ts";
import type { AgenticResumeState } from "./anthropic.ts";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
  const text = await new Response(stream).text();
  return text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
}

function sseUpstream(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
}

const textTurn = (text: string, stop: string | null) => [
  { type: "message_start", message: { usage: { input_tokens: 3 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index: 0 },
  ...(stop ? [{ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 2 } }] : []),
  ...(stop ? [{ type: "message_stop" }] : []),
];

function terminal(events: Record<string, unknown>[]) {
  const t = events.filter((e) => e.type === "done" || e.type === "error" || e.type === "continue");
  assertEquals(t.length, 1, "nøyaktig ett terminal-event: " + JSON.stringify(events));
  return t[0];
}

// ── sse-util ───────────────────────────────────────────────────────────────
Deno.test("singleTextStream: stop max_tokens → text + error AVKORTET, aldri done", async () => {
  const ev = await collect(singleTextStream("Halv", { inputTokens: 1, outputTokens: 2 }, "max_tokens"));
  assertEquals(ev[0], { type: "text", text: "Halv" });
  const t = terminal(ev);
  assertEquals(t.type, "error");
  assertEquals(t.code, "AVKORTET");
});

Deno.test("errorEvent: SseFeil gir code + ren melding; vanlig feil uten code", () => {
  assertEquals(errorEvent(new SseFeil("AVKORTET", "kuttet")), { type: "error", code: "AVKORTET", message: "kuttet" });
  const e = errorEvent(new Error("boom"));
  assertEquals(e.type, "error");
  assertEquals("code" in e, false);
});

// ── transformAnthropicStream (single-shot Anthropic) ──────────────────────
Deno.test("transformAnthropicStream: end_turn → done", async () => {
  const ev = await collect(transformAnthropicStream(sseUpstream(textTurn("ok", "end_turn")), "sk-ant-testtesttest"));
  assertEquals(terminal(ev).type, "done");
});

Deno.test("transformAnthropicStream: max_tokens → error AVKORTET (ikke done)", async () => {
  const ev = await collect(transformAnthropicStream(sseUpstream(textTurn("halv", "max_tokens")), "sk-ant-testtesttest"));
  assertEquals(ev[0], { type: "text", text: "halv" });
  const t = terminal(ev);
  assertEquals(t.type, "error");
  assertEquals(t.code, "AVKORTET");
});

Deno.test("transformAnthropicStream: refusal → error AVVIST", async () => {
  const ev = await collect(transformAnthropicStream(sseUpstream(textTurn("x", "refusal")), "sk-ant-testtesttest"));
  assertEquals(terminal(ev).code, "AVVIST");
});

Deno.test("transformAnthropicStream: midt-strøm error-event → error STROMFEIL", async () => {
  const up = [...textTurn("x", null), { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }];
  const ev = await collect(transformAnthropicStream(sseUpstream(up), "sk-ant-testtesttest"));
  const t = terminal(ev);
  assertEquals(t.type, "error");
  assertEquals(t.code, "STROMFEIL");
});

Deno.test("transformAnthropicStream: strøm brutt uten stop_reason → error STROMFEIL", async () => {
  const ev = await collect(transformAnthropicStream(sseUpstream(textTurn("x", null)), "sk-ant-testtesttest"));
  assertEquals(terminal(ev).code, "STROMFEIL");
});

// ── runAgenticStream (native løkke) ───────────────────────────────────────
function agentic(stop: string | null) {
  return collect(runAgenticStream({
    apiKey: "sk-ant-testtesttest", model: "m", system: "s", userContent: "q", tools: [], turnsPerCall: 9,
    executeTool: () => Promise.resolve(""),
    deps: { fetchImpl: (() => Promise.resolve(new Response(sseUpstream(textTurn("tekst", stop)), { status: 200 }))) as unknown as typeof fetch },
  }));
}

Deno.test("runAgenticStream: max_tokens på sluttur → error AVKORTET, ingen done", async () => {
  const t = terminal(await agentic("max_tokens"));
  assertEquals(t.type, "error");
  assertEquals(t.code, "AVKORTET");
});

Deno.test("runAgenticStream: refusal → AVVIST; tom stop_reason → STROMFEIL; end_turn → done", async () => {
  assertEquals(terminal(await agentic("refusal")).code, "AVVIST");
  assertEquals(terminal(await agentic(null)).code, "STROMFEIL");
  assertEquals(terminal(await agentic("end_turn")).type, "done");
  assertEquals(terminal(await agentic("stop_sequence")).type, "done");
});

// ── leverandørløkka ────────────────────────────────────────────────────────
Deno.test("runProviderAgenticStream: stop max_tokens → error AVKORTET", async () => {
  const turn: ProviderTurnResult = { text: "halv", toolUses: [], searchNotes: [], stop: "max_tokens",
    usage: { inputTokens: 1, outputTokens: 1 } };
  const ev = await collect(runProviderAgenticStream({
    runTurn: () => Promise.resolve(turn), system: "S", userContent: "Q", tools: [],
    executeTool: () => Promise.resolve(""), turnsPerCall: 2,
  }));
  const t = terminal(ev);
  assertEquals(t.type, "error");
  assertEquals(t.code, "AVKORTET");
  assertEquals(ev.some((e) => e.type === "text"), false);
});

// ── adaptere ───────────────────────────────────────────────────────────────
const COMPAT: ProviderConfig = { type: "openai-compat", baseUrl: "https://llm.example/v1", model: "m", key: "sk-proj-abc123XYZ", webSearch: "none" };
const RESP: ProviderConfig = { type: "openai-responses", baseUrl: "https://api.openai.example/v1", model: "m", key: "sk-proj-abc123XYZ", webSearch: "native" };
const fresh = (): AgenticResumeState => ({ messages: [{ role: "user", content: "Q" }], turn: 0, clientCalls: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });
function seqFetch(responses: { status: number; body: unknown }[], bodies: Record<string, unknown>[] = []): typeof fetch {
  let i = 0;
  return ((_u: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const r = responses[Math.min(i++, responses.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  }) as typeof fetch;
}

Deno.test("openai-compat: finish_reason length → stop max_tokens (tur og single)", async () => {
  const body = { choices: [{ message: { content: "halv" }, finish_reason: "length" }], usage: {} };
  const r = await makeOpenAiCompatTurn(COMPAT)(fresh(), { system: "S", tools: [], maxTokens: 9, deps: { fetchImpl: seqFetch([{ status: 200, body }]) } });
  assertEquals(r.stop, "max_tokens");
  const s = await messageOpenAiCompat(COMPAT, { system: "S", prompt: "P", maxTokens: 9 }, { fetchImpl: seqFetch([{ status: 200, body }]) });
  assertEquals(s.stop, "max_tokens");
});

Deno.test("openai-compat: uparsbare verktøyargumenter → stop max_tokens; content_filter → refusal", async () => {
  const body = { choices: [{ message: { content: "", tool_calls: [{ id: "c", function: { name: "run_code", arguments: '{"script":"x = ' } }] }, finish_reason: "tool_calls" }] };
  const r = await makeOpenAiCompatTurn(COMPAT)(fresh(), { system: "S", tools: [{ name: "run_code" }], maxTokens: 9, deps: { fetchImpl: seqFetch([{ status: 200, body }]) } });
  assertEquals(r.stop, "max_tokens");
  const cf = { choices: [{ message: { content: "" }, finish_reason: "content_filter" }] };
  const s = await messageOpenAiCompat(COMPAT, { system: "S", prompt: "P", maxTokens: 9 }, { fetchImpl: seqFetch([{ status: 200, body: cf }]) });
  assertEquals(s.stop, "refusal");
});

Deno.test("openai-compat: 400 «max_tokens … at most 8192» → ett nytt forsøk med senket tak", async () => {
  const bodies: Record<string, unknown>[] = [];
  const s = await messageOpenAiCompat(COMPAT, { system: "S", prompt: "P", maxTokens: 16384 }, {
    fetchImpl: seqFetch([
      { status: 400, body: { error: { message: "Invalid max_tokens value, the valid range of max_tokens is [1, 8192]" } } },
      { status: 200, body: { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] } },
    ], bodies),
  });
  assertEquals(s.text, "ok");
  assertEquals(bodies.length, 2);
  assertEquals(bodies[1].max_tokens, 8192);
});

Deno.test("openai-responses: status incomplete → stop max_tokens (tur og single)", async () => {
  const body = { id: "r1", status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "message", content: [{ type: "output_text", text: "halv" }] }], usage: {} };
  const r = await makeOpenAiResponsesTurn(RESP)(fresh(), { system: "S", tools: [], maxTokens: 9, deps: { fetchImpl: seqFetch([{ status: 200, body }]) } });
  assertEquals(r.stop, "max_tokens");
  const s = await messageOpenAiResponses(RESP, { system: "S", prompt: "P", maxTokens: 9 }, { fetchImpl: seqFetch([{ status: 200, body }]) });
  assertEquals(s.stop, "max_tokens");
  const cf = { ...body, incomplete_details: { reason: "content_filter" } };
  const s2 = await messageOpenAiResponses(RESP, { system: "S", prompt: "P", maxTokens: 9 }, { fetchImpl: seqFetch([{ status: 200, body: cf }]) });
  assertEquals(s2.stop, "refusal");
});

Deno.test("openai-responses: instructions sendes på HVER tur (også med previous_response_id)", async () => {
  const bodies: Record<string, unknown>[] = [];
  const st = fresh();
  st.prevResponseId = "resp_1";
  st.messages.push({ role: "assistant", content: [{ type: "tool_use", id: "c1", name: "probe", input: {} }] });
  st.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "ok" }] });
  await makeOpenAiResponsesTurn(RESP)(st, { system: "SYS", tools: [], maxTokens: 9,
    deps: { fetchImpl: seqFetch([{ status: 200, body: { id: "r2", status: "completed", output: [] } }], bodies) } });
  assertEquals(bodies[0].previous_response_id, "resp_1");
  assertEquals(bodies[0].instructions, "SYS");
  assert(Array.isArray(bodies[0].input));
});
