// Signert resume-state for /api/svar (review 2026-10-10, rate-limit-bypass).
//
// Problemet: continuation-hops (X-Svar-Resume: 1) telles i den rause
// "svar-hop"-bøtta (600/t) i stedet for "svar" (60/t). Resume-staten var
// usignert, så en FERSK spørring kunne sendes som en forfalsket resume-state
// (eget spørsmål i state.messages) og slippe unna spørsmålsbøtta.
//
// Kuren: serveren legger en HMAC på hver state den sender ut i et
// `continue`-event (`state.mac = "<exp>.<hex>"`, gyldig RESUME_TTL_MS).
// Klienten ekkoer staten uendret (js/ai-chat.js: cont = {state: ev.state, …}),
// så ingen klientendring trengs. Et hop med ugyldig/utløpt/manglende mac
// AVVISES IKKE — det telles bare i "svar"-bøtta som et nytt spørsmål. Det er
// ikke-brytende (en hemmelighetsrotasjon midt i et løp koster ett
// spørsmålstikk, ikke et dødt svar).
//
// Nøkkelen: env SVAR_RESUME_SECRET hvis satt (anbefalt), ellers AVLEDET fra
// eksisterende server-hemmeligheter (ANTHROPIC_API_KEY / M2PY_ACCESS_TOKEN)
// via SHA-256 med egen domene-etikett — stabil på tvers av isolater og
// deploys uten en ny påkrevd env-variabel, og nøkkelen selv forlater aldri
// serveren. Finnes ingen av dem (ren BYOK-deploy uten serverhemmeligheter),
// er signering av og hop-bøtta oppfører seg som før (dokumentert restrisiko:
// da brukes uansett brukerens egen nøkkel, ikke serverens).
//
// MAC-en dekker JSON.stringify(state uten mac) + exp. Rundturen
// JSON.parse/JSON.stringify bevarer nøkkelrekkefølge og tall eksakt, så
// klientens ekko gir samme bytes.

export const RESUME_TTL_MS = 2 * 60 * 60 * 1000;

const enc = new TextEncoder();

export async function resumeKey(getEnv: (k: string) => string | undefined): Promise<CryptoKey | null> {
  const eksplisitt = getEnv("SVAR_RESUME_SECRET") ?? "";
  let material: Uint8Array<ArrayBuffer>;
  if (eksplisitt) {
    material = enc.encode(eksplisitt);
  } else {
    const a = getEnv("ANTHROPIC_API_KEY") ?? "";
    const t = getEnv("M2PY_ACCESS_TOKEN") ?? "";
    if (!a && !t) return null;
    material = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`svar-resume-mac-v1|${a}|${t}`)));
  }
  return await crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function utenMac(state: Record<string, unknown>): Record<string, unknown> {
  const { mac: _mac, ...rest } = state;
  return rest;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function macFor(key: CryptoKey, state: Record<string, unknown>, exp: number): Promise<string> {
  const data = enc.encode(`${exp}|${JSON.stringify(utenMac(state))}`);
  return hex(await crypto.subtle.sign("HMAC", key, data));
}

/** Kopi av staten med `mac` satt. */
export async function signState(
  key: CryptoKey,
  state: Record<string, unknown>,
  now = Date.now(),
): Promise<Record<string, unknown>> {
  const exp = now + RESUME_TTL_MS;
  return { ...utenMac(state), mac: `${exp}.${await macFor(key, state, exp)}` };
}

/** true = staten er utstedt av denne serveren og ikke utløpt. */
export async function verifyState(
  key: CryptoKey,
  state: unknown,
  now = Date.now(),
): Promise<boolean> {
  if (!state || typeof state !== "object") return false;
  const s = state as Record<string, unknown>;
  if (typeof s.mac !== "string") return false;
  const m = /^(\d{1,16})\.([0-9a-f]{64})$/.exec(s.mac);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now)) return false;
  const sig = new Uint8Array(m[2].match(/../g)!.map((h) => parseInt(h, 16)));
  const data = enc.encode(`${exp}|${JSON.stringify(utenMac(s))}`);
  return await crypto.subtle.verify("HMAC", key, sig, data);
}

/** SSE-gjennomstrømning som signerer `state` i hvert continue-event. */
export function signContinueEvents(
  stream: ReadableStream<Uint8Array>,
  key: CryptoKey | null,
  now: () => number = Date.now,
): ReadableStream<Uint8Array> {
  if (!key) return stream;
  const encoder = new TextEncoder();
  const dec = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      const flush = async (raw: string) => {
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        if (dataLine) {
          try {
            const obj = JSON.parse(dataLine.slice(5).trim());
            if (obj?.type === "continue" && obj.state && typeof obj.state === "object") {
              obj.state = await signState(key, obj.state, now());
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              return;
            }
          } catch { /* uparsbart: send urørt */ }
        }
        controller.enqueue(encoder.encode(raw + "\n\n"));
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const ev = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            await flush(ev);
          }
        }
        if (buffer.trim()) await flush(buffer.trimEnd());
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

/** true = dette hopet skal OGSÅ telles i "svar"-bøtta (som et nytt
 *  spørsmål): det er et hop, signering er aktiv, og staten er ikke vår. */
export async function hopMaTellesSomSporsmal(
  erHop: boolean,
  key: CryptoKey | null,
  state: unknown,
  now = Date.now(),
): Promise<boolean> {
  if (!erHop || !key) return false;
  return !(await verifyState(key, state, now));
}
