# Løkke-nivå: svar-klart-stopp og badge-på-beste-kjøring

**Dato:** 2026-08-04 · **Status:** godkjent design, venter på implementasjonsplan

## Bakgrunn og målt motivasjon

Tre målerunder (baseline → midtveis → etter-måling, `docs/eval/2026-08-baseline.md`)
viste at prompt-regler alene ikke bryter to atferdsmønstre i ask-løpet:

1. **Polering til taket:** modellen bruker restbudsjettet på «én figur til»
   selv når outputen alt besvarer spørsmålet (M-Q4: feilet poleringskjøring
   ødela et godt svar). Etter fase 2+3 er mønsteret brutt på lette/middels
   spørsmål, men står igjen i E5-klassen (flerkilde under tidspress).
2. **Falsk advarsel fra siste kjøring:** badge-logikken ser kun på
   `lastRunOk` — når kjøring 2 ga dataene og kjøring 3–4 var feilet
   polering, stemples et solid svar med rød advarsel (M-Q12).

Fasit fra run-disiplinrunden: instruksjoner flytter ikke dette; mekanikken må.

## Beslutninger (brainstorm 2026-08-04)

- **Stoppstyrke: HYBRID.** Etter FØRSTE vellykkede kjøring: deterministisk
  påminnelse. Etter ANDRE vellykkede: `run_code` fjernes fra verktøylista.
  Myk først (bevarer legitim reparasjon og E5-klassens datajakt), hard mot
  ren polering.
- **Badge: TRESTEGS.** Ok → som i dag; alt feilet → dagens røde advarsel;
  feilet-etter-suksess → mild, presis note (nøytral styling, ikke -warn):
  «⚠ Last polish run failed — the numbers come from an earlier successful
  run» (engelsk per ask-visningens språkkonvensjon — UI-teksten i
  ask-view.js er engelsk-først, Hans 2026-07-29).
- **Arkitektur: A — orkestrert i `svar.ts`** (ikke inne i løkke-filene):
  provider-agnostisk, `anthropic.ts` urørt, alt testbart som rene funksjoner.
- Gjelder ALLE ruter med run_code og BEGGE dybder (uniform semantikk;
  utforsk-friksjon overvåkes og kan gates senere om målt).

## Mekanisme 1 — svar-klart → stopp (server, `svar.ts`)

**Suksessdefinisjon (kryss-lag-kontrakt):** klientens `mdAskExecuteScript`
(js/ai-chat.js) formatterer run-resultatet som `OK. OUTPUT (truncated):…`
ved suksess og `FEIL:\n…` ved feil. Serveren klassifiserer på prefikset
`OK.`. Kontrakten testlåses på BEGGE sider (node-test på klientformatet,
deno-test på klassifisereren) — endres formatet uten testene, er det en
strukturfeil, ikke en drift.

**Tilstand:** `run_ok_calls` (heltall 0–50) fraktes i resume-payloadens
sidekanal — SAMME mønster som `probed` i dag (`continueExtra` ut,
`body.resume.run_ok_calls` inn, validert i svar.ts). `AgenticResumeState`
og løkke-filene røres ikke. Kjent akseptert rest (som for probed/state
ellers): resume er usignert — manipulasjon påvirker bare egen kjøring med
egen nøkkel (HMAC står på roadmap uendret).

**Atferd per hop i svar.ts:**
1. Innkommende `run_result` klassifiseres; ved `OK.` inkrementeres telleren.
2. KUN når det innkommende resultatet er `OK.` OG den nye tellerverdien er
   nøyaktig 1 (selve suksess-hopet — aldri på feil-hops): den myke
   påminnelsen APPENDES deterministisk på run-resultatteksten før den går
   inn i løpet:
   «[PÅMINNELSE fra kjøretiden: outputen over foreligger — skriv
   sluttsvaret nå. Ny run_code-kjøring KUN hvis outputen faktisk ikke
   besvarer spørsmålet; etter neste vellykkede kjøring stenges run_code.]»
3. `run_ok_calls >= 2`: verktøylista for påfølgende hops bygges UTEN
   run_code (filter på navn over `buildRouteToolDefs`-resultatet), UNNTATT
   når run_code er eneste verktøy i ruta (beregning) — da forblir lista
   ufiltrert, for API-et avviser en tom `tools`-liste når historikken har
   tool_use-blokker (se `filtrerRunCode`). Kjørebudsjettene
   (`depthRunCodeCalls` m.m.) er uendret — de forblir taket for FEILENDE
   kjøringer (reparasjon).

**Akseptert kostnad — cache-invalidering:** verktøylista ligger FØR system
i Anthropic sitt prompt-cache-prefiks; å droppe run_code ved andre suksess
invaliderer dermed cache-prefikset for resten av løpet. Akseptert, ikke
optimalisert i denne runden.

**Rene funksjoner** i ny liten `_lib/run-disiplin.ts` (testbare uten
handler): `klassifiserRunResult(s) -> "ok" | "feil"`,
`medPaaminnelse(runResult) -> string`, `skalStengeRunCode(runOkCalls) ->
boolean`, `coerceRunOkCalls(u) -> number`.

**Prompt (samme-historie-prinsippet):** RUN-blokka i svar-prompt.ts får et
kort avsnitt som forteller modellen nøyaktig dette (påminnelse etter første
suksess; verktøyet stenges etter andre) — ingen stille overraskelser.
Testlåses som de andre prompt-reglene.

## Mekanisme 2 — trestegs-badge (klient, `js/ask-view.js`)

- `runAskFlow` sporer `runHistory: boolean[]` (push `r.ok` per kjøring i
  `onRunCode`) i tillegg til dagens `lastRunOk`.
- Ny REN funksjon (node-testbar, eksportert i modulseamen):
  `badgeFor(runHistory) -> "ok" | "feilet-etter-suksess" | "feilet"`
  («ok» = siste kjøring ok; «feilet-etter-suksess» = minst én ok men siste
  feilet; «feilet» = ingen ok). Brukes KUN når kjøringer fantes
  (`ranAny`) — ingen-kjøringer-veien (kildebasert-badgen) er uendret; for
  tom historikk returnerer funksjonen «ok» av konvensjon, men kalleren når
  den aldri da.
- Visning: «ok» → dagens suksessvei uendret (levende output, resolver);
  «feilet» → dagens røde vei uendret; «feilet-etter-suksess» → SAMME
  behandling av output som dagens feilvei (stripRefs, ingen levende mount —
  outputArea inneholder den FEILEDE kjøringens tilstand, plassholdere er
  upålitelige) men med den milde noten i nøytral `ask-badge`-styling
  (ikke `ask-badge-warn`), og kilder vises som i dag.
- Telemetrien er uendret (feilede runs rapporteres fortsatt).

## Feilhåndtering

- Klassifisereren er konservativ: alt som ikke starter med `OK.` regnes som
  feil (aldri falsk suksess-stopp).
- Manglende/ugyldig `run_ok_calls` i resume → 0 (aldri kast; en mistet
  teller gir bare mildere oppførsel).
- Verktøyfjerningen kan aldri fjerne annet enn run_code (navnefilter), og
  aldri tømme lista helt (se `filtrerRunCode`/beregning-unntaket over).
- Kjent stale-klient-vindu: en nettleser med gammel cachet `js/ai-chat.js`
  (fra før dette laget) echoer ikke `run_ok_calls` tilbake i resume, så
  `coerceRunOkCalls` faller til 0 hvert hop — det gir påminnelsen etter
  HVER suksess og aldri selve stengingen (mild degradering, by design);
  vinduet lukkes når klient-cachen ruller (hard reload / ny fane løser det
  umiddelbart).

## Testing

- **Deno:** run-disiplin.ts-funksjonene (klassifisering inkl. tom
  streng/FEIL-prefiks; påminnelse appendes nøyaktig én gang; stenging ved
  2; coerce-grenser); prompt-testen (RUN-avsnittet); verktøyfilter-test
  (buildRouteToolDefs minus run_code beholder resten intakt).
- **Node:** `badgeFor` (alle tre tilstander + tom historikk);
  kontrakt-test som asserterer at ai-chat.js-kilden fortsatt inneholder
  literalene `'OK. OUTPUT (truncated):\n'` og `'FEIL:\n'` (kildedrift-vakt
  for kryss-lag-kontrakten).
- **Måling etterpå:** re-kjør E5 + E4 (playwright-oppsettet). Suksess:
  ingen kjøringer ETTER andre suksess; E5 ikke dårligere utfall; ingen
  røde badges på feilet-etter-suksess-klassen.

## Bevisst utenfor scope

- HMAC over resume-state (roadmap, uendret).
- Endringer i `anthropic.ts`/`providers/agentic.ts`-løkkene.
- Utforsk-spesifikk gating (overvåkes; gates kun ved målt friksjon).
- Varmere tolk-gjenbruk mellom kjøringer (eget ROADMAP-punkt).

## Referanser

Målingene: `docs/eval/2026-08-baseline.md` (midtveis + etter-måling).
Sidekanal-presedens: `probed` i `svar.ts`/`continueExtra`.
Klientkontrakten: `js/ai-chat.js` `mdAskExecuteScript`.
