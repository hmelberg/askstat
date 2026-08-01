# Utforsk-ruten: verdi- og teorispørsmål som utforskbare modeller

**Dato:** 2026-08-01 · **Status:** godkjent design, venter på implementasjonsplan

## Bakgrunn og problem

Ruteren (`ask-ruter.ts`) klassifiserer i fire ruter: beregning / data / oppslag /
språk. To målte problemer:

1. **«språk» er en samlekurv.** Den blander tre klasser som fortjener ulik
   behandling: (a) rent språklige/kreative forespørsler (oversett, skriv et
   dikt) der direktesvar er riktig; (b) normative/konseptuelle spørsmål
   («Hva er rettferdighet?», «Bør staten godkjenne et legemiddel til
   1 mill. kr per QALY?»); (c) wicked spørsmål med høy usikkerhet («Vil KI gi
   masse­arbeidsledighet?»). Bare (a) fortjener blindveien: kort direktesvar
   fra ruteren, ingen kode. (b) og (c) kan *belyses* av en enkel modell som
   gjør uenigheten eksplisitt — men når aldri pipelinen.
2. **REFORM-blokka sultes av rutingen.** `svar-prompt.ts` har allerede en
   omformingsblokk («verdi- og teorispørsmål kan belyses med kode»), men den
   monteres kun i beregning-ruten — som verdispørsmål aldri rutes til.
   Maskineriet finnes; rutingen sulter det.

Designprinsipp fra brainstormen (2026-08-01): skill **epistemisk type** (hva
slags påstand som ville besvart spørsmålet) fra **ressursbehov** (kode, data,
websøk, simulering, interaktivitet). Ruteren skal være grov og bare avgjøre
rørlegging (blokk-montering + verktøy); findiagnosen skjer inne i svar-løpet,
slik QUERYLOGIC allerede gjør deskriptivt/kausalt-triagen for data-ruten.

## Strategi (én setning)

> Ikke avgjør spørsmålet direkte. Oversett det til en modell som viser hvilke
> fakta, verdier og antakelser ulike svar avhenger av.

Denne setningen åpner den nye prompt-blokka ordrett — den er rutas identitet.

## Mål

- Ny rute **utforsk** i ruteren og `/api/svar`-pipelinen; **språk** smalnes til
  rent språklige/kreative forespørsler.
- En UTFORSK-kontrakt formulert som **egenskaper svaret skal ha, ikke
  seksjoner det skal inneholde** (anti-mal-prinsippet: en obligatorisk
  sjuseksjons-mal gir rituell etterlevelse, ikke tenkning — modellen dikter
  en grunn terskel for å fylle seksjonen).
- **Dekomponerings-gate** før kode (utforsk-analogen til variabelplan-gaten).
- Hard regel: **verdipremisser velges aldri stille** — de eksponeres som
  brukerstyrte parametre eller eksplisitte posisjoner.
- Konklusjoner som **regionbeskrivelser**, ikke scenario-prosenter.
- Kompakt **ærlighetsfooter** (tre punkter) + framing-linje.
- To fellesregler i RUN-blokka (alle ruter): definisjonskontrovers-regelen og
  en escape-hatch for feilruting.
- REFORM pensjoneres (erstattes av utforsk; ingen bakoverkompat-hensyn).

## Ikke-mål (bevisst utelatt, YAGNI)

- **Registerdata/ost-direktiver i utforsk.** v1 bruker websøk + transkribering
  + merket modellkunnskap for empiriske ankere. Datatunge spørsmål har
  data-ruten; escape-hatchen (se §5) dekker grensetilfellene.
- **Egen prognose-rute.** Prediktive spørsmål («hva blir inflasjonen neste
  år?») rutes fortsatt til data; SCIENCE-blokkas kausale slagside mot
  prognoser er et kjent gap som noteres i svar.md, ikke fikses nå.
- **Automatisk parametersveip-harness.** Terskelsøk er modellens ansvar i
  scriptet (løkke/grid i koden), ikke et eget klientverktøy.
- **Ny UI.** Utforsk bruker eksisterende ask-flyt, split-knapp og dybdevalg.
  Ingen nye knapper eller innstillinger.
- **v2-pipelinen** (`kode-svar-v2.ts`) røres ikke.

## 1. Ruterendring (`prompts/ask-ruter.md` + `RUTER_SYSTEM` i `ask-ruter.ts`)

Rutelista utvides til fem. Ny og endret rutetekst (utkast, finpuss i
implementasjonen):

- `"utforsk"`: normative, konseptuelle eller svært usikre spørsmål der et
  direkte svar ville vært en mening eller en skuldertrekning — men der en
  enkel modell med navngitte parametre kan gjøre uenigheten eksplisitt.
  Test: *ville en enkel modell med navngitte parametre gjøre det klarere hva
  svaret avhenger av?* Ja → utforsk.
- `"språk"` (smalnet): rent språklige eller kreative forespørsler
  (oversettelse, dikt, omformulering, ren tekstproduksjon). Fortsatt KUN
  denne ruta som får direktesvar i `"svar"`-feltet.

TOLKNING for utforsk: kort operasjonell omforming — hvilken beslutning,
avveining eller mekanisme som kan modelleres (f.eks. «QALY-terskel som
funksjon av budsjettvirkning og vekting av alvorlighet»).

JSON-kontrakten er uendret (`svar`-feltet fortsatt kun for språk). Klientens
fallback ved ugyldig ruter-JSON er uendret: `data`.

## 2. UTFORSK-blokka (`INTRO_UTFORSK` i `svar-prompt.ts`, dokumentert i `svar.md`)

Kontrakten har fire deler, i denne rekkefølgen. NB: dette er *egenskaper*
svaret skal ha — blokka skal eksplisitt si at formen følger spørsmålet, og at
elementer som ikke gir mening for akkurat dette spørsmålet droppes med én
setnings begrunnelse i stedet for å fylles rituelt.

**2a. Oppdrag + framing (én gang per svar).** Strategisetningen ordrett.
Deretter framing-regelen: svaret åpner med den operasjonelle tolkningen og
markerer at dette er ÉN måte å formalisere spørsmålet på (modellformen er
systemets valg, ikke gitt av spørsmålet). Denne linja erstatter et eget
«hvem valgte modellen»-footerpunkt — som gjentagende kulepunkt degenererer
det til boilerplate.

**2b. Invarianter (gjelder alltid).**

- **Dekomponerings-gate før kode:** kompakt tabell —
  komponent | klasse (`empirisk` / `verdipremiss` / `strukturantakelse`) |
  håndtering (`data` / `simulering` / `parameter` / `prosa`) | kilde eller
  antatt verdi. Klassene styrer håndteringen: empirisk m/ kilde → hent/
  transkriber (§3); empirisk uten kilde → antatt verdi, merket; verdipremiss
  → brukerstyrt parameter; strukturusikkerhet → to modellformer eller
  sensitivitetsnote.
- **Verdipremisser velges aldri stille.** Systemet kan velge empiriske
  antakelser (og merke dem), men aldri verdier *for* brukeren. Der modusen
  har interaktive kontroller (python: `#@param`/ipywidgets) eksponeres
  verdipremisser som kontroller; ellers som tydelig markerte konstanter
  øverst i scriptet + en posisjonstabell i svaret (r/duckdb).
- **Ærlighetsfooter, tre punkter:** utelatte konsekvenser; antakelser uten
  evidens; om alternative modellformer ville gitt andre svar. (Innbakte
  verdier trenger ikke footerplass — de er allerede synlige som parametre.)
- **Moralske spørsmål spesielt (Hans 2026-08-01):** maksimeringsformen er i
  seg selv et konsekvensetisk valg — etisk rammeverk behandles som
  strukturantakelse i gate-tabellen. Pliktetiske hensyn representeres som
  harde bivilkår (plikten er ikke omsettelig) eller, mykere, som høy
  kostnad ved brudd med brukerstyrt vekt — og grepet NAVNGIS (oversettelsen
  er selv filosofisk omstridt). Ved reell rammeverk-kontrovers vises begge
  rammene og hvor de divergerer, i stedet for stille valg. Prompten skal
  ALDRI anbefale utilitarisme fordi den er lettest å modellere.

**2c. Foretrukket konklusjonsform.**

- **Terskler som regionbeskrivelser:** «A vinner med mindre
  behandlingseffekten er under X eller vekten på den dårligst stilte gruppen
  over 2×» — aldri scenario-prosenter («best i 72 % av scenarioene») uten at
  fordelingen over scenarioer selv er navngitt som antakelse (et uniformt
  grid er en subjektiv prior i objektiv forkledning).
- **Robusthet:** hva som holder over hele den plausible parameterregionen.
- Eksplisitt lov å si «ingen meningsfull terskel finnes her».
- Avslutning: **hva vi trenger mer kunnskap om** — peker samtidig mot gode
  oppfølgingsspørsmål.

**2d. Midler (modellens valg).** Simulering, transkriberte småtabeller,
widgets, en 2×2-tabell over posisjoner, flere modellformer — velges per
spørsmål, styrt av gate-tabellens klasse→håndtering-mapping. Ingen av dem er
obligatoriske; en ren dekomponering i prosa er et gyldig svar når modellen
ikke tilfører innsikt.

**Kompleksitet vs. realisme (default med brukeroverstyring):** default er en
ENKEL modell med få, navngitte nøkkelparametre — enkelhet slår realisme,
leseren skal kunne forstå mekanismen (videreført fra REFORM). Men ber
brukeren selv om en rikere eller mer realistisk modell (flere mekanismer,
flere grupper, kalibrering mot tall), følges bestillingen — da er
kompleksiteten et ønske, ikke støy.

**2e. Ett kompakt worked example (few-shot) i blokka.** Ett eksempel lærer
formen bedre enn en påbudt disposisjon. Skisse (utformes presist i
implementasjonen, holdes kort — ~15 linjer):

> Spørsmål: «Bør staten godkjenne et legemiddel til 1 mill. kr per QALY?»
> Gate-tabell: betalingsvillighet per QALY = verdipremiss → slider;
> behandlingseffekt (QALY-gevinst) = empirisk, usikker → parameter m/
> plausibelt intervall; alvorlighetsvekting = verdipremiss → slider;
> budsjettvirkning fortrenger annen behandling = strukturantakelse →
> sensitivitetsnote. Konklusjonsform: «godkjenning lønner seg hvis
> terskelen settes over Y eller alvorlighetsvekten over Z» + footer.

## 3. Empiriske ankere uten registeret (`UTFORSK_DATA`-miniblokk)

Utforsk har ikke katalogverktøyene. Egen liten blokk (INLINE-stigen minus
nivå 1):

1. **Transkribert fra hentet innhold:** web_search/web_fetch → småtabeller
   (< ~50 rader) inline (`io.StringIO`-mønsteret), med kilde-URL i kommentar
   og merket «transkribert, ikke maskinelt verifisert».
2. **Modellkunnskap:** stabile referansefakta, merket «fra modellkunnskap —
   verifiser».
3. **Aldri** presentere antatte verdier som målinger: i en simulering er
   antatte størrelser *parametre*, ikke observasjoner. Fabrikasjonsvernet
   gjelder uendret.

Kjøringer uten web-verktøy (leverandører uten hosted web): kun nivå 2, og
modellen sier eksplisitt at empiriske ankere er uverifiserte.

## 4. Montering og verktøy (`svar-prompt.ts`, `svar.ts`)

- `AskRoute` utvides: `"beregning" | "data" | "oppslag" | "utforsk"`;
  `coerceRoute` beholder default `data`.
- Monteringstabellen (svar.md «Montering per rute») får ny rad:

  | Rute | Blokker (rekkefølge) |
  | --- | --- |
  | utforsk | INTRO_UTFORSK + DEPTH_UTFORSK[depth] + UTFORSK_DATA + MODE[mode] + RUN |

  Ingen registerblokk, DELIVERY, QUERYLOGIC, SCIENCE, META_SEARCH eller
  KODEBOK — de er data-rutens.
- **REFORM slettes**; beregning-raden blir INTRO_CALC + MODE[mode] + RUN.
  Ruteren sender nå verdi-/teorispørsmål til utforsk i stedet.
- **Dybde** skalerer ambisjon, ikke ærlighet (samme prinsipp som
  DEPTH-blokkene): to korte varianter `DEPTH_UTFORSK[depth]` —
  standard: ÉN enkel modell, 1–3 parametre, ≤ 2 web_search / ≤ 1 web_fetch /
  ≤ 3 run_code; deep: fleremodell-sammenligning eller grundigere
  sensitivitet, ≤ 5 web_search+web_fetch / ≤ 4 run_code.
- `buildRouteToolDefs("utforsk", …)`: run_code + web_search/web_fetch (hosted
  der leverandøren har det); ingen katalogverktøy.
  `depthClientToolCalls`/`depthRunCodeCalls` følger budsjettlinjene over.
- `prompts/svar.md` oppdateres synkront (source-of-truth-konvensjonen:
  TS-konstantene er det som sendes; .md-fila holdes byte-nær).

## 5. Fellesendringer i RUN-blokka (pipeline-rutene, ikke språk)

To nye regler, begge korte:

1. **Definisjonskontrovers:** når flere forsvarlige operasjonaliseringer gir
   vesentlig ulikt svar («helseutgifter»: SHA-definisjon? % av BNP? per
   capita?) — vis to, eller navngi valget eksplisitt i tolkningen. (Utvider
   «Slik tolker jeg spørsmålet»-normen; PARTIAL dekker allerede
   kilde­sprik, dette dekker definisjonssprik.)
2. **Escape-hatch for feilruting:** oppdager du underveis at spørsmålet
   egentlig er en annen type (en beregning som trenger data, et dataspørsmål
   som egentlig er normativt), si det eksplisitt i svaret og svar så godt
   rutas verktøy tillater. Billigere enn en perfekt ruter.

## 6. Klient (`js/ask-view.js`)

- `ASK_ROUTES` += `'utforsk'` (ellers faller ruta til data-fallbacken).
- Språk-kortslutningen er uendret; utforsk går gjennom `/api/svar` som de
  andre rutene (route-feltet sendes allerede).
- Progress-linje og provenance-kommentar (`buildAskProvenance`) viser ruta
  automatisk — ingen endring.

## 7. Feilhåndtering

- Ugyldig/ukjent rute fra ruteren → `data` (uendret, klient og server).
- Utforsk-kjøring der modellen ikke finner noe å modellere: dekomponering i
  prosa + footer er et gyldig minimumssvar (2d) — aldri en tvungen, tom
  simulering.
- Leverandører uten hosted web: §3-degradering (kun merket modellkunnskap).

## 8. Testing

- `prompt-assembly.test.ts`: utforsk-monteringen (blokk-rekkefølge; ingen
  registerblokk/DELIVERY; REFORM finnes ikke lenger — heller ikke i
  beregning); `coerceRoute("utforsk")`; verktøydefinisjoner og budsjettall
  per dybde for utforsk.
- Ruter-smoke (manuell, dev-port 8899): fire spørsmål — «Hva er
  rettferdighet?» (utforsk), «Bør staten godkjenne … per QALY?» (utforsk),
  «Oversett dette diktet» (språk), «Er 97 et primtall?» (beregning) — før
  push, jf. smoke-som-pre-push-port-praksisen.
- Synk-sjekk: `ask-ruter.md`/`RUTER_SYSTEM` og `svar.md`/`svar-prompt.ts`
  holdes byte-nære (eksisterende konvensjon, manuell).

## 9. Kjente v1-begrensninger (bevisste)

- Ingen registerdata i utforsk — empiriske ankere er transkribert eller
  merket modellkunnskap. Første naturlige utvidelse hvis utforsk-svar ofte
  trenger ordentlige tidsserier: gi deep-utforsk data-rutens
  oppdagelsesverktøy.
- Terskelsøk skjer i scriptet (grid/løkke), uten eget sveip-verktøy.
- Prognose-gapet i data-ruten står (notert i Ikke-mål).
