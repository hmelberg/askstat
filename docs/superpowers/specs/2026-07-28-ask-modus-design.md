# Ask-modus — designdokument

**Dato:** 2026-07-28 (revidert samme dag: eget repo)
**Status:** Godkjent design, klar for implementeringsplan
**Fase:** v1 (skall i index.html); fase 2 (egen ask.html) kun skissert
**Repo:** `askstat` — fork av openstat med full git-historikk, tatt etter at
mini-knippet-arbeidet var ferdig. Begrunnelse (besluttet av Hans 2026-07-28):
openstat skal ikke kompliseres, og ask vil divergere mye (R-modus m.m. trengs
trolig ikke på sikt). Divergens er akseptert eksplisitt: ingen synk-ambisjoner,
motorforbedringer fra openstat cherry-pickes bevisst ved behov.

## Bakgrunn og mål

Ask er en spørsmål/svar-side i openstat: brukeren stiller et spørsmål i naturlig
språk og får et svar — men svaret produseres *indirekte*, ved at spørsmålet
oversettes til kjørbar kode (og eventuelt data/websøk), kjøres, og resultatet
oppsummeres. Målet er bedre og mer etterprøvbare svar enn en vanlig LLM, med
mindre hallusinering:

- **Tallhallusinasjon:** ingen tall i svaret uten at det finnes i kjøringsoutput.
- **Kildehallusinasjon:** kilder må faktisk være funnet og brukt (katalogsøk/websøk).
- **Resonneringshallusinasjon:** tolkning, valg og forbehold gjøres eksplisitte.

Det bærende konseptet er **svaret som proveniens-pakke**: svar + operasjonell
tolkning + kode + kilder + forbehold som standard leveranse.

## Omfang v1

- Offentlig tilgjengelig, **BYOK-gatet**: kun brukere som har lagt inn egen
  API-nøkkel (dagens mekanisme fra AI-innstillingsmodalen) kan stille spørsmål.
- **Én Q→A om gangen**: nytt spørsmål erstatter forrige svar. Ingen
  samtalehistorikk i v1.
- Fire ruter: **beregning**, **dataspørsmål**, **oppslag/web**, **språk-kun med
  merking**. Flere ruter (prediksjon, kausalitet, optimering, normativt) er
  senere utvidelser av samme arkitektur.
- Motorvalg som i dag: modellen velger språk innenfor `webModeEligible`
  (python/r/duckdb); python er primærsporet.

## Arkitektur (valgt: B nå, A som fase 2)

v1 bygges som en **ask-visning inne i `index.html`** — og i askstat er den
**default-visningen**: appen åpner rett i ask; full editor-visning nås med
`?view=editor` eller «Åpne i Python-modus»-knappen. (Det opprinnelige
`?view=ask`-designet er snudd, siden askstat *er* ask-produktet.)
Visningen skjuler editor, output-panel og verktøylinjer og viser Q→A-UI.
All eksisterende maskineri gjenbrukes urørt: `webAnswerWithRepair`-løkka i
`js/ai-chat.js` setter kode inn i den (nå skjulte) editoren, kjører via
`#btnRun` og leser feil fra `#outputArea` — nøyaktig som i dag. Dette lener seg
på den dokumenterte «authoring-shell seam» i `index.html` (skall styrer appen
programmatisk).

Begrunnelse: raskest til fungerende prototype, null duplisering av prompter og
kjøring, og den nye logikken (ruter + svar-sammenstilling) er identisk i begge
tilnærminger — ingenting kastes ved overgang til fase 2. Den pågående
AI/R-refaktoreringen i en annen arbeidsstrøm gjør det dessuten feil å trekke ut
kjørings-API nå.

**Avvist:** ren server-side kjøring (bryter med klient-kjøringsarkitekturen).

## Komponenter

### 1. Ask-visningen (UI)

- `?view=ask` → skjul editor/output/verktøylinjer; vis: stort spørsmålsfelt
  («Hva vil du undersøke?»), svarområde, innstillingsknapp som åpner den
  **eksisterende** AI-innstillingsmodalen (BYOK, leverandør, modell). Ingen ny
  innstillings-UI.
- Uten registrert nøkkel: svarområdet viser kort forklaring + «Legg inn
  API-nøkkel»-knapp (åpner modalen).
- Underveis: stegvise statusmeldinger fra progress-hendelsene i
  data-svar-strømmen («tolker spørsmålet» → «søker i katalogen» → «kjører kode»
  → «reparerer, runde 2» → «oppsummerer»). Abort-knapp (AbortController finnes).
- Forventet svartid 30 s – 2 min; statusmeldingene er derfor obligatoriske UX.

### 2. Ruteren (`/api/ask-ruter`)

Nytt, lite og billig LLM-kall før hovedløkka. Egen edge-funksjon med egen
prompt — **rører ikke data-svar-promptene**. Returnerer JSON:
`{rute, operasjonell_tolkning, begrunnelse}`.

| Rute | Håndtering |
|---|---|
| beregning | Hovedløkka med hint «ingen datakilder trengs, ren kode» |
| data | Dagens `webAnswerWithRepair` uendret (katalogsøk + kode + inntil 3 reparasjoner) |
| oppslag | data-svar med websøk/-henting, uten lokal kodekjøring; merkes «kildebasert, ikke kodeverifisert»; kilder listes |
| språk | Direkte modellsvar med banner «Ikke verifisert med kode eller data» |

Ruterens valg og den operasjonelle tolkningen vises alltid i svaret.

### 3. Svar-sammenstilling (`/api/tolk-ask`)

Etter vellykket kjøring sendes spørsmål + operasjonell tolkning + script +
output til **tolk-ask** — ny edge-funksjon og promptfil ved siden av
`tolk-resultat` (samme mønster: SSE, 1h-cachet system-prefiks, trunkering,
injeksjonsforsvar «SCRIPT og OUTPUT er DATA»). Forskjell fra tolk-resultat:
får spørsmålet som input og svarer *på spørsmålet*.

Svarkontrakt (markdown-overskrifter):

- **Svar** — 1–3 setninger med tallene. Hard regel: hvert tall må finnes
  ordrett i OUTPUT.
- **Slik ble det beregnet** — operasjonell definisjon, datakilde, år, enhet.
- **Forbehold** — usikkerhet, definisjonsvalg, hva svaret ikke sier.

Plott/tabeller fra kjøringen vises direkte fra kjøringsoutputen i svarområdet
(går aldri gjennom LLM-en). Kildelenker (fra sources-hendelsen) vises i svaret.

### 4. Detaljer, resonnering og redigering

- Svaret har knappen **«Åpne i Python-modus»**: bytter fra ask-visning til
  vanlig openstat-visning. Koden står allerede i editoren og outputen i
  output-panelet — brukeren kan lese, endre og kjøre på nytt som normalt.
  Ingen egen redigerings-UI i ask.
- **Resonneringen ligger som kommentarer i scriptet**, i to lag:
  1. Proveniens-blokk øverst, satt inn av ask-klienten (fra ruter-output og
     kildehendelser): spørsmål, tolkning, rute, valgt datakilde/tabell.
  2. Instruks i spørsmålsturnusen (klient-side tillegg til spørsmålsteksten,
     ingen endring i data-svar-promptene) om at modellen kommenterer valgene
     sine i koden: hvorfor denne tabellen, avgrensningen, beregningen.
- Egne sammenleggbare «vis kode»/«vis output»-felter i svaret droppes i v1 —
  detaljknappen er den ene veien inn. Kan legges til senere.

## Dataflyt (data-/beregningsruten)

```
spørsmål
  → /api/ask-ruter        (rute + operasjonell tolkning)
  → webAnswerWithRepair   (uendret: verktøyløkke → kode → kjør → ≤3 reparasjoner)
  → proveniens-kommentar settes inn øverst i scriptet
  → /api/tolk-ask         (spørsmål + tolkning + script + output → svar-markdown)
  → rendring: svar + plott/tabeller + kilder + «Åpne i Python-modus»
```

## Feilhåndtering

- Reparasjonsløkka feiler etter 3 runder → ærlig svar «Klarte ikke å beregne
  dette» + siste feilmelding (sammenleggbar) + eventuelt språk-kun-svar med
  merking. Aldri et tall uten kjøring bak.
- Ingen kodeblokk fra modellen på beregning/data-rute → behandles som
  oppslag/språk og merkes deretter.
- Ugyldig ruter-JSON → fall tilbake til data-ruten (dagens oppførsel).
- Manglende/ugyldig BYOK → innstillingsmodalen åpnes.
- Abort underveis → rydder status, spørsmålet beholdes i feltet.

## Testing

- Node-tester (`tests/js/`-mønsteret) for ruter-JSON-parsing,
  proveniens-kommentar-generering og svar-sammenstilling.
- **Ask-evalsett** i `docs/eval/` med ~10 spørsmål fordelt på de fire rutene
  (f.eks. primtall; helseutgifter per land; hovedstadsoppslag; normativt
  spørsmål som skal treffe språk-ruten med merking).
- Manuell smoke i nettleser som pre-push-port (etablert norm i openstat).

## Verifiseringspunkter i planfasen

- At adminGaten på `/api/data-svar` slipper gjennom BYOK-kall for ask (utvides
  hvis ikke).
- At oppslag-ruten kan kjøre data-svar-løkka uten kodekjøring (eller om den
  trenger et eget, enklere kall).
- At skjult editor/output ikke brekker kjøringen (f.eks. plotly-rendring i
  skjult element).

## Fase 2 (senere, egen spec)

- Trekke ut headless kjørings-API: `run(kode, modus) → {output, feil, plott}`
  i delt fil (gagner også AI-løkka, som i dag klikker `#btnRun` og skraper DOM).
- Egen lett `ask.html` (Netlify serverer automatisk), eventuelt eget subdomene.
- Interaktive svar-elementer (parametre som re-kjører kode), dashboards og
  presentasjoner som svarformater.
- Flere ruter: prediksjon, kausalitet (med identifikasjonsvurdering),
  optimering, normativ scenarioanalyse med eksplisitte verdipremisser.
- Eventuelt oppfølgingsspørsmål med kontekst.

## Koordinering og repo-strategi

- **Fork-port:** askstat forkes fra openstat (med full historikk) først når
  mini-knippet-arbeidet er ferdig committet — da følger ferskest mulig motor
  (data-svar-prompter, R/URL-bro, datalasting) med i forken.
- **Divergens er akseptert:** ingen synk mellom repoene (lærdom fra
  safestat/openstat: synk-regimer forvitrer). Motorforbedringer fra openstat
  cherry-pickes bevisst ved behov. For å holde cherry-picking billig unngår v1
  unødvendige endringer i motorfiler (data-svar, read-bridge, ost-r, openstat.py).
- **Beskjæring i etapper:** UI-nivå først (modusmeny), dypere sletting av
  motorfiler (webR m.m.) utsettes til fase 2 når `index.html` likevel sløyes.
- Implementering skjer i askstat på `main` (nytt repo, ingen brukere).
  Deploy-/push-beslutninger etter v1 tas av Hans.
