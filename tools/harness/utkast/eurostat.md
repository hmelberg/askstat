# UTKAST: eurostat (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/eurostat.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): unemployment, arbeidsledighet, harmonized, konsumprisindeks, KPI
- **ei_lmhr_m** — Unemployment rate (%) - monthly data
  - `freq` — 1 kode(r) — eksempler: M=Monthly
  - `unit` — 1 kode(r) — eksempler: PC_ACT=Percentage of population in the labour force
  - `s_adj` — 2 kode(r) — eksempler: NSA=Unadjusted data (i.e. neither seasonally adjusted nor calendar adjusted data), SA=Seasonally adjusted data, not calendar adjusted data
  - `indic` — 9 kode(r) — eksempler: LM-UN-T-TOT=Unemployment according to ILO definition - total, LM-UN-M-TOT=Unemployment according to ILO definition - males, LM-UN-F-TOT=Unemployment according to ILO definition - females, LM-UN-T-LE25=Unemployment according to ILO definition - under 25 years - total, LM-UN-M-LE25=Unemployment according to ILO definition - under 25 years - males
  - `geo` (rolle: geo) — 46 kode(r) — eksempler: EU=European Union (EU6-1958, EU9-1973, EU10-1981, EU12-1986, EU15-1995, EU25-2004, EU27-2007, EU28-2013, EU27-2020), EU27_2020=European Union - 27 countries (from 2020), EA=Euro area (EA11-1999, EA12-2001, EA13-2007, EA15-2008, EA16-2009, EA17-2011, EA18-2014, EA19-2015, EA20-2023, EA21-2026), EA21=Euro area – 21 countries (from 2026), EA20=Euro area – 20 countries (2023-2025)
  - `time` — 1 kode(r) — eksempler: 2026-07
  - _kun siste periode probet (lastTimePeriod=1, budsjetthensyn) — full tidsspenn IKKE hentet i denne utforskningen._
- **prc_hicp_manr** — HICP - monthly data (annual rate of change)
  - `freq` — 1 kode(r) — eksempler: M=Monthly
  - `unit` — 1 kode(r) — eksempler: RCH_A=Annual rate of change
  - `coicop` — 467 kode(r) — eksempler: CP00=All-items HICP, CP01=Food and non-alcoholic beverages, CP011=Food, CP0111=Bread and cereals, CP01111=Rice
  - `geo` (rolle: geo) — 45 kode(r) — eksempler: EU=European Union (EU6-1958, EU9-1973, EU10-1981, EU12-1986, EU15-1995, EU25-2004, EU27-2007, EU28-2013, EU27-2020), EU27_2020=European Union - 27 countries (from 2020), EU28=European Union - 28 countries (2013-2020), EA=Euro area (EA11-1999, EA12-2001, EA13-2007, EA15-2008, EA16-2009, EA17-2011, EA18-2014, EA19-2015, EA20-2023, EA21-2026), EA20=Euro area – 20 countries (2023-2025)
  - `time` — 1 kode(r) — eksempler: 2025-12
  - _kun siste periode probet (lastTimePeriod=1, budsjetthensyn) — full tidsspenn IKKE hentet i denne utforskningen._

## Guide (hentelaget — eksempel først)
### Enkeltvalg (ett land, ei_lmhr_m)
```python
eurostat.read("ei_lmhr_m", countries=["NO"], years="2024:2026", filters={"s_adj": "NSA"})
```
279 rader, kolonner: freq, unit, s_adj, indic, geo, time, value

### Flervalg (Norden, ei_lmhr_m)
```python
eurostat.read("ei_lmhr_m", countries=["NO", "SE", "DK", "FI", "IS"], years="2024:2026", filters={"s_adj": "NSA"})
```
1395 rader, kolonner: freq, unit, s_adj, indic, geo, time, value

### Tidsvindu (11 år, ei_lmhr_m)
```python
eurostat.read("ei_lmhr_m", countries=["NO"], years="2015:2026", filters={"s_adj": "NSA"})
```
1251 rader, kolonner: freq, unit, s_adj, indic, geo, time, value

### Feilforsøk: kommaform i geo= (ei_lmhr_m) — FORVENTET FEIL (FEILET)
```python
eurostat.read("ei_lmhr_m", years="2024:2025", filters={"s_adj": "NSA", "geo": "NO,SE"})
```
Feil: «ei_lmhr_m»: uttrekket kom TOMT tilbake (0 datarader) — sjekk filtre/dekning (koder, år, land); slakk én dimensjon og prøv igjen. Flere land angis som countries=["NO", "SE"] — kommaliste i én geo=-param gir stille tomt fra Eurostat.

### Enkeltvalg, andre tabell (prc_hicp_manr)
```python
eurostat.read("prc_hicp_manr", countries=["NO"], years="2024:2026", filters={"coicop": "CP00"})
```
24 rader, kolonner: freq, unit, coicop, geo, time, value


## Kjente feller (målt i denne utforskningen)
**Feilforsøk: kommaform i geo= (ei_lmhr_m) — FORVENTET FEIL**
`eurostat.read("ei_lmhr_m", years="2024:2025", filters={"s_adj": "NSA", "geo": "NO,SE"})`
→ «ei_lmhr_m»: uttrekket kom TOMT tilbake (0 datarader) — sjekk filtre/dekning (koder, år, land); slakk én dimensjon og prøv igjen. Flere land angis som countries=["NO", "SE"] — kommaliste i én geo=-param gir stille tomt fra Eurostat.

## Økosystem (pakker — for PORTABLE skript; i appen gjelder adapterne)

- Python `eurostat` — verifisert: install + import
- R (dokumentert, ikke testet her): `eurostat (rOpenGov)`, `restatapi`

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
