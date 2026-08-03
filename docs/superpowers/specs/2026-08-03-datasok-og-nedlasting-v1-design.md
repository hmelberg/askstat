# Datasøk og nedlasting v1: pålitelig lasting, telemetri og fire nye kilder

**Dato:** 2026-08-03 · **Status:** godkjent design, venter på implementasjonsplan

## Bakgrunn og problem

Hans' prioritering (brainstorm 2026-08-03): finn relevante og pålitelige data
**raskt og uten feil**. Portabilitet (script som kjører uendret utenfor appen)
er en fordel, ikke hovedmålet — særlig ikke i askstat. Hovedsmerten i dag,
etter Hans' egen rangering: **(1) nedlastings-/kodefeil** (reparasjonsrunder,
ugjennomsiktige feil, kildequirks) og **(2) for tregt / for mange runder**.
Ikke oppdagelse (feil datasett) og ikke stille gale tall.

To evidenskilder rammer inn designet:

- **Workbench-utredningen** (`~/Downloads/data-sources-and-architecture.md`,
  2026-08-02, med målt CORS-matrise, Data Commons-målinger i appendiks A og
  bibliotekshøsting i appendiks B). Nøkkelfunn: dekningssjekk før forpliktelse
  (DC svarte score 0.9999997 på «unemployment rate» — med null norske
  observasjoner); HTTP-feilkropper er ekstern grunnsannhet som modellreparasjon
  faktisk virker på; reparasjonsløkker skal være grunne.
- **Egen evallogg fra august-runden** (jf. ROADMAP «DSL vs. LLM-vaner»):
  de fem målte feilene var *interne selvmotsigelser* (hint mot laster,
  probe som løy om XML) — ikke modellvaner. Fiksen er konsistens håndhevet
  strukturelt, ikke flere regler.

## Mål

1. Første genererte script treffer oftere; når det feiler, repareres det på
   ÉN runde fordi feilen navngir årsaken.
2. Feilene samles (Anvil) så forbedring kan måles i stedet for anekdoteres.
3. Brukeren kan styre kildevalg — per spørsmål og varig — og registrere
   API-nøkler enkelt.
4. Fire kildeutvidelser: DBnomics som internasjonal ryggrad, OWID-katalogarm,
   Google Data Commons (søk + dekningssjekk + nedlasting), IPUMS (mikrodata,
   asynkron extract-flyt).

**Valgt tilnærming (A):** måling først → herding → bredde. Hver ny kilde
lander på en herdet base og fanges av telemetrien fra dag én.

## Fase 1 — måling

### 1a. Feiltelemetri (askstat → Anvil, KUN feil)

- **Klient** (`js/ask-view.js` `runAskFlow`): samler feilede
  `run_code`-kjøringer underveis (script + feiltekst — begge finnes allerede i
  `mdAskExecuteScript` sin `ok:false`-gren). Ved flytslutt, HVIS noe feilet
  (én eller flere feilede runs, ELLER flyten selv kastet — strømfeil,
  ruterfeil — da med `runs: []` og feilteksten i et eget `flow_error`-felt):
  **én** POST med hele historien:
  `{app: "askstat", ts, version, ui_lang, mode, route, depth, question,
  tolkning, runs: [{script, error}], final_ok, probed_sources, provider_type}`.
  Ett event per spørsmål — holder dataene sammenkoblet og endepunktet dumt.
- **Skrubbing:** script gjennom eksisterende `DataDirectives.scrubKeys` før
  sending; aldri BYOK-/kildenøkler; provider kun som typestreng. Feiltekst
  trunkert ~4 KB per run; total payload ≤ ~200 KB.
- **Transport:** direkte browser → Anvil
  `@anvil.server.http_endpoint("/feil", methods=["POST"], enable_cors=True)`
  i **microdata-api**. Fire-and-forget (`fetch` m/ `keepalive`, feil svelges) —
  telemetri får ALDRI bremse eller knekke ask-flyten.
- **Anvil-siden er bevisst dum:** én datatabell (`feilrapporter`: `mottatt`
  datetime + `payload` tekst/JSON-blob), ingen parsing, kun størrelsesvakt.
  Begrunnelse: Anvil-pull er en kjent deploy-flaskehals — endepunktet skal
  aldri trenge en ny synk. Analyse (VANE-KONFLIKT vs. INTERN INKONSISTENS-
  taggingen fra ROADMAP) skjer offline på eksport av tabellen.

### 1b. Bibliotek-spike (timeboks ~½ dag)

- I ekte app (python-modus): `micropip.install("wbgapi")` → ett ekte World
  Bank-kall for norsk indikator; `micropip.install("sdmx1")` → én OECD-
  spørring. Først verifiseres Workbench-påstanden om at `requests` nå virker
  rett ut av boksen i vår Pyodide-versjon (urllib3 ≥ 2.2 Emscripten-backend) —
  alt annet avhenger av den.
- **Leveranse:** kort notat i `docs/` (install-virker / requests-virker /
  CORS-utfall / DataFrame-utfall per bibliotek) som ender i én av to
  kjennelser: **(a)** virker rent → fase 2 legger en prompt-tillatelse for
  bibliotekene i python-modus, og muligheten for å pensjonere håndrullet
  SDMX-nøkkelbygging noteres som eget framtidig løp; **(b)** virker ikke →
  ROADMAP-spørsmålet lukkes med evidens, `ost` beholder dagens omfang.
- Spiken endrer INGEN prompter/lastere selv — den produserer kun kjennelsen.

## Fase 2 — herding av lasteveien

Seks tiltak, ordnet etter forventet effekt på feilede runder:

1. **Feilkropper når modellen.** Den reelle ugjennomsiktigheten er
   klient-side: `js/data-loader.js` kaster `'proxy 400 for ledighet'` og
   FORKASTER oppstrømskroppen — der PxWeb sier «Missing selection for
   mandatory variable Tid». Fiks: `fetchLoadTarget`/`fetchRawUrl` leser
   feilkroppen ved non-ok (trunkert ~1,5 KB) og tar den med i kastet melding →
   flyter inn i `run_code` sitt `FEIL:`-output → én-rundes reparasjon.
   (`/api/hent` slipper allerede oppstrøms status+kropp gjennom; den faste
   catch-meldingen består — den verner nøkkelbærende URL-er.)
2. **«Hint må parse» — strukturell konsistenstest.** Ny node-test: hvert
   `how_to_read`-hint fra hver søkearm, og hvert direktiveksempel i
   DELIVERY-prompten, mates gjennom `DataDirectives.parse` + `resolve` mot det
   ekte registeret — CI feiler hvis et hint ikke overlever. Gjør hele
   august-feilklassen umulig å gjeninnføre.
3. **Kildeguider for topp 5.** `data/source-guides/` vokser fra 1 (ssb) til 5:
   +eurostat, +oecd/sdmx, +worldbank, +dbnomics. Innhold destillert fra
   EVAL-reglene + Workbench-gotchas (≤ ~2 KB hver; leveres via eksisterende
   attacher, null ny maskin). Registeret får `guide: true` på de fire.
4. **Dekningssjekk + tomt-resultat-vakter.** Tre billige lag: `probe` får
   eksplisitt note når 200-svar har null datarader («HTTP 200 men 0 datarader —
   sjekk filtre/dekning»); lasteren kaster høylytt når et hentet uttrekk er
   tomt i stedet for å binde en tom ramme; prompten får regelen *probe den
   eksakte filtrerte URL-en før scriptet skrives; 0 rader → slakk én dimensjon
   og re-probe*.
5. **Budsjetter.** Standard: klientverktøykall 4→**8**, web_search 2→**3**,
   web_fetch 1→**2**, run_code 3→**4**. Deep uendret. Runtime-knotter og
   DEPTH-tabellen i prompten endres SAMMEN (de er dokumentert som én
   historie). Rommet er TIL tiltak 4 — verifisering var det budsjettet før
   tvang modellen til å droppe.
6. **Brukerpreferanser + landruting.** «Datapreferanser»-tekstfelt i
   AI-innstillingene (localStorage), sendes som `preferences`-felt til
   `/api/svar`, injiseres som tydelig merket blokk som **overstyrer
   standardvalg** (tak ~2 000 tegn). Ved siden av: statisk rutingblokk i
   systemprompten: Norge → ssb/fhi (med kjente-hull-noter, f.eks.
   «ungdoms-rusdata: FHI/Ungdata, ikke SSB»), Norden → dst/scb/statfin,
   EU/NUTS → eurostat, global makro → dbnomics/worldbank/oecd,
   hverdagsspråklige tverrlandssammenligninger → owid. Navngir preferansene
   et standardland, følger rutingblokka det.

Filer: `js/data-loader.js`, `_lib/tools/probe.ts`, `_lib/svar-prompt.ts`,
`svar.ts`, innstillings-UI, `data/source-guides/*.md`, nye tester.
Fresh-start-reparasjon (restart etter 2 feilede reparasjoner, jf. evidensen)
forblir **kun prompt-nivå** i v1 — ekte transkript-reset krever
`runAgenticStream`-kirurgi og utsettes.

## Fase 3 — fire kilder (i byggerekkefølge)

### 3a. DBnomics som ryggrad (timer — rir på fase 2-promptarbeidet)

Rutingblokka navngir dbnomics som førstevalg for internasjonale/makroserier;
per-katalog-taket heves (4→6) så round-robin-flettingen slutter å begrave den;
den nye kildeguiden (fase 2 tiltak 3) lærer bort de to rundesparende
egenskapene: `latest`-release-koder (aldri hardkod `WEO:2024-10`) og
`align_periods=1` for server-side fler-serie-join. Ingen ny maskin.

### 3b. OWID-katalogarm (~1 dag)

Høsteskript (samme mønster som eksisterende katalog-høstere) bygger
`data/owid-catalog.json` — slug + tittel (+ kort undertittel) for hvert
grapher-chart — og en søkearm scorer med eksisterende substring-scorer.
`how_to_read`-hintet er *venstre kolonne* i grenseregelen, med vilje:
`pd.read_csv("https://ourworldindata.org/grapher/<slug>.csv?useColumnShortNames=true&country=NOR~SWE&time=2000..2024")`
— ren pandas, målt CORS-åpen, intet direktiv. Gir hverdagsspråklige spørsmål
en kilde hvis *titler er skrevet i hverdagsspråk*.

### 3c. Google Data Commons (den store biten)

Full vertikal bak ÉN site-env-nøkkel (`DATACOMMONS_API_KEY`, gratis tier;
ops-forutsetning: registreres én gang i Netlify):

- **Søkearm:** `/v2/resolve?resolver=indicator` som ny `search_datasets`-arm,
  server-side (env-nøkkelen forlater aldri edge-funksjonen — samme mønster som
  `OPENALEX_MAILTO`). **Score-terskel ~0,9** — appendiks A målte 0,9999 for
  ekte treff mot 0,755 for temadrift; under terskel returnerer armen ingenting
  i stedet for tobakk-for-cannabis. Armen er stille fraværende uten nøkkel.
- **Dekningssjekk der den strukturelt hører hjemme:**
  `table_metadata('datacommons', '<StatVar>', find='<land>')` returnerer
  hvilke entiteter/år/fasetter som faktisk har observasjoner — den målte
  feilen («unemployment rate», score 0,9999997, null norske observasjoner)
  fanges av verktøyet modellen uansett kaller før kode. Multi-fasett-
  tvetydighet (World Bank 83,112 vs OECD 83,1) returneres eksplisitt så
  modellen navngir fasetten sin.
- **Nedlasting:** registeroppføring + nøkkelinjeksjon via `/api/hent` + liten
  JSON→CSV-flatener (`kind='datacommons'` i `js/api-kinds.js`, samme form som
  worldbank-flateneren). Rutingblokka er ærlig om rollen: resolver og
  tverrlands-demografi/helse-basics — **aldri** kilden for nordiske detaljer.

### 3d. IPUMS (sist, timeboks, egen form)

- Registeroppføring med `auth: {user: true}` — nøkkelen er *brukerens* (gratis
  IPUMS-registrering), legges inn via eksisterende nøkkel-UI, header-injiseres
  av `/api/hent`. Ingen søkearm i v1; rutingblokka + ny `ipums.md`-guide
  sender mikrodata-spørsmål dit.
- Asynkron extract-flyt drives TILSTANDSLØST av modellen (IPUMS-API-et støtter
  det godt): *sjekk kontoens nylige extracts for et matchende ferdig → finnes
  ingen, send inn nytt (POST via `/api/hent` sin GET-innpakkede POST) → poll
  kort → ikke ferdig: avslutt ærlig med «extract sendt inn — spør igjen om
  ~5 minutter, så plukker jeg det opp».* Ingen klient-tilstand, ingen ny
  maskin; guiden koder flyten. «Spør igjen senere» er et VELLYKKET utfall og
  ordlegges slik.
- **Kollektioner først:** IPUMS NHIS + MEPS (amerikanske helsesurveys,
  API-støttet) + IPUMS International. Ærlig note: nordisk dekning i IPUMS er
  historiske folketellinger — komplement, ikke overlapp, med registrene.
  (Avgjort i brainstorm: start her, revurder etter første bruk.)

## Feilhåndtering (tverrgående regler)

- Telemetri er fire-and-forget: egne feil svelges, kan aldri bremse/knekke
  ask-flyten, sender kun etter `scrubKeys` + størrelsestak.
- Hver ny arm degraderer STILLE på søkelaget (DC-arm borte uten nøkkel,
  OWID-arm borte hvis katalogfila 404-er — samme konvensjon som dagens
  `failed`-liste) men HØYLYTT på lastelaget (tomt uttrekk kaster, feilkropper
  når fram). Søk kan trekke på skuldrene; lasting lyver aldri.

## Testing

- **Node:** hint-må-parse-testen (strukturgarantien); laster-feilkropp-
  inklusjon; tomt-uttrekk-vakt; OWID-arm-scoring; telemetri-skrubbing + tak.
- **Deno:** probe 0-rader-note; DC-arm-terskel (mocket fetch, ett treff
  over/ett under 0,9); DC-dekningmetadata; `preferences`-validering i
  `svar.ts`; budsjettkonstanter assertes like tallene i DEPTH-promptteksten
  (så de ikke kan drifte — samme triks som registry-testene).
- **Live smoke før hver push:** hver ny arm får én ekte forespørsel fra
  deployet origin — OECD-`Accept-Language`-buggen lærte oss at research-fase-
  prober lyver om produksjonsatferd.
- **Eval:** `docs/eval/ask-evalsett.md` utvides med ~8 spørsmål mot de nye
  stiene (OWID-hverdagsspråk, DC-demografi, DBnomics-makro, én IPUMS-flyt, ett
  bevisst dekningshull som SKAL ende i ærlig «ikke funnet»). Kjøres før fase 2
  og etter fase 3 — det er før/etter-målingen, siden kun-feil-telemetri
  mangler baserater.

## Bevisst utenfor v1

- Ekte transkript-reset fresh-start (`runAgenticStream`-kirurgi).
- Lokal semantisk/embedding-indeks (Workbench «Layer 2»).
- Data Commons som *tverrkilde*-entitetsresolver (KLASS, NUTS-crosswalks).
- IPUMS-søkearm.
- Server-side analyse/dashboard på telemetritabellen (eksport + offline).
- Endringer i selve `ost`-grammatikken — spiken produserer kun kjennelsen;
  å handle på kjennelse (a) er et eget framtidig løp.

## Referanser

- Workbench-utredning: `~/Downloads/data-sources-and-architecture.md`
  (+ `endpoints.json`: høstet register, 50 PxWeb + 35 SDMX-endepunkter —
  råstoff for framtidige kildeutvidelser, ikke brukt i v1).
- ROADMAP: «DSL vs. LLM-vaner» (spike-begrunnelsen), «Hugging Face som
  datakilde» (samme vurderingsmønster).
- Eksisterende design: `2026-07-29-samlet-ask-pipeline-design.md` (pipelinen),
  `2026-07-30-oppdagelseslaget-design.md` (search_datasets),
  `2026-07-31-ssb-mandatory-variabler-design.md` (guider + mandatory).
