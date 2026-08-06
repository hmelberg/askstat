// Kryss-lag-kontrakt (review-funn 2026-08-06 #1): svar.ts sin
// resume-rekonstruksjon (rebuildResumeState) MÅ bevare get_pack sin
// pending.name/expectedId og den nye getPackCalls-telleren uendret. Begge
// protokolltestene i anthropic.test.ts/providers/agentic.test.ts kaller
// løkkene DIREKTE og går ALDRI via svar.ts — denne fila er den eneste som
// faktisk dekker svar.ts sitt eget rekonstruksjonssteg (bugen review-funnet
// fryktet: et felt-for-felt-whitelist som stille dropper name/expectedId,
// slik at HVER get_pack-runde dør med «mangler run_result» — med en grønn
// test-suite for øvrig).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rebuildResumeState, validResumeState } from "../svar.ts";
import type { AgenticResumeState } from "./anthropic.ts";

function baseState(overrides: Partial<AgenticResumeState>): AgenticResumeState {
  return {
    messages: [{ role: "user", content: "q" }],
    turn: 1,
    clientCalls: 0,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
    ...overrides,
  };
}

Deno.test("validResumeState + rebuildResumeState: get_pack sin pending.name/expectedId og getPackCalls overlever hele runden", () => {
  const raw = baseState({
    pending: { results: [], awaitingId: "tu1", name: "get_pack", expectedId: "norway" },
    getPackCalls: 2,
  });
  assertEquals(validResumeState(raw), true);
  const rebuilt = rebuildResumeState(raw);
  assertEquals(rebuilt.pending?.name, "get_pack");
  assertEquals(rebuilt.pending?.expectedId, "norway");
  assertEquals(rebuilt.getPackCalls, 2);
  assertEquals(rebuilt.runCalls, undefined); // run_code-telleren urørt av en get_pack-runde
});

Deno.test("rebuildResumeState: run_code (pending uten name) urørt — bakoverkompatibel med eldre state", () => {
  const raw = baseState({ pending: { results: [], awaitingId: "tu2" }, runCalls: 1 });
  const rebuilt = rebuildResumeState(raw);
  assertEquals(rebuilt.pending?.awaitingId, "tu2");
  assertEquals(rebuilt.pending?.name, undefined);
  assertEquals(rebuilt.runCalls, 1);
  assertEquals(rebuilt.getPackCalls, undefined);
});

Deno.test("validResumeState: getPackCalls valideres (heltall 0-50, samme regel som runCalls)", () => {
  assertEquals(validResumeState(baseState({ getPackCalls: 5 })), true);
  assertEquals(validResumeState(baseState({ getPackCalls: -1 })), false);
  assertEquals(validResumeState(baseState({ getPackCalls: 51 })), false);
  assertEquals(validResumeState(baseState({ getPackCalls: 1.5 })), false);
});

Deno.test("validResumeState: pending.expectedId over 100 tegn avvises (speiler coercePacks sitt id-tak)", () => {
  assertEquals(validResumeState(baseState({
    pending: { results: [], awaitingId: "tu1", name: "get_pack", expectedId: "x".repeat(101) },
  })), false);
  assertEquals(validResumeState(baseState({
    pending: { results: [], awaitingId: "tu1", name: "get_pack", expectedId: "x".repeat(100) },
  })), true);
});
