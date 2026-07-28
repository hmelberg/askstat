# R-prompt-dtypes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MODE_R lærer dtype-håndtering + de nye R-veiene (ost_read_csv/ost_convert_dtypes, ærlig app-only-merket); kriterium 12 utvides til R; målt med eval-batch (q3/q7/q14 i r-modus) før merge.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-r-prompt-dtypes-design.md. Én kodetask (prompt + deno-needles + kriterium-tekst), deretter kontrollørens målesteg (netlify-restart, batch, bedømming, evalsett-logg).

**Tech Stack:** netlify/edge-functions/_lib/data-svar-prompt.ts (MODE_R:318), data-svar-prompt.test.ts (needle-lista:~68), docs/eval/data-svar-evalsett.md (kriterium 12:36), .superpowers/sdd/eval-harness/ (run.mjs/analyze.mjs).

## Global Constraints

- ALDRI push — kontrollørens beslutning etter målt batch.
- Arbeidsgren: `r-prompt-dtypes` (opprettes fra main før Task 1).
- ALDRI git add noe under .superpowers/.
- MODE_PY og MODE_DUCK skal være BYTE-LIKE uendret.
- Nye kodeblokker i prompten: ingen halekommentarer på direktivlinjer, må parse i deno-vakten (den parser promptens egne eksempelblokker).
- Suiter ved task-slutt: `cd netlify/edge-functions && deno test --allow-read --allow-env --allow-net` (285/0 ved start → 285/0 etter; needle-utvidelser er i eksisterende test), `node --test "tests/js/"*.test.js` 1060/0 urørt, `python3 -m pytest -q` 1447/0 urørt.

---

### Task 1: MODE_R-dtypes + needles + kriterium 12-R

**Files:**
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.ts` (MODE_R, linje 318-343)
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.test.ts` (MODE_R-needle-lista, ~linje 68-70)
- Modify: `docs/eval/data-svar-evalsett.md` (kriterium 12, linje 36-42)

**Interfaces:** ingen — prompt-tekst og dok. MODE_R-blokkens eksisterende innhold (METODEVERKTØYKASSE, DATAHENTING-blokken m/ eksempler, IKKE-hent-på-nytt-regelen, Svarformat) beholdes ordrett; DTYPES-seksjonen skytes inn MELLOM «IKKE hent på nytt»-avsnittet og «## Svarformat».

- [ ] **Step 1: Utvid needle-lista (rød først)**

I `data-svar-prompt.test.ts`, MODE_R-lista:

```ts
  const r = buildDataSvarSystem("r", reg);
  for (const n of ["read.csv(", "fromJSON", "IKKE hent på nytt",
    // r-prompt-dtypes-runden: standard-idiom + app-only-merket ost-vei
    "colClasses", "ledende nuller", "factor(", "ost_read_csv", "KUN I OPENSTAT"]) {
    if (!r.includes(n)) throw new Error("MODE_R mangler: " + n);
  }
```

Kjør: `cd netlify/edge-functions && deno test --allow-read --allow-env --allow-net` → FAIL («MODE_R mangler: colClasses»).

- [ ] **Step 2: Skyt inn DTYPES-seksjonen i MODE_R**

Etter avsnittet som slutter med «…bruk variabelen direkte.» og FØR `## Svarformat`:

```
DTYPES — tenk gjennom typene FØR analysen, med STANDARD R-idiomer (appen
endrer ALDRI typer bak ryggen din; samme kode gir samme ramme i RStudio).
De tre klassene som oftest går galt:

\`\`\`r
df <- read.csv(url, colClasses = c(Region = "character"))
df$kjonn <- factor(df$kjonn)
\`\`\`

1. KODER som SER numeriske ut (kommunenummer, tabellkoder): R-inferensen
   MISTER ledende nuller (0301 → 301) — les dem eksplisitt som tekst med
   \`colClasses = c(<kolonne> = "character")\`. Gjelder alltid join-nøkler.
2. DATOER/KVARTALER: \`as.Date(...)\` eksplisitt; kvartalsformer («2024K1»)
   holdes som tekst/factor eller splittes eksplisitt — aldri stol på
   inferens.
3. KATEGORIER: \`factor(...)\` når analysen tjener på det.

KUN I OPENSTAT (ikke RStudio): \`ost_read_csv(url)\` (metadatadrevet typing
— factor med kildens nivåer i kildens orden) og
\`ost_convert_dtypes(df, meta = "<samme url>")\` på en ramme du alt har.
Kode som skal være portabel bruker standard-idiomene over.
```

(Transkriber med samme escape-stil som resten av template-literalen. Den nye ```r-blokken har ingen direktivlinjer — parser rent i grammatikk-vakten.)

- [ ] **Step 3: Oppdater kriterium 12 i evalsettet**

Erstatt kriterium 12-teksten (linje 36-42) med:

```
12. DTYPE-HÅNDTERING (2026-07-28, overraskelsesprinsippet — appen typer
    ALDRI implisitt): generert python/R-kode håndterer typene selv med
    standard-idiomer — kodekolonner/join-nøkler som ser numeriske ut
    (kommunenr, tabellkoder) leses m/ dtype={...: str} (python) eller
    colClasses = c(... = "character") (R); datoer/kvartaler håndteres
    eksplisitt (parse_dates/to_datetime, as.Date — aldri inferens-antakelse);
    ost.read_csv/convert_dtypes (python, portabel) og
    ost_read_csv/ost_convert_dtypes (R, kun i appen) teller som eksplisitt
    metadata-vei. FAIL når analysen joiner/grupperer på en kodekolonne
    motoren har talltolket.
```

- [ ] **Step 4: Kjør suitene → PASS**

`cd netlify/edge-functions && deno test --allow-read --allow-env --allow-net` → 285/0 (needlene grønne, eksempelblokkene parser). `node --test "tests/js/"*.test.js` → 1060/0. `python3 -m pytest -q` → 1447/0. Verifiser byte-likhet for MODE_PY/MODE_DUCK: `git diff` viser kun MODE_R-blokken + testfila + evalsettet.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/data-svar-prompt.ts netlify/edge-functions/_lib/data-svar-prompt.test.ts docs/eval/data-svar-evalsett.md
git commit -m "feat(data-svar): MODE_R lærer dtypes (colClasses-idiomet) + ost_read_csv app-only; kriterium 12 utvidet til R"
```

---

## Kontrollørens målesteg (utenfor task-nummereringen)

- RESTART netlify dev (edge-modul-cachen!) fra REPO-ROTEN (cwd-fella), 400-smoke mot /api/data-svar + GET /data/data-sources.json=200.
- Batch (Deep, r-modus): q3, q7, q14 via .superpowers/sdd/eval-harness/run.mjs; analyze.mjs + manuell kriterium 12-R-bedømming.
- Resultatlogg i docs/eval/data-svar-evalsett.md (committet), ledger-notat.
- Merge til main, push, ledger.
