import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { klassifiserRunResult, coerceRunOkCalls, medPaaminnelse, PAAMINNELSE, skalStengeRunCode } from "./run-disiplin.ts";

Deno.test("klassifiserRunResult: konservativ — kun OK.-prefiks er ok", () => {
  assertEquals(klassifiserRunResult("OK. OUTPUT (truncated):\nx"), "ok");
  assertEquals(klassifiserRunResult("FEIL:\nTraceback"), "feil");
  assertEquals(klassifiserRunResult(""), "feil");
  assertEquals(klassifiserRunResult(undefined), "feil");
  assertEquals(klassifiserRunResult(" OK. ledende blank"), "feil");
});

Deno.test("coerceRunOkCalls: heltall 0–50, ellers 0", () => {
  assertEquals(coerceRunOkCalls(1), 1);
  assertEquals(coerceRunOkCalls(50), 50);
  assertEquals(coerceRunOkCalls(51), 0);
  assertEquals(coerceRunOkCalls(-1), 0);
  assertEquals(coerceRunOkCalls(1.5), 0);
  assertEquals(coerceRunOkCalls("2"), 0);
  assertEquals(coerceRunOkCalls(undefined), 0);
});

Deno.test("skalStengeRunCode ved 2+", () => {
  assert(!skalStengeRunCode(0) && !skalStengeRunCode(1));
  assert(skalStengeRunCode(2) && skalStengeRunCode(3));
});

Deno.test("medPaaminnelse: appender konstanten nøyaktig én gang", () => {
  const ut = medPaaminnelse("OK. OUTPUT (truncated):\nx");
  assert(ut.startsWith("OK. OUTPUT"));
  assert(ut.endsWith(PAAMINNELSE));
  assertEquals(ut.split(PAAMINNELSE).length, 2);
  assert(PAAMINNELSE.includes("outputen over foreligger"));
  assert(PAAMINNELSE.includes("stenges run_code"));
});
