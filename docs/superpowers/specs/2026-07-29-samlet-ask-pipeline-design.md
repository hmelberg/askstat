# Samlet ask-pipeline — design

**Dato:** 2026-07-29
**Status:** Godkjent av Hans (diskusjonsrunder i Claude Code-sesjon)
**Erstatter:** dagens tre-stegs pipeline (ruter → data-svar → tolk-ask) med reparasjonsrunder

## Bakgrunn og mål

Eval-målingene (docs/eval/ask-evalsett.md, 2026-07-29) viser at data-ruten tar 3–4,5 minutter
og feiler for ofte (Q4 trengte 3 reparasjonsrunder, Q5 ga semantisk søppel). Strukturelle årsaker:

1. `turnsPerCall = 1` — hver agentiske tur er en full rundtur nettleser → edge → Anthropic,
   og hver hop laster opp hele samtalen på nytt (opptil 40 hops per spørsmål).
2. Reparasjonsrunder (opptil 3 + 1 semantisk) starter hver gang en helt ny agentisk kjøring
   uten minne fra forrige forsøk.
3. Systemprompten er ~23 kB (~6k tokens) uansett spørsmålstype.
4. Agentiske turer strømmes ikke.
5. Ratelimiten (10/time per endepunkt+IP) teller hver hop, ikke hvert spørsmål.

**Mål:** Én enklere, raskere og robustere pipeline som erstatter dagens helt
(ingen bakoverkompatibilitet, ingen parallelle løsninger, ett output-format).
Måltall: data-ruten under ~90 s i standard dybde, ingen regresjon på øvrige ruter.

## Beslutninger (med begrunnelse)

| # | Beslutning | Begrunnelse |
|---|---|---|
| 1 | Erstatt gammel pipeline helt — ingen «Quick» ved siden av | To systemer og to output-formater er unødvendig kompleksitet; ingen brukere ennå |
| 2 | Arkitektur: ruter + ett samlet agentisk løp med `run_code` som verktøy | Modellen ser faktisk output og retter i samme kontekst; tolk-steget og fra-null-reparasjoner bortfaller |
| 3 | Omforming/simulering bakes inn i beregning-ruten som prinsipp (ingen femte rute) | Skillet «beregn» vs. «belys med modell» er glidende; prompten håndterer begge |
| 4 | Dybde: split-knapp «Ask» (standard, slank) + «Deep» i nedtrekk; dybde ut av settings | Ett system med én parameter; gjenbruker `.mode-dropdown`-mønsteret |
| 5 | Levende output i svarkortet + widgets promptes nå; kloning slettes | Infrastrukturen (ui.slider, #@param, ipywidgets, plotly) finnes allerede; punkt 3 løses gratis |

## Arkitektur

### Dataflyt

```text
Spørsmål
  → POST /api/ask-ruter          (beholdes; språk-ruten svarer direkte som i dag)
  → POST /api/svar               (NYTT endepunkt; erstatter data-svar + tolk-ask)
      server kjører MANGE LLM-turer per HTTP-kall
      verktøy: search_catalog, table_metadata, probe, search_literature,
               web_search, web_fetch (hosted), run_code (NYTT, klientutført)
      tilbake til klienten kun ved: heartbeat | run_code | strømmet sluttsvar
  → sluttsvar strømmes som markdown rett inn i svarkortet
  → output-området flyttes levende inn i kortet
```

### Endepunkter

- **`svar.ts`** (ny, `/api/svar`): gjenbruker `runAgenticStream` fra `_lib/anthropic.ts`,
  men server-løkka fortsetter til den enten trenger `run_code` (klienten må kjøre),
  har sluttsvar (strømmes), eller når `maxTurns` (24 beholdes som backstop).
  `turnsPerCall = 1`-regimet bortfaller for server-side-verktøy.
- **Slettes:** `data-svar.ts`, `tolk-ask.ts`.
- **Beholdes:** `ask-ruter.ts` (uendret rolle), `hent.ts` (dataproxy), `_lib/tools/*`.

### SSE-kontrakt (utvidelse av dagens)

```text
progress | text | sources | run_code | continue | done | error
```

- `run_code`-event bærer `{script, mode}`. Klienten kjører skriptet (eksisterende
  mekanisme: sett inn i skjult editor → `#btnRun` → poll → les output/feil),
  og POST-er tilbake til `/api/svar` med `resume.state` + verktøyresultat.
- Verktøyresultatet til modellen: `{ok, output (≤20 000 tegn), error}`.
  180 s-taket for kjøring beholdes; timeout gir verktøyresultat med beskjed om å
  svare med det man har.
- Heartbeat hver 10 s beholdes (Netlify dreper tause strømmer etter ~40–60 s).
- Sluttsvaret strømmes som `text`-deltaer (dagens «stream the final turn»-TODO løses).

### Reparasjon

Ingen egen reparasjonsløkke. Kjørefeil og uventet output kommer tilbake som
`run_code`-resultat i samme kontekst, og modellen retter i neste tur.
Budsjettet for `run_code` (2 standard / 4 deep) er den nye reparasjonsgrensen.
Når budsjettet er brukt: svar ærlig med det man har. Semantisk-reparasjonsrunden
i `ask-view.js` slettes — modellen ser selv outputen før den svarer.

### Ratelimit

Telles per **spørsmål**, ikke per hop: `ask-ruter` og *første* `/api/svar`-kall
teller; continuation-hops med gyldig `resume`-state er unntatt.

## Prompts

Rutespesifikk montering av eksisterende blokker i `_lib/data-svar-prompt.ts`
(flyttes/omdøpes til `_lib/svar-prompt.ts`). Filosofi: stol på modellens egen
kunnskap; få, målte regler fremfor mange føre-var-regler. `.md`-filene i
`prompts/` holdes synkrone som source of truth (eksisterende konvensjon).

| Rute | Blokker inn | Blokker ut (vs. i dag) |
|---|---|---|
| beregning | INTRO (slanket), MODE_*, NY omformingsblokk (~15 linjer) | Registerblokken (~9 kB), ost-grammatikk, PxWeb-mal, EVAL-regler, QUERYLOGIC |
| data | INTRO, MODE_*, DELIVERY (ost/PxWeb/EVAL-reglene beholdes — de er målte feil), QUERYLOGIC, register, NY «ta det du fant»-regel | SCIENCE/INLINE/MULTI vurderes slanket |
| oppslag | Web-verifiseringskrav (≥1 kilde-URL, aldri fra hukommelsen) | Alt kode/data-spesifikt |
| språk | (besvares av ruteren som i dag, med «ikke verifisert»-badge) | — |

**Ny omformingsblokk (beregning):** «Verdispørsmål og teorispørsmål kan ofte belyses
med en enkel simulering: omform spørsmålet eksplisitt, oppgi antakelsene, hold modellen
enkel nok til å forstås, og bruk gjerne slider/#@param slik at brukeren kan dra i
antakelsene selv. Si alltid tydelig at og hvordan spørsmålet er omformet.»

**Alle ruter:** Når spørsmålet er omformet, åpner svaret med tolkningen
(«Slik tolker jeg spørsmålet: …»). Antakelser oppgis alltid.

**data-ruten i tillegg:** Delvise resultater rapporteres ærlig i stedet for å utløse
nye runder («fant 8 av 12 land — sier det»). Når kildemanifestet avslører at kilder
spriker, gis en kort oversikt over forskjellene i stedet for å velge én stille.

Mål: standardprompt per rute ned mot en tredjedel av dagens ~23 kB
(beregning blir langt mindre; data noe mindre).

## Budsjett og dybde

| | Standard («Ask») | Deep (nedtrekk) |
|---|---|---|
| Verktøykall (søk/metadata/probe/litteratur — run_code telles separat) | ≤4 | ≤12 |
| web_search | ≤2 | ≤5 |
| web_fetch | ≤1 (15k tokens) | ≤5 (30k tokens) |
| run_code | ≤2 | ≤4 |

Dybdevalget fjernes fra settings-modalen. Split-knappen bygges med
`.mode-dropdown`-mønsteret (som `#viewModeBtn`): primærklikk = Ask (standard),
chevron-meny = {Deep}. Valget gjelder til det endres og markeres i menyen.

## Output (svarkortet)

- Etter vellykket kjøring flyttes selve `#outputArea`-DOM-noden inn i svarkortet
  (ikke klon): interaktiv plotly (med `Plotly.Plots.resize` etter flytting),
  levende slidere/param-skjemaer, tabeller.
- Bytte til «Code & output»-pillen flytter noden tilbake til vanlig layout;
  nytt spørsmål tømmer den.
- Kloningskoden i `ask-view.js` (PNG-snapshot + inntil 3 tabellkloner) slettes.
- «View code», kilde-manifestet og Details-folden beholdes.

## Slettes

- `netlify/edge-functions/tolk-ask.ts` (+ prompt-doc)
- `netlify/edge-functions/data-svar.ts` (erstattes av `svar.ts`)
- Reparasjonsløkkene: `mdAskRun`-rundene og semantisk reparasjon i `ask-view.js`,
  `webAnswerWithRepair`-stien for ask
- Kloning-til-statisk i `ask-view.js`
- Dybdevalget i settings-modalen

## Verifisering

1. Playwright-kjøring av eval-settet Q1–Q10 (docs/eval/ask-evalsett.md) før og etter,
   BYOK, standard dybde. Suksesskriterier:
   - data-ruten (Q4–Q6): fra 3–4,5 min til **< 90 s**; Q4/Q5/Q6 består innholdsmessig
   - beregning (Q1–Q3): ≤ 35 s, ingen regresjon
   - oppslag/språk (Q7–Q10): ≤ 15 s, ingen regresjon
2. Smoke-test lokalt før push (netlify dev-restart + 400-smoke, jf. verify-fella).
3. Widget-røyk: ett simuleringsspørsmål der svaret inneholder slider som faktisk
   re-kjører i svarkortet.

## Utsatt til senere designrunder (roadmap)

1. **Oppdagelseslaget** (kuratert utvidelse): DBnomics-søkeadapter (registeroppføring
   finnes alt), 1–2 metakataloger (DataCite, data.europa.eu), generisk
   datasettprofilering/kodebok-lesing (Stata/SPSS-etiketter, missing-koder).
2. **MCP-lag** over `_lib/tools/` — tynn påbygging når/hvis flere klienter trenger det.
3. **Selvforbedring**: eval-settet utvides og brukes systematisk til promptlæring.
4. Headless `run()`-API (erstatter skjult-editor-mekanismen) — fase 2-punkt fra
   forrige spec, uendret prioritet.
