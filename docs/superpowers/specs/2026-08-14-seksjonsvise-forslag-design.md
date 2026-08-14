# Design: Seksjonsvise forslag — forslags-generering som får plass i edge-vinduet

Dato: 2026-08-14. Status: utkast til Hans' review.

Innløser v2-punktet fra kildeforbedring-specen 2026-08-13 («seksjonsvise
patcher — kun hvis full-tekst-retur viser seg dyr»), som nå har MÅLT
behov: forslags-endepunktet genererer `ny_tekst` som HELE det reviderte
dokumentet — for en ~40k-tegns OECD-kopi er det 12–17k tokens output i én
enkelt strøm (flere minutter), mens edge-funksjonen har hard
plattformgrense og ingen continue-protokoll. Målt 2026-08-14: «edge
function timed out» på Hans' forbedringskall, og retry hjelper ikke når
kallet strukturelt ikke får plass i vinduet.

## Mål

Forslag returnerer KUN endrede seksjoner (typisk noen hundre tokens);
klienten fletter dem inn i originalen. Genereringen krymper fra minutter
til sekunder, og 8k-klipp-problemet for store dokumenter forsvinner som
bieffekt (fletting skjer mot UKLIPPET original klientside).

## 1. Kontrakt (erstatter full ny_tekst — ingen bakoverkompat)

`forslag`-elementer får formen:

```json
{"id": "user:… | builtin:…",
 "deler": [{"del": "kort" | "guide" | "hode" | "prefix", "ny_tekst": "…"}],
 "begrunnelse": "…"}
```

- `del`-vokabularet er nøyaktig splitKortGuide-lagene (js/source-doc.js):
  `prefix` (maskindel/front matter), `hode` (tittel + innledning), `kort`
  (`## Kort`-blokken), `guide` (alle øvrige seksjoner). Ukjente
  del-verdier filtreres stille i parseren.
- `ny_tekst` per del er HELE den nye delen (inkl. `## Kort`-overskriften
  for kort-delen) — deler modellen ikke nevner, står urørt.
- Prompten instruerer: endre færrest mulige deler; `prefix` KUN når
  feilen beviselig sitter i maskinfeltene.
- `kode_sak` og `melding` er uendret. `oppgave:'kort'`-modusen returnerer
  naturlig bare kort-delen.

## 2. Fletting og visning (klient)

- **Flettefunksjon (ren, node-testet):**
  `flettDeler(originalTekst, deler) -> ny fulltekst` — splitKortGuide på
  originalen, erstatt nevnte deler, rekonstruer
  `prefix + hode + kort + guide` med normaliserte blanklinje-skjøter
  (én tom linje mellom deler; splitKortGuide-joinens kjente
  linjeskift-tap håndteres HER én gang for alle).
- **Diff-kortet** viser diff per ENDRET del (mindre, mer lesbare kort);
  Bruk/PR opererer på flettet fulltekst — Profiles.update og
  kilde-pr-endepunktet er UENDRET.
- **Uklippet original:** payloaden til modellen sender fortsatt klippede
  tekster (docs 40k, ref_docs 8k — budsjettdisiplin), men FLETTINGEN skjer
  mot den uklippede originalen (Profiles-lageret for egne kilder;
  ny uklippet lokal henting av data/sources/<id>.md for builtin) —
  dermed kan 8k-PR-guarden fra 2026-08-14-runden ERSTATTES av flettingen
  (halen består urørt), og builtin-PR åpnes igjen for store dokumenter.

## 3. Server

- `max_tokens` senkes 16 000 → 6 000 (en del er sjelden >3k tegn; hele
  gevinsten ved runden). Prompt-fasiten omskrives til deler-kontrakten
  (svarformat-eksempel + regler); TS-konstant byte-lik som før.
- Endepunkt/koersjon uendret utover promptteksten (deler valideres
  klientside i parseren — samme tillitsmodell som i dag).

## 4. Verifisering

- flettDeler: hver del alene, flere deler, ukjent del filtrert, tomt
  deler-array = uendret tekst, blanklinje-normalisering, round-trip på
  ekte data/sources-filer (flett uten deler == normalisert original).
- Parser: deler-form, filtrering, oppgave:'kort' → kun kort-del.
- Prompt-drift som før. Manuell smoke: OECD-kopien (40k) → forslag på
  sekunder uten timeout; builtin-PR på stort dokument bevarer halen
  (sjekk PR-diffen).

## 5. Filer

js/kilde-forslag.js (parser, flettDeler, kortvisning per del, uklippet
originalhenting), js/source-doc.js (ev. flette-hjelper her i stedet —
avgjøres i planen), prompts/kilde-forslag.md + kilde-forslag.ts
(kontrakt + max_tokens), tester. Estimat ~1,5 økter.

## Bevisst utelatt

- Linjenivå-patcher (diff-format) — skjøre å applisere; delnivå er
  robust nok og matcher dokumentmodellen.
- Vilkårlige seksjonsnavn som deler — de fire splitKortGuide-lagene ER
  modellen; finkornethet innen guide-delen tas ev. senere.
