# Metadata i sidebar + metadata-API i openstat.py (design)

*Bestilling 2026-07-25 (Hans): metadata om datasett og variabler skal (1) vises
i sidebaren — meta-ikon ved kildenavn som åpner en container, og info per
variabel ved klikk — med en fleksibel mekanisme siden ulike kilder har ulik
type informasjon (spørreskjema-lenker, kodelister, beskrivelser); og (2) få et
motstykke i openstat.py til data-API-et (connect/read/create/add) for
innhenting og oppbevaring av metadata koblet til selve datasettet. Senere
tillegg i brainstormingen: `meta=True`-kwarg på datahenting, lenkeoversikt som
førsteklasses konsept, kildeattribusjon under tabeller (på sikt), og et
fellesskapslag (wiki/kommentarer) for delt kunnskap om datasett/variabler.*

## §0 Nå-situasjon (kartlagt 2026-07-25)

- **Sidebar «Tilkoblede kilder»** (`index.html`, `refreshConnectedSources()`
  ~7569 / `updateSidebarSources()` ~7655): viser alias + dempede
  kolonnenavn-rader. HELT inert i dag — ingen klikk, ingen ikoner, ingen info.
- **Aktive datasett** har derimot et fungerende mønster:
  `showVariableDetail()`/`renderVariableDetailHtml()` (~4253) viser dtype,
  stats, katalogfelt og en «Mer informasjon»-lenke — men KUN for
  microdata-katalogen (`data/variable_names.json`), hardkodet, og eksplisitt
  «ikke støttet» utenfor python-modus (`nonPyRuntime()`).
- **openstat.py** (`Source`/`Dataset`, connect/read/create/add/frame): rent
  data-API, null metadata-konsept. `metadata_url()`-hjelperen for pxweb
  FINNES allerede (linje 80) men brukes ikke til noe brukervendt.
- **AI-verktøyene** `search_catalog`/`table_metadata`
  (`netlify/edge-functions/_lib/tools/`) henter nå variabel-nivå-metadata for
  9 kilder (pxweb/ckan/apd/fhi/dst/statfin/sdmx-json/sdmx-xml) — men er
  admin-låst og brukes kun av data-svar-AI-en; innholdet når aldri UI-et.

**Nøkkelinnsikt fra brainstormingen:** metadata rider ofte GRATIS med
dataresponsen vi allerede henter — json-stat2 (pxweb/eurostat) inneholder alle
labels/kodelister (`category.label`, kastes i dag av `columns_from_jsonstat`),
worldbank/dbnomics-JSON har id+navn-par, SDMX kan få kode+label i samme CSV
med `labels=both`. «Innhenting» er derfor i stor grad «ikke kast det som
allerede kom».

## §1 MetaInfo — én form for alt

Alt metadata-innhold, uansett kilde og nivå, normaliseres til én struktur som
én renderer viser:

```
MetaInfo = {
  tittel?:      string,
  beskrivelse?: string,
  felter:       [{label, verdi}],        // vilkårlige fakta ("Periode: 2008K1–2026K2", "Lisens: CC-BY")
  lenker:       [{label, url}],          // lenkeoversikten: spørreskjema, tabellside, dokumentasjon, kommentarer
  variabler:    [{navn, label?, beskrivelse?, kodeliste?: [{kode, label}], lenker?: [{label, url}]}]
}
```

- `variabler`-formen er bevisst identisk med `TableMeta`/`TableVariable` fra
  `table-metadata.ts` (code/label/values) — ett vokabular gjennom hele
  systemet, ingen oversettelse mellom AI-verktøy, endepunkt, sidebar og Python.
- Fleksibiliteten ligger i INNHOLDET, ikke i UI-koden: en SDMX-kilde fyller
  `variabler` med dimensjoner+kodeliste-utdrag, apd fyller `felter` med
  lisens/opphav, en spørreundersøkelse får `lenker` fra `# meta`. For en gitt
  opplysning kan man ha innholdet inline (hentet), en lenke til det, eller
  begge — formen tvinger ingenting.

## §2 Tre metadata-kilder, én flettingsregel

1. **Automatisk berikelse** (grunnlaget — brukeren skal IKKE måtte skrive det
   kilden allerede vet): beskrivelser/labels/kodelister fra kildens API, via
   `/api/metadata` (§4) i sidebar og `meta=True`/`kilde.meta()` (§6) i Python.
2. **`# meta`-direktiver** (tillegget — det kilden IKKE vet): brukerens egne
   beskrivelser og lenker (§3).
3. **Proveniens** (gratis fakta): kilde-URL, kind, tabell, dato — notert av
   `Dataset.add()` og av direktivlaget (§6).

**Fletting:** brukerens `# meta`-innhold vises ØVERST og supplerer — det
overstyrer aldri stille den automatiske informasjonen (begge vises; ved
direkte konflikt om samme felt vinner brukerens tekst plassering, kildens
beholdes under). Fellesskapsnotater (§7) er en fjerde, tydelig adskilt
kategori.

## §3 `# meta`-direktivet

```
# read https://example.com/lonn2024.csv as lonn
# read https://example.com/helse.parquet as helse

# meta lonn Spørreundersøkelse om lønn, innsamlet 2024
# meta lonn https://example.com/skjema.pdf Spørreskjema
# meta lonn.alder Alder ved utgangen av inntektsåret
# meta helse Data fra NPR-uttrekk 2026
```

- **Mål er alltid eksplisitt**: første token er `<alias>` eller
  `<alias>.<variabel>` — aliaset fra `# read … as`/`# connect … as` eller et
  opprettet datasettnavn. Split på FØRSTE punktum (aliaser er brukervalgte
  enkle navn; tabell-ID-er som `11pk.px` forekommer aldri som alias).
- **Innholdsregel**: starter resten med `http` → lenke (resten av linjen etter
  URL-en blir valgfri etikett); ellers → beskrivelse (tekst).
- **Akkumulering**: gjentatte direktiver mot samme mål legges til (flere
  lenker, lengre beskrivelse) — aldri overskriving.
- **Skrivefeil-regel**: et mål som ikke matcher noe kjent alias vises som
  advarsel i sidebaren — forsvinner ALDRI stille.
- Parses av JS-direktivlaget (som `# connect`/`# read` i dag) — synlig for
  AI-en i script-konteksten, overlever eksport, krever ikke kodekjøring.

## §4 `/api/metadata` — offentlig, tynt endepunkt

`table_metadata`-verktøyet er admin-låst (AI-endepunkt) — sidebaren hos en
anonym bruker kan ikke kalle det. I stedet for å duplisere kildekunnskapen
(ECB-XML, OECD-Accept-Language, statfin-rekursjonen — alt dyrekjøpt i dag)
i klient-JS: et nytt lite OFFENTLIG endepunkt som wrapper nøyaktig samme
TS-adaptere.

- **Input**: KUN `(kilde-id, tabell-id)` mot kilderegisteret — aldri rå
  URL-er → ingen SSRF-flate utover de registrerte kildene selv.
- **Ingen auth**, men per-IP rate-limit (gjenbruk `_lib/rate-limit.ts`) og
  cache-vennlige svar (`Cache-Control: public, s-maxage=…` — metadata endres
  sjelden).
- **Output**: MetaInfo-formen (mappet fra `TableMeta` + registeroppføringens
  navn/quirks/base-lenke).
- Degraderer grasiøst: uten nett/endepunkt viser containeren bare
  `# meta`-innhold + proveniens.

## §5 Sidebar-UI (python-modus først)

- **Kilderad i «Tilkoblede kilder»**: ⓘ-ikon ved aliaset → utvidbar container
  under raden: tittel/felter/lenker fra `/api/metadata`, `# meta`-innhold
  (øverst), proveniens-linje, 💬-kommentarlenke (§7). Hentes LAZY ved første
  klikk (aldri ved sideinnlasting), caches i `__connectedSources`.
- **Variabelrader samme sted** (i dag inerte): klikkbare → samme
  container-mønster med variabelens label/kodeliste-utdrag + `# meta` for
  variabelen + 💬-lenke.
- **Aktive datasett**: `# meta`-innhold flettes inn i eksisterende
  `showVariableDetail`-panel (som allerede har felter+lenke-layouten) —
  minimal endring.
- Én generisk MetaInfo-renderer for alle containerne — gjenbruker det
  VISUELLE mønsteret fra `renderVariableDetailHtml`, men uten
  microdata-hardkoblingen.
- Andre språkmoduser (duckdb/r/brython/mpy/js) arver senere — samme
  rekkefølge som resten av appen er bygget i. `nonPyRuntime()`-sperren
  beholdes for stats-delen; metadata-delen (som ikke krever kjørende
  runtime) kan vises overalt fra start der det er gratis.

## §6 Python-API — speiler data-API-et

```python
kilde = openstat.connect("https://data.ssb.no/api/pxwebapi/v2/tables")
df    = kilde.read('05839')              # data — som i dag
info  = kilde.meta('05839')              # metadata — NY, samme mentale modell
df    = kilde.read('05839', meta=True)   # begge: metadata → df.attrs["meta"]

d = openstat.create("Tid", name="d")
d.add(kilde, ["value"], table='05839', meta=True)   # → akkumuleres på d.meta
d.sources()       # proveniens-tabell: kolonne, kilde-url, kind, tabell, dato
d.attribution()   # "Kilde: SSB (05839). Hentet 2026-07-25."
```

- **`kilde.meta(tabell)`** returnerer MetaInfo som dict. v1-dekning: pxweb/
  eurostat (dedikert metadata-endepunkt — `metadata_url()` finnes alt) +
  det som er gratis i dataresponsene for øvrige kinds. Dyp berikelse
  (ECB-XML-DSD osv.) forblir UI-lagets jobb — Python dekker det billige og
  vanlige, uten å duplisere dagens TS-kildekunnskap.
- **`meta=True`** på `read()`/`add()`: (a) behold labels/kodelister som
  allerede ligger i dataresponsen (json-stat2 `category.label`,
  worldbank/dbnomics-navnepar); (b) gjør kindens dedikerte metadata-kall der
  det finnes. Uten `meta=True`: dagens oppførsel, null ekstra kall.
- **Lagring**: `Dataset.d.meta` er hovedbæreren (robust gjennom hele
  byggeflyten); `df.attrs["meta"]` for rå `read()` er best-effort (pandas
  attrs overlever ikke merges — dokumentert ærlig).
- **Proveniens**: `add()` noterer `{kolonne, url, kind, tabell, dato}` uten
  nettverk. `sources()` returnerer tabellen; `attribution()` bygger
  kildestreng klar til å limes under en tabell — forberedelse til automatisk
  stempling i ui-laget i en SENERE økt (bevisst ikke wiret inn nå).
- **SDMX `labels=both`**: utsatt beslutning — endrer CSV-parsingen og må
  live-verifiseres per kilde; egen liten økt.
- **Paritetspunkt** (åpen risiko, avklares i planfasen for leveranse B): hva
  om noe må speiles i `js/api-kinds.js` for at `meta=True` skal virke likt
  i appen (der direktiv-lasting går via JS/DuckDB-monteringsveien) og i
  eksporterte CPython-script (der openstat.py gjør jobben).

## §7 Fellesskapslaget (wiki/kommentarer)

Brukere oppdager ting om variabler (klassikeren: diagnosekolonnen i NPR) og
bør kunne dele det. Vurdert lagring:

- **GitHub Discussions i et dedikert repo (`openstat-metadata`) — VALGT for
  v1-lenken**: null infrastruktur, GitHub håndterer spam/innlogging, og vi
  har allerede stabile ID-er for deterministiske lenker (`ssb/05839.Region`,
  `fhi/npr/<tabell>.<variabel>`). Containerne (begge nivåer) får en
  «💬 Kommenter og se kommentarer»-lenke til søk/tråd for akkurat det målet.
  Ulempe (akseptert): bidrag krever GitHub-konto.
- **Høstet wiki-repo — FASE 2 for inline-visning**: markdown/YAML per
  datasett/variabel i fellesskapsrepoet, høstet til statisk
  `community-notes.json` med samme mønster som `apd-catalog.json`, vist
  direkte i containeren. Bidrag via GitHubs webredigering + PR (innebygd
  kvalitetskontroll). Gjenbruker bokstavelig talt apd-arkitekturen.
- **Database (Anvil e.l.) — FORKASTET**: openstat er bevisst database-fritt;
  en kommentardatabase gir moderasjonsplikt, spamflate og driftsavhengighet.

**Tillitsregel (ufravikelig)**: fellesskapsinnhold vises alltid visuelt
adskilt og tydelig merket («fra fellesskapet») — aldri forvekselbart med
kildens offisielle metadata. Registeret har allerede
offisiell/etablert/funnet; dette er en fjerde kategori.

## §8 Leveranser og testing

Tre uavhengige leveranser, egen implementeringsplan per leveranse
(subagent-driven, review per task, live smoke-test før push, lokale commits
til eksplisitt push-beslutning):

- **A — Sidebar + endepunkt**: direktivparser, `/api/metadata`, ⓘ-container,
  klikkbare variabelrader, `showVariableDetail`-fletting, 💬-lenke
  (repo-opprettelse + URL-konvensjon).
- **B — Python**: proveniens/`sources()`/`attribution()`, `kilde.meta()`,
  `meta=True`, paritetsavklaringen.
- **C — Fellesskap fase 2**: kun notert; planlegges når A har vært i bruk.

Testing per etablert mønster: fixture-baserte enhetstester (aldri live HTTP i
suiten), live smoke-test mot ekte kilder før push (OECD-Accept-Language-
lærdommen), `# meta`-parseren testes med flerdatasett-scenarioer inkl.
skrivefeil-advarselen.

## §9 Bevisst utenfor

- Andre språkmoduser enn python (arver mekanismen senere).
- Automatisk kildestempling i ui-tabeller (kun `attribution()`-hjelperen nå).
- DDI-import og andre metadata-standarder som kildeformat.
- Redigering av metadata via UI (alt skjer via direktiver/script/GitHub).
- SDMX `labels=both` (egen liten økt etter live-verifisering).
- Inline fellesskapsnotater (fase 2, §7).
