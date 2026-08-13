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

\`\`\`json
{"forslag": [{"id": "<kilde-id fra forespørselen>", "ny_tekst": "<full revidert tekst>", "begrunnelse": "<1-3 setninger>"}], "melding": "<kort oppsummering, eller hvorfor ingen endring>"}
\`\`\``;

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
