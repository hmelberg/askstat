<!-- KILDE for data-svar-edge-funksjonen (Web-modus: generelle dataspørsmål
mot åpne kilder). TS-konstantene i _lib/data-svar-prompt.ts er render-målet;
denne fila er kildedokument + endringslogg (samme mønster som kode-svar.md).

Design: docs/superpowers/specs/2026-07-03-web-data-svar-design.md.

Blokkstruktur: INTRO (tre faser: tolk → finn → generer; søkehåndverk),
DELIVERY (grenseregel pandas-vs-ost, ost-direktiver, proxy, POST-innpakking,
kildesitering, lukket grammatikk),
SCIENCE (rå→justert, identifikasjon, heterogenitet, ærlighet — utvidet fra
INFERENCE_STRATEGY_PYR i kode-svar.ts), INLINE (datatilfangst-stigen:
probet → transkribert-fra-web_fetch → modellkunnskap; aldri utfall fra
nivå 3), MULTI (merge til ÉN analysedataframe, join-nøkler, radtall
før/etter), MODE_PY/R/DUCK (miljø + svarformat), SEARCH_HINTS (meta-kataloger
som web_search-startpunkter), + registerblokk (renderRegistryBlock,
byte-stabil). Hosted tools: web_search + web_fetch.

Prompt-utviklingsloop (spec §7): endringer kjøres mot evalsettet
(docs/eval/data-svar-evalsett.md) før deploy; feilmønstre fra evals og
reparasjonsrunder blir nye promptregler eller register-quirks.

ENDRINGSLOGG
NB: entries FØR 2026-07-27 siterer direktivsyntaksen slik den var DA
(`# read <url> as <navn>`, `key(ask)`, `# connect X as ssb`). De står med vilje
urørt — det er en logg, ikke en referanse. Gjeldende syntaks: se siste entry.
- 2026-07-03: v1 — blokkene opprettet per spec.
- 2026-07-03: v1.1 — Evalsett-kjøring #1 (11 spørsmål, docs/eval/data-svar-evalsett.md):
  5/11 PASS, 6/11 FAIL. Klart gjentakende mønster i 5 av 6 feil (Q3/Q5/Q7/Q8/Q9):
  modellen skriver ad-hoc nettverkskode (read.csv/pd.read_csv/requests/pyfetch mot
  samme URL) i stedet for å bruke en allerede innlastet `# read`-variabel, og/eller
  merker en kilde «probe-verifisert» uten at probe faktisk returnerte ok=true for
  akkurat den URL-en. DELIVERY-blokken fikk to nye KRAV-punkter som adresserer
  begge: (1) `navn` fra `# read` er ferdig data — aldri hent på nytt; (2)
  «probe-verifisert» krever eksakt URL-treff i probe-loggen, ellers si ærlig fra at
  ingen kilde ble funnet. Samtidig: registerets `ssb`-oppføring fikk `cors: false`
  og en rettet `sporrings_url_mal` (v2, ikke v2-beta, for selve datauttrekket) —
  v2-beta/.../data feilet reproduserbart i to uavhengige spørsmål (Q3, Q4), mens
  søk og /metadata fortsatt virker fint på v2-beta. Q11 feilet separat med
  AbortError (90s non-streaming-turngrense nådd under et 11-verktøykall-forløp) —
  logget som infra-observasjon, ikke en promptfeil. `data-svar-prompt.test.ts`
  grønn etter endringen (115/115 i hele `_lib/`-suiten).
- 2026-07-03: v1.2 — Final-review fiksrunde: DELIVERY-eksempelet motsa det
  rettede `ssb`-registeret (viste fortsatt `v2-beta/.../data` og en direkte
  `ssb/…`-load uten proxy). Eksempelet er nå justert til å stemme eksakt med
  `data/data-sources.json`s `ssb`-oppføring: `# connect ssb` (register-id,
  som `fred`) + `# read /api/hent?url=<url-enkodet v2 data-URL…> as ledighet`
  (proxy obligatorisk, `cors:false`; datauttrekk MÅ bruke `/v2/`, ikke
  `/v2-beta/`). OWID- og fred-eksempellinjene er uendret. Samtidig:
  `_lib/anthropic.ts`s `AGENTIC_TIMEOUT_MS` hevet 90s → 180s (Q11 i evalsettet
  traff denne grensen med `AbortError` under et langt multi-probe-forløp;
  streaming av siste runde er den riktige langsiktige fiksen, se kommentar i
  fila). Q3/Q5/Q11 kjørt på nytt mot evalsettet — se
  `docs/eval/data-svar-evalsett.md` for resultatene. `data-svar-prompt.test.ts`
  og hele `_lib/`-suiten grønn etter endringen.
- 2026-07-23: + SEARCH_HINTS-blokk (meta-kataloger som web_search-startpunkter,
  spec 2026-07-23-user-keys-and-source-registry §6) mellom modus-blokken og
  registerblokken; registerblokken markerer nå brukernøkkel-status via
  available_keys (kun ider). Evalsettet utvidet med #12–15.
- 2026-07-23 (2): + MEMORY_URLS-blokk (kun nivå 2-leverandører uten websøk,
  spec 2026-07-23-llm-provider-tiers A4) mellom Søketips og registerblokken;
  TOOL_DEFS delt i CLIENT_TOOL_DEFS + hostede verktøy.
- 2026-07-25: SEARCH_HINTS peker ikke lenger på awesome-public-datasets som
  web_search-mål — den er nå en registerkilde (search_catalog(apd, …), se
  docs/superpowers/specs/2026-07-25-apd-catalog-design.md).
- 2026-07-27: PYTHONSK DIREKTIVSYNTAKS (spec
  docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md). Alle
  direktiveksempler i DELIVERY, INLINE, MULTI og modus-blokkene er skrevet om:
  `# connect ssb` → `# ssb = ost.connect("ssb")`, `# read <url> as <navn>` →
  `# <navn> = ost.read("<url>")`, `# read <alias>/<sti> as <navn>` →
  `# <navn> = <alias>.read("<sti>")`, `key(ask)` → `secret_key="ask"`.
  Prosaordet «load-linje/load-rammene» er borte (verbet heter `read`).
  DELIVERY fikk ett NYTT krav: grammatikken er LUKKET — ingen uttrykk,
  f-strenger eller variabler i argumenter, kun navngitte literaler. Uten den
  regelen skriver modellen Python inne i direktivlinja, som er den nærliggende
  feilen når linja *ser ut* som Python. MODE_DUCK sier nå eksplisitt at `#`
  ikke er kommentar i DuckDB-SQL (bruk `--`). `data-svar-prompt.test.ts`:
  needelen «load» byttet til «ost.connect»/«ost.read» — ordet finnes ikke i
  vokabularet lenger.
  UTESTET: evalsettet (docs/eval/data-svar-evalsett.md) er kalibrert mot det
  GAMLE vokabularet og er IKKE kjørt etter denne endringen. Krever API-nøkkel.
- 2026-07-27 (2): pandas-URL-bro (Task 6). `pd.read_csv(url)` virker nå direkte
  i Pyodide/Brython/MicroPython (Task 1–5) for rene GET-URL-er — DELIVERY
  fikk en NY grenseregel-tabell rett under overskriften: åpen tabell-URL →
  vanlig pandas (\`pd.read_csv\`), ett eksempel; nøkkel/proxy/kanonisk
  spørring/database → \`ost\`-direktiv, ett eksempel. Resten av DELIVERY
  (proxy, POST-innpakking, kildesitering, lukket grammatikk) er uendret —
  regelen gjelder bare HVILKET verktøy man griper til, ikke selve
  direktivgrammatikken. `data-svar-prompt.test.ts` fikk to nye needles i den
  eksisterende needle-listen (`pd.read_csv`, `Grenseregel`) — TILLEGG, ingen
  eldre needle endret eller fjernet. Hele `_lib/`-suiten grønn etter
  endringen.
  FIX (Task 6-review, samme dag): SDMX-forbeholdet fantes fra før KUN i
  hjelp.html:471 (til mennesker), ikke der det virker operasjonelt — i selve
  modell-prompten. DELIVERY fikk derfor én ny setning rett under
  grenseregel-tabellen, samme ordlyd som hjelp.html: SDMX-kilder (OECD, ECB,
  Norges Bank) ignorerer ukjente parametere STILLE i en rå URL — bruk `ost`
  med `years=`/`countries=`/`indicators=` som sikkerhetsskinne mot disse,
  ALDRI en rå `pd.read_csv`-URL mot SDMX. `data-svar-prompt.test.ts` fikk én
  ny needle (`SDMX`) i samme needle-liste — TILLEGG, ingen eldre needle
  endret.

### Uten websøk: modellkunnskaps-URL-er

Denne kjøringen har IKKE web_search/web_fetch. Registerverktøyene
(search_catalog → table_metadata → probe) er primærveien. For behov utenfor
registeret KAN du foreslå konkrete data-URL-er fra egen kunnskap (f.eks. hos
kildene i Søketips-blokken over) — men HVER slik URL MÅ verifiseres med probe
før den brukes i scriptet. Feiler proben: prøv en annen kandidat, eller si
ærlig at kilden ikke ble funnet. ALDRI lever en uprobet URL, og ALDRI merk noe
«probe-verifisert» uten at probe faktisk returnerte ok=true for akkurat den
URL-en.
-->

Se `_lib/data-svar-prompt.ts` — innholdet er inlinet som TS-konstanter fordi
Deno Deploy ikke bundler .md-filer ved kjøretid.
