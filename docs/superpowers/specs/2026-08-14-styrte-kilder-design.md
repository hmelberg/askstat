# Design: Styrte kilder — deterministisk vei der treningsbias trumfer instruksjoner

Dato: 2026-08-14. Status: utkast til Hans' review (retning bekreftet i
samtale: gammel løsning består for ikke-styrte kilder; rå vei forblir
stengt også ved feil; kildebeskrivelsen rendyrkes til innhold/valg).

Bakgrunn: fem målte Oslo-kjøringer viste at guideregler og prompt-linjer
flytter atferd marginalt, mens miljøfakta (v0-hardskinnen) flytter den
umiddelbart — modellens treningsbias for velkjente API-er (SSB «PxWebApi
v1» = /api/v0, OECD .Stat, …) trumfer tekstlige instruksjoner, spesielt
under feilpress og i lange verktøyløp. Lukker samtidig det åpne
DSL-vs-LLM-vaner-sporet (notat i ROADMAP, 2026-08-02): svaret er ikke å
krympe ost-flaten, men å gjøre den til eneste dør for kildene der prioren
er giftig.

## Prinsipp

For kilder merket **styrt** skal modellen VELGE (tabell, parametre — fra
strukturert metadata), aldri KONSTRUERE (URL-er, formater, HTTP-detaljer).
Konstruksjonen eies av adapterne som allerede finnes; feil vei stenges som
miljøfaktum, riktig vei rekkes frem som ferdig linje. Alt annet er som før:
ikke-styrte kilder beholder dagens frie utforsking uendret.

## 1. Styrt-flagget

- Front matter i kildedokumentet: `styrt: true` — settes i v1 på **ssb,
  oecd, eurostat, ess** (målt problemklasse). Nye kilder merkes én om
  gangen ved målt behov, aldri i bulk.
- Generatoren (tools/source_docs.mjs) propagerer feltet til
  data-sources.json; serverens `parseRegistry`/DataSource og klientens
  registerlesing tar det med. Fravær = ikke styrt (alle eksisterende
  kilder uendret).

## 2. Skinnene — håndhevelse i miljøet, per avskjæringspunkt vi eier

- **Probe (server):** rå URL-er mot en styrt kildes `base_url` avvises med
  instruktiv feil: «<kilde> er styrt — bruk <alias>.read(…); lese-linjen
  får du ferdig fra table_metadata». (Trygt: adapterne prober aldri.)
  v0-skinnen består som i dag.
- **Script-lag (klient):** read-bridge/data-loader avviser RÅ lesinger
  (pd.read_csv/read_json/requests-mønstrene skannen alt fanger) mot styrt
  base_url med samme instruktive feil i run_result — men SLIPPER GJENNOM
  adapterveien (`<alias>.read`/direktiv-resolve, som er de samme lagene og
  derfor kan skille de to). NB: /api/hent-proxyen kan IKKE blokkere styrte
  base_url-er generelt — adapterne bruker den selv ved CORS; håndhevelsen
  bor i probe + script-laget, ikke i proxyen.
- **Feil-politikk (bekreftet):** rå vei forblir stengt OGSÅ når den styrte
  veien feiler — flukt-ved-feil er selve sykdommen. Adapterfeil skal være
  instruktive og korrigere VALGET (appens feiloversettelser finnes);
  reelle adapterhull går kodesak→issue-sporet (bevist virksomt:
  parquet-saken bestilt 13/8, levert 14/8). Ingen nød-luke i v1.

## 3. Positiv affordance: lese-linjen rekkes frem

`table_metadata` for en styrt kilde utvider svaret med **`lese_linje`**:
en deterministisk bygget, kanonisk linje for valgt tabell —
`# df = ssb.read("07459", regions=["<Region-kode>"], years="…", indicators=["<ContentsCode>"])`
— der obligatoriske dimensjoner (mandatory-flagget) står som navngitte
parametre med eksempelverdier fra metadataene. Prompten instruerer: «for
styrte kilder: kopier lese_linjen og juster KUN parameterverdiene». Dermed
møter modellen den riktige veien i nøyaktig det øyeblikket den har valgt
tabell — i stedet for bare stengte dører. (Bevisst IKKE et nytt
datahentings-verktøy server-side: det ville duplisert adapterne;
kjøringen skjer som før klientside via run_code.)

## 4. Kildedokumentets nye rolle for styrte kilder

Beskrivelsen bytter jobb fra bruksanvisning til innholds- og valgkunnskap
(bekreftet retning; kort/lang-splitt-arkitekturen er alt formet for det):

- **Kort** (ivrig): hva basen inneholder — dekning, temaer, nivåer — for
  treffsikkert kildevalg og søk.
- **Guide** (lat): EKSEMPEL FØRST (komplett arbeidseksempel: spørsmål →
  søk → metadata → lese_linje → data), deretter innholds-/kodeverks-
  kunnskap som styrer parameterVALG (PA-vs-PC, SHA-flerdimensjonsråd,
  anweight-fallback, kjente tabellnumre) — ALT HTTP-/URL-/formatstoff
  STRYKES fra prompt-flaten (håndheves nå av skinner/adaptere; det som
  har utviklerverdi flyttes til kommentarer i adapterkoden).
- SSB-guiden skrives om først som mal; oecd/eurostat/ess følger i samme
  runde. Det gjenværende v0-forbudet (én linje i Kjente feller) adopterer
  SSBs egen navngiving: «PxWebApi v1 (= `/api/v0/`)» — treff prioren der
  den bor.
- svar.md slankes tilsvarende: ALDRI-regler som skinnene nå håndhever
  (rå-URL-forbud mot SDMX m.fl. der kilden er styrt) erstattes av én
  setning om styrte kilder i registerblokka: «styrt — bruk
  <alias>.read(…); rå URL-er avvises av verktøyene».

## 5. Verifisering

- Enhetstester per skinne (probe-avvisning m/instruktiv tekst;
  script-lagets avvisning av rå lesing men IKKE adaptervei; flaggets
  propagering generator→registry→klient).
- Regresjon: ikke-styrte kilder helt uendret (testfixtures uten styrt).
- E2e-mål (Hans' smoke): Oslo-spørsmålet på ≤ ~6 turer uten én eneste rå
  SSB-URL; eurosone-/helse-spørsmålene tilsvarende for oecd/ess.
- Måling over tid: styrt-flagget er reversibelt per kilde — funker en
  kilde dårligere styrt enn fri, er det én linje å fjerne.

## 6. Filer (plan-nivå detaljeres senere)

data/sources/{ssb,oecd,eurostat,ess}.md (styrt: true + guide-omlegging),
tools/source_docs.mjs (feltpropagering), _lib/registry.ts (felt),
_lib/tools/probe.ts (skinne), _lib/tools/table-metadata.ts (lese_linje),
js/data-loader.js + js/read-bridge.js (script-skinne),
prompts/svar.md + _lib/svar-prompt.ts (slanking + styrt-linje), tester.
Estimat: ~2,5 økter.

## Bevisst utelatt

- Server-side datahenting (duplisering av klientadapterne).
- Nød-luke ved adapterfeil (kodesak-sporet er ventilen).
- Styring av flere kilder enn de fire målte.
- Proxy-blokkering av styrte base_url-er (adapterne bruker proxyen selv).
- range()-spørsmålet fra SSB-docs (hevder støtte, vi målte 400 31/7):
  fersk probe tas i guide-omleggingen, ikke som egen sak.
