# Langhale-oppdagelse: statisk katalog fra awesome-public-datasets (design)

*Prosjekt 2 fra økten 2026-07-25 (Hans): mens
`2026-07-25-source-catalog-adapters-design.md` dekker de 8 registerkildene
som ER en API men mangler adapter, dekker denne kilder som IKKE er en API i
det hele tatt — filer/lenkelister uten dimensjons- eller kodelistestruktur.
Hans presiserte at «de vanskeligere kildene» konkret betyr dette: datasett
som f.eks. de i github.com/awesomedata/awesome-public-datasets, der en egen
statisk oversikt trolig må lages selv. Hans vurderer å ta DENNE økten før
kildekatalog-adapterne — de to er uavhengige og kan gjøres i hvilken
rekkefølge som helst (se §2, dispatch-mønsteret er delt og additivt).*

## §0 Research-funn (verifisert live 2026-07-25, ikke antatt)

Første antakelse var at awesome-public-datasets kun er en README med
lenker (som SEARCH_HINTS-blokken i dag beskriver den: "kategorisert
lenkeliste, en del døde lenker"). Faktisk sjekk mot repoet viste noe bedre:

- README-en (`awesomedata/awesome-public-datasets`) er **auto-generert**
  fra en maskinlesbar kilde: `awesomedata/apd-core`, med **ÉN YAML-fil per
  datasett** under `core/<Kategori>/<slug>.yml`.
- Verifisert antall: **868 YAML-filer i 35 kategorier**
  (Agriculture, Economics, Government, Healthcare, Finance, Education,
  Climate+Weather, EarthScience, GIS, Energy, MachineLearning, …) — hentet
  via GitHub tree-API (`git/trees/master?recursive=1`).
- Faktisk skjema (to eksempler hentet direkte, felt varierer noe per
  oppføring — ingen av dem er påkrevd utover title/homepage/category):
  ```yaml
  title: Lemons quality control dataset
  homepage: https://github.com/softwaremill/lemon-dataset
  category: Agriculture
  description: Lemon dataset has been prepared to investigate...
  keywords: fruit, quality, lemon, segmentation
  access_level: public
  language: en
  license: MIT
  organization: [{name: SoftwareMill, web: https://softwaremill.com/}]
  issued_time: 2020.07
  ```
  Andre felt sett: `version`, `image`, `temporal`, `spatial`, `copyrights`,
  `accrual_periodicity`, `specification`, `data_dictionary`, `publisher`,
  `sources`.
- **Datasett-nivå, IKKE variabel-nivå** — ingen av YAML-filene har
  kolonne-/felt-skjema. Dette bekrefter ChatGPT-vurderingen fra tidligere i
  økten: GitHub-lenkelister gir oppdagelse og beskrivelse, ikke
  variabelmetadata. `homepage` peker ofte på en LANDINGSSIDE
  (f.eks. "https://fdc.nal.usda.gov/download-datasets"), ikke en direkte
  data-URL — modellen må ofte `web_fetch` landingssiden for å finne selve
  fildata-lenken før `probe` gir mening.
- README-ens OK/FIXME-ikoner (lenke-helse) er IKKE en per-YAML-felt —
  fant ingen pålitelig maskinlesbar helsestatus i selve `apd-core`-repoet
  (sannsynligvis generert av deres eget `deploy/`-verktøy ved bygg, ikke
  eksponert som data). Høsteren gjør derfor sin EGEN lette
  livstegn-sjekk (§3) i stedet for å stole på repoets ikoner.

## §1 Hva dette løser og ikke løser

**Løser:** «hvilke datasett finnes om X» — 868 kuraterte, beskrevne
kandidater blir søkbare LOKALT (ingen live HTTP mot GitHub per spørsmål),
i stedet for at modellen må web_search'e README-en på nytt hver gang og
tolke rå markdown/rst-tekst.

**Løser IKKE:** variabel-/kolonnenivå for disse 868 — det er iboende
umulig å forhåndshøste pålitelig (868 vilkårlige eksterne kilder i alle
mulige formater). Etter at `search_catalog` peker på en kandidat, gjelder
samme stige som i dag (INLINE-blokken i `data-svar-prompt.ts`):
`web_fetch` landingssiden ved behov → `probe` den faktiske data-URL-en.
Ingen endring i den stigen.

## §2 Arkitektur — samme to-nivås dispatch som kildekatalog-adapterne

Gjenbruker MØNSTERET fra `2026-07-25-source-catalog-adapters-design.md`
§2 (tilgang for delte protokoller, kind for bespoke): denne økten trenger
kun å innføre selve to-nivås switch-strukturen i `search_catalog` med ÉN
`kind`-gren (`apd`) — de andre grenene (sdmx/statfin/dst/fhi) legges til
uavhengig, i hvilken rekkefølge som helst. Ingen konflikt uansett hvilken
økt som gjøres først.

- **Ny registeroppføring** i `data/data-sources.json`:
  ```json
  {
    "id": "apd",
    "navn": "Awesome Public Datasets (fellesskapskatalog)",
    "utgiver": "awesomedata/apd-core (GitHub-fellesskap)",
    "tillit": "funnet",
    "tilgang": "fil",
    "kind": "apd",
    "base_url": "https://github.com/awesomedata/apd-core",
    "cors": false,
    "quirks": "868 datasett-oppføringer (35 kategorier), datasett-nivå kun — ingen kolonneskjema. homepage er ofte en landingsside, ikke en direkte data-URL. Søkes LOKALT mot en forhåndshøstet katalog (data/apd-catalog.json), ingen live GitHub-kall."
  }
  ```
- **`search_catalog`s switch** (se forrige spec §2 for full kodeform):
  `default`-grenen får `case "apd": return apdSearch(query)` —
  ren lokal filtrering (delstreng/nøkkelord mot title+description+keywords+
  category, case-insensitiv) over `data/apd-catalog.json`, LEST ÉN GANG og
  cachet i modul-scope (samme `_cache`-mønster som `registry.ts`, siden
  filen kun endres ved re-høsting, ikke ved kjøretid). Ingen nettverkskall
  i selve verktøyet — derfor null latency-kostnad utover fil-lesing.
  Treff capped til `MAX_HITS=20` (samme konstant/mønster som eksisterende
  `search-catalog.ts`).
- **`table_metadata`** støtter IKKE `apd` (samme feilmelding-mønster som
  for kilder uten adapter i dag: "ingen tabell-metadata for 'apd' —
  bruk web_fetch/probe på treffets URL"). Riktig, siden det ikke finnes
  kolonnedata å gi.
- **`registry.ts`s `renderRegistryBlock`**: "søkbar via search_catalog"-
  sjekken (allerede planlagt utvidet i forrige spec til å telle
  `kind`-baserte adaptere) dekker `apd` uten ekstra kode.
- **`SEARCH_HINTS`-blokken i `data-svar-prompt.ts`** oppdateres: teksten
  "gode startpunkter for web_search/web_fetch: awesome-public-datasets…"
  blir MISVISENDE etter denne økten (modellen skal bruke
  `search_catalog(apd, …)` direkte, ikke web_search README-en) — fjern
  awesome-public-datasets fra web_search-forslagene, siden den nå er en
  ekte registerkilde.

## §3 Høsteren (Python, engangsjobb + manuell re-kjøring)

**Fil:** `tools/harvest_apd_catalog.py` (samme stil/konvensjon som
`tools/build_norge_geojson.py`: docstring med manuelt kjøre-kommando,
`urllib.request` — ingen nye kjøretidsavhengigheter, kun tooling-siden;
`yaml`-parsing er allerede i bruk i `tools/gen_jmv_specs.py`, så PyYAML
er ikke en ny type avhengighet i `tools/`).

- **Hent HELE repoet som tarball** (`https://github.com/awesomedata/
  apd-core/archive/refs/heads/master.tar.gz`), IKKE 868 enkelt-fetches
  mot `raw.githubusercontent.com` — unngår rate-limiting og er høflig mot
  GitHub. Pakk ut i minne/temp, finn alle `core/**/*.yml`.
- **Per fil:** parse YAML → normaliser til kompakt post:
  `{id, title, category, description (kuttet ~200 tegn, samme konvensjon
  som cleanDescription i catalog-format.ts), keywords, homepage, license,
  access_level, language, publisher}`. `id` = `<kategori-slug>/<fil-slug>`
  (stabil, menneskelesbar, ingen kollisjon siden det speiler repoets egen
  mappestruktur).
- **Lett livstegn-sjekk:** HTTP HEAD (fallback GET ved 405/501) mot
  `homepage`, kort timeout (~5s), IKKE en full nedlasting. Lagre
  `reachable: bool` + `checked_at: <høste-dato>` — men IKKE slett
  ureachable oppføringer (unngår stille dekningstap — jf. prinsippet om at
  taps-caps skal logges, ikke skjules). Reachable er bare et hint;
  `probe`-kravet i DELIVERY-blokken («ALDRI lever en uprobet URL») gjelder
  fortsatt fullt ut ved faktisk bruk — en gammel høste-tids-HEAD er ikke
  et probe-resultat.
- **Output:** `data/apd-catalog.json` (samme mappe som `data-sources.json`
  — konsumeres av edge-funksjonen, ikke `static_data/` som er
  demo-datasett).
- **Kjøring:** manuell, som `build_norge_geojson.py`:
  `python3 tools/harvest_apd_catalog.py`. Logger antall hentet, antall
  ureachable, og en kort kategorifordeling til stdout ved kjøring (synlig
  dekningsrapport, ikke stille).
- **Refresh-kadens:** manuell re-kjøring når man vil ha oppdaterte
  oppføringer (apd-core oppdateres av fellesskapet jevnlig, men ikke i et
  tempo som krever cron/CI ennå — matcher "korte sykluser"-stilen).

## §4 Skala/token-kostnad

868 oppføringer ligger KUN i `data/apd-catalog.json` (fillest, ikke i
systemprompten — i motsetning til f.eks. `variable_metadata.json`s
`renderNameList` for microdata, som bevisst inlines HELE katalogen fordi
den brukes av en egen "picker"-modell-runde). Her er det ikke nødvendig:
`search_catalog(apd, query)` returnerer KUN treffene (cappet til 20) som
et verktøyresultat, samme mønster som pxweb/ckan-søk i dag. Ingen
tokenkostnad ved spørsmål som ikke trenger denne kilden.

## §5 Testing

- **Python:** `tests/test_harvest_apd_catalog.py` (pytest, matcher
  `tests/test_gen_jmv_specs.py`-mønsteret) — fixture-YAML-filer (ikke
  live nettverk), dekker: normalisering, kutting av lange beskrivelser,
  manglende valgfrie felt (mange oppføringer mangler f.eks. `keywords`
  eller `license` — se OpenFoodFacts-eksempelet i §0 som mangler
  `version`/`image`), livstegn-sjekk (mock HEAD-respons).
- **TypeScript:** `_lib/tools/search-catalog.test.ts` får en `apdSearch`-
  seksjon med en LITEN fixture-katalog (3-5 poster), ikke hele 868 —
  dekker: treff, tomt søk, delstreng-match på tvers av title/description/
  keywords/category.

## §6 Bevisst utenfor økten

- Variabel-/kolonneskjema for apd-oppføringer — iboende urealistisk å
  forhåndshøste pålitelig for 868 vilkårlige kilder; `web_fetch`+`probe`-
  stigen dekker dette per spørsmål som i dag.
- Andre seed-lister utover apd-core (Zenodo, data.world, Kaggles egen
  datasett-liste) — samme høste-mønster ville fungere, men ikke bygget nå.
- Kategori-filtrering ved høsting (f.eks. dropp MachineLearning/
  ImageProcessing som mindre relevant for offentlig statistikk) — høst
  ALT (billig, én gang), la nøkkelord-søket gjøre relevans-filtreringen
  per spørsmål i stedet for å gjette bort kategorier på forhånd.
- Automatisk cron-refresh av høsten.
- Kildekatalog-adapterne for sdmx/statfin/dst/fhi — egen spec
  (`2026-07-25-source-catalog-adapters-design.md`), uavhengig av denne.
