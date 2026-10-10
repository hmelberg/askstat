// ── SSE-TERMINALKONTRAKT (review 2026-10-10, port av microdata aa5892c) ─────
// Gjelder ALLE AI-endepunktenes strømmer (svar, ask-ruter, tolk-resultat,
// kilde-forslag), uansett leverandør:
//
//   1. Strømmen ender med NØYAKTIG ett terminal-event:
//        {type:"done", inputTokens, outputTokens, …}   — suksess, svaret er helt
//        {type:"error", message, code?}                 — alt annet
//      (svar kan i stedet ende med {type:"continue", state} — et hop, ikke
//      et svar.) `done` og `error` sendes aldri i samme strøm.
//   2. Avkortet svar (Anthropic stop_reason "max_tokens", OpenAI
//      finish_reason "length", Responses status "incomplete", uparsbare
//      verktøyargumenter) gir ALDRI `done`, men
//        {type:"error", code:"AVKORTET", message:"Svaret ble avkortet …"}
//      Tekst-/delta-events som alt er sendt står — klienten kan vise den
//      delvise teksten med et «avkortet»-merke.
//   3. code:"AVVIST"    — modellen/leverandøren nektet (stop_reason "refusal",
//                         finish_reason "content_filter").
//      code:"STROMFEIL" — oppstrøms-strømmen feilet midt i (in-stream
//                         {"type":"error"}) eller ble brutt uten stop_reason.
//      Ingen code       — øvrige feil (HTTP-feil oppstrøms, verktøy-loop-
//                         grenser, …); meldingen er skrubbet for nøkler.
//   4. En strøm som slutter UTEN terminal-event er en brutt forbindelse og
//      skal behandles som feil av klienten.
export type SseFeilkode = "AVKORTET" | "AVVIST" | "STROMFEIL";

/** Feil med en terminal-kode fra kontrakten over. */
export class SseFeil extends Error {
  code: SseFeilkode;
  constructor(code: SseFeilkode, message: string) {
    super(message);
    this.name = "SseFeil";
    this.code = code;
  }
}

/** Avkortingsmeldingene — delt av den native løkka, leverandørløkka og
 *  single-shot-strømmene, så brukeren får SAMME forklaring uansett leverandør. */
export const AVKORTET_MIDT_I_SVARET =
  "Svaret ble avkortet: modellen nådde token-taket midt i svaret. Still spørsmålet enklere, eller be om et kortere svar.";
export const AVKORTET_UNDER_TENKING =
  "Modellen brukte hele token-budsjettet på å tenke uten å begynne på svaret. Still spørsmålet enklere, eller velg et raskere kvalitetsnivå.";
export const AVVIST_MELDING =
  "Modellen eller leverandøren avbrøt svaret (avvisning/innholdsfilter). Prøv å omformulere spørsmålet.";
export const STROM_BRUTT =
  "Strømmen fra modellen ble brutt før svaret var ferdig. Prøv igjen.";

/** Stoppårsak normalisert på tvers av leverandører. */
export type Stopp = "end" | "max_tokens" | "refusal";

/** SseFeil for en ikke-vellykket stoppårsak, ellers null. */
export function feilForStopp(stop: Stopp, hadText = true): SseFeil | null {
  if (stop === "max_tokens") {
    return new SseFeil("AVKORTET", hadText ? AVKORTET_MIDT_I_SVARET : AVKORTET_UNDER_TENKING);
  }
  if (stop === "refusal") return new SseFeil("AVVIST", AVVIST_MELDING);
  return null;
}

/** Bygg et error-event etter kontrakten. `scrub` renser meldingsteksten. */
export function errorEvent(
  e: unknown,
  scrub: (s: string) => string = (s) => s,
): Record<string, unknown> {
  if (e instanceof SseFeil) return { type: "error", code: e.code, message: scrub(e.message) };
  return { type: "error", message: scrub(String(e)) };
}

/** Wrap a completed (non-streamed) answer as the standard SSE event pair, so
 *  provider paths that buffer the whole reply reuse the client's stream path.
 *  stop ≠ "end" gir text + error (AVKORTET/AVVIST) i stedet for done. */
export function singleTextStream(
  text: string,
  usage: Record<string, number>,
  stop: Stopp = "end",
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const feil = feilForStopp(stop, !!text);
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`));
      const term = feil ? errorEvent(feil) : { type: "done", ...usage };
      c.enqueue(enc.encode(`data: ${JSON.stringify(term)}\n\n`));
      c.close();
    },
  });
}

// SSE pass-through that injects one synthetic event immediately before the
// `done` event (used for the deterministic source manifest in svar).
export function injectBeforeDone(
  stream: ReadableStream<Uint8Array>,
  makeEvent: () => Record<string, unknown> | null,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      const flushEvent = (raw: string) => {
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        if (dataLine) {
          try {
            const obj = JSON.parse(dataLine.slice(5).trim());
            if (obj?.type === "done") {
              const extra = makeEvent();
              if (extra) controller.enqueue(enc.encode(`data: ${JSON.stringify(extra)}\n\n`));
            }
          } catch { /* pass through unparseable events untouched */ }
        }
        controller.enqueue(enc.encode(raw + "\n\n"));
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            flushEvent(buffer.slice(0, idx));
            buffer = buffer.slice(idx + 2);
          }
        }
        if (buffer.trim()) flushEvent(buffer.trimEnd());
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
