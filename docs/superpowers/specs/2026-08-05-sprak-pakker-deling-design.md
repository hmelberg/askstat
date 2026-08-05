# Språk-og-pakke-runden: deep-only, kildepakker, UI-språk, deling, mobil

**Dato:** 2026-08-05 · **Status:** godkjent design (Hans 2026-08-05), implementasjon i gang

## Bakgrunn og mål

Ask-visningen er default og skal rendyrkes. Hans vil ha (1) kun dypt søk —
thin/deep-valget er utdatert; (2) to uavhengige kontroller: UI-språk og
kilde-scope («søk med norske kilder foretrukket»), der svarspråket fortsatt
følger spørsmålet; (3) kuraterte, delbare «pakker» som beskriver kilder
(land, men også f.eks. «National Health Interview Survey») og som beviselig
påvirker svarløpet; (4) ny tagline + About-seksjon som forklarer
anti-hallusinasjons-poenget; (5) ask-visningen brukbar på mobil; pluss to
visuelle fikser (tittel-sentrering, papirtone).

Grunnmuren finnes allerede: profiler injiseres med uttalt forrang over
landrutingen (`svar-prompt.ts:24-33` + `ROUTING`-blokka), kildeguider
leveres just-in-time (`source-guides.ts`), registeret rendres i prompten
(`registry.ts`), i18n-maskineriet virker (`js/i18n.js`, no-nøkler → en),
og `is_admin` finnes i auth-laget (`auth.ts:289-378`). Runden er
komposisjon, ikke nykonstruksjon.

## Beslutninger (Hans, brainstorm 2026-08-05)

- **Deep-only.** Dybdevelgeren fjernes; alt kjøres 'deep'.
- **To uavhengige kontroller:** UI-språk og kildescope. Språk ≠ land
  (svensktalende finner, engelsktalende i Norge). Svarspråk følger
  spørsmålet, uendret.
- **Kildescope = pakker**, ikke en tredje mekanisme: kuraterte, skrivebeskyttede
  «profiler» i egen slot, komponerbare med personlig profil (to slots).
- **Språkvalg defaultes fra browser-locale** (reverserer engelsk-først-valget
  fra 2026-07-29). Region-subtag styrer landpakke (`sv-FI` → svensk UI +
  Finland-pakke). Auto-valgt pakke VISES alltid («auto») og overstyrer aldri
  et manuelt valg.
- **Startspråk:** en (kilde) + no, da, sv, fi, is, de, fr, es, pt, zh, ja.
  Claude genererer ordbøkene.
- **Oversettelses-scope:** ask-visningen (knapper, UI-elementer, synlige
  progresslinjer, eksempler inkl. `data-q`). Editor-visningen SENERE.
  Details-sporet (diagnostikk) forblir engelsk.
- **Deling er kuratert, to kanaler:** v1 = GitHub-katalog (PR + CI-lint);
  v2 (senere, ved faktisk behov) = in-app innsending + admin-godkjenning
  (`is_admin` finnes allerede). Én katalogformat mater begge.
- **Import = kopi**, ikke referanse — med synlig opprinnelse.
- **Markdown i profiler/pakker er offisielt.**
- **Ny tagline + About** (copy under; redigerbar).
- **Papirtonen mørkes** slik at kort-mot-bakgrunn-kontrasten overlever
  Mac-skjermer (True Tone/vidgamut visker ut dagens `#f5f2eb`).
- **Mobil:** ask-visningen skal fungere på telefonskjerm. Editor-visningen
  er utenfor scope.
- **Sentreringsbuggen fikses** (`css/ask.css:85`).

## Design

### 1. Deep-only

- Fjern dybdepillen (`index.html`-markup + `ask-view.js:611-635`);
  `askDepth()` returnerer konstant `'deep'` (behold funksjonen — historikk/
  telemetri leser den).
- Server: `coerceDepth` (`svar-prompt.ts:14`) defaulter til `'deep'` —
  fjerner samtidig dagens latente klient/server-mismatch.
- `depth`-feltet BEHOLDES i payload, historikk og feil-telemetri (konstant
  `'deep'`) for kontinuitet i telemetrien.

### 2. Pakker (kildescope)

**To-slot-komposisjon.** Profiles-lageret får et eget pakkevalg ved siden av
`active`: `pack: null | {id, auto?: true}`. Personlig profil og pakke er
aktive SAMTIDIG. Pakkevalget synkes som nytt felt i profiles-dokumentet
(konto-sync, union-merge som i dag; `auto`-flagget synkes IKKE — det er
per-enhet).

**Injeksjon.** `svar-prompt.ts` rendrer to merkede blokker der preferanse-
blokka står i dag, begge med samme forrangs- og ærlighetsformulering:

- `## Brukerens datapreferanser` — personlig profiltekst (som i dag)
- `## Aktiv kildepakke: <navn>` — pakketeksten

Per-blokk-cap 8000 tegn (samme som i dag, nå per blokk). Markdown-vern:
overskrifter i injisert tekst demoteres (`#`→`###`) så brukertekst aldri
kolliderer med promptens egen struktur.

**Innebygde pakker.** `data/packs/index.json` + `data/packs/<id>.md`.
V1 kuratert: `norway.md`, `finland.md` (ekte innhold: kilde-id-er fra
registeret, gode tabeller, søkespråk-råd à la «søk statfin med finske
termer via search_catalog»).

**Generisk landmal.** For land uten kuratert pakke genereres pakketeksten
fra en mal (Hans' utkast): «The user is likely from {COUNTRY}; prefer
relevant national sources such as {AGENCY} when natural for the question.»
`data/packs/countries.json` beriker med byrånavn og ærlig registerdekning
(f.eks. Tyskland: «Destatis har ingen adapter — bruk eurostat/dbnomics som
dekker DE, eller web_fetch»). Malen virker også UTEN tabelloppslag (da uten
byrånavn). V1-tabell: Norden + DE, FR, ES, PT, BR, CN, JP, NL, IT, UK, US.

**Velger-UI.** Egen pille ved siden av profilvelgeren i input-kortet:
«Sources: International default / Norway (auto) / …» — samme popup-anatomi
som profilvelgeren. Prosess-sporet får «Pack applied: <navn>» (parallell
til «Profile applied», aldri-usynlig-prinsippet fra konto-runden §Fase 1b).

**Søkearmene er uendret i v1** — pakketekst styrer adferd via prompten
(målt tilstrekkelig i denne pipelinen). Pakkeformatet definerer likevel et
valgfritt `datasets[]`-felt ({id, title, url, how_to_read}) nå, slik at
formatet er stabilt — men KOBLINGEN inn i `search_datasets` som egen
pack-arm utsettes til første survey-pakke faktisk trenger den.

**Markdown.** Profil-/pakketekst behandles offisielt som markdown:
modalen og import-forhåndsvisningen rendrer det; prompten får det rått
(med heading-demotering). PDF-/filvedlegg er BEVISST utelatt — pakker
lenker til URL-er og siterer de avgjørende linjene (missing-koder,
vektvariabler) i stedet.

### 3. Copy: tagline + About

- `<h1>` beholdes: «Ask with data». Sub-linja erstattes:
  **«The AI finds open data and writes the code that computes your answer —
  you can check every step.»**
- `<title>`: «AskStat — an AI that answers with data and verifiable code».
- Under sub-linja, liten lenkelinje: «Unlike a chatbot, every answer comes
  with its data and code. Why that matters →» — åpner About-modalen.
- **About**: ny sidebar-knapp («Why AskStat?») mellom Examples og
  bunngruppa, åpner modal (samme mønster som profilmodalen):

  > **Why AskStat?**
  >
  > Most AI chatbots answer from memory — fluently, but sometimes wrong,
  > and you can't see where an answer came from.
  >
  > AskStat never answers from memory. It searches real, open data sources,
  > writes code to compute the answer, runs it, and shows you everything:
  > the data it used, the code it wrote, and the reasoning in between. You
  > can open the code, change it, and run it again yourself.
  >
  > - **Real sources** — official statistics (Eurostat, World Bank,
  >   national statistical agencies) searched live, with links.
  > - **Verifiable** — every number comes from code and data you can inspect.
  > - **Honest** — if the data doesn't support an answer, it says so
  >   instead of guessing.
  > - **Yours** — switch to the code view any time to edit and re-run the
  >   analysis.

  Copyen fastsettes FØR ordbøkene genereres (én oversettelsesrunde).

### 4. UI-språk

- **Fallbackkjede først:** `t()` slår opp lang → en → nøkkel (i dag: lang →
  nøkkel, som viser NORSK for manglende oversettelser — uakseptabelt for
  f.eks. fransk UI). Må lande FØR nye språk skipes.
- **Ask-visningen wires med ENGELSKE nøkler** (strengene er allerede
  engelsk hardkodet i `index.html`/`profiles.js`/`ask-view.js`); editoren
  beholder sine historiske norske nøkler — `t()` bryr seg ikke om
  nøkkelspråk. Konsekvens: engelsk UI trenger ingen ask-oppføringer, og
  norsk blir en vanlig ordbok (`no.js` med kun ask-nøkler).
- **Ordbøker:** `js/i18n/<lang>.js` for no, da, sv, fi, is, de, fr, es,
  pt, zh, ja. `SUPPORTED`-lista utvides. Omfang: ~60–80 ask-strenger + tagline/
  About + eksempler. Statiske sider (hjelp/personvern/export) forblir no/en.
- **Eksempler oversettes helt** — både etikett og `data-q`. Det er
  tilsiktet at klikk da gir svar på UI-språket (svarspråk følger
  spørsmålet). Landsspesifikke eksempelsett er en SENERE pakke-funksjon,
  ikke oversettelsesoppgave.
- **Locale-default:** `detectInitialLang()`: lagret valg → eksakt
  locale-match → språkdel-match → `'en'`. Region-subtag mappes til
  landpakke (`nb-NO`→norway, `sv-FI`→finland, `pt-BR`→brazil-mal osv.).
  Uten region: entydige språk mappes (no/nb/nn→NO, da→DK, fi→FI, is→IS,
  sv→SE, ja→JP); tvetydige (de/fr/es/pt/zh/en) → internasjonal default.
- **Språkbytte setter pakke** kun når pakka ikke er manuelt valgt
  (`auto`-flagget) — vises som «(auto)» i velgeren.
- **Server:** `ui_lang`-typene i `ask-ruter.ts`/`tolk-resultat.ts` utvides
  fra `"no" | "en"` til godkjent språkkodeliste; promptlinjer med
  «norsk/engelsk» generaliseres til «svar på spørsmålets språk».
- **Synlige progresslinjer** (~10 strenger: «Interpreting the question …»,
  «Route: …», «Profile applied: …», badge-tekstene) wires via `t()`.
  Details-sporet forblir engelsk.

### 5. Deling v1 (GitHub-katalog)

- Mappe i repoet: `data/packs/community/` + felles `data/packs/index.json`
  ({id, name, description, author, updated, file, builtin?}). Innebygde og
  community-pakker deler indeks og format — kilden («builtin» /
  «community/<author>») vises alltid.
- **Explore/Import-UI:** «View/Import profiles from others…» i pakke-/
  profilmenyen: leser indeksen, viser beskrivelse + rendret markdown-
  forhåndsvisning, «Import» KOPIERER inn i lokalt lager med registrert
  opprinnelse {source, id, updated}. Ingen live-referanser (en godkjent
  pakke kan ikke muteres i etterkant under folk); «update available»-nudge
  kan komme senere.
- **Kurering = PR-review + CI-lint:** formatvalidering, størrelse ≤8000,
  hemmelighets-mønstre (nøkkel-regexer), URL-probe (lever lenkene?).
- **Deling v2 (BEVISST UTENFOR RUNDEN):** in-app innsending → pending-
  tabell i microdata-api → admin-UI (gated på `is_admin`) → publisert
  katalog flettet med GitHub-indeksen klientside. Skisseres her kun så
  formatet ikke må endres da. Bygges når noen som ikke kan åpne PR faktisk
  vil dele — Anvil-pull-flaskehalsen (tre ventende pulls per 2026-08-05)
  gjør kanalen dyr nå.
- **Sikkerhet:** delte pakker er tekst injisert i ANDRES svarløp
  (crowdsourcet prompt-injection). Lag: menneskelig godkjenning (PR/admin),
  synlig proveniens + forhåndsvisning før aktivering, og eksisterende
  formulering om at preferanser aldri opphever ærlighetsreglene.

### 6. Visuelle fikser + mobil

- **Tittel-sentrering:** `css/ask.css:85` — `margin: 7vh 0 6px` →
  `margin: 7vh auto 6px` (shorthanden nuller i dag auto-margene fra
  `.ask-main > *`, så tittelen ligger venstreskjøvet på brede vinduer
  mens sub og kort sentreres).
- **Papirtone:** light-tema `--bg: #f5f2eb` → `#efeade` (et hakk mørkere/
  varmere så kort-mot-papir-kontrasten overlever True Tone/vidgamut-
  skjermer). `--scrollbar-track` (i dag samme verdi) følger `--bg`;
  `--sidebar-bg`/`--bg-code`/`--border` vurderes sammen så trappen
  bakgrunn → sidebar → panel forblir monoton. Dark uendret.
- **Mobil (ask-visningen, <720px):**
  - Sidebar: dagens `display: none` (`ask.css:79`) erstattes med
    overlay-skuff + hamburgerknapp i en slank mobiltopplinje (brand +
    hamburger) — i dag er sidebaren rett og slett UTILGJENGELIG på mobil
    (ingen New question, Examples, historikk, innstillinger, login).
  - Input-kort, svarkolonne og outputs skal holde seg innenfor
    skjermbredden (`.ask-out-slot` har alt `overflow-x: auto`);
    pille-raden (`.ask-input-tools`) får `flex-wrap`.
  - Modaler (profiler, pakker, About, settings, login) caps med
    `max-height` + intern scroll og testes på 390px-bredde.
  - Tappmål ≥40px på primærhandlinger. `viewport`-meta finnes allerede.
  - Editor-visningen på mobil: utenfor scope.

## Byggerekkefølge (input til writing-plans)

1. **Småfikser:** deep-only + tittel-margin + papirtone.
2. **Pakker:** to-slot-lager + injeksjon m/heading-demotering + innebygde
   pakker (norway, finland) + landmal + velger-pille + synk + markdown-
   forhåndsvisning.
3. **Copy:** tagline + About (engelsk fastsettes her).
4. **Språk:** fallbackkjede → ask-wiring (engelske nøkler) → ordbøker
   (11 språk) → locale-default + region→pakke → `ui_lang`-utvidelse +
   promptgeneralisering.
5. **Mobil:** skuff-sidebar + reflow + modal-caps.
6. **Deling v1:** community-mappe + indeks + Explore/Import + CI-lint.

Fase 2 og 3 er uavhengige; 3 må lande før ordbøkene i 4 genereres.
Fase 5 kan flyttes fritt.

## Utenfor scope (bevisst)

- Deling v2 (Anvil innsending/godkjenning) — skissert over, bygges ved behov.
- `datasets[]`-armen i `search_datasets` — formatfeltet defineres, kobles
  ved første survey-pakke.
- Editor-oversettelse; hjelp-/personvernsider utover no/en.
- PDF-/filvedlegg i pakker (URL + siterte utdrag i stedet).
- Landsspesifikke eksempelsett (senere pakke-funksjon).
- Modustilpassede AI-svar, trusted-hub o.l. fra andre løp.

## Feller og notater

- `coerceDepth`-mismatchen (klient 'deep', server-default 'standard') er
  latent i dag KUN fordi klienten alltid sender feltet — fase 1 fjerner den.
- i18n-fallback viser i dag NORSK for manglende nøkler — fallbackkjeden
  må inn før noen ny ordbok skipes, ellers ser en fransk bruker norsk.
- `__i18nMissing`-settet (i18n.js) brukes til å finne uoversatte nøkler
  per språk under QA.
- Oversatte `data-q` endrer selve spørsmålet som sendes — svarspråket
  følger med. Tilsiktet.
- Heading-kollisjon: brukertekst med `##` inne i preferanseblokkene må
  demoteres — ellers kan injisert tekst «avslutte» promptens seksjoner.
- Mac-bakgrunnen var IKKE en kodebug (identiske hex-verdier) — True Tone/
  vidgamut visker ut svak varmtone; mørkere `--bg` er den robuste fiksen.
- Pakke-auto-flagget synkes ikke (per-enhet): to enheter med ulike
  browserspråk skal ikke slåss om pakka via konto-synk.
- Anvil-kanalen (deling v2) arver `is_admin`-maskineriet i `auth.ts` —
  ikke bygg ny rolle-modell da.
