# Baseline-kjøring før fase 2-herdingen (spec 2026-08-03 §Testing)

Kjørt 2026-08-04 av kontrolleren (playwright/Chromium, BYOK fra .env) mot
**lokal worktree på origin/main (8ff63e9) = prod-koden**, netlify dev :8897,
dybde standard, python-modus. Data-rute-settet fra ask-evalsett.md.
(Hans delegerte kjøringen — «kjør», 2026-08-04.)

| # | Spørsmål (kortform) | Tid | Runder (run_code) | Utfall | Feiltype |
|---|---------------------|-----|-------------------|--------|----------|
| 4 | Norge helse %BNP | 211 s | **3/3 (tak)** | PASS m/slitasje — 10,2 % (VB 2022), men svaret åpner med «før budsjettet ble brukt opp»; naboland omtrentlige («~17–18 %») | budsjett-tak; reparasjonsrunder |
| 5 | Norden arbeidsledighet | 83 s | **3/3 (tak)** | ÆRLIG FEIL — OECD-SDMX 404, degradert til websøk-transkriberte tall m/badge | hint/flowRef (SDMX 404); budsjett-tak |
| 6 | Oslo folketall 10 år | 162 s | **3/3 (tak)** | PASS — SSB 647 676→717 710 (+10,8 %), figur i svaret | reparasjonsrunder; budsjett-tak |
| 12 | EU helse %BNP (katalog) | 87 s | **3/3 (tak)** | PASS — full EU-27-rangering (VB 2022), katalogsøk brukt, figur | budsjett-tak |
| 11 | Forskningsdata helse/inntekt | 70 s | 0 | PASS — research-scope, ærlig kildeoversikt (EU-SILC m.fl.), ingen fabrikkerte URL-er | — |

## Hovedfunn (før-tilstand)

1. **Kjørebudsjettet (3) er bindende i HVER datatung kjøring** — alle fire
   brukte alle tre run_code-kallene, og Q4 sier det eksplisitt i svaret.
   Fase 2s heving til 4 + dekningssjekk-regelen treffer målt smerte.
2. **Q5 er august-klassen live:** SDMX-404 (flowRef/nøkkelform) brant hele
   budsjettet uten svar. Fase 2s feilkropper + guider + hint-vakt er
   designet mot akkurat dette.
3. Ærlighetsmekanikken virker allerede (badge, ingen fabrikasjon) — det som
   mangler er at første script treffer.

Etter-måling: kjør samme fem spørsmål etter fase 3 (spec §Testing).


---

# Midtveis-måling ETTER fase 2 (2026-08-04, samme oppsett, ny kode dc186ef)

| # | Baseline (tak 3) | Midtveis (tak 4) | Endring |
|---|---|---|---|
| 4 | 211 s, 3/3, PASS m/slitasje | 147 s, **4/4, FEIL-badge** (fikk data, budsjett ut før figur) | tid ↓, utfall ↓ |
| 5 | 83 s, 3/3, ÆRLIG FEIL (OECD-404) | 132 s, **4/4**, websøk-fallback ga kildebasert svar; metadata×2+probe×1 brukt | utfall ↑ (svar levert), fortsatt tomt |
| 6 | 162 s, 3/3, PASS+figur | **73 s**, 4/4, PASS+figur, riktige tall | tid HALVERT |
| 12 | 87 s, 3/3, PASS (worldbank) | 153 s, **4/4**, uferdig — Eurostat icha11-koder; tomt-uttrekk-vakten fyrte og modellen resonnerte riktig om årsaken, men budsjettet tok slutt | utfall ↓ |
| 11 | 70 s, 0, PASS | 95 s, 0, PASS (research-scope korrekt) | ~uendret |

## Analyse

1. **Budsjett-metning består: «work expands».** 3-tak ga 3/3; 4-tak gir 4/4.
   Run-budsjettet brukes som ARBEIDSPLAN (hent data i én kjøring, figur i
   neste, patch i neste) — ikke som reparasjonsreserve etter ETT komplett
   script. Budsjettheving var feil medisin alene; run-DISIPLIN er neste.
2. **Vaktene virker målbart:** tomt-uttrekk-vakten fanget stille-tomt
   Eurostat-uttrekk (M-Q12, modellen navngir årsaken); metadata/prober
   brukes (M-Q5) men ikke konsekvent (M-Q4: 0 prober).
3. **ROUTING kan feilstyre mot vanskeligere kilder:** M-Q12 valgte eurostat
   (EU→eurostat-regelen) der baseline valgte worldbank og PASSERTE — enklest
   spørremodell bør trumfe geografisk «riktighet» når flere kilder dekker
   spørsmålet.
4. **Telemetri-e2e bekreftet i forbifarten:** M-Q4s feilede løp produserte
   ekte feilrapporter til Anvil (første organiske rader).
5. Forbehold: n=1 per spørsmål, høy modellvarians — men taket-fylles-mønsteret
   er konsistent over alle 8 datatunge målinger (4+4).

## Anbefalte neste grep (små, prompt-nivå)

A. **Run-disiplinregel i RUN-blokka:** run 1 SKAL være komplett
   (last+analyse+figur i ett script); kjørebudsjettet er REPARASJONER, ikke
   arbeidsdeling; ved tomt-uttrekk: table_metadata(find=) FØR ny kjøring.
B. **Enklest-kilde-regel i ROUTING:** dekker flere kilder spørsmålet, velg
   den med enklest spørremodell (worldbank/owid før eurostat/oecd for
   enkle indikatorer).
C. Deretter: la telemetrien samle organiske feil før mer bygging; fase 3
   som planlagt.


---

# Stikkprøver ETTER run-disiplin + enklest-kilde-reglene (2026-08-04, 8f2d4db)

| # | Midtveis | Stikkprøve m/nye regler | Endring |
|---|---|---|---|
| 4 | 147 s, 4/4, FEIL-badge | **86 s, PASS uten badge, figur** — og RIKTIG tall: 7,9 % (VB 2022), verifisert mot spike-fasiten (wbgapi: NOR 2022 = 7,91). Baselinens «10,2 % (2022)» var et STILLE GALT tall ingen fanget. | klart bedre |
| 12 | 153 s, 4/4, uferdig (eurostat-koder) | 127 s, 4/4, badge — men svar LEVERT fra kjøring 2s output (data inne; siste polerings-kjøringer feilet) | delvis bedre |

## Konklusjon etter tre målerunder

1. **A+B-reglene ga målbar bedring** på begge re-testede spørsmål (tid,
   utfall, og i Q4s tilfelle KORREKTHET).
2. **Fyll-taket-mønsteret består** (4/4 i alle datatunge kjøringer, alle tre
   rundene). Modellen bruker restbudsjett til «polering» (ny figur-kjøring)
   selv når svaret foreligger — og når SISTE kjøring feiler, settes
   advarsels-badgen selv om en TIDLIGERE kjøring ga dataene (Q12).
   Dette er ikke lenger et prompt-problem: kandidattiltak er løkke-nivå
   («svar-klart → stopp»-signal; badge-logikk som ser på beste, ikke siste,
   kjøring) — eget spor, ikke fase 3.
3. Videre måling bør nå skje via TELEMETRIEN (organiske feil) i stedet for
   flere kostbare evalrunder.
