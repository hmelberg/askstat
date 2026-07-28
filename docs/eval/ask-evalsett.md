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

(Noter dato, spørsmålsnummer og avvik her.)
