# Pythonsk direktivsyntaks — én grammatikk for alle direktivlinjer

**Dato:** 2026-07-26
**Status:** design godkjent, ikke implementert
**Beslutningstakere:** Hans + Claude

---

## 1. Problemet

Direktivspråket oppleves ad hoc. Kartleggingen viser at følelsen er berettiget,
men at årsaken ikke er verbene — `# read X as Y` er et koherent, SQL-aktig
verbspråk. Årsaken er at kodebasen har **seks uavhengige kommentarspråk** med
**fem forskjellige måter å skrive et nøkkel–verdi-par på**:

| Konvensjon | Eksempel | Parser |
|---|---|---|
| Celle-header | `#%% python hide-code id=fig1` | `js/cells.js:11,76` |
| Celle-tag | `#tag.hide-code = true` | `js/cells.js:112` |
| Colab-skjema | `#@title Tittel {run:"manual"}` | `js/param-forms.js:42,60` |
| Dataverb | `# read ssb/05839 as bef, years(2000:2009)` | `js/data-directives.js:17-32` |
| Metadata | `# meta bef Folkemengde etter alder` | `js/data-directives.js:37` |
| Bibliotek | `# use plotly from https://…` | `js/data-directives.js:355` |

Fem nøkkel–verdi-former: bart flagg (`hide-code`), `cols=3`, `#tag.k = v`,
`key(ask)`, `{run:"manual"}`.

### 1.1 Konkrete følgeskader (funnet i kartleggingen)

1. **Seks divergerende verblister.** Om en linje er et direktiv avgjøres
   uavhengig i `js/data-loader.js:455`, `:477`, `js/portable-export.js:20`,
   `:543`, `:567` og `index.html:7962`, `:8357`. De er allerede ute av sync:
   `meta` mangler i `stripDataDirectiveLines` (`index.html:8357`), `require`
   mangler i `ASM_LINE_RE`, `create` mangler i `DIRECTIVE_LINE_RE`.

2. **Ekte bug som følger av (1).** `#` er ikke kommentar i DuckDB. En
   `# meta …`-linje i en `#`-merket SQL-blokk strippes ikke og lekker inn i
   `window.__duck.exec()`. `DuckdbNative.scrub` (`js/duckdb-native.js:53`)
   forstår bare `--` og `/* */`. Fikses som en konsekvens av dette designet.

3. **To grammatikker for samme verb.** `LOAD_RE` (`js/data-directives.js:18`)
   og `LOADAS_RE` (`:32`) matcher begge `# read … as …` med stille
   divergerende regler. `# read ssb/05839 as bef, years(2000:2009)` er en
   gyldig *load*, men ikke en gyldig *assembly-kilde*.

4. **`# meta` gjetter.** Parseren avgjør om innholdet er en lenke eller
   beskrivelse ved å snuse på om det starter med `http` (`:187`). Det finnes
   ingen plass til utgiver, lisens, enhet eller hentedato.

5. **Direktivtekst syntetiseres og re-parses** i fire omganger
   (`data-loader.js:457`, `:478`, `portable-export.js:568`, `index.html:7963`)
   — strenger som `'# load ' + target + ' as ' + alias` mates tilbake gjennom
   `DD.parse`.

6. **`$`-ankrede regexer** betyr at ingen etterfølgende kommentar er lovlig på
   noen direktivlinje, og delte `gim`-objekter krever manuelle
   `lastIndex = 0`-nullstillinger åtte steder.

---

## 2. Mål og ikke-mål

### Mål
- Én grammatikk for alle direktivlinjer, formet som Python.
- `# meta` får navngitte felt og blir utvidbar uten ny syntaks.
- Én `isDirectiveLine()` erstatter de seks verblistene.
- Ekte feilmeldinger i stedet for stille ikke-match.

### Ikke-mål
- **Ingen arkitekturendring.** `DataDirectives.parse()` kjører fortsatt
  statisk på editorteksten før kjøring. Sidepanel, datasettliste, portable
  export, assembly og AI-kontekst leser samme parsetre. Motorer, `data-loader`,
  proxy og `#%%`-cellemaskineri røres ikke.
- Ingen Python-tolk. Grammatikken er lukket (§5.3).
- `#%% data`-celletype er **ikke** i denne runden (§10).
- Ingen ny *datafunksjonalitet* i `openstat.py`. To små paritetshull tettes
  (`Dataset.join`, `format=`) fordi kopier-og-lim-påstanden i §4.3 ellers ikke
  holder — se §4.5(b). Ingen nye kilder, kinds eller transportveier.

---

## 3. Form 1 — navnerom-tilordning

Utvider mønsteret som allerede finnes i `#tag.` og `#options.`:

```
direktiv := marker WS* NAVNEROM "." STI WS* "=" WS* literal EOL
marker   := "#" | "--" | "//"
NAVNEROM := "options" | "tag" | "meta"
STI      := IDENT ("." IDENT)*
```

```python
#options.view = "output-only"        # finnes i dag, uendret
#tag.hide-code = true                # finnes i dag, uendret
#meta.bef.note = "Folkemengde etter alder og kjønn 2000-2009"
#meta.bef.link = "https://ssb.no/befolkning", "Om SSBs befolkningsstatistikk"
#meta.bef.publisher = "SSB"
#meta.bef.alder.label = "Alder i hele år"
```

`#options.` og `#tag.` er uendret — de er allerede på denne formen. Kun `meta`
er ny.

### 3.1 Meta-modellen

Målformen er `MetaInfo` fra `2026-07-25-metadata-sidebar-design.md`:
`{tittel?, beskrivelse?, felter[], lenker[], variabler[]}`.

**Datasettnivå** — `meta.<alias>.<nøkkel>`:

| Nøkkel | Type | Til |
|---|---|---|
| `title` | streng | `tittel` |
| `note` | streng | `beskrivelse` |
| `link` | tuppel *eller* liste av tupler | `lenker[]` |
| `labels` | dict | `variabler[].label` (bulk, §3.1) |
| `publisher`, `license`, `unit`, `retrieved`, `source` | streng | `felter[]` (kjent etikett) |
| *hva som helst annet* | streng/tall | `felter[]` (nøkkelnavnet som etikett) |

**Variabelnivå** — `meta.<alias>.<variabel>.<nøkkel>`, eller bulk:

```python
#meta.bef.alder.label = "Alder i hele år"
#meta.bef.alder.note  = "Alder ved utgangen av året"
#meta.bef.labels = {"alder": "Alder i hele år", "kjonn": "Kjønn"}
```

**Tvetydighetsregelen:** `meta.<alias>.<x>` der `<x>` er en kjent
datasettnøkkel (tabellen over) tolkes som datasettnivå. Alt annet er et
variabelnavn, og krever da et videre ledd (`meta.bef.alder.label`). En
`meta.bef.alder = "…"` uten videre ledd er en **feil** med melding
*«ukjent datasett-nøkkel `alder` — mente du `meta.bef.alder.label`?»*.
`labels` er reservert som datasettnøkkel (bulk-formen over) og kan derfor ikke
være et variabelnavn.

### 3.2 Lenker: tuppel eller liste

```python
#meta.bef.link = "https://ssb.no/befolkning", "Om SSB"
#meta.bef.link = [("https://ssb.no/befolkning", "Om SSB"),
#                 ("https://ssb.no/05839", "Tabellen")]
```
Én nøkkel; parseren skiller på type. Etiketten er valgfri
(`#meta.bef.link = "https://ssb.no/befolkning"`).

**Ingen `.add()`, ingen `add_link`.** Vurdert og forkastet: et metodekall ved
siden av tilordning ville gjeninnføre to mekanismer, og en
streng-diskriminator (`add("link", …)`) er den samme posisjonelle gjettingen
som §1.4 fjerner. Lister dekker behovet i språket vi allerede forplikter oss
til.

### 3.3 Atferdsendring: overskriv i stedet for akkumulering

I dag akkumulerer gjentatte `# meta`-linjer. Med `=` gjelder **siste
tilordning**. Praktisk: samle alle lenker til ett datasett på ett sted.

Dette gjelder kun brukerens eget lag. Kildens metadata fra `/api/metadata`
flettes fortsatt separat, og `js/meta-info.js:145-177` beholder regelen om at
brukertekst rendres først og aldri stille overstyrer kildens.

`+=` (append på liste-nøkler) er **reservert, ikke bygget**. Legges inn hvis
distribuert deklarasjon viser seg nødvendig — f.eks. hvis `#%% data`-celler
(§10) gjør det naturlig å spre meta over flere celler.

---

## 4. Form 2 — kall-grammatikk for dataverbene

```python
# ssb   = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")
# bef   = ssb.read("05839", years="2000:2009", indicators="Personer")
# owid  = ost.read("https://ourworldindata.org/grapher/co2.csv")
# panel = ost.create(key="pid")
# panel.add(bef, "personer")
# panel.join(sales, on="pid")
# tall  = ost.use("tall", source="duckdb")
```

Argumentformene følger `openstat.py` bokstavelig — se §4.5 for hvilke deler
som er pakke-identiske og hvilke som er editor-only.

`ost.`-prefiks på inngangspunktene, bart på metodekall — nøyaktig som ekte
Python. Begrunnelse (§4.3).

### 4.1 Fullstendig oversettelse

| I dag | Ny |
|---|---|
| `# connect X as ssb, kind(pxweb)` | `# ssb = ost.connect("X", kind="pxweb")` |
| `# connect ssb` | `# ssb = ost.connect("ssb")` |
| `# connect h, key(ask)` | `# h = ost.connect("h", key="ask")` |
| `# read ssb/05839 as bef, years(2000:2009)` | `# bef = ssb.read("05839", years="2000:2009")` |
| `# read URL as df, key(ask)` | `# df = ost.read("URL", key="ask")` |
| `# read db/patients as p` | `# p = db.read("patients")` |
| `# require URL as gammel` | `# gammel = ost.read("URL")` |
| `# create panel, key(kommune_nr year)` | `# panel = ost.create(key=["kommune_nr", "year"])` |
| `# create demo, key(k), format(duckdb)` | `# demo = ost.create(key="k", format="duckdb")` |
| `# add p/income, p/edu into panel` | `# panel.add(p, ["income", "edu"])` |
| `# add p/x into panel inner` | `# panel.add(p, "x", how="inner")` |
| `# import db/patients.age into panel` | `# panel.add(db, "age", table="patients")` |
| `# join sales into panel on pid` | `# panel.join(sales, on="pid")` |
| `# join sales into panel on pid outer` | `# panel.join(sales, on="pid", how="outer")` |
| `# use df` | `# df = ost.use("df")` |
| `# use tall from duckdb` | `# tall = ost.use("tall", source="duckdb")` |

Opsjoner:

| I dag | Ny |
|---|---|
| `key(ask)` / `key(LITERAL)` | `key="ask"` / `key="LITERAL"` |
| `exec(remote)` | `exec="remote"` |
| `kind(pxweb)` | `kind="pxweb"` |
| `cache(30m)` | `cache="30m"` |
| `years(2000:2009)`, `years(2020:)` | `years="2000:2009"`, `years="2020:"` |
| `countries(NOR SWE)` | `countries=["NOR", "SWE"]` |
| `regions(0)`, `indicators(Personer)` | `regions=["0"]`, `indicators=["Personer"]` |
| `filters(na_item=B1GQ unit=CP_MEUR)` | `filters={"na_item": "B1GQ", "unit": "CP_MEUR"}` |
| `all()` | `all=True` |

Enkeltverdier godtas uten liste: `countries="NOR"` ≡ `countries=["NOR"]`.

### 4.2 To gevinster på kjøpet

- `ost.use` kan nå **døpe om**: `mine = ost.use("df", source="duckdb")`. Dagens
  `# use` kan ikke det.
- `filters` blir en ekte dict i stedet for en mellomromsdelt streng, og
  siterte strenger fjerner en reell bug-klasse: URL-er som inneholder komma
  eller parentes brekker dagens `\S+`-mønster og `,\s*\w+\([^)]*\)`-hale.

### 4.3 Hvorfor `ost.` og ikke bart `connect(...)`

- **Prisen er liten.** `ost.` står bare på inngangspunkter — typisk 1–3 linjer
  per script. Alt annet er metodekall på objekter.
- **Bokstavelig kopier-og-lim.** Innholdet kjører uendret i CPython med
  `import openstat as ost` foran; signaturene i `openstat.py` er allerede
  nøyaktig disse (`connect(url, kind=None)` `:485`, `Source.read(table,
  columns=None, **query)` `:391`, `create(key, name=None, how="left")` `:527`,
  `Dataset.add(source, columns, table=None, how=None)` `:508`). Dette er den
  eneste varianten der de to dataveiene — som i dag aldri møtes — møtes.
- **Én importkonvensjon**, den som allerede står i `openstat.py:8`. Bart
  `connect` ville krevd `from openstat import connect, read, create` — en
  annen konvensjon å lære.
- **Synlig eierskap.** Direktivlinjene ligger blandet med brukerens egen kode.

Vurdert motargument: bart `connect(...)` leses tydeligere som en DSL og
inviterer mindre til å tro at resten av Python virker. Akseptert som et
dokumentasjonsproblem (§5.3 må stå tydelig i hjelpen), veid opp mot konkret
portabilitet.

**`ost.` skal ikke være valgfritt noe sted.** To skrivemåter for samme ting er
plagen dette designet fjerner.

### 4.4 Direktivspråket er ett språk i alle modi

Allerede tilfelle i dag: `# read X as Y` er identisk i python, R, SQL, brython,
micropython og javascript — kun kommentarmarkøren (`#`/`--`/`//`) varierer.
Dette designet endrer formen på det ene språket, ikke antallet språk. En
R-bruker møter en Python-formet direktivlinje; alternativet er ikke
«R-formet», bare formløst.

### 4.5 Pakke-paritet — hva er identisk, hva er editor-only

Kopier-og-lim-påstanden i §4.3 må kvalifiseres ærlig. Tre nivåer:

**(a) Identisk med `openstat.py` i dag** — limes rett inn og virker:

| Direktiv | Pakkesignatur |
|---|---|
| `ost.connect(url, kind=…)` | `openstat.py:485` |
| `ost.read(url, table=…, columns=…, kind=…, **query)` | `:489` |
| `kilde.read(table, columns=…, **query)` | `:391` |
| `ost.create(key=…, name=…, how=…)` | `:527` |
| `panel.add(kilde, kolonner, table=…, how=…)` | `:508` |
| Kanonisk vokabular: `years`, `countries`, `regions`, `indicators`, `filters` | `_CANONICAL_KEYS` `:239` |

Merk at `add` tar **én** `columns`-parameter (streng eller liste), ikke
varargs — derav `panel.add(p, ["income", "edu"])` i §4.1.

**(b) Mangler i pakken — foreslås lagt til (små, ~10–20 linjer hver):**

- `Dataset.join(frame_eller_kilde, on=…, how=…)`. `Dataset` har i dag bare
  `add`/`frame` (`openstat.py:496-524`). Uten denne er `# panel.join(…)` ikke
  kopierbar. Anbefales lagt til i samme runde — den er nesten identisk med
  `add`, bare med eksplisitt `on` i stedet for datasettets deklarerte nøkkel.
- `format=`-kwarg på `ost.create` (leverer rammen som
  `pandas`/`data.table`/`tibble`/`duckdb`). Finnes i direktivet siden
  2026-07-24, ikke i pakken.

**(c) Editor-only — har og skal ikke ha noen pakkeekvivalent:**

| Kwarg/verb | Hvorfor |
|---|---|
| `key="ask"` | interaktiv passordmodal; ingen mening utenfor nettleseren |
| `exec="local"/"remote"` | kjøringslokalitet mot serveren |
| `cache="30m"` | Cache-API/service worker |
| `ost.use(navn, source=…)` | kopierer datasett mellom kjøretider i editoren |

**Dette er en felle å håndtere eksplisitt:** `openstat.py:391` tar `**query`,
så et innlimt `ost.read("URL", key="ask")` ville sende `key=ask` som
*spørringsparameter* i stedet for å feile. Portable export må derfor stripe
(c)-kwargene og erstatte dem med en kommentar, slik den allerede maskerer
`key()` i dag (`js/portable-export.js:23-28`). Alternativt kan `openstat.py`
avvise disse fire navnene eksplisitt med en peker til editoren; det er
billigere og feiler høylytt. **Anbefales: begge.**

---

## 5. Parser

### 5.1 Plassering

`js/data-directives.js`. Erstatter `CONNECT_RE` (`:17`), `LOAD_RE` (`:18`),
`CREATE_RE` (`:29`), `IMPORT_RE` (`:30`), `JOIN_RE` (`:31`), `LOADAS_RE`
(`:32`), `META_RE` (`:37`), `USE_RE` (`:355`) og `parseOptions` (`:47`) med én
uttrykksparser (~150 linjer).

`parse()`, `resolve()`, `parseAssembly()`, `parseUse()`, `parseSegmentUses()`,
`metaByTarget()` og `scrubKeys()` beholder **samme eksterne signatur og samme
returform**, slik at ingen kallsted trenger endring. `scrubKeys` må matche
`key="…"` i stedet for `key(…)`.

### 5.2 Grammatikk

```
linje    := marker WS* (tilordning | metodekall) EOL
tilordning := NAVN "=" uttrykk
            | NAVNEROM "." STI "=" literal
metodekall := NAVN "." METODE "(" args ")"
uttrykk  := "ost" "." VERB "(" args ")"
          | NAVN "." METODE "(" args ")"
args     := literal ("," literal)* ("," IDENT "=" literal)*
literal  := streng | tall | True | False | None
          | "[" literal* "]" | "(" literal* ")" | "{" par* "}"
          | KILDENAVN
VERB     := connect | read | create | use
METODE   := read | add | join
NAVNEROM := options | tag | meta
```

Strenger: både `"` og `'`. Etterfølgende kommentar etter `#`-direktivet er
fortsatt ikke lovlig (uendret fra i dag, og ikke verdt komplikasjonen).

### 5.3 Hva parseren *ikke* er

Må stå eksplisitt i hjelpen og i `directive-language-examples.md`:

> Direktivlinjer er ikke Python. Grammatikken er lukket: ingen variabler i
> argumenter (unntatt kildenavn), ingen uttrykk, ingen f-strenger, ingen
> aritmetikk, ingen løkker eller betingelser, ingen import.

### 5.4 Feilmeldinger

Dagens regexer feiler stille — en linje som ikke matcher blir bare ignorert.
Med en parser skal hver avvist linje gi melding med linjenummer:

- `linje 4: ukjent argument «yers» — mente du «years»?`
- `linje 7: ukjent verb «ost.fetch» — gyldige: connect, read, create, use`
- `linje 9: «years» må være streng, fikk tall — skriv years="2020:2024"`
- `linje 12: ukjent kilde-alias «ssb» (mangler ost.connect-linje?)`
- `linje 3: «# read X as Y» er gammel syntaks — skriv «# Y = ost.read("X")»`

Den siste er migrasjonshjelpen (§8). Meldingene går i samme kanal som dagens
`parsed.errors`.

### 5.5 Uendret oppløsningssemantikk

`resolve()` beholder dagens rekkefølge (`js/data-directives.js:215-289`):
URL → connect-alias → registry-id i `data/data-sources.json` → Anvil-kilde.
Kanonisk vokabular oversettes fortsatt per kind med **hard feil** ved
uoversettbare felt (SDMX-fellen, `:76-80`). `translateCanonical` forblir
duplisert mot `openstat.py:270` med paritet håndhevet av delt fixture.

---

## 6. Konsolidering: én `isDirectiveLine()`

Ny eksportert funksjon `DataDirectives.isDirectiveLine(line)` — sann hvis
linja parser som §5.2-grammatikken. Erstatter de seks listene fra §1.1:

| Sted | I dag | Etter |
|---|---|---|
| `js/data-loader.js:455`, `:477` | connect-filter-regex ×2 | `isDirectiveLine` |
| `js/portable-export.js:20` | `DIRECTIVE_LINE_RE` | `isDirectiveLine` |
| `js/portable-export.js:543` | `ASM_LINE_RE` | `isDirectiveLine` |
| `js/portable-export.js:567` | connect-filter-regex | `isDirectiveLine` |
| `index.html:7962` | connect-filter-regex | `isDirectiveLine` |
| `index.html:8357` | `stripDataDirectiveLines` | `isDirectiveLine` |

**Dette fikser buggen i §1.2**: strippen dekker nå `meta` fordi den ikke lenger
har en håndholdt verbliste.

`js/javascript-engine.js:75` (blanker alle kolonne-0-`#`-linjer) og
`js/cells.js` (`#tag`/`#%%`) er uberørt — de opererer på andre kriterier.

### 6.1 Syntetisering av direktivtekst

De fire stedene som bygger direktivstrenger for å re-parse dem
(`data-loader.js:457`, `:478`, `portable-export.js:568`, `index.html:7963`)
skal i stedet bygge parsetre-objekter direkte. En ny hjelper
`DataDirectives.makeLoad({alias, target, opts})` returnerer samme form som
`parse().loads[i]`. Fjerner tekst-rundturen.

---

## 7. Hva som *ikke* endres

- `DataDirectives.parse()` kjøres fortsatt statisk på editorteksten før
  kjøring (`index.html:4616`, `:8050`). Ingenting krever at kode kjøres for at
  sidepanelet skal vite hva som finnes.
- `js/data-loader.js` (fetch, proxy, nøkler, dekryptering, cache), `js/pxweb.js`,
  `js/api-kinds.js`, `js/assembly-duckdb.js`, alle motorer, `openstat.py`.
- `#%%`-celler, `#tag.`, `#options.`, `#@param`, `#'`, `## <mode>`-markører.
- `# label:` (byggetid, `examples/generate_manifest.py`).
- Kommentarmarkør-fleksibiliteten (`#`/`--`/`//`).

---

## 8. Migrering — hard omlegging, ingen aliaser

Per prosjektets policy (ingen brukere ennå; erstatt fremfor å fryse):

1. **Ingen stille aliaser.** Gammel syntaks gir feilmeldingen fra §5.4 med
   forslag til ny form. En god feilmelding lærer bort språket; et stille alias
   skjuler at det finnes to.
2. **Engangs konverteringsskript** (`tools/`) som skriver om alle
   direktivlinjer i `examples/**` (34+ filer), `web_examples/**` og
   `docs/directive-language-examples.md`. Kjøres én gang, committes,
   og slettes ikke — det er også dokumentasjon av oversettelsen.
3. **Manuelt oppdateres:** `hjelp.html`, `hjelp.en.html`, `command_help.js`,
   `README.md`, `netlify/edge-functions/prompts/data-svar.md`,
   `netlify/edge-functions/_lib/data-svar-prompt.ts:34-60,91-92,137-157`.
4. **AI-evalene må re-kjøres.** `ROADMAP.md:369` flagger allerede at
   `data-svar`-evalene er kalibrert mot gammelt vokabular fra omdøpingen
   2026-07-25 og ikke er kjørt siden. Krever API-nøkkel. Dette er den eneste
   delen av migreringen som ikke kan verifiseres automatisk i repoet.
5. **Publiseringsveien** (`index.html:1603`, `:1626`, `:1633`) har egne
   `# load`- og `# use`-regexer som må følge med.

---

## 9. Testing

- **`netlify/edge-functions/_lib/data-directives.test.ts`** er sannheten —
  den `eval`-er nettleserfila direkte, så grammatikken har én implementasjon.
  Hver rad i oversettelsestabellene (§4.1) blir en test.
- **Feilmeldingstester:** hver melding i §5.4, inkludert gammel-syntaks-hintet.
- **`isDirectiveLine`-tester:** særlig at `#meta.…` strippes fra DuckDB-SQL
  (regresjonstesten for buggen i §1.2).
- **Uendret:** `data-loader.test.ts`, `portable-export.test.ts`,
  `hent-core.test.ts` skal passere med kun oppdaterte inndata-strenger — hvis
  de krever logikkendringer har vi brutt §2s ikke-mål.
- **Browser-verifisering:** én seanse med et pxweb-script (sidepanel, ⓘ-modal,
  datasettliste), ett assembly-script, og ett R-script med direktiver.

---

## 10. Utsatt

- **`#%% data`-celletype.** Med uniform grammatikk kan `#`-en droppes inne i en
  egen celletype, og innholdet blir da bokstavelig Python. Cella kjøres aldri
  av en motor — den leses statisk — så den virker identisk i R-, SQL- og
  jamovi-modus. Krever `TYPES`/`NONCODE`/`SEG_MARKER` i `js/cells.js`. Ren
  ergonomi oppå en grammatikk som allerede er ryddig; egen runde.
- **`+=` for liste-nøkler i meta** (§3.3).
- **`ost.meta()` / `sources()` / `attribution()`** i pakken — fullt spesifisert
  i `2026-07-25-metadata-sidebar-design.md` §6, fortsatt uimplementert.
- **`#meta` → `df.attrs['meta']` i pyodide.** Kjeden er wiret for brython
  (`js/brython-engine.js:342`) og micropython (`js/micropython-engine.js:308`),
  men ikke for pyodide — som er den eneste motoren der `ost` faktisk finnes.
- **Sammenslåing av `#tag.`/`#options.`/`#@param` i én parser.** De er allerede
  på Form 1s form; å flytte dem inn i `data-directives.js` er opprydding uten
  brukersynlig gevinst.

---

## 11. Åpne punkter ved implementering

- `openstat.py` tar `filters=` via `_CANONICAL_KEYS` (`:239`) **og** frie
  `**query`-kwargs (`:391`). Direktivgrammatikken godtar kun `filters={…}`
  eksplisitt — frie kwargs avvises med feil, for å bevare
  hard-feil-ved-uoversettbart-regelen (SDMX-fellen). Divergensen er bevisst og
  skal kommenteres i begge filer.
- **Testene i §9 må dekke §4.5(c)-fellen**: at portable export stripper
  `key`/`exec`/`cache`/`use`, og at `openstat.py` avviser dem høylytt. Uten
  dette blir et innlimt script stille feil, ikke høylytt feil — den verste
  utfallsklassen, og nøyaktig samme feilmodus som SDMX-fellen designet ellers
  verner mot.
- Delt fixture for paritet: `Dataset.join` må inn i både `tests/test_openstat.py`
  og `netlify/edge-functions/_lib/data-directives.test.ts` med samme
  forventede merge-resultat, slik `tests/fixtures/pxweb_dataset.json` gjør for
  pxweb.
- `# require` for **navngitte** kilder (HE/remote) hoppes over av klienten i
  dag (`js/data-directives.js:177`) og rutes til serveren. `ost.read("navn")`
  må bevare nøyaktig samme forbigåelse, ellers brekker HE-fanen.
