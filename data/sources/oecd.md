---
id: oecd
navn: OECD SDMX
utgiver: OECD
tillit: offisiell
tilgang: sdmx
base_url: https://sdmx.oecd.org/public/rest/data/
cors: true
join_nokler: [LOCATION (ISO3), TIME_PERIOD]
kind: sdmx
tags: [makro]
order: 3
---

# OECD SDMX

## Kort

SDMX 2.1; ressurssti = <agency>,<dataflow> på KOMMA-form (slash-form 404-er: «Could not find Dataflow», målt 2026-08-01) — search_catalog/search_datasets gir id-en ferdig på denne formen. Utvalg skrives ALLTID med det kanoniske vokabularet (years=/countries=/indicators=/filters={}); lasteren bygger den punktumdelte nøkkelen selv fra kildens egen CSV-header. Skriv ALDRI startPeriod=/endPeriod= som kwarg (parseren avviser dem — years= oversettes til dem) og bygg ikke nøkkelstien for hånd. Adapteren henter CSV via Accept-header (application/vnd.sdmx.data+csv;labels=id — verifisert 2026-07-25); c[DIM]=filtre ignoreres STILLE (SDMX 3.0-syntaks, API-et er 2.1). CORS: reflektert origin.

## Guide

# OECD (SDMX) — kildeguide

- flowRef er KOMMA-form og skal KOPIERES ordrett fra search_datasets/search_catalog-treffet: `# o = oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2015:2024", countries=["NOR","SWE"])`. Slash-form 404-er («Could not find Dataflow»). Id-er inneholder @ og komma — ikke «rens» dem.
- countries= → REF_AREA, indicators= → MEASURE; ALT annet i filters={"<DIM>": "<kode>"} — dimensjonene og kodene får du fra table_metadata (bruk find= for lange lister).
- Nøkkelstien (punktumdelte dimensjoner) bygger lasteren selv — bygg den ALDRI for hånd, og aldri /all + startPeriod som kwargs. years= er eneste tidsvei.
- SDMX ignorerer ukjente parametre STILLE (HTTP 200 med UFILTRERTE data) — aldri rå pd.read_csv-URL mot OECD; alltid den kanoniske read-linjen.
- 404 «NoResultsFound» betyr tomt UTVALG (feil koder), ikke nettverksfeil — sjekk kodene i table_metadata i stedet for å bytte kilde.
- table_metadata viser nå KUN koder som faktisk har data i kuben
  (availableconstraint) — velg aldri koder utenfor listene; en dimensjon
  med én verdi settes til den verdien. 0 rader betyr feil KOMBINASJON, ikke
  at data mangler: fjern filtre (behold countries=) og filtrer i pandas.
- For kuber med mange dimensjoner (f.eks. SHA/helseutgifter DSD_SHA@DF_SHA): spesifiser BARE de strengt nødvendige filtrene i filters={} (typisk UNIT_MEASURE, FINANCING_SCHEME, PROVIDER, FUNCTION, MODE_PROVISION) — for mange simultane dimensjonskombinasjoner gir NoRecordsFound selv om kombinasjonen logisk finnes. La resterende dimensjoner komme gjennom og filtrer dem etterpå i pandas.
- UNIT_MEASURE-koder for prosentandeler: bruk `PA` (percent per annum) for år-over-år prosentvis endring — `PC` (percent) gir NoRecordsFound i prisdata. Eksempel HICP år-over-år: `filters={"FREQ": "M", "MEASURE": "CPI", "UNIT_MEASURE": "PA", "TRANSFORMATION": "GY"}`.

## Om kilden

OECD — comparative statistics for OECD member and partner countries: economy, labour, health, and social policy via SDMX.

