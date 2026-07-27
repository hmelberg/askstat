# Pythonsk direktivsyntaks — én grammatikk for alle direktivlinjer

**Dato:** 2026-07-26
**Status:** implementert 2026-07-27 (Task 1–13). Teksten under er rettet mot det
som faktisk ble bygget; se §12 «Status ved levering» for det som ble utsatt.
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
NAVNEROM := "meta"
STI      := IDENT ("." IDENT)*
```

```python
#options.view = "output-only"        # finnes i dag, uendret (egen parser)
#tag.hide-code = true                # finnes i dag, uendret (egen parser)
#meta.bef.note = "Folkemengde etter alder og kjønn 2000-2009"
#meta.bef.link = {"https://ssb.no/befolkning": "Om SSBs befolkningsstatistikk"}
#meta.bef.publisher = "SSB"
#meta.bef.alder.label = "Alder i hele år"
```

`#options.` og `#tag.` er uendret — de er allerede på denne formen, men de
beholder sine egne parsere i `js/cells.js`. Denne grammatikken kjenner bare
`meta` (`NS = { meta: 1 }`, `js/directive-parser.js:102`); å flytte de to andre
inn er opprydding uten brukersynlig gevinst (§10).

### 3.1 Meta-modellen

Målformen er `MetaInfo` fra `2026-07-25-metadata-sidebar-design.md`:
`{tittel?, beskrivelse?, felter[], lenker[], variabler[]}`.

**Datasettnivå** — `meta.<alias>.<nøkkel>`:

| Nøkkel | Type | Til |
|---|---|---|
| `title` | streng | `tittel` |
| `note` | streng *eller* liste av strenger | `beskrivelse` |
| `link` | streng, liste eller dict | `lenker[]` (§3.2) |
| `labels` | dict | `variabler[].label` (bulk) |
| *hva som helst annet* | streng | `felter[]` (nøkkelnavnet som etikett) |

`publisher`, `license`, `unit`, `retrieved` og `source` er ikke egne
tilfeller i parseren — de faller i den siste raden, som alle andre navn.
Verdien må være en **streng**: en liste eller dict her ville blitt `"A,B"`
eller `"[object Object]"` gjennom `String()`, altså stille søppel i
sidepanelet, så den gir feil (`js/data-directives.js:335-339`).

**`note` tar også en liste** (`note = ["A", "B"]`), symmetrisk med `link`.
Listeformen er ikke pynt: `=` **overskriver** (§3.3), mens den gamle
`# meta`-syntaksen akkumulerte, så uten en listeform ville to notater på samme
mål mistet det første i stillhet under migreringen.

**Variabelnivå** — `meta.<alias>.<variabel>.<nøkkel>`, eller bulk:

```python
#meta.bef.alder.label = "Alder i hele år"
#meta.bef.alder.note  = "Alder ved utgangen av året"
#meta.bef.labels = {"alder": "Alder i hele år", "kjonn": "Kjønn"}
```

Variabelnøklene er et lukket sett: `label`, `note`, `link`.

**Tvetydighetsregelen — omgjort under implementering.** Designet sa først at
`meta.bef.alder = "…"` uten videre ledd var en **feil** («ukjent datasett-nøkkel
`alder`»). Det lot seg ikke gjøre uten å ofre det siste punktet i tabellen over:
hele poenget med «hva som helst annet → `felter[]`» er at meta skal kunne
utvides *uten ny syntaks*, og da finnes det ingen liste over lovlige navn å
avvise mot. Regelen ble derfor snudd og gjort rent posisjonell:

- **To ledd** (`meta.<alias>.<nøkkel>`) er alltid datasettnivå. Er nøkkelen
  ukjent, blir den et **visningsfelt** med nøkkelnavnet som etikett — ikke en
  feil.
- **Tre ledd** (`meta.<alias>.<variabel>.<nøkkel>`) er alltid variabelnivå.
  Variabelnivå krever altså *alltid* tre ledd; det finnes ingen to-ledds
  variabelform å forveksle med.
- Fire ledd eller mer er en feil («for dyp meta-sti»).

Prisen er at en skrivefeil på variabelnivå (`meta.bef.alder = "…"` når du mente
`meta.bef.alder.label`) blir et visningsfelt som heter «alder» i stedet for en
feilmelding. Det er den samme prisen som gjør feltene utvidbare, og feilen er
synlig i sidepanelet med én gang.

Motsatt vei er det derimot en feil: en kjent datasettnøkkel brukt som
variabelnavn (`meta.bef.link.x = …`) avvises med *«`link` tar en verdi, ikke en
sti»*. Reservasjonen gjelder alle fire datasettnøklene (`title`, `note`, `link`,
`labels`), ikke bare `labels` som designet først sa.

### 3.2 Lenker: streng, liste eller dict

```python
#meta.bef.link = "https://ssb.no/befolkning"
#meta.bef.link = ["https://ssb.no/befolkning", "https://ssb.no/05839"]
#meta.bef.link = {"https://ssb.no/befolkning": "Om SSB",
#                 "https://ssb.no/05839": "Tabellen"}
```

Én nøkkel; parseren skiller på type. Streng = én lenke uten etikett, liste =
flere uten etikett, dict = `url: etikett`.

**Tuppelformen ble droppet** (Hans, 2026-07-27). Designet foreslo først
`link = "url", "etikett"` og `link = [("url", "etikett"), …]`. Det viste seg
uskillbart: parseren representerer `(…)` og `[…]` med samme JS-array
(`js/directive-parser.js:23-24`), så `("a", "b")` og `["a", "b"]` er *samme
verdi*. «To lenker» ville altså blitt stille til «én lenke med etikett» — den
posisjonelle gjettingen §1.4 skulle fjerne, gjeninnført i en ny form. Dicten
sier hvem som er URL og hvem som er etikett i selve syntaksen.

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

`+=` er **bygget** (2026-07-27, rett etter leveringen): `=` erstatter, `+=`
føyer til — standard Python-semantikk. Gyldig kun for de akkumulerende
nøklene `note` og `link` (på begge nivåer); på enkeltverdinøkler
(`title`/`label`/felt) gir `+=` feil, ikke stille konkatenering. Begrunnelsen
var todelt: metadata oppdages gjerne underveis i analysen (én lang listelinje
er feil ergonomi for det), og direktivlinjer kan ikke brytes, så listeformen
hadde et hardt tak allerede ved to lenker. I tillegg VARSLER gjentatt `=` på
note/link nå i sidepanelets aldri-stille-rad («bruk «+=» for å beholde
begge») — før migreringen akkumulerte gjentatte linjer, så vanen sitter, og
tapet er brukerens egen tekst. parse() fikk en egen `warnings`-kanal for
dette (additiv, ingen konsument brytes).

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
| `# connect h, key(ask)` | `# h = ost.connect("h", secret_key="ask")` |
| `# read ssb/05839 as bef, years(2000:2009)` | `# bef = ssb.read("05839", years="2000:2009")` |
| `# read URL as df, key(ask)` | `# df = ost.read("URL", secret_key="ask")` |
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

**`key` → `secret_key`** (Hans, 2026-07-26, etter at tabellen først ble
skrevet). Ordet `key` var overlastet: `key(ask)` var en hemmelighet, mens
`create … key(kommune_nr)` var kolonnenavn. I den nye grammatikken står de to
ved siden av hverandre som kwargs på samme form, og forvekslingen ville vært
gratis. Derfor: **`key=` betyr nå utelukkende kolonnenavn i `ost.create`**, og
hemmeligheten heter `secret_key=`. `key=` på `connect`/`read` avvises med
*«ukjent argument «key» — mente du «secret_key»?»* (`js/data-directives.js:147`,
`:169-177`). Internt heter feltet fortsatt `key`, så `resolve()` er urørt.

`# require URL as gammel` i tabellen gjelder kun **URL**-formen. Den navngitte
formen (`# require <registrert-kilde> as <alias>`) er fjernet uten etterfølger
— se §12.

Opsjoner:

| I dag | Ny |
|---|---|
| `key(ask)` / `key(LITERAL)` | `secret_key="ask"` / `secret_key="LITERAL"` |
| `exec(remote)` | `exec="remote"` |
| `kind(pxweb)` | `kind="pxweb"` |
| `cache(30m)` | `cache="30m"` |
| `years(2000:2009)`, `years(2020:)` | `years="2000:2009"`, `years="2020:"` |
| `countries(NOR SWE)` | `countries=["NOR", "SWE"]` |
| `regions(0)`, `indicators(Personer)` | `regions=["0"]`, `indicators=["Personer"]` |
| `filters(na_item=B1GQ unit=CP_MEUR)` | `filters={"na_item": "B1GQ", "unit": "CP_MEUR"}` |
| `all()` | `all=True` |

Enkeltverdier godtas uten liste: `countries="NOR"` ≡ `countries=["NOR"]`.

`how=` er et **lukket sett** — `left`, `inner`, `outer`. Uten det ville
`how="innner"` falt til `left` uten et ord: feil sammenslåing, riktig-utseende
resultat. `create`, `add` og `join` validerer dessuten sine *egne* kwargs
(`create`: `key`, `format`; `add`: `table`, `how`; `join`: `on`, `how`), fordi
`parse()` bare kjenner `connect`/`read` sine argumenter og ellers ropte
«ukjent argument «key»» på en helt gyldig `ost.create`.

### 4.2 Én gevinst på kjøpet — og én som ble utsatt

- `filters` blir en ekte dict i stedet for en mellomromsdelt streng, og
  siterte strenger fjerner en reell bug-klasse: URL-er som inneholder komma
  eller parentes brekker dagens `\S+`-mønster og `,\s*\w+\([^)]*\)`-hale.

- **Omdøping i `ost.use` er utsatt, ikke levert.** Designet lovet
  `mine = ost.use("df", source="duckdb")`. Grammatikken tillater det, men
  `parseUse` avviser det eksplisitt: *«omdøping i use er ikke støttet ennå»*
  (`js/data-directives.js:730-733`). Årsaken er forbrukersiden, ikke parseren.
  `parseUse`/`parseSegmentUses` returnerer `{name, from}` med **ett** navn, og
  `index.html` bruker `u.name` til begge ender av kopien: til å slå opp
  datasettet i *kildekjøretiden* (`exists(u.name)` i webR `:8511`, dict-oppslag
  i pyodide `:8530`, `__duckUseBytes(u.name)` `:8508`) og til å binde det i
  *målkjøretiden* (`_bindUseIntoPy(py, u.name, …)` `:11046`, `:11155`).
  Omdøping krever et andre navn gjennom hele den kjeden. Å la det passere
  stille ville bundet datasettet under kildenavnet uansett hva brukeren skrev —
  akkurat den stille-feil-klassen designet ellers verner mot. Feilmeldingen
  koster én linje; navneparet er en egen runde.

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
| `ost.connect(url, kind=…)` | `openstat.py:522` |
| `ost.read(url, table=…, columns=…, kind=…, **query)` | `:526` |
| `kilde.read(table, columns=…, **query)` | `:423` |
| `ost.create(key=…, name=…, how=…, format=…)` | `:606` |
| `panel.add(kilde, kolonner, table=…, how=…)` | `:572` |
| `panel.join(annen, on=…, how=…)` | `:585` |
| Kanonisk vokabular: `years`, `countries`, `regions`, `indicators`, `filters`, `all` | `_CANONICAL_KEYS` `:243` |

Merk at `add` tar **én** `columns`-parameter (streng eller liste), ikke
varargs — derav `panel.add(p, ["income", "edu"])` i §4.1. Dette **håndheves nå
i parseren**: `add(p, "income", "edu")` er en feil med forslag om å samle
kolonnene i en liste. Uten vakten ga den linja to kolonner i editoren og én i
pakken, der `"edu"` ble lest som `table=` og forsvant stille — samme linje, to
svar, altså nøyaktig det kopier-og-lim-pariteten lover at ikke skjer.

`all=True` er et **unntak i tabellen over**: ordet er kanonisk i begge
implementasjonene, men ekspansjonen (les alle verdier av uspesifiserte
dimensjoner) finnes bare i editorens laster. Pakken sender det derfor ikke
videre rått — `&all=True` ville blitt ignorert av kilden, og brukeren hadde
fått kildens default i stedet for alt — men kaster med *«all=True ekspanderes
foreløpig bare i OpenStat-editoren»* (`openstat.py:285-290`). Begge sider avviser
dessuten `all` for andre kilder enn pxweb, med samme melding.

**(b) Manglet i pakken — LEVERT i Task 11:**

- `Dataset.join(other, on, how=None)` (`openstat.py:585`). `Dataset` hadde bare
  `add`/`frame`, så `# panel.join(…)` var ikke kopierbar. Den er nesten
  identisk med `add`, bare med eksplisitt `on` i stedet for datasettets
  deklarerte nøkkel — og den sjekker at `on`-kolonnene finnes i *begge* rammer
  før merge, siden pandas ellers kaster en melding som ikke sier hvilken side
  som mangler kolonnen.
- `format=`-kwarg på `ost.create` (`openstat.py:606`), levert via `_deliver`
  (`:535`): `pandas` (default), `polars`, `duckdb`. `data.table`/`tibble`
  finnes bare i R-modus i editoren og gir en egen feilmelding som sier det;
  en ukjent verdi er en feil, ikke noe å ignorere — å returnere pandas
  stillferdig ville flyttet feilen til neste linje der den ser ut som noe
  helt annet.

**(c) Editor-only — har og skal ikke ha noen pakkeekvivalent:**

| Kwarg/verb | Hvorfor |
|---|---|
| `secret_key="ask"` | interaktiv passordmodal; ingen mening utenfor nettleseren |
| `exec="local"/"remote"` | kjøringslokalitet mot serveren |
| `cache="30m"` | Cache-API/service worker |
| `ost.use(navn, source=…)` | kopierer datasett mellom kjøretider i editoren |

**Dette var en felle å håndtere eksplisitt:** `Source.read` tar `**query`, så et
innlimt `ost.read("URL", secret_key="ask")` ville sendt `secret_key=ask` som
*spørringsparameter* og fått et rart svar i stedet for en feil. Begge halvdeler
ble bygget, som anbefalt:

1. `openstat.py:402-428` avviser `secret_key`, `exec` og `cache` høylytt i
   `Source.read`, hver med sin egen begrunnelse. `key` står i samme liste med
   teksten «argumentet het «key» før 2026-07-26» — et innlimt script fra før
   omdøpingen skal ikke feile som spørringsparameter.
2. Portabel eksport (Task 12) fjerner `secret_key`/`exec`/`cache` fra den
   kommenterte direktivlinja og skriver notisen *«editor-argumenter
   (secret_key/exec/cache) er fjernet — de virker bare i OpenStat»* i headeren
   (`js/portable-export.js:46-48`).

**`source` hører IKKE hjemme i denne listen** — designet førte den opp, og det
var feil. `source` er en ekte World Bank-spørringsparameter (`?source=<db-id>`),
så `Source.read` må slippe den gjennom. Editor-formen er
`ost.use(navn, source=…)`, der **hele linja** er editor-only: `ost.use()` finnes
som egen funksjon i pakken (`openstat.py:611`) og kaster med en peker til
editoren. Eksporten fjerner derfor ikke `source=` fra en `use`-linje heller —
det ville gjort kommentaren mindre sann, ikke mer.

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
NAVNEROM := meta
```

`NAVNEROM` er **kun `meta`** (`NS = { meta: 1 }`, `js/directive-parser.js:102`).
`#options.` og `#tag.` er på samme form, men beholder sine egne parsere i
`js/cells.js` — å slå dem sammen er opprydding uten brukersynlig gevinst
(§10), og denne parseren skal ikke stjele linjer den ikke eier.

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
3. **Manuelt oppdatert (Task 13):** `hjelp.html`, `hjelp.en.html`,
   `docs/directive-language-examples.md` + `.html` (prosaen),
   `netlify/edge-functions/prompts/data-svar.md`,
   `netlify/edge-functions/_lib/data-svar-prompt.ts` og
   `netlify/edge-functions/kode-svar.ts` (JS-modusens promptmal — planen
   glemte den). `js/command_help.js` finnes **ikke** i openstat (den lever i
   safestat), og `README.md` har ingen direktiveksempler — begge er verifisert
   med grep og trengte ingenting.
4. **AI-evalene må re-kjøres.** ROADMAP flagger allerede at
   `data-svar`-evalene er kalibrert mot gammelt vokabular fra omdøpingen
   2026-07-25 og ikke er kjørt siden. Krever API-nøkkel. Dette er den eneste
   delen av migreringen som ikke kan verifiseres automatisk i repoet.
5. **Publiseringsveien** (`index.html`) hadde egne `# load`- og
   `# use`-regexer. De var i praksis allerede døde — `/#[ \t]*load\b/` matchet
   ingenting etter omdøpingen 2026-07-25, så både advarselen «scriptet har
   read-linjer men ingen data er hentet» og strippingen var uten effekt, og
   publiserte dokumenter beholdt `ost.read`-linjer de ikke kan kjøre. Erstattet
   av `DataDirectives.isDirectiveLine` (commit `15d2e1b`).

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
  `secret_key`/`exec`/`cache`, og at `openstat.py` avviser dem høylytt. Uten
  dette blir et innlimt script stille feil, ikke høylytt feil — den verste
  utfallsklassen, og nøyaktig samme feilmodus som SDMX-fellen designet ellers
  verner mot. (`use` er ikke i strippelista: hele linja er editor-only, og
  `openstat.use()` feiler selv med en peker til editoren.)
- Delt fixture for paritet: `Dataset.join` må inn i både `tests/test_openstat.py`
  og `netlify/edge-functions/_lib/data-directives.test.ts` med samme
  forventede merge-resultat, slik `tests/fixtures/pxweb_dataset.json` gjør for
  pxweb.
- ~~`# require` for **navngitte** kilder (HE/remote) hoppes over av klienten i
  dag og rutes til serveren. `ost.read("navn")` må bevare nøyaktig samme
  forbigåelse, ellers brekker HE-fanen.~~ **Løst ved å fjerne formen.** Se §12:
  den navngitte `require`-formen har ingen etterfølger. En registrert kilde nås
  nå via `ost.connect("navn")` + `<alias>.read()`, som `resolve()` returnerer
  som `{anvil: …}` og ruter til serveren på vanlig vis.

---

## 12. Status ved levering (2026-07-27)

Levert i Task 1–13: én grammatikk (`js/directive-parser.js`), `#meta.`-navnerommet,
`isDirectiveLine()` i stedet for de divergerende verblistene, `makeLoad()` i
stedet for tekst-rundturene, `Dataset.join`/`format=` i `openstat.py`, avvisning
av editor-argumenter i pakken, og fjerning av dem i portabel eksport.

**Fjernet uten etterfølger:**

- **`# require <navn> as <alias>` for navngitte kilder.** Den gamle formen viste
  til en registrert kilde *uten* en `connect`-linje, og ble rutet til den
  «Krypterte» (HE) editorfanen, hvis `dialect` var låst til `'he'`. Den nye
  grammatikken har ingen måte å si «vis til en registrert kilde uten connect»,
  og å finne på én ville gjeninnført en andre skrivemåte for det
  `ost.connect("navn")` + `<alias>.read()` allerede gjør. Skriv `connect`-linja.
  HE-fanen er ikke en del av OpenStat (den lever i SafeStat), så ingenting i
  dette repoet mistet en fungerende vei. `# require <url> as <navn>` er dekket
  av `ost.read("<url>")`, som i §4.1.

**Utsatt (bevisst, med grunn):**

- **Omdøping i `ost.use`** — §4.2. Krever et navnepar (kildenavn + målnavn)
  gjennom `parseUse`, `parseSegmentUses` og seks kallsteder i `index.html`.
  Avvises i mellomtiden med *«omdøping i use er ikke støttet ennå»*, ikke stille.
- **`all=True`-ekspansjon i `openstat.py`** — §4.5(a). Ordet er kanonisk i
  begge implementasjonene; ekspansjonen (les kildens json-stat2-metadata og
  fyll ut de uspesifiserte dimensjonene) finnes bare i editorens laster. Pakken
  kaster med en peker dit, i stedet for å sende `all=True` videre som en rå
  spørringsparameter kilden ignorerer.
- **`+=` for liste-nøkler i meta** — §3.3. `note`/`link` tar liste, som dekker
  behovet så lenge meta for ett datasett skrives på ett sted.
- Resten av §10 (`#%% data`-celletype, `ost.meta()`/`sources()`/
  `attribution()`, `#meta` → `df.attrs['meta']` i pyodide, sammenslåing av
  `#tag.`/`#options.`/`#@param`).

**Ikke verifisert automatisk:**

- **AI-evalene** (`docs/eval/data-svar-evalsett.md`) er kalibrert mot det gamle
  vokabularet og må kjøres på nytt med API-nøkkel. Promptmalene er oppdatert
  (Task 13), men treffraten er ukjent til evalsettet er kjørt.
- **Nettleserverifiseringen** (§9, siste punkt) — sjekklista ligger i
  `.superpowers/sdd/task-13-smoke.md`.
