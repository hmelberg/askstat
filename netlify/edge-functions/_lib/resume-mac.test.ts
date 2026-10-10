import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hopMaTellesSomSporsmal, RESUME_TTL_MS, resumeKey, signContinueEvents, signState, verifyState } from "./resume-mac.ts";
import { rebuildResumeState, validResumeState } from "../svar.ts";

const env = (m: Record<string, string>) => (k: string) => m[k];
const state = () => ({
  messages: [{ role: "user", content: "Hva er «BNP» i 2023? æøå  " }],
  turn: 1, clientCalls: 0, runCalls: 1,
  usage: { inputTokens: 10, outputTokens: 2.5, cacheReadTokens: 0, cacheCreationTokens: 0 },
});

Deno.test("resumeKey: eksplisitt secret, avledet fra serverhemmeligheter, ellers null", async () => {
  assertEquals((await resumeKey(env({ SVAR_RESUME_SECRET: "s3cret" }))) !== null, true);
  assertEquals((await resumeKey(env({ ANTHROPIC_API_KEY: "sk-ant-x" }))) !== null, true);
  assertEquals((await resumeKey(env({ M2PY_ACCESS_TOKEN: "tok" }))) !== null, true);
  assertEquals(await resumeKey(env({})), null);
});

Deno.test("signState/verifyState: overlever klientens JSON-rundtur; forfalskning og utløp avvises", async () => {
  const key = (await resumeKey(env({ ANTHROPIC_API_KEY: "sk-ant-x" })))!;
  const signed = await signState(key, state(), 1_000);
  const ekko = JSON.parse(JSON.stringify(signed));
  assertEquals(await verifyState(key, ekko, 2_000), true);
  // Fersk spørring forkledd som resume: endret spørsmål → ugyldig.
  const forfalsket = { ...ekko, messages: [{ role: "user", content: "nytt spørsmål" }] };
  assertEquals(await verifyState(key, forfalsket, 2_000), false);
  // Uten mac / søppel-mac / utløpt.
  assertEquals(await verifyState(key, state(), 2_000), false);
  assertEquals(await verifyState(key, { ...ekko, mac: "1.abc" }, 2_000), false);
  assertEquals(await verifyState(key, ekko, 1_000 + RESUME_TTL_MS + 1), false);
  // Annen nøkkel (rotert secret) → ugyldig.
  const annen = (await resumeKey(env({ SVAR_RESUME_SECRET: "annen" })))!;
  assertEquals(await verifyState(annen, ekko, 2_000), false);
});

Deno.test("signert state passerer validResumeState, og rebuildResumeState dropper mac", async () => {
  const key = (await resumeKey(env({ SVAR_RESUME_SECRET: "s" })))!;
  const signed = JSON.parse(JSON.stringify(await signState(key, state())));
  assertEquals(validResumeState(signed), true);
  assertEquals("mac" in rebuildResumeState(signed), false);
});

Deno.test("signContinueEvents: signerer kun continue-state, resten urørt", async () => {
  const key = (await resumeKey(env({ SVAR_RESUME_SECRET: "s" })))!;
  const enc = new TextEncoder();
  const up = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "progress", text: "x" })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "run_code", script: "1" })}\n\ndata: ${JSON.stringify({ type: "continue", state: state(), probed: [] })}\n\n`));
      c.close();
    },
  });
  const text = await new Response(signContinueEvents(up, key)).text();
  const ev = text.split("\n\n").filter(Boolean).map((l) => JSON.parse(l.slice(6)));
  assertEquals(ev.map((e) => e.type), ["progress", "run_code", "continue"]);
  assertEquals(typeof ev[2].state.mac, "string");
  assertEquals(await verifyState(key, ev[2].state), true);
  assertEquals(ev[2].probed, []);
});

Deno.test("hopMaTellesSomSporsmal: kun hop med ikke-verifisert state, og kun når signering er aktiv", async () => {
  const key = (await resumeKey(env({ SVAR_RESUME_SECRET: "s" })))!;
  const signed = JSON.parse(JSON.stringify(await signState(key, state())));
  assertEquals(await hopMaTellesSomSporsmal(true, key, signed), false);
  assertEquals(await hopMaTellesSomSporsmal(true, key, state()), true);
  assertEquals(await hopMaTellesSomSporsmal(false, key, state()), false);
  assertEquals(await hopMaTellesSomSporsmal(true, null, state()), false);
});
