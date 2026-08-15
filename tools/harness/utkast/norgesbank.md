# UTKAST: norgesbank (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/norgesbank.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): styringsrente, policy rate, IR
- **EXR** — EXR
  - `FREQ` — eksempler: B, A, M
  - `BASE_CUR` — eksempler: HUF, DKK, CZK, CAD, BRL
  - `QUOTE_CUR` — eksempler: NOK
  - `TENOR` — eksempler: SP
  - _dimensjonsnavn fra CSV-header + inntil 5 EKTE eksempelkoder sett i en lastNObservations=1-probe (ikke fulle kodelister/etiketter — structure-endepunktet er ikke utforsket her)._
- **IR** — IR
  - `FREQ` — eksempler: A, B, M
  - `INSTRUMENT_TYPE` — eksempler: KPRA
  - `TENOR` — eksempler: SD, OL, RR
  - `UNIT_MEASURE` — eksempler: R
  - _dimensjonsnavn fra CSV-header + inntil 5 EKTE eksempelkoder sett i en lastNObservations=1-probe (ikke fulle kodelister/etiketter — structure-endepunktet er ikke utforsket her)._

## Guide (hentelaget — eksempel først)
### Enkeltvalg (EXR)
```python
norgesbank.read("EXR", years="2024:2025", filters={"FREQ": "B", "BASE_CUR": "HUF", "QUOTE_CUR": "NOK", "TENOR": "SP"})
```
502 rader, kolonner: STRUCTURE, STRUCTURE_ID, ACTION, FREQ, BASE_CUR, QUOTE_CUR, TENOR, TIME_PERIOD, OBS_VALUE, DECIMALS, CALCULATED, UNIT_MULT, COLLECTION

### Tidsvindu (10 år, EXR)
```python
norgesbank.read("EXR", years="2015:2025", filters={"FREQ": "B", "BASE_CUR": "HUF", "QUOTE_CUR": "NOK", "TENOR": "SP"})
```
2768 rader, kolonner: STRUCTURE, STRUCTURE_ID, ACTION, FREQ, BASE_CUR, QUOTE_CUR, TENOR, TIME_PERIOD, OBS_VALUE, DECIMALS, CALCULATED, UNIT_MULT, COLLECTION

### Feilforsøk: liste-verdi i filters (EXR) — FORVENTET FEIL, 0 nettverkskall (FEILET)
```python
norgesbank.read("EXR", years="2024:2025", filters={"FREQ": ["B", "A"], "BASE_CUR": "HUF", "QUOTE_CUR": "NOK", "TENOR": "SP"})
```
Feil: liste-verdi for filters['FREQ'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall

### Enkeltvalg, andre dataflow (IR)
```python
norgesbank.read("IR", years="2020:2025", filters={"FREQ": "A", "INSTRUMENT_TYPE": "KPRA", "TENOR": "SD", "UNIT_MEASURE": "R"})
```
6 rader, kolonner: STRUCTURE, STRUCTURE_ID, ACTION, FREQ, INSTRUMENT_TYPE, TENOR, UNIT_MEASURE, TIME_PERIOD, OBS_VALUE, DECIMALS, COLLECTION, CALC_METHOD


## Kjente feller (målt i denne utforskningen)
**Feilforsøk: liste-verdi i filters (EXR) — FORVENTET FEIL, 0 nettverkskall**
`norgesbank.read("EXR", years="2024:2025", filters={"FREQ": ["B", "A"], "BASE_CUR": "HUF", "QUOTE_CUR": "NOK", "TENOR": "SP"})`
→ liste-verdi for filters['FREQ'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall

## Økosystem (pakker — for PORTABLE skript; i appen gjelder adapterne)

- Python `sdmx1` — verifisert: install + import
- R (dokumentert, ikke testet her): `rsdmx`

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
