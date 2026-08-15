# Design: Kildeharnessen — selvstendig utprøvings- og forbedringssløyfe

Dato: 2026-08-15. Status: utkast til Hans' review. Avklart i samtale:
frittstående sak i samme repo (IKKE admin-knapp i appen — edge-vinduet er
22 s, evaluereren må stå utenfor det den tester, og slettbarhet er en
ønsket egenskap); leveranser flyter gjennom kanaler appen alt har.

Bakgrunn: ukens målte forbedringssyklus (Oslo runde 1→11: 17 turer → 8;
inflasjons-runden: 5+ blinde reparasjonsrunder til feilkropp-fiksen) ble
kjørt manuelt med Hans som testharness. Adapter-batteriet (spec
2026-08-15-stabiliseringsrunden §3) automatiserte adapterlaget og fant en
reell buggklasse på første kjøring. Denne spec-en løfter samme grep to
nivåer opp: kildelaget (hva finnes, hvordan hentes det) og flytlaget
(hvordan svar-løkka faktisk presterer), med en sløyfe som gjør målt
friksjon om til konkrete forslag.

## Prinsipper

- **Frittstående og slettbart:** alt bor i `tools/harness/` + rapporter i
  `docs/eval/`. `rm -rf tools/harness` etterlater appen urørt.
- **Aldri auto-apply:** harnessen FORESLÅR (utkast-filer, rapporter,
  evt. PR via eksisterende kilde-pr-kanal) — Hans reviewer alt.
- **Målt, ikke ment:** hvert forslag refererer kjøringen som begrunner
  det (samme regel som kodekommentarene).
- **Budsjett-gatet:** kildeutforskeren er gratis (direkte API-kall);
  alt som koster Claude-penger krever eksplisitt flagg og har harde tak.

## 1. Kildeutforskeren (`tools/harness/utforsk.py` — gratis)

Standardisert utforskning per kilde, rett mot kildens API via openstat.py
i CPython (virker nå, med feilkropper — fikset 26d1692):

- **Søk:** kjør kildens søke-endepunkt med 3–5 tematiske testfraser
  (fra spørsmålssettet §3) — mål treffkvalitet, noter frase-former som
  virker/feiler.
- **Metadata:** hent table_metadata-ekvivalenten for 2–4 representative
  tabeller — trekk ut dimensjoner, kodelister (klippet), mandatory/
  eliminerbar-status, tidsdekning.
- **Henting:** kjør én verifisert lesing per spørringsmønster
  (enkeltland, flerland, aggregat-via-utelatelse, tidsvindu) — noter
  formen som VIRKET (kjørte read-linjer) og feilene underveis (kropp +
  hva som reparerte dem).

Output per kilde: `tools/harness/utkast/<kilde>.md` — et UTKAST til
kildedokument i todelingen fra kort/lang-arkitekturen:

- **Kort-delen** (innholdslaget): hva basen dekker — temaer, sentrale
  variabler/indikatorer, geografiske nivåer, tidsspenn. Det man VELGER
  kilde på. Bygget fra metadata-høstingen, aldri fra antakelser.
- **Guide-delen** (hentelaget): eksempel først — de VERIFISERTE
  read-linjene fra utforskningen med én linje kontekst hver, deretter
  kjente feller (målte feil + reparasjonen). Aldri udokumentert HTTP —
  samme stil som styrt-guidene.

Utkastet er råmateriale for `data/sources/<kilde>.md` — Hans (eller en
senere runde) fletter inn det som er verdt å beholde; drift-testen og
8k-taket gjelder som før. For helt nye kilder er utkastet et komplett
førsteutkast.

## 2. Flyt-evalueren (`tools/harness/evalrun.md` + driver — koster Claude)

Kjør spørsmål fra settet (§3) gjennom den EKTE svar-løkka og mål:

- **Driver v1: Playwright mot lokal `netlify dev`** — mønsteret er alt
  bevist (baseline-kjøringen 2026-08-04, BYOK fra .env). Ekte klient,
  ekte pyodide, ekte skinner. Kjente feller SKAL stå i driver-dokumentet:
  netlify dev cacher edge-TS-moduler (restart + 400-smoke før eval),
  Chrome HTTP-cacher js/ (hard reload m/ignoreCache), dev-porter.
  Driveren er i v1 en DOKUMENTERT PROSEDYRE + hjelpeskript (start dev,
  åpne app, send spørsmål, høst prosesslinjer/svar-kort/⚠️-linjer) —
  ikke nødvendigvis helautomatisk i første versjon; ambisjonen er at
  kontrolleren (Claude Code) kan kjøre hele runden uten Hans.
- **Målt per spørsmål** (samme kolonner som baseline-formatet):
  tid, turer, run_code-runder, utfall mot suksesskriteriet, feiltype,
  PLUSS de nye signalene: ⚠️-FEIL-linjer (nå synlige), rå-URL-forsøk
  mot styrte kilder, web_fetch-flukt, fabrikasjonssjekk (tall i svaret
  finnes i output).
- **Rapport:** `docs/eval/<dato>-harness.md` — baseline-formatet, én
  rad per spørsmål, hovedfunn-seksjon.

**Budsjett (Hans' ramme: 20–30 løkke-kjøringer er OK, spør før mer):**
én runde = spørsmålssettet én gang (6–8 kjøringer). Før/etter-måling av
en endring = to runder (~12–16). Harde regler: aldri kjør uten
eksplisitt bestilling; maks 2 runder per økt uten ny bekreftelse fra
Hans; løpende teller i rapporten («kjøring 14 av rammen på 30»).

## 3. Spørsmålssettet (`tools/harness/sporsmal.json`)

Gjenbruk + utvid `docs/eval/ask-evalsett.md` (data-rutens kjerne):

- Ukens målte eksempler: Oslo folketall 10 år (ssb), arbeidsledighet i
  Norden (eurostat flerland), inflasjon Norge vs eurosonen (ssb+eurostat
  sammenstilling), helseutgifter %BNP (oecd/worldbank), lykke Norge vs
  Tyskland (ess mikrodata m/vekter).
- 2–3 nye som dekker uprøvde mønstre (f.eks. Norges Bank rente/valuta
  [sdmx], IMF WEO-anslag [dbnomics], en fhi-tabell [norsk helsestatistikk]).
- Per spørsmål: forventet rute, forventet kilde(r), MEKANISK fasit-sjekk
  der mulig (talls tilstedeværelse/intervall, kilde-id i sporet, «ingen
  rå <host>-URL»), og suksesskriterium i fritekst der det må.

## 4. Forbedringssløyfa (syntese)

Etter en eval-runde destillerer kontrolleren (eller ett enkelt
Claude-kall, teller mot budsjettet) funnene til:

1. **Kildebeskrivelse-utkast** — oppdateringer til utkastene i §1 der
   flyten avdekket kunnskap utforskeren ikke så (f.eks. «14706, ikke
   14710, for tolvmånedersvekst»).
2. **Logikk-/promptforslag** — dokumentert i rapporten som forslag med
   målt begrunnelse (samme form som ukens runder), ALDRI auto-endret.
3. **Adapter-/kodeforslag** — går som kodesak/issue via eksisterende
   kanal når det er kode, ikke tekst.

Sløyfa lukkes ved at neste eval-runde måler deltaet (turer/utfall) mot
forrige rapport — det er suksessmålet for hele harnessen.

## Verifisering

- Kildeutforskeren kjørt mot minst 3 kilder (ssb, eurostat, én sdmx) med
  utkast-filer som resultat; ingen Claude-kostnad påløpt.
- Én flyt-eval-runde (≤ 8 kjøringer) gjennomført med rapport i
  baseline-format; budsjett-telleren stemmer.
- Minst ett kildebeskrivelse-utkast og ett logikkforslag produsert fra
  målt friksjon, levert som utkast/rapport (ikke applisert).
- `rm -rf tools/harness` + `git status` viser at appen er urørt
  (slettbarhets-kontrakten).

## Bevisst utelatt

- Admin-knapp/UI i appen (kan komme senere som tynn utløser).
- Auto-apply av noe som helst (prompt, kildedokumenter, kode).
- MCP-/pakke-pilotene (egne løp — men harnessens rapporter er
  målestokken de skal dømmes mot, jf. stabiliserings-spec §5).
- CI-integrasjon av flyt-evalueren (koster penger per kjøring; forblir
  manuelt bestilt). Kildeutforskeren KAN senere CI-kjøres (gratis), men
  ikke i v1.
- Fullautomatisk Playwright-driver (v1 er prosedyre + hjelpeskript;
  automatiseres først når prosedyren har vist seg stabil).
