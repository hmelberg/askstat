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
