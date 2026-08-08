# Kildevelger-runde 2 — opprydding i sources-UI og standardvalg (askstat)

## Kontekst

Hans' smoke av pakkesplitting-runden avdekket at kildevelger-UI-et er forvirrende: sjekkbokslista i pillen mangler overskrifter/visuelle skiller; synkede test-importer fra e2e-røyk ser ut som «default-valgte pakker»; auto-landvalget vises misvisende som en avhuket sjekkboks blant kildene; standardkildene (ssb, dbnomics, …) er usynlige, ubeskrevne og kan ikke skrus av; og skillet kolleksjon (oversikt) vs enkeltkilde forsvinner ved import. Hans' beslutninger (2026-08-08): ryddeknapper (ikke automigrering), landvalg som egen sidemeny-knapp m/Automatic+None, registry-liste m/ekte av/på (default PÅ, mekanisk server-filtrering, synket), badges/grupper for kolleksjoner vs kilder. Bygger på main (32 commits foran origin, upushet — pakkesplitting-runden).

Repo: `/Users/hom/Documents/GitHub/askstat`. Ingen bakoverkompat (ingen brukere), men synk-mønsteret (hel-verdi-objekter m/`updated`, eksplisitte verdier fremfor felt-sletting) beholdes.

## Designavgjørelser

- **`doc.country = {mode:'auto'|'none'|'cc', cc?, updated}`** — nytt synket felt i profiles-dokumentet. VALGET synces; auto-RESULTATET forblir device-lokalt i `md_pack_auto`. `doc.packs` blir rent manuelt flervalg `{ids}`; `{auto:true}`-varianten og `setPacksAuto` slettes (writeDoc skrubber gamle `{auto:true}`); «Standard (automatic)»-raden i popoveren UTGÅR (funksjonen bor i landvelgerens «Automatic»).
- **`doc.sources_off = {ids, updated}`** — synket; klient-clamp regex `^[a-z0-9_-]{1,32}$`, tak 40. Nytt body-felt `sources_off` i /api/svar; server filtrerer registry-arrayen ETT sted (rett etter loadRegistry i svar.ts) så både registerblokka og HELE executeTool (search_catalog/table_metadata/search_datasets/probe) dekkes mekanisk. IKKE-muterende filter (loadRegistry cacher modul-globalt). hent.ts urørt.
- **`beskrivelse`** (engelsk én-linjer) blir PÅKREVD felt i data/data-sources.json (30 kilder — innholdsjobb) + registry.ts-skjemaet; vises KUN i manager-infopanelet, ALDRI i promptens registerblokk (cachet prefiks, byte-stabil-test urørt).
- **Gruppering:** popover-scrollen og manageren gjenbruker Explore-taksonomien: «Topic overviews» (importer m/origin.kind overview) / «Individual sources» (origin.kind source) / «My sources» (egne) — og manageren får i tillegg «Built-in data sources» (registry-togglene) nederst. Popoveren viser ALDRI registry-togglene. Norway/Finland utgår som sjekkbokser (eies av landvelgeren). importPack lagrer `origin.kind`.
- **Pille-etiketten viser kun manuelt valgte pakker** (packsState().ids; tom → «Sources») — landet vises på sidemeny-knappen «Country: X». Payloaden bruker `effectiveIds()` = countryPackId() + packsState().ids (dedup; motoren/packs[]-kontrakten ellers uendret; PACKS_MAX 20 holder).

## Oppgaver

**Task 1 — Tilstandsmodell i `js/profiles.js` + synk-vakt** (`countryState/setCountry/sourcesOff/toggleSourceOff`; forenklet `packsState`; `mergeRemote` får hel-verdi-armer for country+sources_off via felles hjelper; `js/konto-sync.js:75`-vakten utvides `!out.packs && !out.country && !out.sources_off`).

**Task 2 — Kjerne i `js/packs.js`**: `countryPackId()` (none→null; cc→`curatedForCountry(cc)||'country:'+cc`; auto→`md_pack_auto`), `effectiveIds()` (land først), `countryOptions()` (kuraterte + generiske land, sortert), `load()` henter også `data/data-sources.json` (nett-først + cache-fallback-mønsteret), `listRegistry()`, `describe('reg:…')`-arm, `importPack` lagrer kind, `list()` mister builtin/country-grenene og grupperer importer på origin.kind. `rawSelected`/`ensureSelected` bytter til `effectiveIds`.

**Task 3 — Server**: `registry.ts` får `beskrivelse` i skjema + `coerceSourcesOff` + `filtrerAvslatte` (ny array!); `svar.ts` RequestBody + filterpunkt etter loadRegistry; `data/data-sources.json` får 30 engelske beskrivelser.

**Task 4 — Sidemeny-knapp + landvelger-modal**: `#askCountryBtn`/`#askCountryLabel` etter Profile-knappen (index.html:170-173-mønsteret, renderSideLabel-idiomet); ny `#countryBackdrop`-modal (Explore-mønsteret: fast søke-input, kun rader rebygges) med radioradene Automatic (from your language) → kaller `P.onLangChange(localeCandidates)` / None (international) / land fra `countryOptions()` m/`filterCatalog`-søk; valg lukker. Gamle `renderCountries`/`managerView='countries'`-maskineriet + `#sourcesCountryBtn` slettes.

**Task 5 — Popover-opprydding** (`renderInto` packs.js:423-537): standardRow + country-blokka slettes; scrollen får gruppeoverskrifter (`.ask-pop-group`, kopiér `.ask-explore-group`-stilen css/ask.css:159-166); tom-bibliotek-hint; sjekket-status mot `packsState().ids`.

**Task 6 — Manager** (`renderLibrary` packs.js:617-677): tre pakkegrupper m/overskrifter + «Built-in data sources» nederst (checkbox=!off → `toggleSourceOff`; navneklikk → infopanel m/beskrivelse); bunnrad: fjern Add country…, nye «Deselect all» (`setPacks([])`) og «Remove imported» (confirm; sletter alle profiles-kilder m/`origin.source==='community'` — `remove()` rydder doc.packs.ids selv).

**Task 7 — Etiketter/progress**: `context-pill.js` renderLabel → kun `packsState().ids`; ask-view-progresslinja (ask-view.js:1065-1070) bygger fra `effectiveIds()` m/`(auto)`-suffiks kun på landpakka når mode==='auto'.

**Task 8 — i18n**: nye nøkler (Country/Country: {name}/Country: none/Automatic (from your language)/None (international)/My sources/Built-in data sources/Deselect all/Remove imported/confirm-teksten/tom-hintet/titler) × 12 ordbøker + `node tools/list_i18n_keys.mjs`-regen; gjenbruk Topic overviews/Individual sources; fjern Standard (automatic)/Add country….

**Task 9 — Tester (TDD per task)**: profiles.test.js (ny packs/country/sources_off-semantikk, mergeRemote-armer, slett setPacksAuto-testene); packs.test.js (countryPackId/effectiveIds/countryOptions/origin.kind/listRegistry/list-gruppering/payload m/landtekst); konto-sync.test.js (country+sources_off-rundtur); run-kontrakt.test.js (sources_off-kontrakten begge sider); context-pill-dom.test.js; deno registry.test.ts (beskrivelse påkrevd, coerceSourcesOff, filtrerAvslatte ikke-muterende; byte-stabil renderRegistryBlock-test URØRT).

Rekkefølge: 1 → 2 → 3 → 5 → 6 → 4 → 7 → 8 (tester fortløpende). Kjente feller: loadRegistry-cachen må aldri muteres; onChange→renderList-løkka er etablert mønster for togglene; gamle synkede dokumenter kan ha `{auto:true}`/country-ider i packs.ids — writeDoc-skrubb + Deselect all håndterer det (besluttet: ingen automigrering).

## Verifisering

1. Begge suitene: `node --test 'tests/js/*.test.js'` (inkl. i18n-drift) og `cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/`.
2. Lokal smoke (netlify dev 8899, ferskstartet): (a) fersk profil → pillen viser «Sources», sidemenyen «Country: Norway» (norsk locale) — ingen avhukede pakker; (b) Country-modal: bytt til None → progress-linja mister landpakka; (c) Manage sources: fire grupper m/overskrifter, slå AV dbnomics → still et spørsmål der dbnomics ellers ville vært brukt → registerblokka/katalogsøket omgår kilden (sjekk prosess-sporet); (d) importer en oversikt + en enkeltkilde fra Explore → havner i riktig gruppe i popover og manager; (e) «Deselect all» + «Remove imported» rydder Hans' synkede test-importer; (f) Hans re-smoker FARS-flyten fra pakkesplitting-runden (fortsatt upushet) — push av HELE main-stacken etter grønn smoke.

## Etterarbeid (utenfor runden)

- Kvalitetsgjennomgang av pakkeinnholdet («not well formed»-inntrykket) — egen innholdsrunde.
- Ev. kuraterte landpakker for flere land (Hans nevnte det som mulig senere).
