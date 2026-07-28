# Dynamisk-URL-regelen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EVAL-REGEL 7 (dynamisk bygde URL-er = vanlig kode, aldri direktiv/urllib/«simuler») + kryss-lenke fra grammatikk-kravet; målt på q15 ×2 + naboklasse-vakt q1 før merge.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-dynamisk-url-regel-design.md. Én kodetask, deretter kontrollørens målesteg.

**Tech Stack:** netlify/edge-functions/_lib/data-svar-prompt.ts (EVAL-REGLER-lista:111-116, grammatikk-KRAVET:~157-163), data-svar-prompt.test.ts (python-needle-lista), eval-harness.

## Global Constraints

- ALDRI push — kontrollørens beslutning etter målt batch. Gren `dynamisk-url-regel` fra main. ALDRI git add under .superpowers/.
- Regel 1-6 og resten av prompten BYTE-LIK uendret (kun tillegg).
- Suiter: deno 285/0, node 1060/0, pytest 1447/0 — alle uendret grønne.

---

### Task 1: Regel 7 + kryss-lenke + needles

**Files:**
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.ts` (to steder)
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.test.ts` (python-needles)

- [ ] **Step 1: Needles (rød først)** — i python-needle-lista (den lange `a`-løkka), legg til: `"dynamisk bygde URL-er"`, `"simuler"`. Kjør deno test → FAIL («mangler: dynamisk bygde URL-er»).

- [ ] **Step 2: Regel 7** — etter regel 6-linja i EVAL-REGLER:

```
7. DYNAMISK BYGDE URL-er (løkke over år/sider, f-string/paste0): direktiv-
   grammatikken tar dem ALDRI (literal-only) — skriv VANLIG KODE med
   \`pd.read_csv(url)\`/\`read.csv(url)\` direkte (broen håndterer også
   dynamiske URL-er); ved målt cors:false pakkes URL-en i \`/api/hent?url=\`
   I KODEN. ALDRI urllib/requests (regel 4 gjelder), og ALDRI «simuler
   innlasting»-kode — koden skal HENTE, ikke late som.
```

- [ ] **Step 3: Kryss-lenke** — i grammatikk-KRAV-punktet («direktivlinjer er IKKE Python …»), etter «… gir feilmelding.», legg til setningen:

```
Trenger du en DYNAMISK bygget URL: det er vanlig kode (regel 7), aldri en
direktivlinje.
```

- [ ] **Step 4: Suiter → PASS** — deno 285/0, node 1060/0, pytest 1447/0; `git diff` viser kun de tre tilleggene.

- [ ] **Step 5: Commit** — `git commit -m "feat(data-svar): EVAL-REGEL 7 — dynamisk bygde URL-er er vanlig kode (q15-forkledningen); kryss-lenket fra grammatikk-kravet"`

---

## Kontrollørens målesteg

RESTART netlify dev + smoke; batch q15 ×2 (python: «Hvordan har folketallet i Danmark utviklet seg per kvartal siden 2020?») + q1 ×1 (naboklasse-vakt); bedøm (regel 4/7-brudd? direktiver der de hører hjemme?); logg i evalsettet; merge+push+ledger.
