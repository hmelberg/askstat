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
const MAX_TOKENS = 6_000;         // en DEL er sjelden >3k tegn — hele poenget
                                   // med seksjonsrunden; 16k-enkeltstrøm fikk
                                   // ikke plass i edge-vinduet (målt 2026-08-14)

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
3. Returner KUN de delene som endres, som hele nye deler: "prefix"
   (maskinfeltene øverst — endres KUN når feilen beviselig sitter der),
   "hode" (tittel/innledning), "kort" (## Kort-blokken) eller "guide" (alle
   øvrige seksjoner). Deler du ikke nevner, står urørt. Endre færrest mulige
   deler — aldri send en uendret del på nytt. Er dokumentets guide-del svært
   stor (over ~15 000 tegn) og endringen ligger der: ikke re-emitter hele
   guiden — beskriv i stedet endringen presist i "melding" (hvilken
   linje/påstand som bør endres, og til hva), så brukeren kan gjøre den i
   editoren.
4. Ærlig tomt svar er gyldig: ligger feilen i modellens kodevaner eller i en
   innebygd kilde du ikke har fått teksten til, skal "forslag" være tom og
   "melding" forklare hvorfor. Dikt ALDRI en endring for å ha noe å levere.
5. Kildetekstens språk følger dokumentet; "melding" og "begrunnelse" skrives
   på UI-språket angitt i forespørselen.
6. Ved TIDLIGERE RUNDER i forespørselen: brukerens tilbakemelding overstyrer
   ditt forrige forslag — juster, ikke gjenta.
7. Vurder EKSPLISITT hvilket LAG endringen hører hjemme i: feil kildeVALG →
   \`## Kort\`-seksjonen; feil BRUK av riktig kilde → \`## Guide\`-seksjonen.
   Navngi laget i "begrunnelse".
8. Mangler \`## Kort\` i originalen, generer den som egen "kort"-del (2–4
   setninger destillert fra langversjonen). I dokumenter UTEN ## Kort-
   overskrift regnes FØRSTE prosa-avsnitt som dagens kort-del — en ny
   kort-del ERSTATTER det avsnittet, så innarbeid innholdet dets.

KODESAK

Peker evidensen på selve appen/adapterne (f.eks. en målt serverfeil
beskrivelsen ikke kan påvirke): gjør INGEN tekstendring for det problemet —
beskriv det i stedet i feltet "kode_sak": {"tittel": "<kort>", "kropp":
"<strukturert bestilling til en kode-KI som senere får repoet: hva feilet,
hva virket, mistenkt kilde/adapter, antatt mekanisme, foreslått retning —
ALDRI kodeforslag>"}. Utelat feltet ellers. Siter relevant linje/påstand fra
referansedokumentet når det finnes.

REFERANSE-DOKUMENTER

Forespørselen kan inneholde seksjonen REFERANSE: INNEBYGDE KILDER — appens
egne beskrivelser av innebygde datakilder. De er LESE-referanse: bruk dem til
å diagnostisere, og SITER relevant innhold i "melding" og "kode_sak"
(«beskrivelsen sier X, loggen viser Y»). Foreslå endringer i et innebygd
dokument KUN når forespørselen har ADMIN-linjen OG evidensen peker på en
faktisk feil i dokumentet (feil URL, parameter eller påstand) — bruk da
id-formen "builtin:<kilde-id>" i forslaget, med deler som i SVARFORMAT (kun
de delene som endres). Uten ADMIN-linjen: aldri builtin-forslag; kodefeil
går fortsatt til kode_sak.

OPPGAVEMODUS KORT

Står det OPPGAVE: KORT i forespørselen, er jobben KUN \`## Kort\`-seksjonen:
finnes den, revider den i lys av resten av dokumentet; mangler den,
destiller en ny fra langversjonen. Svar med nøyaktig én del: {"del": "kort",
"ny_tekst": "<hele den nye ## Kort-blokken>"}.

SVARFORMAT

Svar med et kort resonnement (maks 5 setninger) etterfulgt av NØYAKTIG én
fenced json-blokk, sist i svaret:

\`\`\`json
{"forslag": [{"id": "<kilde-id fra forespørselen>", "deler": [{"del": "kort" | "guide" | "hode" | "prefix", "ny_tekst": "<HELE den nye delen, inkl. overskrift>"}], "begrunnelse": "<1-3 setninger>"}], "melding": "<kort oppsummering, eller hvorfor ingen endring>", "kode_sak": {"tittel": "...", "kropp": "..."}}
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
  const oppgave = body.oppgave === "kort" ? "kort" : undefined;
  body.oppgave = oppgave;
  if (!oppgave && (typeof body.question !== "string" || !body.question.trim())) {
    return new Response("question mangler", { status: 400 });
  }
  if (typeof body.question !== "string") body.question = "";
  if (!Array.isArray(body.runs)) body.runs = [];

  // ref_docs/admin: ukjente felt fra klienten, koerces til trygg form —
  // ugyldige ref_docs droppes stille (ingen feilrespons for dette).
  const REF_ID_RE = /^[a-z0-9_-]{1,32}$/;
  body.admin = body.admin === true;
  body.ref_docs = Array.isArray(body.ref_docs)
    ? body.ref_docs
      .filter((d): d is { id: string; text: string } =>
        !!d && typeof d.id === "string" && REF_ID_RE.test(d.id) &&
        typeof d.text === "string" && !!d.text)
      .slice(0, 3)
      .map((d) => ({ id: d.id, text: d.text.slice(0, 8_000) }))
    : undefined;

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
