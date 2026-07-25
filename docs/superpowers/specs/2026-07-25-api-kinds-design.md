# API-kinds: sdmx/dbnomics/worldbank + kanonisk vokabular (design)

*Hans' bestilling 2026-07-25: API-kilder via kind() — Verdensbanken, OECD,
«og andre store kilder». Generalisert etter Hans' innspill i samme økt:
(a) protokoll-adaptere fremfor kilde-spesifikke kinds (DBnomics-ideen),
(b) brukeren skriver KILDEN (oecd), ikke formatet (sdmx), (c) et kanonisk
spørrevokabular (countries/years/… ) som oversettes per kilde. Alle
API-fakta under er probet live 2026-07-25 med curl.*

## §0 Probefunn som styrer designet (alle 2026-07-25)

| Kilde | Funn |
|---|---|
| Verdensbanken | CORS `*`; enkel JSON `[meta, [rader]]`; `per_page`-default er 50 (!), `meta.pages` for paginering; feilform `[{message:[…]}]` |
| OECD | `Accept: application/vnd.sdmx.data+csv;labels=id` → SDMX-CSV (komma, koder, langt format). `format=csvfile`-param virker også. CORS OK (reflektert origin). 404 `NoResultsFound` / 422 `expecting 13 got 12` som rene tekstfeil |
| ECB | 406 på sdmx-csv-Accept; `Accept: text/csv` OG `format=csvdata` virker begge (komma-CSV, KEY+dimensjoner+OBS_VALUE). CORS `*` |
| Norges Bank | sdmx-csv-Accept virker (komma, `;labels=id` gir rene koder — semikolon-problemet fra `format=csv` forsvinner). `Accept: text/csv` gir XML (!). CORS OK |
| DBnomics | CORS OK; JSON med `series.docs[].period/value`-arrayer; `:latest`-dataset 302-redirecter (fetch følger); CSV-varianten er BRED med avsnitts-lange kolonnenavn — ubrukelig for oss |
| **Fellen** | SDMX 3.0-filtre `c[DIM]=verdi` blir **stille ignorert** av OECD, ECB og NB (2.1-API-er): svaret ser vellykket ut men er ufiltrert. Regel: send ALDRI parametre vi ikke vet at kilden forstår — oversett verifiserbart eller feil høyt |
| WHO GHO | API-et svarte ikke (timeout) — utsatt, notert i roadmap |

## §1 Arkitektur: tre protokoll-adaptere, kildenavn som inngang

Ny ren modul **`js/api-kinds.js`** (samme kontrakt som js/pxweb.js: ingen
nett/DOM, kjører under `node --test`), med tre protokoll-kinds:

- **`sdmx`** — OECD, ECB, Norges Bank, IMF m.fl. Datavei: forsøk 1 med
  `Accept: application/vnd.sdmx.data+csv;labels=id`; blir svaret 406 eller
  content-type ikke CSV → forsøk 2 med `format=csvdata`-param (ECB-veien).
  Deterministisk, maks to forsøk, ingen per-kilde-konfig; svaret leveres
  som CSV-bytes urørt (passthrough — API-ets egne kolonnenavn, Hans' valg).
- **`dbnomics`** — én adapter for ~80 kilder (IMF, BIS, ILO, FAO …).
  JSON hentes med `observations=1` tvunget på; flatener til langt format:
  én rad per (serie, periode) med kolonnene `series_code`, én kolonne per
  dimensjon (fra `docs[].dimensions`, koder som verdier), `period`,
  `value`. `limit`-taket (1000 serier) sjekkes mot `num_found` — flere →
  ærlig feil med hint om filtre. CSV-varianten brukes IKKE (bred, monstrøse
  kolonnenavn).
- **`worldbank`** — URL-bygger tvinger `format=json` og setter
  `per_page=20000` når brukeren ikke har valgt (default 50 er en felle);
  følger `meta.pages` med sideløkke (tak 10 sider → ærlig feil over det);
  flatener til kolonnene `indicator, country, countryiso3code, date, value`
  (koder som verdier, samme konvensjon som pxweb). WB-feilformen
  `[{message:[…]}]` → norsk feilmelding med API-ets egen tekst.

**Kildenavn som inngang** (Hans 2026-07-25: «brukeren vet ofte kilden,
ikke formatet»):

1. *Registeret bærer kind:* oppføringer i data/data-sources.json får
   `kind`-felt (oecd/ecb/norgesbank → sdmx; worldbank → worldbank;
   dbnomics → dbnomics; ssb har alt pxweb-tilgang). `resolve()` henter
   kind fra registeroppføringen når direktivet ikke har kind() —
   `# connect oecd as o` er alt som trengs.
2. *Alias-tabell i api-kinds.js:* `kindAlias('oecd') === 'sdmx'` osv., så
   `kind(oecd)` med bar URL også virker. Protokollnavnene (sdmx/dbnomics/
   worldbank) forblir gyldige for kilder utenfor registeret.

## §2 Direktiv-UX (fase 1 — kildens egen spørremodell)

```
# connect oecd as o
# read o/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all?startPeriod=2020 as levealder

# connect https://data-api.ecb.europa.eu/service/data as ecb, kind(sdmx)
# read ecb/EXR/D.USD.EUR.SP00.A?startPeriod=2026-01-01 as kurs

# connect worldbank as wb
# read wb/country/NOR;SWE/indicator/NY.GDP.MKTP.CD?date=2015:2024 as bnp

# connect dbnomics as dbn
# read dbn/IMF/WEO:latest/NOR.NGDP_RPCH as vekst
```

Som pxweb/eurostat: «stien» etter alias er API-ets egen ressurssti,
query-parametre er API-ets egne. `resolve()`-grenen for pxweb/eurostat
utvides med de nye kind-ene: ressurssti kreves (egen feilmelding med
eksempel per kind), `table` = stien før `?`.

## §3 Kanonisk vokabular (fase 2 — sukker, aldri magi)

Hans' standard: source/dataset/countries/regions/indicators/start_year/
end_year/filters. Mapping: `source` = connect-linjen, `dataset` = stien i
read-målet; resten er opsjoner på read-linjen (parseOptions tar allerede
vilkårlige `felt(…)`):

```
# read o/DSD_HEALTH_STAT@DF_LE as le, countries(NOR SWE), years(2020:2024)
# read eu/nama_10_gdp as bnp, countries(NO), years(2020:), filters(na_item=B1GQ unit=CP_MEUR)
```

- **`years(a:b)`** dekker start_year/end_year (`years(2020:)` = åpen ende).
  Mekanisk overalt: SDMX `startPeriod/endPeriod`, WB `date=a:b`, Eurostat
  `sinceTimePeriod/untilTimePeriod`, pxweb `valueCodes[Tid]` (v2-uttrykk
  verifiseres i implementasjonen — proben var inkonklusiv pga.
  obligatoriske variabler).
- **`countries(…)`/`regions(…)`/`indicators(…)`**: oversettes per kind der
  det er mekanisk verifiserbart — WB (sti-segmenter), Eurostat (`geo=`),
  pxweb (`valueCodes[Region]`/`valueCodes[ContentsCode]`), dbnomics
  (`dimensions=`-JSON der dimensjonsnavnet er kjent). For **sdmx** bygges
  posisjonsnøkkelen via **CSV-header-introspeksjon**: én liten
  `lastNObservations=1`-probe (delt _bufCache), headerkolonnene mellom
  prefikset (`DATAFLOW` hos OECD, `STRUCTURE,STRUCTURE_ID,ACTION` hos NB,
  `KEY` hos ECB) og `TIME_PERIOD` ER nøkkeldimensjonene i orden
  (verifisert: DF_LE ga nøyaktig de 13 som 422-feilen krevde) —
  ingen XML/DSD-parsing (pandasdmx-tyngden vi bevisst unngår).
- **`filters(k=v …)`**: API-native ventil — pxweb `valueCodes[k]=v`,
  Eurostat/WB rene query-params; for sdmx rutes k=v inn i nøkkelstien via
  samme headerkunnskap (query-params ville blitt stille ignorert, jf. §0).
- **Hard-feil-regelen:** et kanonisk felt som ikke kan oversettes
  verifiserbart for kilden → norsk feil med kildens native alternativ.
  ALDRI stille passthrough (§0-fellen gir feil-data-som-ser-riktig-ut).

## §4 Berørte lag (samme sjekkliste som Eurostat-økten)

1. `js/api-kinds.js` (ny) + `tests/api-kinds.test.js` (node --test).
2. `js/data-directives.js` — nye kinds i resolve(); kind fra
   registeroppføring; alias-oppslag; fase 2: kanonisk-oversettelse som ren
   funksjon (testbar uten nett).
3. `js/data-loader.js` — gren ved pxweb-grenen: Accept-header på direkte
   fetch (fetchLoadTarget utvides med per-item-headere), 406/ikke-CSV →
   param-fallback, konvertering per kind, CSV-bytes ut. Delt
   _bufCache/proxy-fallback.
4. `netlify/edge-functions/_lib/hent-core.ts` — videresend innkommende
   `accept`-header (én linje; headere bygges i dag fra bunnen og mister
   den — sdmx via proxy ville fått XML).
5. `index.html` — nye kinds i pushdown-ekskluderingen (~7489). Katalog-/
   tab-probe hoppes bevisst over (id-rommene er enorme; åpent punkt).
6. `data/data-sources.json` — oppføringer for oecd/ecb/norgesbank/
   worldbank/dbnomics med kind, base_url og quirks (per_page-fella,
   13-delt nøkkel, Accept-krav, `:latest`-redirect).
7. `js/portable-export.js` — selvforsynt eksportkode: sdmx = SAMME
   Accept-header som appen (python urllib.request, R download.file med
   headers=) så rammen blir byte-identisk — format-param duger ikke
   (navnet varierer per kilde, og NBs `format=csv` gir semikolon+labels);
   worldbank/dbnomics = samme flatening som JS (speilet logikk).
8. `openstat.py` — kind="sdmx"/"dbnomics"/"worldbank" + alias; paritet
   håndheves av delte fixtures (tests/fixtures/worldbank_response.json,
   dbnomics_response.json, sdmx_header.csv) i begge testsuiter.

## §5 Bevisste valg og avgrensninger

- **Eksterne pakker (dbnomics-py, pandasdmx/sdmx1, rsdmx) brukes IKKE:**
  wasm-motorene (Pyodide/webR/Brython/MicroPython) kjører ikke
  requests/lxml-stackene deres, og i eksporten ville pakkene gitt andre
  rammer enn appen viser (bryter «samme script, samme resultat»).
  De nevnes i katalog-quirks som tips for videre arbeid UTENFOR openstat.
- **Kolonner ut = API-ets egne navn** (Hans' valg 2026-07-25): OBS_VALUE
  hos SDMX-kilder, value hos WB/dbnomics/pxweb. Ingen navnemagi.
- **Ingen katalog-/tab-probe for nye kilder** i denne økten (20k+
  WB-indikatorer). Åpent punkt sammen med WHO GHO og IMF-liveverifisering.
- **Fase 1 pushes før fase 2 påbegynnes** (push-alltid-regelen; fase 1 er
  selvstendig nyttig).

## §6 Testing/verifisering

- node --test: URL-byggere (Accept-strategi som ren funksjon: gitt
  responsstatus/content-type → neste steg), WB-flatener (inkl. feilform og
  paginerings-meta), dbnomics-flatener (inkl. sparse verdier), alias-
  tabellen, sdmx-headerparsing (fase 2).
- deno: resolve()-grenene (ressurssti-krav, kind fra register, alias).
- pytest: paritet på delte fixtures.
- Live før push: editor mot OECD/ECB/NB/WB/DBnomics (hard-reload med
  ignoreCache — kjent Chrome-cache-felle), eksportert script i lokal
  CPython. Norsk BNP/levealder som fasit-sjekk.
