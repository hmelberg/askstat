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
