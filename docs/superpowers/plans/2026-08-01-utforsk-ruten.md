# Utforsk-ruten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ny rute `utforsk` som oversetter normative/konseptuelle/wicked spørsmål til utforskbare modeller, med kontrakt (dekomponerings-gate, verdipremiss-regel, regionterskler, ærlighetsfooter) — jf. spec `docs/superpowers/specs/2026-08-01-utforsk-ruten-design.md`.

**Architecture:** Ruteren (`ask-ruter.ts`) får femte rute og smalnet «språk»; `/api/svar`-pipelinen får utforsk-montering (nye prompt-blokker i `svar-prompt.ts`, run_code + web-verktøy, ingen register). REFORM slettes. To fellesregler inn i RUN-blokka. Klienten trenger bare `ASK_ROUTES`-utvidelse.

**Tech Stack:** Deno (edge functions, TS), node:test (klient-JS), rene prompt-strenger.

## Global Constraints

- **Synk-konvensjonen:** `prompts/ask-ruter.md` ↔ `RUTER_SYSTEM` i `ask-ruter.ts`, og `prompts/svar.md` ↔ TS-konstantene i `_lib/svar-prompt.ts` holdes byte-nære (TS er det som sendes; .md er source-of-truth-dokument). Endres en blokk ett sted, endres den begge steder — i samme commit.
- **Ingen bakoverkompat:** REFORM slettes helt (ingen brukere, jf. prosjektnorm). Gamle tester som asserterer REFORM oppdateres, ikke bevares.
- **Promptspråk:** norsk, samme stil som eksisterende blokker (KRAV/ALDRI-prosa, ##-overskrifter).
- **Testkommandoer:** Deno: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt.test.ts` (full suite + typecheck i Task 6). Node: `node --test tests/js/ask-view.test.js` fra repo-rot.
- **Ingen push underveis** — push er sluttsteget (Task 6), etter grønn full suite.

---

### Task 1: `svar-prompt.ts` — utforsk-type, blokker, montering og verktøy

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (type linje 19-23, REFORM linje 364-380, buildSvarSystem linje 526-543, buildRouteToolDefs linje 621-639)
- Test: `netlify/edge-functions/_lib/svar-prompt.test.ts`

**Interfaces:**
- Consumes: eksisterende `Depth`, `MODE`, `RUN`, `RUN_CODE_TOOL`, `uses`-mapet i buildRouteToolDefs.
- Produces: `AskRoute` inkluderer `"utforsk"`; `coerceRoute("utforsk") === "utforsk"`; `buildSvarSystem("utforsk", mode, registryBlock, {depth})` returnerer utforsk-montering; `buildRouteToolDefs("utforsk", depth, opts)` returnerer `[RUN_CODE_TOOL, ...web]`. `REFORM` finnes ikke lenger.

- [ ] **Step 1: Skriv feilende tester**

Legg til nederst i `svar-prompt.test.ts`, og ERSTATT den eksisterende testen
`"buildSvarSystem(beregning): omforming + run_code, INGEN register/EVAL/ost"`
(linje 20-28) med beregning-varianten under (REFORM finnes ikke lenger):

```ts
Deno.test("buildSvarSystem(beregning): run_code + modus, INGEN register/EVAL/ost/Omforming", () => {
  const s = buildSvarSystem("beregning", "python", "REGISTERBLOKK-MARKØR");
  assert(s.includes("run_code"));
  assert(s.includes("#@param"));
  assert(!s.includes("Omforming"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(!s.includes("EVAL-REGLER"));
  assert(!s.includes("ost.connect"));
});

Deno.test("coerceRoute: utforsk er gyldig", () => {
  assertEquals(coerceRoute("utforsk"), "utforsk");
});

Deno.test("buildSvarSystem(utforsk): kontrakt + dybde + ankere + modus + run_code, ingen register/EVAL/katalog", () => {
  const s = buildSvarSystem("utforsk", "python", "REGISTERBLOKK-MARKØR", { depth: "standard" });
  assert(s.includes("Ikke avgjør spørsmålet"));      // oppdragssetningen
  assert(s.includes("DEKOMPONERINGS-GATE"));
  assert(s.includes("VERDIPREMISSER VELGES ALDRI STILLE"));
  assert(s.includes("REGIONBESKRIVELSER"));
  assert(s.includes("Dybde: STANDARD"));
  assert(s.includes("Empiriske ankere"));
  assert(s.includes("#@param"));                     // MODE_PY er med
  assert(s.includes("run_code"));
  assert(!s.includes("REGISTERBLOKK-MARKØR"));
  assert(!s.includes("EVAL-REGLER"));
  assert(!s.includes("search_datasets"));
});

Deno.test("buildSvarSystem(utforsk, deep): deep-dybdeblokk", () => {
  const s = buildSvarSystem("utforsk", "python", "", { depth: "deep" });
  assert(s.includes("Dybde: DEEP"));
  assert(!s.includes("Dybde: STANDARD"));
});

Deno.test("buildRouteToolDefs(utforsk): run_code + web m/ budsjett, ingen katalogverktøy", () => {
  const defs = buildRouteToolDefs("utforsk", "standard") as { name?: string; max_uses?: number }[];
  const names = defs.map((d) => d.name);
  assert(names.includes("run_code"));
  assert(names.includes("web_search") && names.includes("web_fetch"));
  assert(!names.includes("search_datasets") && !names.includes("search_catalog") && !names.includes("probe"));
  assertEquals(defs.find((d) => d.name === "web_search")?.max_uses, 2);
});

Deno.test("buildRouteToolDefs(utforsk, hostedWeb:false): kun run_code", () => {
  const defs = buildRouteToolDefs("utforsk", "deep", { hostedWeb: false }) as { name?: string }[];
  assertEquals(defs.map((d) => d.name), ["run_code"]);
});
```

- [ ] **Step 2: Kjør testene — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt.test.ts`
Expected: FAIL — TS2345 (`"utforsk"` er ikke i `AskRoute`) / assert-feil.

- [ ] **Step 3: Implementer i `svar-prompt.ts`**

3a. Type + coerce (erstatt linje 18-23):

```ts
// Ruter fra /api/ask-ruter. "språk" når aldri hit (besvares av ruteren).
export type AskRoute = "beregning" | "data" | "oppslag" | "utforsk";

export function coerceRoute(r: unknown): AskRoute {
  return r === "beregning" || r === "oppslag" || r === "utforsk" ? r : "data";
}
```

3b. SLETT hele `REFORM`-konstanten (linje 364-380). Legg inn tre nye
konstanter samme sted (mellom `PARTIAL` og `INTRO_CALC`):

```ts
const INTRO_UTFORSK = `\
Du er en modellerings- og beslutningsassistent. Spørsmålet er rutet som
UTFORSK: normativt, konseptuelt eller så usikkert at et direkte svar ville
vært en mening eller en skuldertrekning. Oppdraget:

> Ikke avgjør spørsmålet direkte. Oversett det til en modell som viser
> hvilke fakta, verdier og antakelser ulike svar avhenger av.

Svaret ÅPNER med den operasjonelle tolkningen («Slik tolker jeg spørsmålet:
…») og markerer at dette er ÉN måte å formalisere spørsmålet på —
modellformen er ditt valg, ikke gitt av spørsmålet. Du svarer på brukerens
språk (norsk/engelsk).

KONTRAKTEN under er EGENSKAPER svaret skal ha — ikke seksjoner det skal
inneholde. Formen følger spørsmålet; et element som ikke gir mening for
akkurat dette spørsmålet droppes med én setnings begrunnelse i stedet for å
fylles rituelt.

INVARIANTER (gjelder alltid):
- DEKOMPONERINGS-GATE før kode: kompakt tabell — komponent | klasse
  (empirisk / verdipremiss / strukturantakelse) | håndtering (data /
  simulering / parameter / prosa) | kilde eller antatt verdi. Klassen
  styrer håndteringen: empirisk m/ kilde → hent/transkriber (se Empiriske
  ankere); empirisk uten kilde → antatt verdi, merket; verdipremiss →
  brukerstyrt parameter; strukturusikkerhet → to modellformer eller
  sensitivitetsnote.
- VERDIPREMISSER VELGES ALDRI STILLE: du kan velge empiriske antakelser
  (og merke dem), men aldri verdier FOR brukeren. I python-modus
  eksponeres de som #@param/ipywidgets-kontroller (se modusblokken);
  ellers som tydelig markerte konstanter øverst i scriptet + en
  posisjonstabell i svaret.
- ÆRLIGHETSFOOTER (tre punkter, kort, sist i svaret): hvilke konsekvenser
  modellen utelater; hvilke antakelser som mangler evidens; om alternative
  modellformer ville gitt andre svar.

KONKLUSJONSFORM (foretrukket):
- TERSKLER SOM REGIONBESKRIVELSER: «A vinner med mindre
  behandlingseffekten er under X eller vekten på den dårligst stilte over
  2×» — ALDRI scenario-prosenter («best i 72 % av scenarioene») uten at
  fordelingen over scenarioer selv er navngitt som antakelse (et uniformt
  grid er en subjektiv prior i objektiv forkledning).
- ROBUSTHET: hva som holder over hele den plausible parameterregionen.
- Det er LOV å si «ingen meningsfull terskel finnes her».
- AVSLUTT med hva vi trenger mer kunnskap om — det peker mot gode
  oppfølgingsspørsmål.

MIDLER (ditt valg, styrt av gate-tabellen): simulering, transkriberte
småtabeller, widgets, en 2×2-tabell over posisjoner, flere modellformer.
Ingen er obligatoriske — en ren dekomponering i prosa er et gyldig svar
når en modell ikke tilfører innsikt.

KOMPLEKSITET VS. REALISME: default er en ENKEL modell med få, navngitte
nøkkelparametre — enkelhet slår realisme, leseren skal kunne forstå
mekanismen. Ber brukeren selv om en rikere/mer realistisk modell (flere
mekanismer, flere grupper, kalibrering mot tall), følg bestillingen.

EKSEMPEL (formen, ikke en mal):
Spørsmål: «Bør staten godkjenne et legemiddel til 1 mill. kr per QALY?»
Gate-tabell: betalingsvillighet per QALY = verdipremiss → slider;
QALY-gevinst per pasient = empirisk, usikker → parameter m/ plausibelt
intervall; alvorlighetsvekt = verdipremiss → slider; «budsjettet
fortrenger annen behandling» = strukturantakelse → sensitivitetsnote.
Konklusjon: «Godkjenning lønner seg hvis terskelen settes over Y eller
alvorlighetsvekten over Z; mest følsomt for antatt QALY-gevinst.»
Footer: utelater FoU-insentiver; QALY-gevinsten mangler evidens her; en
budsjettmodell med eksplisitt fortrengning kan snu svaret.`;

// Utforsk-dybde: skalerer AMBISJON (modellrikdom/kilder), aldri ærlighet —
// samme prinsipp som DEPTH_STANDARD/DEEP for data-ruten.
const DEPTH_UTFORSK_STANDARD = `\
## Dybde: STANDARD (hurtig)

ÉN enkel modell, 1–3 nøkkelparametre. Budsjett: ≤ 2 web_search, ≤ 1
web_fetch, ≤ 3 run_code-kjøringer. Standard reduserer AMBISJON, ALDRI
ÆRLIGHET: gate-tabellen, verdipremiss-regelen og footeren gjelder UENDRET.`;

const DEPTH_UTFORSK_DEEP = `\
## Dybde: DEEP (grundig)

Rikere utforskning: flere modellformer eller grundigere sensitivitet, og
bedre empiriske ankere (flere kilder). Budsjett: inntil 5
web_search/web_fetch og 4 run_code-kjøringer.`;

const DEPTH_UTFORSK: Record<Depth, string> = {
  standard: DEPTH_UTFORSK_STANDARD,
  deep: DEPTH_UTFORSK_DEEP,
};

const UTFORSK_DATA = `\
## Empiriske ankere (uten kilderegisteret)

Denne ruta har ikke katalogverktøyene. For empiriske komponenter:
1. **Transkribert fra hentet innhold**: web_search/web_fetch → småtabeller
   (< ~50 rader) inline: \`data_<navn> = """..."""\` +
   \`pd.read_csv(io.StringIO(data_<navn>))\` (R: \`read.csv(text = "...")\`).
   KRAV: kilde-URL i kommentar ved blokken + merk «transkribert, ikke
   maskinelt verifisert».
2. **Modellkunnskap**: stabile referansefakta (ISO-koder, kjente terskler,
   klassifiseringer), merket «fra modellkunnskap — verifiser».
3. ALDRI presenter antatte verdier som målinger: i en simulering er
   antatte størrelser PARAMETRE, ikke observasjoner. Fabrikasjonsvernet
   gjelder uendret. Uten web-verktøy i kjøringen: kun nivå 2, og si
   eksplisitt at empiriske ankere er uverifiserte.

Er spørsmålets empiriske kjerne det dominerende (ordentlige tidsserier
trengs): si det, og foreslå å stille spørsmålet på nytt som dataspørsmål.`;
```

3c. `buildSvarSystem` — fjern REFORM fra beregning og legg til
utforsk-grenen (erstatt linje 533-535-området):

```ts
  if (route === "beregning") {
    return [INTRO_CALC, MODE[mode], RUN].join("\n\n");
  }
  if (route === "utforsk") {
    return [INTRO_UTFORSK, DEPTH_UTFORSK[depth], UTFORSK_DATA, MODE[mode], RUN].join("\n\n");
  }
```

3d. `buildRouteToolDefs` — ny gren rett etter beregning-linja (linje 636):

```ts
  if (route === "beregning") return [RUN_CODE_TOOL];
  if (route === "utforsk") return [RUN_CODE_TOOL, ...web];
```

(`svar.ts` trenger INGEN endring: register-lastingen er allerede gated på
`route === "data"`, verktøy og budsjetter kommer fra funksjonene over, og
`depthClientToolCalls` er irrelevant for utforsk — ingen katalogverktøy å
telle.)

- [ ] **Step 4: Kjør testene — skal passere**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt.test.ts`
Expected: PASS (alle, inkl. de gamle).

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt.test.ts
git commit -m "feat(svar): utforsk-ruten — kontraktblokker, montering og verktøy; REFORM slettet"
```

---

### Task 2: RUN-fellesregler — definisjonssprik og feilruting

**Files:**
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (RUN-konstanten, «Sluttsvarets form»-lista)
- Test: `netlify/edge-functions/_lib/svar-prompt.test.ts`

**Interfaces:**
- Consumes: `RUN`-konstanten fra Task 1-tilstand.
- Produces: RUN inneholder markørene `FLERE FORSVARLIGE DEFINISJONER` og `FEILRUTET` — synlige i alle fire pipeline-ruter.

- [ ] **Step 1: Skriv feilende test**

```ts
Deno.test("RUN-fellesregler: definisjonssprik + feilruting i alle pipeline-ruter", () => {
  for (const route of ["beregning", "oppslag", "data", "utforsk"] as const) {
    const s = buildSvarSystem(route, "python", "REG");
    assert(s.includes("FLERE FORSVARLIGE DEFINISJONER"), route);
    assert(s.includes("FEILRUTET"), route);
  }
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt.test.ts`
Expected: FAIL på begge assertene.

- [ ] **Step 3: Implementer**

I `RUN`-konstanten, i «Sluttsvarets form»-lista, rett ETTER kulepunktet
«Har du omformet spørsmålet …», legg inn to nye kulepunkter:

```
- FLERE FORSVARLIGE DEFINISJONER som gir vesentlig ulikt svar
  («helseutgifter»: SHA-definisjonen? % av BNP? per innbygger?): vis to,
  eller navngi valget eksplisitt i tolkningen — aldri velg stille.
- FEILRUTET? Oppdager du underveis at spørsmålet egentlig er en annen type
  (en beregning som trenger data, et dataspørsmål som egentlig er
  normativt): si det eksplisitt i svaret og svar så godt rutas verktøy
  tillater.
```

- [ ] **Step 4: Kjør — skal passere**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/svar-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/svar-prompt.ts netlify/edge-functions/_lib/svar-prompt.test.ts
git commit -m "feat(svar): RUN-fellesregler — definisjonssprik og feilrutings-escape-hatch"
```

---

### Task 3: Ruteren — «utforsk» inn, «språk» smalnet

**Files:**
- Modify: `netlify/edge-functions/ask-ruter.ts:16-42` (`RUTER_SYSTEM`)
- Modify: `netlify/edge-functions/prompts/ask-ruter.md` (samme tekst + endringslogg)

**Interfaces:**
- Consumes: ingenting nytt.
- Produces: ruteren kan svare `"rute": "utforsk"`; klient (Task 4) og server (Task 1) godtar den. Ingen unit-test-harness for denne strengen — verifiseres av synk-konvensjonen + smoke i Task 6.

- [ ] **Step 1: Oppdater RUTER-lista i BEGGE filer (byte-nær synk)**

I `RUTER_SYSTEM` (og tilsvarende i .md): behold "beregning"/"data"/"oppslag"
uendret. ERSTATT «språk»-punktet med disse TO punktene:

```
- "utforsk": normative, konseptuelle eller svært usikre spørsmål der et
  direkte svar ville vært en mening eller en skuldertrekning — men der en
  enkel modell med navngitte parametre kan gjøre uenigheten eksplisitt
  («er X rettferdig?», «bør staten …?», «hva er riktig …?»). Test: ville
  en enkel modell med navngitte parametre gjøre det klarere hva svaret
  avhenger av? Ja → utforsk.
- "språk": rent språklige eller kreative forespørsler (oversettelse, dikt,
  omformulering, ren tekstproduksjon). KUN for denne ruten: skriv også et
  direkte svar i feltet "svar" (kort, ærlig, på spørsmålets språk).
```

I TOLKNING-avsnittet, utvid siste setning fra «Ved "språk": kort
omformulering.» til:

```
Ved "utforsk": hvilken beslutning, avveining eller mekanisme som kan
modelleres. Ved "språk": kort omformulering.
```

- [ ] **Step 2: Endringslogg i ask-ruter.md**

Legg til i `<!-- ENDRINGSLOGG -->`-blokken:

```
2026-08-01: rute "utforsk" ny (verdi-/teori-/wicked-spørsmål → modell);
"språk" smalnet til rent språklig/kreativt (spec
2026-08-01-utforsk-ruten-design).
```

- [ ] **Step 3: Typecheck**

Run: `cd netlify/edge-functions && deno check ask-ruter.ts`
Expected: OK (ren strengendring).

- [ ] **Step 4: Commit**

```bash
git add netlify/edge-functions/ask-ruter.ts netlify/edge-functions/prompts/ask-ruter.md
git commit -m "feat(ruter): utforsk-rute; språk smalnet til rent språklig/kreativt"
```

---

### Task 4: Klienten — `ASK_ROUTES` + node-test

**Files:**
- Modify: `js/ask-view.js:8`
- Test: `tests/js/ask-view.test.js`

**Interfaces:**
- Consumes: `parseAskRoute` (eksisterende, eksportert i test-seam).
- Produces: `parseAskRoute('{"rute":"utforsk",...}').rute === 'utforsk'`.

- [ ] **Step 1: Skriv feilende test** (legg til ved de andre parseAskRoute-testene)

```js
test('parseAskRoute: utforsk er gyldig rute', () => {
  assert.strictEqual(askView.parseAskRoute('{"rute":"utforsk","tolkning":"x"}').rute, 'utforsk');
});
```

- [ ] **Step 2: Kjør — skal feile**

Run: `node --test tests/js/ask-view.test.js`
Expected: FAIL — `'data'` (fallback) i stedet for `'utforsk'`.

- [ ] **Step 3: Implementer** (`js/ask-view.js:8`)

```js
  var ASK_ROUTES = ['beregning', 'data', 'oppslag', 'språk', 'utforsk'];
```

- [ ] **Step 4: Kjør — skal passere**

Run: `node --test tests/js/ask-view.test.js`
Expected: PASS (alle).

- [ ] **Step 5: Commit**

```bash
git add js/ask-view.js tests/js/ask-view.test.js
git commit -m "feat(ask): klienten godtar utforsk-ruta"
```

---

### Task 5: Dokumentasjons-synk — `prompts/svar.md`

**Files:**
- Modify: `netlify/edge-functions/prompts/svar.md`

**Interfaces:**
- Consumes: de endelige blokk-tekstene fra Task 1-2 (kopieres ORDRETT fra TS, med backtick-escaping løst opp — samme konvensjon som resten av fila).
- Produces: svar.md dokumenterer INTRO_UTFORSK, DEPTH_UTFORSK_STANDARD/DEEP, UTFORSK_DATA, oppdatert RUN og monteringstabellen.

- [ ] **Step 1: Legg inn blokkene**

- Fjern `<!-- REFORM -->`-blokken.
- Legg inn `<!-- INTRO_UTFORSK -->`, `<!-- DEPTH_UTFORSK_STANDARD -->`,
  `<!-- DEPTH_UTFORSK_DEEP -->` og `<!-- UTFORSK_DATA -->` med teksten
  byte-nært fra TS (plassert etter `<!-- INTRO_LOOKUP -->`).
- Oppdater `<!-- RUN -->`-blokken med de to nye kulepunktene fra Task 2.

- [ ] **Step 2: Oppdater monteringstabellen**

I «Montering per rute»: beregning-raden endres til
`INTRO_CALC + MODE[mode] + RUN`; ny rad:

```
| utforsk | INTRO_UTFORSK + DEPTH_UTFORSK[depth] + UTFORSK_DATA + MODE[mode] + RUN |
```

Oppdater også kulepunktet «Rutene "beregning" og "oppslag" bruker verken …»
til å nevne utforsk (utforsk bruker heller ikke registerblokk/DELIVERY/
QUERYLOGIC/SCIENCE/INLINE/MULTI/META_SEARCH/KODEBOK/PARTIAL/MEMORY_URLS),
og «Rute "språk" når aldri hit»-linja står uendret.

- [ ] **Step 3: Endringslogg**

Ny seksjon under `## Endringslogg`:

```
### 2026-08-01

Utforsk-ruten (spec 2026-08-01-utforsk-ruten-design): INTRO_UTFORSK +
DEPTH_UTFORSK + UTFORSK_DATA nye; REFORM slettet (beregning = INTRO_CALC +
MODE + RUN); RUN fikk definisjonssprik- og feilrutings-kulepunktene
(felles for alle pipeline-ruter).
```

- [ ] **Step 4: Commit**

```bash
git add netlify/edge-functions/prompts/svar.md
git commit -m "docs(svar): svar.md synket — utforsk-blokkene inn, REFORM ut"
```

---

### Task 6: Full verifisering + push

**Files:** ingen nye endringer (kun kjøring).

- [ ] **Step 1: Full edge-suite + typecheck**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/`
Expected: alt grønt.

- [ ] **Step 2: Alle node-tester**

Run: `for f in tests/js/*.test.js; do node --test "$f" || break; done`
Expected: alt grønt.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Smoke (manuell, prod etter deploy)** — de fire
ruterspørsmålene fra spec §8: «Hva er rettferdighet?» → utforsk; «Should
the government approve a new drug that costs 1 million kroner per QALY?» →
utforsk; «Oversett dette diktet til engelsk: …» → språk (direktesvar);
«Er 97 et primtall?» → beregning. Hans kjører disse i appen
(ask.melberg.app) — rapportér ruta fra progress-linja.
