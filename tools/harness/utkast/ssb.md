# UTKAST: ssb (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/ssb.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Sammenligning mot data/sources/ssb.md (Task 4-kvalitetssikring, 2026-08-15)

**Utforskeren fant dette, som guiden per i dag IKKE har:**
- **Tabell 14706** (Avledede serier fra KPI: KPI-JA/-JAE/-JE/-JEL/-XADM) er verifisert
  her med en ferdig read-linje for `Tolvmanedersendring`/`KPIJustIndMnd` — guiden
  nevner INGEN KPI-tabellnummer i det hele tatt, selv om `sporsmal.json`
  (`inflasjon-no-euro`) har en eksplisitt fasit-merknad om at det MÅ være «SSB
  14706, IKKE 14710» (målt felle, inflasjons-runden 2026-08-15). Dette utkastet
  er trolig kilden til akkurat den regelen — guiden bør få tabellnummeret inn.
- En konkret, MÅLT feilkropp for `years=` mot en ikke-årlig tabell: `HTTP 400
  {"type":"Parameter error","title":"Non-existent value","status":400}` — et
  ANNET feilmønster enn guidens dokumenterte `range()`-feil (`"Illegal
  selection expression"`); begge er ekte, men for ulike feilhandlinger.
- Faktiske dimensjonsnavn/koder/etiketter for 07459 (`Region`/`Kjonn`/`Alder`/
  `ContentsCode`/`Tid`) med eksempel-regionkoder (`0=Hele landet`,
  `31=Østfold`, `3101=Halden`, …).
- Søkeresultater for 5 temaord (folkemengde/befolkning/kommune/
  konsumprisindeks/KPI) — guiden diskuterer ikke `sok_endepunkt` i det hele
  tatt, selv om registeret har det.
- En eksplisitt «Aggregat-via-utelatelse»-observasjon (utelatelse av
  eliminerbare dimensjoner gir en aggregatrad tilbake, ikke en feil) —
  guidens Mandatory-regel nevner elimination-konseptet abstrakt, men
  demonstrerer det ikke med en faktisk kjørt rad.

**Guiden har dette, som utforskeren IKKE fant** (fordi kun 2 tabeller ble
probet i denne kjøringen — budsjett/utvalg, ikke en systematisk mangel):
- Mandatory-regelen presisert i tekst: `ContentsCode` og `Tid` er ALLTID
  obligatoriske, selv i tabeller med bare ett innholdsalternativ — inkl.
  SSBs egen stavefeil «mandantory» i feilteksten. Ingen av de 6 kjøringene
  her traff en manglende-obligatorisk-dimensjon-feil, så denne regelen ble
  aldri utløst/verifisert på nytt i denne runden.
- Tidsuttrykkene `top(n)`/`from(år)`, og at `range(fra,til)` IKKE finnes
  (`400 "Illegal selection expression"`) — ingen av lesningene her testet
  disse funksjonsfiltrene.
- Codelists-forklaringen (`agg_`- vs `vs_`-prefiks for kodelister,
  aggregering vs. valueset) — `utforsk.py` trekker ikke ut
  `codeLists`-metadata i det hele tatt (kun `dims`/`koder`/`etiketter`).
- At PxWebApi v1 (`/api/v0/`) er stengt i appen, og at
  `/tables/{id}/variables` (404) ikke finnes i v2 — ingen av disse er
  probet av utforskeren.
- Tabellnummer **11342** (befolkning, brukt i guidens hovedeksempel for
  Oslo) — utforskeren brukte **07459** i stedet (begge er gyldige
  befolkningstabeller; `FALLBACK_TABELLER["ssb"]` lister kun 07459+14706,
  ikke 11342).
- Et overordnet «Om kilden»-avsnitt (SSBs fulle dekningsbredde: helse,
  utdanning, arbeidsliv osv.) — utkastet kan bare beskrive de 2 tabellene
  det faktisk probet, ikke basens fulle bredde.

## Kort (innholdslaget — det man velger kilde på)
**Tema utforsket (søkt):** folkemengde, befolkning, kommune, konsumprisindeks, KPI
- **07459** — 07459: Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning (K) 1986-2026
  - tidsspenn (fra Tid-dimensjonens kodeliste): 1986 – 2026
  - `Region` (rolle: geo) — 994 kode(r) [eliminerbar] — eksempler: 0=Hele landet, 31=Østfold, 3101=Halden, 3103=Moss, 3105=Sarpsborg
  - `Kjonn` — 2 kode(r) [eliminerbar] — eksempler: 2=Kvinner, 1=Menn
  - `Alder` — 106 kode(r) [eliminerbar] — eksempler: 000=0 år, 001=1 år, 002=2 år, 003=3 år, 004=4 år
  - `ContentsCode` (rolle: metric) — 1 kode(r) [OBLIGATORISK] — eksempler: Personer1=Personer
  - `Tid` (rolle: time) — 41 kode(r) [OBLIGATORISK] — eksempler: 1986, 1987, 1988, 1989, 1990
- **14706** — 14706: Avledede serier fra konsumprisindeks (KPI-JA, KPI-JAE, KPI-JE, KPI-JEL og KPI-XADM) (2025=100) 1995M01-2026M07
  - tidsspenn (fra Tid-dimensjonens kodeliste): 1995M01 – 2026M07
  - `KPIavledetSerie` — 8 kode(r) [eliminerbar] — eksempler: KPI=Konsumprisindeksen totalt (KPI), KPI-JE=KPI uten energivarer (KPI-JE), KPI-JEL=KPI uten elektrisitet (KPI-JEL), KPI-JA=KPI justert for avgiftsendringer (KPI-JA), KPI-JAE=KPI justert for avgiftsendringer og uten energivarer (KPI-JAE)
  - `ContentsCode` (rolle: metric) — 3 kode(r) [OBLIGATORISK] — eksempler: KPIJustIndMnd=Indeks (2025=100), Manedsendring=Månedsendring (prosent), Tolvmanedersendring=12-måneders endring (prosent)
  - `Tid` (rolle: time) — 379 kode(r) [OBLIGATORISK] — eksempler: 1995M01, 1995M02, 1995M03, 1995M04, 1995M05

## Guide (hentelaget — eksempel først)
### Enkeltvalg (07459)
```python
ssb.read("07459", regions=["0301"], indicators=["Personer1"], years="2026")
```
1 rad, kolonner: Region, ContentsCode, Tid, value

### Flervalg (2 regioner, 07459)
```python
ssb.read("07459", regions=["0301", "4601"], indicators=["Personer1"], years="2026")
```
2 rader, kolonner: Region, ContentsCode, Tid, value

### Tidsvindu (10 år, 07459)
```python
ssb.read("07459", regions=["0301"], indicators=["Personer1"], years="2017:2026")
```
10 rader, kolonner: Region, ContentsCode, Tid, value

### Enkeltvalg (14706)
```python
ssb.read("14706", indicators=["KPIJustIndMnd"], filters={"Tid": ["2026M07"]})
```
1 rad, kolonner: ContentsCode, Tid, value

### Feilforsøk: years= mot en ikke-årlig tabell (14706) — FORVENTET FEIL (FEILET)
```python
ssb.read("14706", indicators=["KPIJustIndMnd"], years="2024:2025")
```
Feil: HTTP 400 for https://data.ssb.no/api/pxwebapi/v2/tables/14706/data?lang=no&valueCodes[ContentsCode]=KPIJustIndMnd&valueCodes[Tid]=2024,2025&outputFormat=json-stat2: {"type":"Parameter error","title":"Non-existent value","status":400} — reparasjon: sjekk kodene mot table_metadata (bruk find="…" for lange kodelister); vil du ha TOTALEN: UTELAT eliminerbare dimensjoner fra read-linjen

### Reparasjon: filters={"Tid": [...]} i stedet for years= (14706)
```python
ssb.read("14706", indicators=["KPIJustIndMnd"], filters={"Tid": ["2026M06", "2026M07"]})
```
2 rader, kolonner: ContentsCode, Tid, value


## Kjente feller (målt i denne utforskningen)
**Aggregat-via-utelatelse (07459):** kjøringen «Enkeltvalg (07459)» over UTELOT Kjonn og Alder (elimination:true i metadata) — 1 rad(er) kom likevel tilbake, altså et aggregat over disse dimensjonene, ikke en feil.

**Aggregat-via-utelatelse (14706):** kjøringen «Reparasjon: filters={"Tid": [...]} i stedet for years= (14706)» over UTELOT KPIavledetSerie (elimination:true i metadata) — 2 rad(er) kom likevel tilbake, altså et aggregat over disse dimensjonene, ikke en feil.

**Feilforsøk: years= mot en ikke-årlig tabell (14706) — FORVENTET FEIL**
`ssb.read("14706", indicators=["KPIJustIndMnd"], years="2024:2025")`
→ HTTP 400 for https://data.ssb.no/api/pxwebapi/v2/tables/14706/data?lang=no&valueCodes[ContentsCode]=KPIJustIndMnd&valueCodes[Tid]=2024,2025&outputFormat=json-stat2: {"type":"Parameter error","title":"Non-existent value","status":400} — reparasjon: sjekk kodene mot table_metadata (bruk find="…" for lange kodelister); vil du ha TOTALEN: UTELAT eliminerbare dimensjoner fra read-linjen

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Python [`pyjstat`](https://github.com/predicador37/pyjstat) — verifisert: 4 rader fra delt json-stat2-fixture (offline)
- R (dokumentert, ikke testet her): [`PxWebApiData (SSBs egen)`](https://cran.r-project.org/package=PxWebApiData), [`pxweb (rOpenGov)`](https://github.com/rOpenGov/pxweb)


## Søkenotater
- «folkemengde»: 20 treff — topp 3: 07521 (07521: Samisk statistikk. Folkemengde per 1. januar og endri); 10516 (10516: Befolkningsendringer, etter innvandringskategori 2011); 07542 (07542: Samisk statistikk. Folkemengde per 1. januar, etter k)
- «befolkning»: 20 treff — topp 3: 13930 (13930: FoU-personale, befolkningen, sysselsatte og studenter); 14476 (14476: Forskere/faglig personale, befolkningen, sysselsatte ); 07519 (07519: Samisk statistikk. Folkemengde, tettsteder og areal. )
- «kommune»: 20 treff — topp 3: 05082 (05082: Sosialhjelpsmottakere, etter alder og hvor mange komm); 09074 (09074: Barn 0-24 år med barnevernstiltak, etter talet på kom); 09590 (09590: Flyttinger innenfor kommunene (K) 2003-2025)
- «konsumprisindeks»: 17 treff — topp 3: 14710 (14710: Konsumprisindeks, historisk serie (2025=100) 1920M03-); 14711 (14711: Konsumprisindeks, historisk serie (2025=100) 1865-202); 14708 (14708: Sesongjustert konsumprisindeks og KPI-JAE (2025=100) )
- «KPI»: 10 treff — topp 3: 14706 (14706: Avledede serier fra konsumprisindeks (KPI-JA, KPI-JAE); 14707 (14707: Avledede serier fra konsumprisindeks (KPI-JA, KPI-JAE); 14708 (14708: Sesongjustert konsumprisindeks og KPI-JAE (2025=100) )
