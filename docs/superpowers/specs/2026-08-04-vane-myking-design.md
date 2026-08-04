# Vane-myking (retning 2): gjør riktig vei lettest, og gal vei ikke dødelig

**Dato:** 2026-08-04 · **Status:** godkjent design (samtale-brainstorm), venter på implementasjonsplan

## Bakgrunn

ROADMAP-spørsmålet «DSL vs. LLM-vaner» er nå empirisk belyst gjennom en ukes
målinger (spike-kjennelsen, tre evalrunder, to transkript-obduksjoner av
ledighetsspørsmålet). Konklusjon: flertallet av brente kjøringer skyldtes
VÅRE hull (metadata, hint-drift) — men urllib/requests-vanen er en ekte,
tilbakevendende konflikt, og noen av reglene våre har friksjon som ikke
lenger verner noe.

Regelinventaret med vanekonflikt-vurdering står i samtalen 2026-08-04 og
oppsummeres slik: verifiserings-/ærlighetsreglene (probe-✅, dekningssjekk,
ID-fra-verktøy, run-disiplin) BEHOLDES uendret; mykingen skjer i transport-
og grammatikk-lagene.

**Valgt retning (Hans, 2026-08-04): retning 2** — ikke frislipp, ikke status
quo: fjern friksjon uten kontrolltap, gjør resterende harde feil om til
fungerende veier eller lærbare feil, og tett metadata-hullene som tvinger
blindflyging.

## Beslutninger

1. **`patch_urllib()` ved Pyodide-boot** (MÅLT 2026-08-04: rå urllib →
   `RuntimeError: TLS not supported`; med pyodide-http 0.2.2 `patch_urllib()`
   → fungerende henting). ALDRI `patch_all` — den nedgraderer requests fra
   den native urllib3-JSPI-veien til sync XHR (målt: adapter byttes til
   `pyodide_http._requests`). Feiler patch-lastingen: warn, aldri blokker
   boot. EVAL-regel 4 skrives om til sannheten: foretrekk bro/direktiv
   (proxy-fallback, feilhjelp, kildelogging); urllib/requests VIRKER, men
   mangler alt dette — og kilder lastet slik havner ikke i kildelisten.
2. **Parser-toleranse for etterfølgende kommentarer** på direktivlinjer:
   grammatikken STRIPPER (i stedet for å hardfeile på) tekst etter
   avsluttende `)` — målt juli-feilklasse. Promptens «tåler INGEN
   etterfølgende kommentar»-tekst oppdateres til samme historie
   (tolereres-men-ignoreres).
3. **Ukjente kwargs i direktiver blir filters-oppføringer** i stedet for
   hard feil: `eurostat.read("nrg_pc_202", geo="NO")` parses som
   `filters={"geo": "NO"}`. Verifiserbarhets-vernet BESTÅR — lasterlaget
   oversetter filters per kind og hardfeiler fortsatt på dimensjoner som
   ikke finnes (SDMX-introspeksjonen). Nær-treff på kanoniske nøkler
   (skrivefeil à la `yeras=`) skal fortsatt få suggest-feilen, ikke bli
   filters.
4. **Eurostat-metadata-adapter** i table_metadata: SDMX 2.1 XML-veien
   (MÅLT: dataflow- og contentconstraint-endepunktene svarer 200, XML-only —
   `format=JSON`/SDMX-JSON-Accept avvises) med befolkede-koder-filtrering
   som OECD-availability-mekanismen (`kun_befolkede`/`tilgjengelighet`).
   Gjenbruk fast-xml-parser + ecbMetadata-mønsteret. Lukker det dokumenterte
   fase 3-hullet (i dag: {feil+guide} uten dimensjonskoder → blindflyging,
   målt i ledighets-transkriptet: to brente kjøringer).

## Bevisst utsatt (telemetri-avgjort)

- Full A1-myking (requests-anbefaling i prompt) og sdmx1-som-SDMX-motor:
  `feilrapporter`-tabellen tagges (VANE-KONFLIKT vs. INTERN INKONSISTENS)
  når organiske data har samlet seg noen uker; raten avgjør.
- UI-velger for datatype, prompt-ferskhetsregel (grep 2), varmere tolk.

## Testing

Hver beslutning testlåses i sitt lag (parser-tester, prompt-tester,
adapter-tester m/XML-fixtures, boot-patch verifiseres i browser-smoke).
Sluttverifisering: ledighetsspørsmålet re-kjøres — suksesskriterium: færre
kjøringer enn transkriptets 4+, og INGEN «TLS not supported»/tomme
direktiv-runder av metadata-mangel.
