# UTKAST: ecb (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/ecb.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): befolkning, population, arbeidsmarknad
- **ECB,EXR** — ECB,EXR
  - `FREQ` — eksempler: A
  - `CURRENCY` — eksempler: ARS, AUD, BGN, BRL, CAD
  - `CURRENCY_DENOM` — eksempler: EUR
  - `EXR_TYPE` — eksempler: SP00
  - `EXR_SUFFIX` — eksempler: A, E
  - _dimensjonsnavn fra CSV-header + inntil 5 EKTE eksempelkoder sett i en lastNObservations=1-probe (ikke fulle kodelister/etiketter — structure-endepunktet er ikke utforsket her)._

## Guide (hentelaget — eksempel først)
### Enkeltvalg (ECB,EXR) (FEILET)
```python
ecb.read("ECB,EXR", years="2024:2025", filters={"FREQ": "A", "CURRENCY": "ARS", "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"})
```
Feil: No columns to parse from file

### Tidsvindu (10 år, ECB,EXR)
```python
ecb.read("ECB,EXR", years="2015:2025", filters={"FREQ": "A", "CURRENCY": "ARS", "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"})
```
5 rader, kolonner: KEY, FREQ, CURRENCY, CURRENCY_DENOM, EXR_TYPE, EXR_SUFFIX, TIME_PERIOD, OBS_VALUE, OBS_STATUS, OBS_CONF, OBS_PRE_BREAK, OBS_COM, TIME_FORMAT, BREAKS, COLLECTION, COMPILING_ORG, DISS_ORG, DOM_SER_IDS, PUBL_ECB, PUBL_MU, PUBL_PUBLIC, UNIT_INDEX_BASE, COMPILATION, COVERAGE, DECIMALS, NAT_TITLE, SOURCE_AGENCY, SOURCE_PUB, TITLE, TITLE_COMPL, UNIT, UNIT_MULT

### Feilforsøk: liste-verdi i filters (ECB,EXR) — FORVENTET FEIL, 0 nettverkskall (FEILET)
```python
ecb.read("ECB,EXR", years="2024:2025", filters={"FREQ": "A", "CURRENCY": ["ARS", "AUD"], "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"})
```
Feil: liste-verdi for filters['CURRENCY'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall


## Kjente feller (målt i denne utforskningen)
**Feilforsøk: liste-verdi i filters (ECB,EXR) — FORVENTET FEIL, 0 nettverkskall**
`ecb.read("ECB,EXR", years="2024:2025", filters={"FREQ": "A", "CURRENCY": ["ARS", "AUD"], "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"})`
→ liste-verdi for filters['CURRENCY'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
