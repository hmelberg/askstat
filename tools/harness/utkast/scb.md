# UTKAST: scb (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/scb.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema utforsket (søkt):** befolkning, population, arbeidsmarknad
- **TAB4552** — Population connected to public network. Year 1960-2024
  - tidsspenn (fra Tid-dimensjonens kodeliste): 1960 – 2024
  - `TypAnsl` — 2 kode(r) [OBLIGATORISK] — eksempler: 60=water, 70=wastewater
  - `ContentsCode` (rolle: metric) — 3 kode(r) [OBLIGATORISK] — eksempler: 000000YE=Connected to public network, 000000YF=Not connected to public network, 000000J2=Total population
  - `Tid` (rolle: time) — 22 kode(r) [OBLIGATORISK] — eksempler: 1960, 1965, 1970, 1975, 1980
  - _FELLE (målt): kilden avviser lang=no (400 Unsupported language) — bruk lang=en/sv eksplisitt i alle kall._
- **TAB4560** — Population by region and type of wastewater disposal methods. Year 2000-2024
  - tidsspenn (fra Tid-dimensjonens kodeliste): 2000 – 2024
  - `Region` — 317 kode(r) [eliminerbar] — eksempler: 00=Sweden, 01=Stockholm county, 0114=Upplands Väsby, 0115=Vallentuna, 0117=Österåker
  - `Avlopp` — 5 kode(r) [eliminerbar] — eksempler: 10=public wastewater disposal, 20=individual wastewater disposal (septic tank or cesspool), 30=no sewage connection , 90=information missing, 99=all wastewater disposal method
  - `ContentsCode` (rolle: metric) — 1 kode(r) [OBLIGATORISK] — eksempler: 000000VL=Number
  - `Tid` (rolle: time) — 14 kode(r) [OBLIGATORISK] — eksempler: 2000, 2005, 2010, 2014, 2015
  - _FELLE (målt): kilden avviser lang=no (400 Unsupported language) — bruk lang=en/sv eksplisitt i alle kall._
- **TAB4562** — Population by region and source of water. Year 2000-2024
  - tidsspenn (fra Tid-dimensjonens kodeliste): 2000 – 2024
  - `Region` — 317 kode(r) [eliminerbar] — eksempler: 00=Sweden, 01=Stockholm county, 0114=Upplands Väsby, 0115=Vallentuna, 0117=Österåker
  - `Vattenanslutning` — 6 kode(r) [eliminerbar] — eksempler: 10=public water supply, 20=self-supply, 30=seasonal water supply, 40=no water connection, 90=information missing
  - `ContentsCode` (rolle: metric) — 1 kode(r) [OBLIGATORISK] — eksempler: 000000VP=Number
  - `Tid` (rolle: time) — 14 kode(r) [OBLIGATORISK] — eksempler: 2000, 2005, 2010, 2014, 2015
  - _FELLE (målt): kilden avviser lang=no (400 Unsupported language) — bruk lang=en/sv eksplisitt i alle kall._

## Guide (hentelaget — eksempel først)
### Enkeltvalg (TAB4552)
```python
scb.read("TAB4552", indicators=["000000YE"], years="2024", filters={"TypAnsl": "60"}, lang="en")
```
1 rad, kolonner: TypAnsl, ContentsCode, Tid, value

### Enkeltvalg (TAB4560)
```python
scb.read("TAB4560", indicators=["000000VL"], years="2024", lang="en")
```
1 rad, kolonner: ContentsCode, Tid, value

### Enkeltvalg (TAB4562)
```python
scb.read("TAB4562", indicators=["000000VP"], years="2024", lang="en")
```
1 rad, kolonner: ContentsCode, Tid, value


## Kjente feller (målt i denne utforskningen)
**Aggregat-via-utelatelse (TAB4560):** kjøringen «Enkeltvalg (TAB4560)» over UTELOT Region og Avlopp (elimination:true i metadata) — 1 rad(er) kom likevel tilbake, altså et aggregat over disse dimensjonene, ikke en feil.

**Aggregat-via-utelatelse (TAB4562):** kjøringen «Enkeltvalg (TAB4562)» over UTELOT Region og Vattenanslutning (elimination:true i metadata) — 1 rad(er) kom likevel tilbake, altså et aggregat over disse dimensjonene, ikke en feil.

## Søkenotater
- «befolkning»: 20 treff — topp 3: TAB4552 (Befolkningens anslutning till kommunalt vatten och avlopp. Å); TAB4560 (Befolkningen efter region och typ av avloppsanslutning. År 2); TAB4562 (Befolkningen efter region och typ av vattenanslutning. År 20)
- «population»: 12 treff — topp 3: TAB3402 (Systematiskt innovationsarbete i offentliga sektorn efter de); TAB3403 (Innovationsaktiviteter i offentliga sektorn efter delsektor.); TAB3404 (Produktinnovation i offentliga sektorn efter delsektor. Anta)
- «arbeidsmarknad»: 0 treff — topp 3: (ingen)
