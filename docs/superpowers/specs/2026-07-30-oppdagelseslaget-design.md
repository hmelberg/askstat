# Oppdagelseslaget — meta-søk med scope

**Dato:** 2026-07-30
**Status:** Godkjent av Hans (designrunde 2, diskusjonsrunder i Claude Code-sesjon)
**Bygger på:** samlet ask-pipeline (spec 2026-07-29, live på ask.melberg.app)

## Bakgrunn og mål

Kartlegging 2026-07-29 viste at oppdagelses-gapet primært IKKE er manglende
metakataloger, men at flere av de mest brukte kildene ikke er SØKBARE:
worldbank, eurostat og dbnomics (pluss who/owid/fred/kaggle) er kun lesbare
når modellen alt kjenner ID-en. Q4-typen («helseutgifter/BNP») må derfor
finne indikator-ID-er via websøk — tregere og mindre presist enn katalogsøk.
I tillegg mangler forskningsdata-oppdagelse helt (survey-/individdata).

**Mål:** Én søkearkitektur som dekker begge: modellen finner både offisiell
statistikk og forskningsdata med FÆRRE turer enn i dag, uten promptvekst og
uten å svekke hastighetsgevinsten fra pipeline-runden.

## Beslutninger (med begrunnelse)

| # | Beslutning | Begrunnelse |
|---|---|---|
| 1 | Begge mål i én runde (statistikk + forskningsdata) | Én felles meta-søk-arkitektur bærer begge; scope-parameteren skiller |
| 2 | Arkitektur A: meta-søk `search_datasets(query, scope)` m/ server-side parallell utvifting | Én tur erstatter 3–4; ett verktøy i prompten; treg katalog forsinker ikke resten |
| 3 | Kuratering v1 — stats: ssb, worldbank (NY), eurostat (NY), dbnomics (NY), oecd, apd; research: datacite (NY), data.europa.eu (NY) | Størst dekning per adapter; DBnomics gir 80+ leverandører i én |
| 4 | Kodebok/profilering løses med PROMPT-regler på run_code, ikke serververktøy | run_code lar modellen profilere selv (pd.read_stata leser etiketter); inspect_dataset server-side er YAGNI |
| 5 | worldbank/eurostat som STATISKE høstede kataloger (apd-mønsteret); dbnomics/datacite/data.europa.eu som levende API-søk | Indikatorlisten/TOC-en endres sjelden; høsteskript committes, kjøres ved behov |

## Arkitektur

### Verktøyet

```text
search_datasets(query: string, scope?: "stats" | "research" | "all")
```

Klientverktøy (utføres server-side på edgen som dagens verktøy). Default
scope: "stats". Serveren vifter ut til scope-katalogene PARALLELT:

- Per-katalog-timeout: 2 500 ms. Timeout/feil → katalogen noteres i
  `failed`-listen i resultatet; de andre leverer som normalt.
- Fletting: kilde-diversitet (maks 4 treff per katalog), enkel
  relevansrekkefølge per katalog bevares, topp 15 totalt.
- `search_catalog(source, query)` beholdes UENDRET for målrettede
  enkeltkilde-søk (modellen kan grave dypere i én katalog).

### Treff-formatet (normalisert)

```json
{
  "source": "worldbank",
  "id": "SH.XPD.CHEX.GD.ZS",
  "title": "Current health expenditure (% of GDP)",
  "description": "…",
  "time": "2000–2023",
  "geo": "global",
  "access": "open" | "landing-page" | "restricted" | "key-required",
  "how_to_read": "table_metadata('worldbank', 'SH.XPD.CHEX.GD.ZS') → # h = worldbank.read(\"country/all/indicator/SH.XPD.CHEX.GD.ZS\")"
}
```

`how_to_read` er en KONKRET neste-steg-hint per kilde-kind: table_metadata-
kall, kanonisk `<alias>.read`-form, eller «probe landingssiden» (DataCite).
Felt uten data utelates (aldri gjettes). Resultatobjektet:
`{hits: [...], failed: ["eurostat"], scope, query}`.

### Kataloger per scope (v1)

| Scope | Katalog | Type | Vei |
|---|---|---|---|
| stats | ssb | live (finnes) | pxwebSearch gjenbrukes |
| stats | worldbank | STATISK (ny) | `data/worldbank-catalog.json` — indikatorliste (~24k, trimmet til id/navn/enhet/kildenote), høstet fra `api.worldbank.org/v2/indicator?format=json` |
| stats | eurostat | STATISK (ny) | `data/eurostat-catalog.json` — offisiell TOC (`ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt`), ~7k tabeller m/ tittel+kode+periode |
| stats | dbnomics | live (ny) | `api.db.nomics.world/v22/search?q=…` — datasett på tvers av 80+ leverandører (IMF, BIS, ILO, …) |
| stats | oecd | live (finnes) | sdmxSearch gjenbrukes |
| stats | apd | statisk (finnes) | apdSearch gjenbrukes |
| research | datacite | live (ny) | `api.datacite.org/dois?query=…&resource-type-id=dataset&page[size]=…` — nøkkelfritt; DOI-metadata fra Zenodo/Figshare/Dataverse m.fl. |
| research | data.europa.eu | live (ny) | søke-API (`data.europa.eu/api/hub/search/…`) — DCAT-metadata, europeiske offentlige data |
| all | union av begge | | |

Statiske kataloger følger apd-mønsteret: høsteskript i `scripts/` (python),
resultat committet i `data/`, test som validerer formatet. Oppfrisking =
kjør skriptet på nytt (manuell beslutning, som apd). Størrelsestak: hver
statisk katalogfil ≤ ~1 MB — worldbank-høsteren dropper arkiverte/utgåtte
indikatorer og trimmer beskrivelser (apd er 460 kB; edge-kaldstart skal ikke
belastes mer enn nødvendig).

**Utsatt (bevisst):** re3data, OpenAlex-datasettkobling, DataONE, WHO/OWID/
FRED-søk (fortsatt lesbare som før), Kaggle (nøkkelkrav), LLM-omranking av
treff, server-side inspect_dataset/read_codebook, MCP-lag.

### table_metadata-utvidelser

Nye kinds KUN der oppfølging er billig og nødvendig:
- `worldbank`: per-indikator-detalj fra `api.worldbank.org/v2/indicator/<id>?format=json` (navn, enhet, kilde, definisjon).
- `dbnomics`: datasettstruktur fra `api.db.nomics.world/v22/datasets/<provider>/<dataset>` (dimensjoner, perioder).

Eurostat-treff bærer nok fra TOC-en (kode+tittel+periode) til dagens
kanoniske `eurostat.read(...)`-vei + probe; DataCite/data.europa.eu-treff
følges opp med web_fetch/probe av landingssiden (access-feltet styrer).

## Prompts (kun data-ruten)

1. **META_SEARCH-blokk (~12 linjer) ERSTATTER SEARCH_HINTS:** søk med
   `search_datasets` FØRST; scope etter spørsmålstype (offisiell statistikk →
   stats; survey-/individ-/forskningsdata → research; usikker → all); følg
   `how_to_read` på valgt treff; `search_catalog` for å grave i én katalog;
   web_search er SISTE utvei for data-oppdagelse, ikke første. Treff med
   `access: "landing-page"` er IKKE lastbare før probe/web_fetch har funnet
   en faktisk fil-URL.
2. **KODEBOK-blokk (~8 linjer), forskningsdata på run_code-siden:** før
   analyse av survey-/individdata: les variabel- og verdietiketter
   (`pd.read_stata(..., convert_categoricals=True)`; SPSS/etikettløs CSV →
   let etter kodebok på landingssiden), sjekk spesielle missing-koder
   (8/9/99/999-mønstre) og vekter/strata; oppgi eksplisitt hva som er ukjent
   når kodebok mangler — aldri gjett verdibetydninger.
3. Fase 2 i INTRO justeres: `search_datasets → (search_catalog) →
   table_metadata → probe`.

Netto promptvekst ≈ 0 (META_SEARCH erstatter SEARCH_HINTS). Budsjetter står:
ett `search_datasets`-kall = ett klientverktøykall.

## Feilhåndtering og ærlighet

- Delvise resultater: `failed`-listen vises for modellen («eurostat svarte
  ikke») — den kan si det videre eller søke målrettet med search_catalog.
- Tomt resultat: strukturert svar med omformuleringsforslag per scope
  (synonymer, engelsk/norsk, bredere termer) — samme håndverk som i dag.
- DataCite-treff uten fil-URL: `access: "landing-page"` + probe-✅-kravet
  gjelder uendret — ingenting brukes i script uten verifisert URL.
- SSRF-vernet (\_lib/ssrf.ts) gjelder alle nye adaptere; ingen nøkler
  involvert i v1-katalogene.

## Filstruktur (mål)

| Fil | Skjebne |
|---|---|
| `netlify/edge-functions/_lib/tools/search-datasets.ts` | NY: scope-oppslag, parallell utvifting, fletting, normalisering |
| `netlify/edge-functions/_lib/tools/catalogs/worldbank.ts` | NY: statisk katalogsøk + table_metadata-adapter |
| `netlify/edge-functions/_lib/tools/catalogs/eurostat.ts` | NY: statisk TOC-søk |
| `netlify/edge-functions/_lib/tools/catalogs/dbnomics.ts` | NY: live søk + table_metadata-adapter |
| `netlify/edge-functions/_lib/tools/catalogs/datacite.ts` | NY: live DOI-søk |
| `netlify/edge-functions/_lib/tools/catalogs/dataeuropa.ts` | NY: live DCAT-søk |
| `data/worldbank-catalog.json`, `data/eurostat-catalog.json` | NYE: høstede kataloger |
| `scripts/harvest_worldbank_catalog.py`, `scripts/harvest_eurostat_catalog.py` | NYE: høsteskript m/ tester |
| `_lib/svar-prompt.ts` + `prompts/svar.md` | META_SEARCH erstatter SEARCH_HINTS; KODEBOK-blokk; verktøydef |
| `svar.ts` | executeTool-case + verktøydef i data-ruten |
| `_lib/tools/search-catalog.ts`, `table-metadata.ts` | worldbank/dbnomics-kinds gjenbrukes fra catalogs/-modulene |

## Verifisering

1. Deno-tester per adapter (mockede API-svar) + flette-tester (diversitet,
   failed-håndtering, topp-15-kutt, normalisering).
2. Høsteskript-tester (formatvalidering av de statiske katalogene, samme
   mønster som test_harvest_apd_catalog.py).
3. UFAKTURERT live-røyk per katalog: direkte curl mot hvert API + ett
   search_datasets-kall via lokal dev-server med mock-spørring (fanget
   OECD-Accept-Language-500 sist — samme port her).
4. Eval: to NYE spørsmål i evalsettet —
   - **Q11 (research):** «Finn forskningsdata om helse og inntekt på
     individnivå» → research-scope, DataCite-treff, ærlig access-merking,
     ingen fabrikkerte fil-URL-er.
   - **Q12 (stats):** en Verdensbank/Eurostat-sammenligning som i dag krever
     websøk → besvares via katalogsøk UTEN web_search, < 90 s.
   Q1–Q10 re-kjøres som regresjonsvakt (ingen latensregresjon).

## Roadmap videre (neste designrunder)

- Metakataloger runde 2: re3data (finn ARKIVER), OpenAlex artikkel→datasett.
- Selvforbedrende prompts (evalsettet som læringssløyfe).
- MCP-lag over verktøyene når/hvis flere klienter trenger dem.
- HMAC-signering av resume-state (rest-risiko fra pipeline-runden).
