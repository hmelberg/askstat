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
styrt: true
tags: [makro]
order: 3
---

# OECD SDMX

## Kort

SDMX 2.1; ressurssti = <agency>,<dataflow> på KOMMA-form (slash-form 404-er: «Could not find Dataflow», målt 2026-08-01) — search_catalog/search_datasets gir id-en ferdig på denne formen. Utvalg skrives ALLTID med det kanoniske vokabularet (years=/countries=/indicators=/filters={}); lasteren bygger den punktumdelte nøkkelen selv fra kildens egen CSV-header. Skriv ALDRI startPeriod=/endPeriod= som kwarg (parseren avviser dem — years= oversettes til dem) og bygg ikke nøkkelstien for hånd.

## Guide

# OECD (SDMX) — kildeguide

## Komplett eksempel (ledighet, Norge og Sverige)

```
# o = oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2015:2024", countries=["NOR","SWE"])
```

flowRef er KOMMA-form og skal KOPIERES ordrett fra
search_datasets/search_catalog-treffet — slash-form 404-er («Could not
find Dataflow»); id-er inneholder @ og komma, «rens» dem aldri.
`table_metadata` gir en ferdig `lese_linje` for valgt dataflow: kopier
og juster kun parameterverdiene. Lese-linjen er ferdig verifisert —
`oecd.read` trenger aldri probe (probe avviser uansett alle rå
OECD-URL-er).

- countries= → REF_AREA, indicators= → MEASURE; ALT annet i filters={"<DIM>": "<kode>"} — dimensjonene og kodene får du fra table_metadata (bruk find= for lange lister).
- Nøkkelstien (punktumdelte dimensjoner) bygger lasteren selv — bygg den ALDRI for hånd, og aldri /all + startPeriod som kwargs. years= er eneste tidsvei.
- SDMX ignorerer ukjente parametre STILLE (HTTP 200 med UFILTRERTE data) — bruk alltid den kanoniske read-linjen (years=/countries=/indicators=/filters={}).
- 404 «NoResultsFound» betyr tomt UTVALG (feil koder), ikke nettverksfeil — sjekk kodene i table_metadata i stedet for å bytte kilde.
- table_metadata viser nå KUN koder som faktisk har data i kuben
  (availableconstraint) — velg aldri koder utenfor listene; en dimensjon
  med én verdi settes til den verdien. 0 rader betyr feil KOMBINASJON, ikke
  at data mangler: fjern filtre (behold countries=) og filtrer i pandas.
- For kuber med mange dimensjoner (f.eks. SHA/helseutgifter DSD_SHA@DF_SHA): spesifiser BARE de strengt nødvendige filtrene i filters={} (typisk UNIT_MEASURE, FINANCING_SCHEME, PROVIDER, FUNCTION, MODE_PROVISION) — for mange simultane dimensjonskombinasjoner gir NoRecordsFound selv om kombinasjonen logisk finnes. La resterende dimensjoner komme gjennom og filtrer dem etterpå i pandas.
- UNIT_MEASURE-koder for prosentandeler: bruk `PA` (percent per annum) for år-over-år prosentvis endring — `PC` (percent) gir NoRecordsFound i prisdata. Eksempel HICP år-over-år: `filters={"FREQ": "M", "MEASURE": "CPI", "UNIT_MEASURE": "PA", "TRANSFORMATION": "GY"}`.

## Typiske spørsmål

- «Hva er arbeidsledigheten i Norge/Norden nå?» (harmonisert, sesongjustert)
- «Hvordan har ledigheten utviklet seg måned for måned i de nordiske landene?»
- «Sammenlign arbeidsledigheten i Norge, Sverige, Danmark, Finland og Island»

## Oppskrift: arbeidsledighet, nordiske land, månedlig sesongjustert (verifisert 2026-08-16)

```
# o = oecd.read("OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", years="2023:2026",
#     countries=["NOR","SWE","DNK","FIN","ISL"],
#     filters={"MEASURE": "UNE_LF_M", "UNIT_MEASURE": "PT_LF_SUB", "TRANSFORMATION": "_Z",
#              "ADJUSTMENT": "Y", "SEX": "_T", "AGE": "Y_GE15", "ACTIVITY": "_Z", "FREQ": "M"})
```

210 rader (5 land, alle måneder i vinduet); siste periode 2026-06 (NOR = 4,5 %).
`ADJUSTMENT="Y"` = sesongjustert (`"N"` = ujustert), `SEX="_T"` og
`AGE="Y_GE15"` = totalt, 15 år+, `FREQ="M"` = månedlig. Dette er de FERSKE
OECD-tallene (siste periode = inneværende år) — foretrekk denne fremfor et
frosset dbnomics-speil. `countries=[...]` tar liste (SDMX-ELLER, «+»-joint);
`filters={}` gjør IKKE det uansett dimensjon — bekreftet 2026-08-16 også for
ECB sin CURRENCY-dimensjon (liste der gir samme ValueError).

Forkastet i denne runden: en helse-BNP-oppskrift fra SHA-familien
(`OECD.ELS.HD,DSD_SHA@DF_SHA`) — selv med kun 5 filtre spesifisert OOM-er
probe-steget (~26 MB, «Filtrer på de sentrale dimensjonene FØR henting»)
fordi probe alltid henter `/all?lastNObservations=1` FØR filtrene
anvendes. Ikke løsbart fra brukersiden — utelatt.

## Om kilden

OECD — comparative statistics for OECD member and partner countries: economy, labour, health, and social policy via SDMX.

