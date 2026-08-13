# Design: Kort/lang-splitt for egne kilder — guides_override + KI-vedlikehold av begge lag

Dato: 2026-08-13. Status: utkast til Hans' review.

Oppfølger til kildeforbedring-runden (2026-08-13-kildeforbedring-egne-kilder,
levert samme dag). Utløst av målt erfaring: en OECD-kopi på ~40 000 tegn
flyter i dag IVRIG i hver dataforespørsel (pakkeblokka), mens originalen
fløt LAT (8 000-tegns guide etter første verktøykall) — tyngre førstekall
og mer eksponering for oppstrøms strømbrudd. Prinsippet finnes allerede
for innebygde kilder (kildedokument-specen 2026-08-09 §2: «Kort» → alltid i
prompten, «Guide» → lat); denne runden gir brukernivået samme to-trinns-flyt,
og lar KI-en lage og vedlikeholde begge lag.

## Mål

1. **Kortversjonen velger, langversjonen veileder** — også for egne kilder
   og kopier: modellen ser en stram Kort-tekst når den velger kilde, og får
   bruksanvisningen først når den faktisk bruker kilden.
2. **Brukeren kan redigere begge lag** — også for innebygde kilder (via
   kopi, som allerede bærer begge seksjoner).
3. **KI-en forstår lagene**: forbedringssløyfa vurderer eksplisitt om en
   endring hører hjemme i Kort eller Guide (eller i adapterkode — da sier
   den det i stedet for å dikte en tekstendring), og kan generere en
   manglende kortversjon.

## 1. Dokumentmodellen: to lag i ETT dokument

Alle kildebeskrivelser — egne, importerte, kopier — bruker samme
seksjonskonvensjon som repo-fasiten `data/sources/*.md`:

- `## Kort` — valginformasjon: hva slags data, dekning, når kilden passer.
  Stram; koster tokens i hvert svar.
- `## Guide` — bruksanvisning: endepunkter, parametre, quirks, eksempler.
  Lat; koster kun når kilden faktisk brukes.

**Raus splitt-parser** (Postel, ren funksjon i js/kilde-forslag.js eller
js/source-doc.js — avgjøres i planen): finnes overskriftene, splittes det
der; mangler de, er første avsnitt (etter ev. front matter) Kort og resten
Guide. En kilde uten Guide-stoff er bare Kort — det er lov.

**Redigering av begge lag = å redigere dokumentteksten** i den eksisterende
editoren. Ingen ny UI, ingen to-felts-skjema: kopier av innebygde kilder
inneholder allerede både `## Kort` og `## Guide` fra fasitfila, så «brukeren
må få redigere begge» er dekket av kopi-mekanikken fra forrige runde.

## 2. Kopier av innebygde kilder: `guides_override` erstatter `guides_off`

- Klienten sender `guides_override: {<of-id>: <kopiens Guide-tekst>}` for
  aktive builtin-kopier (samme payload-søm som dagens `guides_off`).
- Serverens guide-attacher (`_lib/source-guides.ts`) bruker override-teksten
  (samme 8 000-tegns tak som repo-guider) i stedet for å hente
  `data/source-guides/<id>.md` — på nøyaktig samme late tidspunkt: første
  search_catalog/table_metadata-svar for kilden. Verktøy-dispatchen og
  registerblokka er fortsatt urørt (§8-fella fra forrige runde står).
- Kopiens **Kort**-seksjon (+ front matter-fakta) flyter ivrig som liten
  pakketekst — det er alt som flyter ivrig.
- `guides_off` UTGÅR (ingen brukere å migrere; av-flagget var v1-formen av
  akkurat dette). Server-side beholdes toleranse for ukjente felter som
  ellers.
- Størrelsesvakt: override-verdier klippes klientside til 8 000 tegn og
  telles i payload-budsjettet.

## 3. Rene egne kilder: Kort ivrig, resten via get_pack

Den late kanalen finnes allerede: composeren (js/packs.js) har nivåene
full/manifest/summary, og serverprompten merker kortform-pakker med
«*(kortform — hent full tekst med get_pack)*» — get_pack er alltid på.
Endringen er en POLICY-flipp, ikke ny mekanikk:

- Egne kilder (kind source) sendes som nytt nivå **'kort'**: front matter +
  `## Kort`-seksjonen (fallback: dagens summaryOf). Full tekst hentes ved
  behov via get_pack, som i dag for budsjettpressede pakker.
- **Unntak — små dokumenter**: tekst under ~1 500 tegn flyter fortsatt
  full; å splitte en tre-linjers kilde er støy, ikke sparing.
- Oversikts-pakker (kind overview) er uendret — de ER valginformasjon.
- Kopier med registeranker følger §2 (guides_override), ikke denne — Guide
  skal ankomme ved verktøykallet, ikke kreve en get_pack-omvei.

## 4. KI-en lager og vedlikeholder begge lag

**a. Forbedringssløyfa (prompts/kilde-forslag.md utvides):**

- Ny regel: vurder EKSPLISITT hvilket lag evidensen peker på — feil
  kildevalg → Kort; feil bruk av riktig kilde → Guide. `begrunnelse` skal
  navngi laget.
- `ny_tekst` skal alltid inneholde begge seksjoner; mangler `## Kort` i
  originalen, genereres den (stram: 2–4 setninger valginfo).
- Ser rotårsaken ut til å ligge i adapterkode/appen (f.eks. en målt
  serverfeil kopiteksten ikke kan påvirke): INGEN tekstendring — si det i
  `melding`, og for admin: lever en strukturert kodesak (§4c). Sløyfa
  skriver ALDRI adapterkode selv.

**b. Editor-knappen «Foreslå Kort (KI)»:**

I kilde-editoren: gjenbruker kilde-forslag-endepunktet med et oppgave-flagg
(`oppgave: 'kort'` — uten kjøringslogg; kun dokumentteksten som evidens),
og viser forslaget med samme diff/Bruk/Forkast-mekanikk som resten av
sløyfa. To tilstander (Hans' presisering 2026-08-13):

- **Egen kilde UTEN `## Kort`**: knappen heter «Foreslå Kort (KI)» og
  forslaget DESTILLERES fra brukerens langversjon (Guide/resten av
  dokumentet) — langversjonen er kilden, Kort er sammendraget.
- **Kopi av innebygd (eller kilde som alt har `## Kort`)**: fasitens Kort
  er utgangspunktet — knappen heter «Forbedre Kort (KI)» og forslaget er
  en revisjon av eksisterende Kort i lys av resten av dokumentet, ikke en
  nygenerering.

Eksplisitt klikk — aldri automatisk KI-kall ved lagring
(overraskelsesprinsippet + BYOK-kost).

**c. Kode-sporet (KUN admin, Hans' tillegg 2026-08-13): tredje utfall →
GitHub-issue.**

Noen rotårsaker kan verken Kort eller Guide fikse — de ligger i selve
innlastingsmetodene (adapterne/appkoden). Da skal sløyfa ikke fikse, men
BESTILLE:

- **Svarkontrakten utvides** med et valgfritt tredje utfall:
  `kode_sak: {tittel, kropp}` — satt KUN når evidensen peker på kode, og
  kan sameksistere med tomt `forslag`. Kroppen er et strukturert oppdrag
  skrevet FOR en kode-KI som senere får repoet foran seg: hva som feilet
  (scrubbet evidens), hva som til slutt virket, hvilken kilde/adapter som
  er mistenkt, antatt mekanisme, og foreslått retning — IKKE kodeforslag
  (sløyfa ser aldri appkoden og skal ikke gjette den).
- **Modalen** viser kodesaken som eget kort bak `erAdmin()` (samme vakt som
  PR-knappen) med knappen **[Opprett GitHub-issue]**. Ikke-admin ser bare
  den ærlige `melding`-linjen som før.
- **Endepunktet**: `kilde-pr.ts` utvides med issue-modus (body
  `{issue: {tittel, kropp}}` → ett kall: POST `/repos/<repo>/issues` med
  etikett `kilde-kodesak`) — samme adminGate uten BYOK-forbikjøring, samme
  token. Issue fremfor PR fordi det ikke finnes noen fil å endre; issuen
  ER prompten som gis videre til kode-KI-en (f.eks. en Claude Code-økt mot
  repoet).
- **PAT-en trenger Issues RW i tillegg** til Contents RW + Pull requests RW
  (engangsjustering i GitHub-innstillingene; dokumenteres i README +
  .env.example-kommentaren).

## 5. Sikkerhet og ytelse

- Scrub-regimet er uendret (samme payloadbygger, samme drift-test).
- Netto-effekten er MINDRE ivrig payload per spørsmål — det var
  motivasjonen (tunge førstekall). Ingen nye utgående veier.

## 6. Verifisering

- Splitt-parseren: overskrifts-form, Postel-fallback (første avsnitt),
  front matter bevart, dokument uten Guide, tomt dokument.
- Compose-nivå 'kort': egne kilder får Kort + get_pack-hint; små dokumenter
  flyter fulle; overview uendret; budsjettregnskapet stemmer.
- Attacher: override-tekst brukt i stedet for fetch (ingen fetch når
  override finnes), 8k-klipp, andre kilder upåvirket; guides_off borte.
- Prompt-regelen: lag-vurderingen i begrunnelse (drift på .md ↔ TS-konstant
  som før); oppgave:'kort'-modusen returnerer kun Kort-endring.
- §4c: parseren tåler kode_sak (med/uten forslag); issue-modusen i
  kilde-pr-core testes med mocket fetch (ett kall, riktig kropp/etikett);
  ikke-admin får 403 og ser aldri kortet; manuell smoke: fremprovoser en
  kodesak (f.eks. mot en kilde med kjent adapterfeil) → issue på GitHub med
  scrubbet evidens og agent-klar bestilling.
- Manuell smoke (Hans): OECD-kopien fra i dag → verifiser at førstespørsmål
  nå sender liten pakketekst (nettverksfanen) og at guiden din ankommer
  ved første katalogkall (Details-sporet); rediger Kort i kopien → se
  endringen i neste spørsmåls payload.

## 7. Filer som endres (plan-nivå detaljeres senere)

| Fil | Endring |
|---|---|
| js/kilde-forslag.js (el. source-doc.js) | splitt-parser (ren, testet) |
| js/packs.js | compose-nivå 'kort' + policy for user-kilder; guides_override-bygger (erstatter builtinOverstyrte-feltbruken) |
| js/ai-chat.js | payload: guides_override i stedet for guides_off |
| js/sources-modal.js / editor | «Foreslå Kort (KI)»-knapp |
| netlify/edge-functions/_lib/source-guides.ts | override-kart i attacheren |
| netlify/edge-functions/svar.ts | coerce guides_override (id→tekst, tak) |
| netlify/edge-functions/kilde-forslag.ts + prompts/kilde-forslag.md | lag-regelen + oppgave:'kort' + kode_sak-utfallet |
| netlify/edge-functions/kilde-pr.ts (+ core/tester) | §4c: issue-modus (POST /issues m/etikett) |
| README + .env.example | PAT-scopet utvides m/Issues RW |
| tester | jf. §6 |

Estimat: ~2,5 økter.

## Bevisst utelatt

- **Lat kanal for adapterløse egne kilder utover get_pack** — de har ikke
  noe verktøykall å henge guiden på; get_pack er kanalen.
- **Auto-generering av Kort uten klikk** (f.eks. ved lagring) —
  overraskelsesprinsippet.
- **Adapterkode-endringer fra sløyfa** — sløyfa skal kunne SI at feilen er
  en kodesak og (for admin) BESTILLE fiksen som issue (§4c), men aldri
  skrive koden selv; koden eies av repo-løypa/kode-KI-en som får issuen.
- **Auto-issue uten klikk og issues fra ikke-admin** — samme regel som
  PR-kanalen: eksplisitt admin-handling, aldri automatikk.
- **Registerlinje-overstyring**: den maskingenererte registerlinja for
  innebygde kilder (navn/kind/tags fra front matter) står — kopiens Kort
  SUPPLERER den ivrig; å erstatte selve linja krever server-tillit til
  brukertekst i den cachede prefiksen og tas ev. med overleggene i
  kildedokument-v1b.
- **openstat-port** — askstat-først som resten.
