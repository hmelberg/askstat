// OpenAI Responses API adapter (spec A6): native hosted web_search + server-
// side conversation state. Non-streaming per hop by design — the hop model and
// the edge-generated SSE progress are reused unchanged; provider-side
// streaming is a later optimization, not a capability gap. State contract:
// prevResponseId carries the stored-conversation id through the client resume
// round-trip; each follow-up sends ONLY the pending function_call_output items.
import { type AgenticResumeState, fetchWithRetry, type RetryDeps } from "../anthropic.ts";
import { type ProviderConfig, scrubKey } from "./config.ts";
import type { ProviderTurnResult, RunTurn, TurnOpts } from "./agentic.ts";
import { erTokenTakFeil, senketTak } from "./fallback.ts";
import type { Stopp } from "../sse-util.ts";

function toResponsesTools(anthropicTools: unknown[]): unknown[] {
  const fns = (anthropicTools as Record<string, unknown>[]).map((t) => ({
    type: "function",
    name: t.name,
    description: t.description ?? "",
    parameters: t.input_schema ?? { type: "object", properties: {} },
  }));
  return [...fns, { type: "web_search" }];
}

/** null = uparsbare argumenter (typisk et avkortet verktøykall). */
function safeParseJson(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch (_) {
    return null;
  }
}

/** Responses-status → normalisert stopp (terminalkontrakten i sse-util.ts).
 *  status "incomplete" med reason max_output_tokens = avkortet; reason
 *  content_filter = avvist. «failed» kommer normalt som HTTP-feil. */
function stoppFra(json: Record<string, unknown>): Stopp {
  if (json?.status !== "incomplete") return "end";
  const reason = (json.incomplete_details as Record<string, unknown> | undefined)?.reason;
  return reason === "content_filter" ? "refusal" : "max_tokens";
}

async function throwUpstream(resp: Response, cfg: ProviderConfig, hadTools: boolean): Promise<never> {
  const detail = await resp.text().catch(() => "");
  console.error(`LLM provider error ${resp.status}: ${scrubKey(detail, cfg.key)}`);
  if (resp.status === 400 && /store|previous_response/i.test(detail)) {
    throw new Error("leverandøren støtter ikke lagret samtaletilstand (store) — bruk typen openai-kompatibel i stedet");
  }
  if (resp.status === 400 && hadTools && /tool/i.test(detail)) {
    throw new Error("svar krever en modell med verktøystøtte (tool-calling) — leverandøren avviste tools-parameteren");
  }
  throw new Error(`Leverandørfeil ${resp.status}`);
}

/** POST /responses; en 400 om for høyt output-tak får ÉTT nytt forsøk med
 *  taket feilmeldingen oppgir (eller uten parameteren) — som openai-compat. */
// deno-lint-ignore no-explicit-any
async function postResponses(
  cfg: ProviderConfig,
  body: Record<string, unknown>,
  hadTools: boolean,
  deps: RetryDeps | undefined,
): Promise<any> {
  const post = (b: Record<string, unknown>) =>
    fetchWithRetry(`${cfg.baseUrl}/responses`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.key}` },
      body: JSON.stringify(b),
    }, deps);
  let resp = await post(body);
  if (!resp.ok && resp.status === 400) {
    const detail = await resp.clone().text().catch(() => "");
    const ny = erTokenTakFeil(detail) ? senketTak(body, "max_output_tokens", detail) : null;
    if (ny) resp = await post(ny);
  }
  if (!resp.ok) await throwUpstream(resp, cfg, hadTools);
  return await resp.json();
}

function parseOutput(json: Record<string, unknown>): ProviderTurnResult {
  const outItems = (Array.isArray(json?.output) ? json.output : []) as Record<string, unknown>[];
  const searchNotes = outItems
    .filter((o) => o.type === "web_search_call")
    .map((o) => {
      const action = (o.action ?? {}) as Record<string, unknown>;
      return `🔎 Websøk: ${String(action.query ?? "").slice(0, 120)}`;
    });
  const parsed = outItems
    .filter((o) => o.type === "function_call")
    .map((o) => ({
      id: String(o.call_id ?? ""),
      name: String(o.name ?? ""),
      input: safeParseJson(o.arguments),
    }));
  let stopp = stoppFra(json);
  if (stopp === "end" && parsed.some((t) => t.input === null)) stopp = "max_tokens";
  const toolUses = parsed.map((t) => ({ ...t, input: t.input ?? {} }));
  const text = outItems
    .filter((o) => o.type === "message")
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []) as Record<string, unknown>[])
    .filter((c) => c.type === "output_text")
    .map((c) => String(c.text ?? ""))
    .join("");
  const usage = (json?.usage ?? {}) as Record<string, number>;
  return {
    text,
    toolUses,
    searchNotes,
    stop: stopp !== "end" ? stopp : toolUses.length ? "tool_use" : "end",
    usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 },
    responseId: String(json?.id ?? ""),
  };
}

export function makeOpenAiResponsesTurn(cfg: ProviderConfig): RunTurn {
  return async (state: AgenticResumeState, opts: TurnOpts): Promise<ProviderTurnResult> => {
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_output_tokens: opts.maxTokens,
      stream: false,
      store: true,
      tools: toResponsesTools(opts.tools),
    };
    // instructions på HVER tur: OpenAI viderefører dem IKKE over
    // previous_response_id (dokumentert), så tur 2+ mistet hele
    // systemprompten (review 2026-10-10).
    body.instructions = opts.system;
    if (state.prevResponseId) {
      body.previous_response_id = state.prevResponseId;
      const last = state.messages[state.messages.length - 1] as Record<string, unknown>;
      const blocks = (Array.isArray(last?.content) ? last.content : []) as Record<string, unknown>[];
      body.input = blocks
        .filter((b) => b.type === "tool_result")
        .map((b) => ({ type: "function_call_output", call_id: b.tool_use_id, output: String(b.content ?? "") }));
    } else {
      const first = state.messages[0] as Record<string, unknown>;
      body.input = typeof first?.content === "string" ? first.content : "";
    }
    return parseOutput(await postResponses(cfg, body, true, opts.deps));
  };
}

/** Single text turn without tools — tolk-resultat (spec A5). store:false: no
 *  follow-up will reference this response, so nothing needs persisting. */
export async function messageOpenAiResponses(
  cfg: ProviderConfig,
  o: { system: string; prompt: string; maxTokens: number },
  deps?: RetryDeps,
): Promise<{ text: string; stop: Stopp; usage: { inputTokens: number; outputTokens: number } }> {
  const parsed = parseOutput(await postResponses(cfg, {
    model: cfg.model,
    max_output_tokens: o.maxTokens,
    stream: false,
    store: false,
    instructions: o.system,
    input: o.prompt,
  }, false, deps));
  const stop: Stopp = parsed.stop === "max_tokens" || parsed.stop === "refusal" ? parsed.stop : "end";
  return { text: parsed.text, stop, usage: parsed.usage };
}
