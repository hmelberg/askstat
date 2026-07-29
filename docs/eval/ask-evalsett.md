# Ask-evalsett (manuelt, kjøres i ask-visningen med BYOK)

Suksess generelt: riktig rute vises i prosesslinjene, svar-kortet følger
kontrakten (Svar / Slik ble det beregnet / Forbehold), alle tall i «Svar»
finnes i output-panelet, og «Åpne i Python-modus» viser script med
proveniens-blokk (`# ══ ask ══ …`) øverst.

| # | Spørsmål | Forventet rute | Suksesskriterium |
|---|---|---|---|
| 1 | Er 7919 et primtall? | beregning | Ja + kode uten datakilder |
| 2 | Hvor mange dager er det mellom 1. mars og 24. desember 2026? | beregning | Riktig antall fra kjøring |
| 3 | Hvor mange r-er er det i «spirrevipp»? | beregning | 2, beregnet med kode |
| 4 | Hvor stor andel av BNP bruker Norge på helse? | data | Kilde (OECD/SSB) + år oppgitt i «Slik ble det beregnet» |
| 5 | Hvilke nordiske land har høyest arbeidsledighet nå? | data | Sammenlignbar kilde + samme periode |
| 6 | Hvordan har folketallet i Oslo utviklet seg siste ti år? | data | SSB-tabell + plott i output-panelet |
| 7 | Hva er hovedstaden i Ghana? | oppslag | Kildebasert-merking ELLER kodesvar; kilde listet |
| 8 | Hvem skrev Prosessen? | oppslag | Kildebasert-merking; kilde listet |
| 9 | Bør Norge prioritere unge i helsekøen? | språk | «Ikke verifisert»-merking, ærlig drøfting |
| 10 | Skriv et dikt om statistikk | språk | «Ikke verifisert»-merking |

Feilhåndtering (kjøres i tillegg):
- Avbryt midt i en kjøring → «Avbrutt», ingen svar-kort.
- Spørsmål med bevisst umulig datakrav (f.eks. «antall enhjørninger per fylke»)
  → ærlig prosa-/feilsvar, ALDRI oppdiktede tall.

## Kjøringslogg

### 2026-07-29 — automatisert kjøring (playwright, BYOK fra .env, fast-dybde, auto-run)

| # | Rute | Tid | Resultat |
|---|---|---|---|
| 1 | beregning ✓ | 18 s | PASS — «Yes, 7919 is a prime number … #1000»; tall i output; proveniens-blokk ok; ingen echo |
| 2 | beregning ✓ | 32 s | PASS — 298 dager (eksklusiv konvensjon, forbehold om 299 ved inklusiv) |
| 3 | beregning ✓ | 20 s | PASS — 2 r-er, posisjon 3 og 4 |
| 4 | data ✓ | ~4,5 min | PASS — 9,4 % av BNP (2023, Verdensbanken SH.XPD.CHEX.GD.ZS) + nabolandssammenligning; 3 reparasjonsrunder reddet en worldbank-direktivfeil; ingen strømfeil i fast-modus |
| 5 | data ✓ | ~3,5 min | ÆRLIG FEIL — Eurostat une_rt_m hentet ufiltrert (duplikatrader, meningsløse verdier); tolk-ask NEKTET å oppgi tall og sa outputen er ubrukelig. Anti-hallusinasjon virket; se funn F1 |
| 6 | data ✓ | ~3 min | PASS — SSB 11342: 647 676 (2015) → 728 714 (2026), +12,5 %, MED plott i output-panelet; 1 reparasjonsrunde |
| 7 | oppslag ✓ | 6 s | PASS — «Accra», korrekt kildebasert-merking; men intet reelt websøk/kildeliste (se funn F2) |
| 8 | oppslag ✓ | 6 s | PASS — Kafka; samme F2-funn |
| 9 | språk ✓ | 6 s | PASS — ærlig drøfting med «Not verified»-merking |
| 10 | språk ✓ | 6 s | PASS — dikt med «Not verified»-merking |

**Funn:**
- **F1 (semantisk reparasjon mangler):** Når koden kjører feilfritt men dataene er
  søppel (Q5: ufiltrert Eurostat-uttrekk), utløses ingen reparasjonsrunde —
  tolk-ask fanger det ærlig, men spørsmålet forblir ubesvart. Mulig forbedring:
  la tolk-ask signalisere «output ubrukelig» tilbake til en semantisk
  reparasjonsrunde.
- **F2 (oppslag uten kilde):** For trivielle fakta svarer modellen fra egen
  kunnskap uten websøk → korrekt merking, men ingen kildeliste. Mulig
  forbedring: oppslagsruten bør instruere om kildeverifisering (web_search)
  også for lette fakta.
- Auto-kjøring, engelsk UI, proveniens-blokk og echo-av verifisert i alle
  relevante kjøringer. «Error in input stream» (deep-modus, 2026-07-28)
  reproduserte IKKE i fast-modus.

### 2026-07-29 (senere) — F1/F2 fikset og verifisert live

- **F1 LØST:** tolk-ask flagger ubrukelig output med `UNUSABLE_OUTPUT:`-markør
  → ask-visningen kjører ÉN semantisk reparasjonsrunde (`mdAskRun` med
  `initialRepair`). Verifisert på Q5: første uttrekk flagget → reparasjon →
  korrekt SA/ILO-filtrert Eurostat-svar (Island 14,0 %, Norge 6,0 %, juni 2026).
- **F2 LØST:** oppslagsruten krever nå reelt websøk + kilde-URL. Verifisert på
  Q7: «Accra» med Britannica-lenke i svaret (10 s).
- **F3 FUNNET+LØST (rotårsak for strømfeilene):** `web_fetch` manglet
  `max_content_tokens` — et ufiltrert Eurostat-JSON ga «prompt is too long:
  4 718 995 tokens» (Anthropic 400) og forklarer trolig også «Error in input
  stream» i deep-modus 2026-07-28. Tak satt: 15k (fast) / 30k (deep).
  **Kandidat for cherry-pick til openstat.**
- **Worldbank-prompten forbedret:** read-formen med ressurssti
  (`country/<ISO3>/indicator/<ID>`) står nå eksplisitt i JSON-API-avsnittet —
  Q4 kostet tre reparasjonsrunder på å lære den av resolver-feilmeldingen.
  Også kandidat for cherry-pick.

### 2026-07-29 (kveld) — UI-runde 2 verifisert live (commit 762f1b1)

- Output-panelet er HELT ute av ask (off-screen m/ekte bredde for plotly);
  kodevisningen viser det urørt. Verifisert begge veier, inkl. bytte-stien.
- Q4 på nytt: worldbank-prompteksemplet virket — modellen probet riktig
  ressurssti direkte (ingen direktivfeil); svar med figur under
  «More information» (9,4 %, 4. plass i Norden, under nordisk snitt 9,9 %).
- Sidebar-viser-fiksen verifisert: ⊞ på `df` gir Tabulator-tabell, ingen
  KeyError. (openstat har samme bug — med i patchen.)
- Ny CSS-felle målt og fikset: `.ask-view-wrap{display:flex}` slo `[hidden]`
  og ga 0px output-panel i editor-visningen etter bytte.
- Patchen til openstat regenerert med alle TRE motorfiksene; `git apply
  --check` grønn mot openstats nåværende tre.
