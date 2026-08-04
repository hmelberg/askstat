# Løkke-nivå (svar-klart-stopp + trestegs-badge) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-08-04-lokke-niva-design.md`: hybrid svar-klart-stopp orkestrert i `svar.ts` (påminnelse etter suksess #1, run_code stenges etter suksess #2) + trestegs-badge i klienten.

**Architecture:** Rene funksjoner i ny `_lib/run-disiplin.ts`; tilstand (`run_ok_calls`) i resume-SIDEKANALEN etter `probed`-mønsteret (løkke-filene `anthropic.ts`/`providers/agentic.ts` røres IKKE); klient-echo av feltet i `runSvarLoop`; badge-logikk som ren eksportert funksjon i `ask-view.js`.

**Tech Stack:** Deno/TS edge-funksjoner, vanilla JS (IIFE + node --test).

## Global Constraints

- `anthropic.ts` og `providers/agentic.ts` er READ-ONLY i denne planen.
- Kryss-lag-kontrakten: klienten formatterer `'OK. OUTPUT (truncated):\n'` / `'FEIL:\n'` (js/ai-chat.js `mdAskExecuteScript`); serveren klassifiserer KUN på prefikset `OK.` — konservativt (alt annet = feil). Begge sider testlåses.
- Kjørebudsjettene (`depthRunCodeCalls` m.m.) endres IKKE.
- Gjelder alle ruter med run_code, begge dybder — uniform semantikk.
- Manglende/ugyldig `run_ok_calls` → 0 (aldri kast). Verktøyfilteret kan bare fjerne `run_code` (navnefilter).
- Norsk brukervendt tekst; prompt og mekanikk forteller samme historie (RUN-avsnitt testlåst).
- Testkommandoer: `node --test tests/js/*.test.js`; `cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/`.
- Commits per task; **push først i Task 4** etter grønn sluttsjekk.

## File Structure

- Create `netlify/edge-functions/_lib/run-disiplin.ts` + `run-disiplin.test.ts` — rene funksjoner.
- Modify `netlify/edge-functions/svar.ts` — sidekanal-lesing, teller, påminnelse, verktøyfilter.
- Modify `netlify/edge-functions/_lib/svar-prompt.ts` — RUN-avsnitt om stoppmekanikken.
- Modify `netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts` — prompt-lås (append).
- Modify `js/ai-chat.js` — `cont`-objektet echo-er `run_ok_calls`.
- Modify `js/ask-view.js` — `runHistory`, `badgeFor`, trestegs-visning; eksport i modulseam.
- Modify `tests/js/ask-view.test.js` — badgeFor-tester (append).
- Create `tests/js/run-kontrakt.test.js` — kildedrift-vakt for OK./FEIL:-literalene.

---

### Task 1: `run-disiplin.ts` — rene funksjoner

**Files:** Create `netlify/edge-functions/_lib/run-disiplin.ts`, `netlify/edge-functions/_lib/run-disiplin.test.ts`.

**Interfaces (Produces — Task 2 bruker disse eksakte signaturene):**
- `klassifiserRunResult(s: string | undefined): "ok" | "feil"` — `"ok"` KUN når strengen starter med `OK.`; undefined/tom/alt annet → `"feil"`.
- `coerceRunOkCalls(u: unknown): number` — heltall 0–50; alt annet → 0.
- `skalStengeRunCode(runOkCalls: number): boolean` — `runOkCalls >= 2`.
- `medPaaminnelse(runResult: string): string` — appender `PAAMINNELSE`-konstanten (eksportert) med to linjeskift foran.

- [ ] **Step 1: Skriv feilende tester**

```ts
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
```

- [ ] **Step 2: Kjør — FAIL** (`cd netlify/edge-functions && deno test --allow-all _lib/run-disiplin.test.ts`)
- [ ] **Step 3: Implementer**

```ts
// Run-disiplin (spec 2026-08-04-lokke-niva-design.md): rene funksjoner for
// svar-klart-stopp. Kryss-lag-kontrakt: klientens mdAskExecuteScript
// (js/ai-chat.js) formatterer 'OK. OUTPUT (truncated):\n…' / 'FEIL:\n…' —
// klassifisereren er KONSERVATIV (alt uten OK.-prefiks er feil; en mistet
// suksess gir bare mildere oppførsel, aldri falsk stopp).

export const PAAMINNELSE =
  "[PÅMINNELSE fra kjøretiden: outputen over foreligger — skriv " +
  "sluttsvaret nå. Ny run_code-kjøring KUN hvis outputen faktisk ikke " +
  "besvarer spørsmålet; etter neste vellykkede kjøring stenges run_code.]";

export function klassifiserRunResult(s: string | undefined): "ok" | "feil" {
  return typeof s === "string" && s.startsWith("OK.") ? "ok" : "feil";
}

export function coerceRunOkCalls(u: unknown): number {
  return typeof u === "number" && Number.isInteger(u) && u >= 0 && u <= 50 ? u : 0;
}

export function skalStengeRunCode(runOkCalls: number): boolean {
  return runOkCalls >= 2;
}

export function medPaaminnelse(runResult: string): string {
  return runResult + "\n\n" + PAAMINNELSE;
}
```

- [ ] **Step 4: Kjør — PASS + hele Deno-suiten**
- [ ] **Step 5: Commit** `feat(run-disiplin): rene funksjoner for svar-klart-stopp`

---

### Task 2: Server-wiring i `svar.ts` + prompt + klient-echo

**Files:** Modify `netlify/edge-functions/svar.ts`, `netlify/edge-functions/_lib/svar-prompt.ts`, `js/ai-chat.js`; test append i `netlify/edge-functions/_lib/svar-prompt-budsjett.test.ts` og `netlify/edge-functions/_lib/run-disiplin.test.ts`.

**Interfaces:**
- Consumes: alle Task 1-funksjonene.
- Produces: continue-eventer bærer `run_ok_calls` (via `continueExtra`, ved siden av `probed`); klienten echo-er feltet i `resume`; verktøylistene bygges via ny eksportert `filtrerRunCode(tools, runOkCalls)` i run-disiplin.ts (navnefilter, testbar).

- [ ] **Step 1: Les dagens flyt** — i `svar.ts`: `probed`-oppbyggingen fra `body.resume.probed`, `runResult`-uttrekket fra `body.run_result`, `commonOpts` (inkl. `runResult`, `continueExtra: () => ({ probed })`) og de tre verktøylist-byggene (`buildRouteToolDefs`-kallene). I `js/ai-chat.js` `runSvarLoop`: `cont = { state: ev.state, probed: ev.probed }` og re-POST-body-en.

- [ ] **Step 2: Feilende test for verktøyfilteret** (append i run-disiplin.test.ts):

```ts
import { buildRouteToolDefs } from "./svar-prompt.ts";
import { filtrerRunCode } from "./run-disiplin.ts";

Deno.test("filtrerRunCode: fjerner kun run_code, og kun ved stenging", () => {
  const tools = buildRouteToolDefs("data", "standard") as { name?: string }[];
  const åpne = filtrerRunCode(tools, 1) as { name?: string }[];
  assertEquals(åpne.length, tools.length);
  const stengte = filtrerRunCode(tools, 2) as { name?: string }[];
  assertEquals(stengte.length, tools.length - 1);
  assert(!stengte.some((t) => t.name === "run_code"));
  assert(stengte.some((t) => t.name === "search_datasets"));
});
```

- [ ] **Step 3: Implementer `filtrerRunCode`** i run-disiplin.ts:

```ts
export function filtrerRunCode(tools: unknown[], runOkCalls: number): unknown[] {
  if (!skalStengeRunCode(runOkCalls)) return tools;
  return tools.filter((t) => (t as { name?: string }).name !== "run_code");
}
```

- [ ] **Step 4: Wire i svar.ts** — etter `runResult`-uttrekket:

```ts
  // Run-disiplin (spec 2026-08-04-lokke-niva): suksess-teller i resume-
  // SIDEKANALEN (probed-mønsteret — løkka er uvitende). Påminnelse på
  // suksess-hop #1; run_code filtreres fra verktøylistene fra suksess #2.
  let runOkCalls = coerceRunOkCalls((body.resume as ResumeBody & { run_ok_calls?: unknown } | undefined)?.run_ok_calls);
  let runResultTilLopet = runResult;
  if (runResult !== undefined && klassifiserRunResult(runResult) === "ok") {
    runOkCalls += 1;
    if (runOkCalls === 1) runResultTilLopet = medPaaminnelse(runResult);
  }
```

(juster `ResumeBody`-interfacet med `run_ok_calls?: unknown` i stedet for inline-cast om det blir renere), bruk `runResultTilLopet` i `commonOpts.runResult`, utvid `continueExtra: () => ({ probed, run_ok_calls: runOkCalls })`, og pakk ALLE tre `tools:`-argumentene i `filtrerRunCode(..., runOkCalls)`. Importer fra `./_lib/run-disiplin.ts`.

- [ ] **Step 5: Klient-echo i js/ai-chat.js** — i `runSvarLoop`: `if (ev.type === 'continue') { cont = { state: ev.state, probed: ev.probed, run_ok_calls: ev.run_ok_calls }; return; }` — feltet følger med i re-POST-ens `resume`-objekt automatisk (hele `cont` sendes som `resume`).

- [ ] **Step 6: RUN-prompt-avsnitt** (svar-prompt.ts, i arbeidsmåte-listen etter run-disiplinregelen fra 2026-08-04) + feilende låsetest først (append i svar-prompt-budsjett.test.ts: `assert(sys.includes("stenges run_code-verktøyet"))`):

```
   MEKANIKK (håndheves av kjøretiden, ikke bare denne teksten): etter din
   FØRSTE vellykkede kjøring får du en påminnelse om å levere svaret;
   etter din ANDRE vellykkede kjøring stenges run_code-verktøyet for
   resten av løpet. Planlegg deretter.
```

- [ ] **Step 7: Kjør alt** — full Deno-suite + `node --test tests/js/*.test.js`.
- [ ] **Step 8: Commit** `feat(svar): svar-klart-stopp — påminnelse etter suksess #1, run_code stengt fra #2 (sidekanal-teller)`

---

### Task 3: Trestegs-badge i klienten

**Files:** Modify `js/ask-view.js`; test append i `tests/js/ask-view.test.js`; create `tests/js/run-kontrakt.test.js`.

**Interfaces:**
- Produces: `badgeFor(runHistory: boolean[]) -> "ok" | "feilet-etter-suksess" | "feilet"` eksportert i modulseamen nederst i ask-view.js.

- [ ] **Step 1: Feilende node-tester** (append i ask-view.test.js, filens require-mønster):

```js
test('badgeFor: tre tilstander', () => {
  assert.equal(AV.badgeFor([true]), 'ok');
  assert.equal(AV.badgeFor([false, true]), 'ok');
  assert.equal(AV.badgeFor([true, false]), 'feilet-etter-suksess');
  assert.equal(AV.badgeFor([true, true, false, false]), 'feilet-etter-suksess');
  assert.equal(AV.badgeFor([false]), 'feilet');
  assert.equal(AV.badgeFor([false, false]), 'feilet');
  assert.equal(AV.badgeFor([]), 'ok');   // konvensjon; kalleren når aldri hit (ranAny-gate)
});
```

Og `tests/js/run-kontrakt.test.js` (kildedrift-vakt, hele fila):

```js
// Kryss-lag-kontrakten (spec 2026-08-04-lokke-niva): serverens
// klassifiserRunResult sniffer på klientens literaler. Endres formatet i
// ai-chat.js uten at run-disiplin.ts følger med, skal DENNE testen rødne.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('mdAskExecuteScript-literalene består (OK./FEIL:-kontrakten)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(src.includes("'OK. OUTPUT (truncated):\\n'"), 'OK.-literalen mangler/endret');
  assert.ok(src.includes("'FEIL:\\n'"), 'FEIL:-literalen mangler/endret');
});
```

(verifiser literal-formen mot faktisk kilde FØR du fester asserten — anførselstegn/konkatenering kan avvike; asserten skal treffe kildeteksten som den er.)

- [ ] **Step 2: Kjør — FAIL → implementer i ask-view.js:**

`badgeFor` som ren funksjon øverst blant de andre rene funksjonene:

```js
  // Trestegs-badge (spec 2026-08-04-lokke-niva): siste kjøring bestemmer
  // suksessveien, men en feilet POLERING etter en vellykket kjøring skal
  // ikke stemple svaret rødt (M-Q12-klassen) — mild note i stedet.
  function badgeFor(runHistory) {
    var h = runHistory || [];
    if (!h.length || h[h.length - 1]) return 'ok';
    return h.indexOf(true) >= 0 ? 'feilet-etter-suksess' : 'feilet';
  }
```

I `runAskFlow`: `var runHistory = [];` ved siden av `feilRuns`; i `onRunCode` etter `lastRunOk = r.ok;`: `runHistory.push(r.ok);`. Sluttvisningen: erstatt dagens `if (lastRunOk) … else if (ranAny) …`-forgrening med `badgeFor(runHistory)`-switch der:
- `'ok'` → dagens suksessgren uendret (resolver/mount/maybeRenderMath);
- `'feilet-etter-suksess'` → som dagens ranAny-feilgren (stripRefs, ingen mount) men badge-tekst `'⚠ Siste poleringsforsøk feilet — tallene bygger på en tidligere vellykket kjøring'` og badgeWarn `false` (nøytral `ask-badge`, ikke `-warn`);
- `'feilet'` → dagens ranAny-feilgren uendret (rød);
- `!ranAny`-grenen (kildebasert) er urørt UTENFOR switchen som i dag.
Eksporter `badgeFor` i modulseamen nederst.

- [ ] **Step 3: Kjør — PASS + full node-suite + Deno-suiten (regresjon).**
- [ ] **Step 4: Commit** `feat(badge): trestegs — feilet polering etter suksess gir mild note, ikke rød advarsel`

---

### Task 4: Sluttsjekk, push og måling

**Files:** ingen nye.

- [ ] **Step 1: Full suite** — node + deno + `python3 -m pytest -q` (regresjon).
- [ ] **Step 2: Push** (`git push`; Netlify autodeployer).
- [ ] **Step 3: Måling** (kontrolleren, playwright-oppsettet fra etter-målingen, lokal dev :8899 m/.env-nøkkel, FRISK server pga. edge-cache): kjør E4 og E5. Suksess: (a) ingen kjøringer etter andre suksess i sporet; (b) E4 fortsatt 1–2 kjøringer/PASS; (c) E5 ikke dårligere utfall enn etter-målingen; (d) fremprovoser om mulig feilet-etter-suksess (om den ikke oppstår naturlig: noter det — mekanismen er testdekket uansett). Resultat appendes i `docs/eval/2026-08-baseline.md` («Løkke-nivå-måling»).
- [ ] **Step 4: Rapporter og oppdater ROADMap-/evalnotatene** om at løkke-nivå-sporet er levert.

---

## Self-review (utført ved skriving)

- **Spec-dekning:** mekanisme 1 → Tasks 1+2 (klassifisering/teller/påminnelse/filter/prompt/klient-echo); mekanisme 2 → Task 3; kontraktlås → Task 1 (server-side) + Task 3 (kilde-vakt); måling → Task 4. Utenfor-scope-listen respekteres (ingen løkke-fil-endringer — kun svar.ts).
- **Plassholdere:** ingen; klient-echo-endringen er navngitt med eksakt objektform; literal-vakten har verifiser-mot-kilde-instruks.
- **Typekonsistens:** funksjonsnavn/signaturer identiske i Task 1-interfaces, Task 2-bruk og testene; badgeFor-tilstandene matcher spec-strengene.
