# Design: Stabiliseringsrunden — synlige kjørefeil, bare-alias i Python, adapter-batteri og kontrakt-caser

Dato: 2026-08-15. Status: godkjent retning (Hans: «he følger dine
anbefalinger», subagent-drevet implementasjon bestilt).

Bakgrunn (målt over Oslo-rundene 7–11 og norden-rundene 2026-08-15):
oppdagelseslaget virker nå (søk → metadata → riktig valg på ~4 turer,
null prober) — tapet sitter i run_code-løkka. Tre strukturelle årsaker:

1. **Kjørefeil er usynlige i prosessloggen.** Tre runder på rad måtte
   diagnostiseres blindt fordi run_result-FEIL-tekstene ikke vises —
   feildiagnosen bommet minst én gang av det (SSB-av-rundene).
2. **Bare-alias virker ikke som ekte Python.** Norden-runden: modellen
   skrev `eurostat.read(...)` som kjørbar kode → NameError → konkluderte
   «adapteren er ikke tilgjengelig i dette kjøremiljøet» og rømte til
   websøk/rå-URL (avvist av skinnene — skviset mellom to vegger). Vår
   egen prompt (EVAL-regel 1) lærer bort formen `eurostat.read("nrg_pc_202",
   geo="NO")` og sier «connect-linja er valgfri» — men det stemmer i dag
   KUN i direktivgrammatikken (kommentarform), ikke i kode.
3. **JS- og python-adapteren drifter.** Målt: liste-filter-fiksen for
   Eurostat (stille-tomt på kommaform) kom i js/data-directives.js
   2026-08-05, python-siden fikk den først 2026-08-15. «Paritet med
   js»-kommentarene håndheves ikke av noe.

Rundens mål: fjern de tre årsakene. IKKE i denne runden (veikart, §5):
requests/patch_all-måling, MCP-pilot, pakke-pilot.

## 1. FEIL-linja i prosessloggen

Ett sentralt punkt: i runSvarLoop (js/ai-chat.js ~784–790), rett etter
`runResult = await handlers.onRunCode(pendingRun)` — når resultatet er
feil (`runResult && runResult.ok === false`), emitter løkka en
prosesslinje via `handlers.onProgress` med FØRSTE linje av feilteksten:
`⚠️ Kjøring feilet: <første linje, klippet til 160 tegn>`. Begge kallere
(ask-view og AI-panelet) får den gratis via sin eksisterende onProgress.

- Teksten er allerede nøkkel-maskert (mdAskExecuteScript maskerer før
  retur) — ingen ny scrubbing.
- «FEIL:\n»-prefikset strippes før visning (det er kontrakt mot
  modellen, ikke mot mennesker).
- Linjene havner dermed også i `prosesslinjer`-loggen ask-view samler
  (samme kanal som 📝-linjene) — neste logg Hans limer inn bærer
  feiltekstene.

## 2. Bare-alias i ekte Python

Det modellen naturlig skriver, skal virke — miljø over instruksjon:

- **openstat.py:** ny `connect_alias(id)`-vei: modulvariabel
  `_REGISTRY` (liste av `{id, base_url, kind}`) settes utenfra;
  `connect_alias` slår opp id-en og returnerer `Source(base_url, kind)`.
  Ukjent id → instruktiv ValueError («ukjent kilde '<id>' — kjør i appen,
  eller bruk ost.connect(url, kind=...)»). `Source.read` bruker allerede
  `fra_adapter=True` — styrt-skinnene passeres korrekt.
- **Kind-avledning:** registeroppføringens `kind`-felt der det finnes
  (eurostat/fhi/…); ellers `tilgang` (pxweb/sdmx); ellers None (Source
  auto-gjenkjenner fra URL). Avledningen bor i JS (én kilde til sannhet
  om registeret) — python får ferdig `{id, base_url, kind}`.
- **Boot-binding (index.html ~10642, samme seam som patch_urllib):**
  etter at openstat/ost er lastet og registeret er tilgjengelig, kjøres
  en liten python-snutt som setter `ost._REGISTRY = <injisert JSON>` og
  binder hver id som toppnivå-navn i kjøremiljøets globals:
  `ssb = ost.connect_alias("ssb")` osv. Bindingen er IDEMPOTENT og
  kjøres når både ost og registeret (DataLoader.loadRegistry) er klare —
  robust mot boot-rekkefølge; senest før første kjøring. Eager binding —
  Source-objektet er en billig konstruksjon uten nettverk. Brukerkode som overskriver et
  navn, eier det (ingen vakt).
- Kun python-modus. R-modus har egen connect-vei (utenfor runden).
- Kollisjonsnote: register-id-er er korte småbokstavsnavn (`ssb`,
  `fred`, `who`); en kollisjon med brukerens variabel er harmløs
  (brukerens tildeling vinner).

## 3. Adapter-batteriet (live-API-tester)

Slutt på Hans-som-testharness: representative, spørsmålsformede lesinger
per styrt kilde, kjørbare i CI/lokalt uten browser.

- **Python (`tests/test_adapter_battery.py`):** via openstat.py
  `Source.read` direkte (CPython, ekte urllib). Casene:
  - ssb 07459: Oslo (`regions=["0301"]`), `years="2015:2024"`,
    `indicators=["Personer1"]` → rader > 0, kolonnen `value` numerisk.
  - ssb 07459 aggregat: samme uten Kjonn/Alder-filtre (eliminerbare
    dims utelatt) → rader > 0.
  - eurostat ei_lmhr_m: `filters={"geo": ["DK","FI","IS","NO","SE"],
    "s_adj": "SA"}`, `years="2024:2026"` →
    rader > 0, alle fem geo-koder til stede.
  - oecd (sdmx): én kjent dataflow m/ `countries=["NOR"]` + years →
    rader > 0 (gjenbruk flow-id fra eksisterende sdmx-tester/guider).
  - norgesbank (sdmx): EXR-flow → rader > 0.
- **JS (`tests/js/adapter-battery.test.js`):** bygg URL-ene via
  `DataDirectives.translateCanonical`/`resolve` for de samme casene og
  hent dem live med node-fetch → assert ikke-tomt (speiler
  assertHarDatarader-kontrakten).
- **Gating:** kjøres KUN med `ASKSTAT_LIVE=1` i miljøet — default-
  suitene forblir hermetiske (`pytest`/`node --test` uendret). Uten
  flagget: pytest.skip / t.skip med tydelig melding. README-notat i
  testfila selv (ingen egen doc).
- Batteriet ER målestokken for senere MCP-/pakke-piloter (§5).

## 4. Delte kontrakt-caser (paritetsvern)

Én fasit, to kjørere — JS og python kan ikke drifte stille igjen:

- **`tests/contract/canonical-cases.json`:** liste av caser
  `{name, kind, rest, canonical, expect_params, expect_rest?, expect_error?}`.
  Dekker minst: eurostat liste-i-filters (én param per verdi), eurostat
  skalar + countries + years (sinceTimePeriod/untilTimePeriod), pxweb
  regions/indicators, pxweb years-enumerering + from(), pxweb
  liste-i-filters (komma-join), worldbank sti-form + date=,
  worldbank indicators+rest-konflikt (expect_error), pxweb years
  uten startår (expect_error).
- **Python-kjører** (i tests/test_openstat.py eller egen fil):
  parametrisert over JSON → `ost._translate_canonical` → sammenlign
  params som SORTERTE lister (ordensuavhengig; rekkefølge er ikke del
  av kontrakten). expect_error-caser: `pytest.raises` med match.
- **Node-kjører** (`tests/js/canonical-contract.test.js`): samme JSON →
  `DataDirectives.translateCanonical` (eksportert, js/data-directives.js
  ~1103) → samme sorterte sammenligning; error-caser asserter
  `{error: ...}`-retur (JS-siden returnerer feilobjekt, kaster ikke —
  kontrakten er «samme params / samme feiltilfelle», ikke samme
  feilmekanikk).
- Én bevisst asymmetri dokumenteres i casefila om den finnes (f.eks.
  all() kun pxweb) — via `only: "js" | "py"`-felt på caset.

## 5. Veikart (bevisst utenfor runden)

- **requests/patch_all-måling:** manuell spike i browser — pyodide-http
  har utviklet seg siden målingen som stoppet patch_all; regel 4 forblir
  preferanse uansett utfall.
- **MCP-pilot (SSB først):** MCP-verktøykall kjøres i Anthropics infra —
  ~0 edge-turer for søk/metadata. `ssb_get_url`-mønsteret (MCP bygger
  spørringen, klienten laster URL-en/read-linjen) bevarer
  data-i-klienten-kontrakten. Designspørsmål som må løses i piloten:
  to-dører (MCP må ERSTATTE søke/metadata-armene for kilden i sesjonen,
  ikke stå ved siden av), styrt-/hook (c)-unntak for MCP-anviste
  lastinger, drift/tillit til ekstern server.
- **Pakke-pilot (sdmx1 eller eurostat-pakken):** spike 2026-08-04 viste
  mekanikken (sdmx1 mot OECD full pass). Krever styrt-unntak for
  pakke-HTTP og er python-only — veies mot MCP-pilotens resultat.
- Adapter-batteriet (§3) er felles målestokk for begge piloter.

## Verifisering

- Alle eksisterende suiter grønne (node, deno, pytest) — uendret omfang.
- Nye kontrakt-caser grønne i BEGGE kjørere.
- Batteriet kjøres én gang live (ASKSTAT_LIVE=1) under implementasjonen
  og skal passere for ssb/eurostat/norgesbank; oecd-caset kan merkes
  kjent-flaky hvis API-et svarer ustabilt (dokumenteres i så fall i
  testfila).
- Manuell røyk (Hans): norden-spørsmålet — forventet: FEIL-linjer
  synlige i detaljloggen hvis noe feiler, og `eurostat.read(...)` som
  ekte kode virker.

## Bevisst utelatt

- R-modus-paritet for bare-alias (egen runde ved målt behov).
- Endringer i regel 4/requests (venter på målingen).
- MCP-/pakke-implementasjon (piloter etter runden).
- Prompt-endringer: EVAL-regel 1 blir SANN av §2 — ingen tekstendring
  nødvendig.
