# Pakkesplitting: enkeltkildepakker + tema-oversikter med get_pack

**Dato:** 2026-08-07 · **Status:** utkast til godkjenning (design-samtale 2026-08-07; ingen kode endret)

## Bakgrunn og mål

De 11 tema-community-pakkene (`data/packs/community/`) er store
flerkilde-dokumenter fra cowork-researchen (2026-08-mikrodatakilder) —
`demography-migration-housing.md` (230 linjer), `crime-transport-energy-
politics.md` (211), `nordic-microdata.md` (218) osv., hver med 10–20
kilder i YAML-blokker. Tre problemer (Hans, design-samtalen):

- **Svarkvalitet/presisjon:** en valgt temapakke dytter mye irrelevant
  kildestoff inn i prompten; én kilde per pakke gir skarpere kontekst.
- **Finne-/velgbarhet:** brukeren skal kunne finne og importere akkurat
  den kilden de trenger i Explore, ikke måtte ta hele temadokumentet.
- **Vedlikehold:** én kilde per fil er lettere å oppdatere og ta imot
  PR-er på enn 200-linjers samledokumenter.

Token-økonomi var IKKE hovedmotivasjonen — tre-nivå-komponeringen
(full/manifest/summary i `js/packs.js`) løser alt det langt på vei.

## Beslutninger (Hans, design-samtalen 2026-08-07)

- **Full splitting:** alle ~60–80 kilder i de 11 temapakkene blir egne
  enkeltkildepakker. Ikke selektiv utrekking av tungvektere.
- **Konsum-modell «oversikt + get_pack»:** brukeren velger typisk en
  tema-oversikt; modellen henter relevante enkeltpakker selv via
  `get_pack`. Enkeltpakker kan OGSÅ importeres direkte i Explore.
- **Id-prefiks `src-`** på enkeltkildepakker (`src-ess`, `src-fars`,
  …) for å unngå navneforvirring med registry-kilder som har
  source-guides (`ess`, `census`, …) — besluttet av Hans midt i runden.
  Navnerommene er teknisk atskilte, men prefikset gjør det utvetydig i
  get_pack-kall, logger og PR-er hva som er en pakke.
- Ingen bakoverkompat-hensyn — ingen brukere ennå; temapakkene
  erstattes på stedet.

## 1. Taksonomi (index.json + filer)

- `index.json` får nytt felt **`kind: "source" | "overview"`** på
  community-poster. Land-pakkene (`norway`/`finland`, `country:`-
  mekanismen) er urørt.
- **Enkeltkildepakker** (`kind: "source"`): flat i
  `data/packs/community/`, id `src-<kilde>` og filnavn `<id>.md`
  (f.eks. `src-fars.md`, `src-gss.md`, `src-share.md`). Innhold hentes fra dagens temapakke: hva
  kilden er, enhet/dekning, ærlig tilgangsstatus, gotchas, konkrete
  URL-er/last-eksempler. Alltid godt under caps → alltid full-nivå.
- **Oversiktspakker** (`kind: "overview"`): de 11 temapakkene beholder
  id-ene sine, men kroppen skrives om: tverrgående narrativ
  (sammenlikninger, fallback-råd, .gov-ustabilitetsadvarselen 2025-26)
  + én linje per kilde med eksplisitt **`(id: src-fars)`**-notasjon og
  instruksen «hent detaljer med get_pack».
- `summary`-feltene (≤1500 tegn) beholdes for begge slag —
  L1-mekanismen i `packs.js` er uendret.

## 2. Motorendringer

- **`GET_PACK_TOOL` eksponeres alltid** når ≥1 pakke er valgt (i dag:
  kun når en valgt pakke ble nedgradert — `svar.ts`). Beskrivelsen
  utvides: id kan komme fra pakkeoverskrifter ELLER fra kildelister i
  oversiktspakker (`(id: …)`-notasjonen).
- **`renderPacksBlock`** (`svar-prompt.ts`): notatet nevner at
  oversiktspakker lister hentbare enkeltpakke-id-er.
- **`maxGetPack` 3 → 5** (`anthropic.ts`): et spørsmål kan trenge 2–3
  enkeltkilder pluss re-henting av en nedgradert pakke.
- **`fullTextFor` i `js/packs.js`: ingen endring** — den resolver
  allerede id-er utenfor gjeldende valg (verifisert i design-samtalen).

## 3. Explore/biblioteksmanager

- `kind`-feltet gir **to grupper i Explore**: «Tema-oversikter» øverst,
  «Enkeltkilder» under. Eksisterende søk (`filterCatalog`) filtrerer
  begge grupper.
- Valg-/pille-mekanikken er uendret; å velge en enkeltkilde direkte gir
  hele dens tekst i prompten som i dag.

## 4. Drift-vern (viktigste nye lint)

`tests/js/packs-lint.test.js` får en regel: **hver `(id: x)`-referanse
i en oversiktspakke MÅ finnes i `index.json`**. Oversikter og
enkeltpakker kan da ikke drive fra hverandre — samme mønster som
source-guides-drift-testen. I tillegg: `kind`-feltet valideres
(påkrevd for community-poster, kun de to verdiene).

## 5. Testing/smoke

- Prefs-testene (`svar-prompt-prefs.test.ts`) oppdateres for
  alltid-eksponert `get_pack` ved valgte pakker.
- Én e2e-smoke: kun en oversikt valgt, spørsmål som krever en
  enkeltkilde (f.eks. FARS-spørsmål med crime-oversikten valgt) —
  verifiser at modellen `get_pack`-er og svarer med kildens innhold.
- Pakke-linten kjører som før i node-suiten (PR-porten).

## Utenfor scope

- Ingen endring i land-pakker, user:-kilder, profiler eller
  payload-kontrakten mot `/api/svar` utover verktøys-eksponeringen.
- «Alt automatisk»-modellen (hele katalogen i prompten, modellen velger
  selv uten valgt oversikt) er bevisst valgt bort — mest prompt-plass
  og størst risiko for feilvalg.
- Deling/innsending av pakker: uendret (menyopprydding-spec).
