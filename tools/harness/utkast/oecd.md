# UTKAST: oecd (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/oecd.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): health expenditure, helseutgifter, SHA
- **OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M** — OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M
  - `REF_AREA` — eksempler: GRC, SWE, PRT, GBR, CHL
  - `MEASURE` — eksempler: UNE_LF_M
  - `UNIT_MEASURE` — eksempler: PT_LF_SUB
  - `TRANSFORMATION` — eksempler: _Z
  - `ADJUSTMENT` — eksempler: N, Y
  - `SEX` — eksempler: M, F, _T
  - `AGE` — eksempler: Y15T24, Y_GE15, Y_GE25
  - `ACTIVITY` — eksempler: _Z
  - `FREQ` — eksempler: A, Q, M
  - _dimensjonsnavn fra CSV-header + inntil 5 EKTE eksempelkoder sett i en lastNObservations=1-probe (ikke fulle kodelister/etiketter — structure-endepunktet er ikke utforsket her)._

## Guide (hentelaget — eksempel først)
### Enkeltvalg (OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M)
```python
oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2024:2025", filters={"REF_AREA": "GRC", "MEASURE": "UNE_LF_M", "UNIT_MEASURE": "PT_LF_SUB", "TRANSFORMATION": "_Z", "ADJUSTMENT": "N", "SEX": "M", "AGE": "Y15T24", "ACTIVITY": "_Z", "FREQ": "A"})
```
2 rader, kolonner: DATAFLOW, REF_AREA, MEASURE, UNIT_MEASURE, TRANSFORMATION, ADJUSTMENT, SEX, AGE, ACTIVITY, FREQ, TIME_PERIOD, OBS_VALUE, BASE_PER, OBS_STATUS, UNIT_MULT, DECIMALS

### Tidsvindu (10 år, OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M)
```python
oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2015:2025", filters={"REF_AREA": "GRC", "MEASURE": "UNE_LF_M", "UNIT_MEASURE": "PT_LF_SUB", "TRANSFORMATION": "_Z", "ADJUSTMENT": "N", "SEX": "M", "AGE": "Y15T24", "ACTIVITY": "_Z", "FREQ": "A"})
```
11 rader, kolonner: DATAFLOW, REF_AREA, MEASURE, UNIT_MEASURE, TRANSFORMATION, ADJUSTMENT, SEX, AGE, ACTIVITY, FREQ, TIME_PERIOD, OBS_VALUE, BASE_PER, OBS_STATUS, UNIT_MULT, DECIMALS

### Feilforsøk: liste-verdi i filters (OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M) — FORVENTET FEIL, 0 nettverkskall (FEILET)
```python
oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2024:2025", filters={"REF_AREA": ["GRC", "SWE"], "MEASURE": "UNE_LF_M", "UNIT_MEASURE": "PT_LF_SUB", "TRANSFORMATION": "_Z", "ADJUSTMENT": "N", "SEX": "M", "AGE": "Y15T24", "ACTIVITY": "_Z", "FREQ": "A"})
```
Feil: liste-verdi for filters['REF_AREA'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall


## Kjente feller (målt i denne utforskningen)
**Feilforsøk: liste-verdi i filters (OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M) — FORVENTET FEIL, 0 nettverkskall**
`oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2024:2025", filters={"REF_AREA": ["GRC", "SWE"], "MEASURE": "UNE_LF_M", "UNIT_MEASURE": "PT_LF_SUB", "TRANSFORMATION": "_Z", "ADJUSTMENT": "N", "SEX": "M", "AGE": "Y15T24", "ACTIVITY": "_Z", "FREQ": "A"})`
→ liste-verdi for filters['REF_AREA'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Python [`sdmx1`](https://github.com/khaeru/sdmx) — verifisert: install + import
- R (dokumentert, ikke testet her): [`rsdmx`](https://github.com/opensdmx/rsdmx), [`OECD`](https://cran.r-project.org/package=OECD)


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
