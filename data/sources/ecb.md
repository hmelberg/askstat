---
id: ecb
navn: ECB Data Portal (SDMX)
utgiver: Den europeiske sentralbanken
tillit: offisiell
tilgang: sdmx
kind: sdmx
base_url: https://data-api.ecb.europa.eu/service/data/
cors: true
join_nokler: [TIME_PERIOD]
tags: [makro]
order: 8
---

# ECB Data Portal (SDMX)

## Kort

SDMX 2.1; ressurssti = <flow>/<nøkkel> (f.eks. EXR/D.USD.EUR.SP00.A); komma-formen fra search_catalog (ECB,EXR) virker også (målt 2026-08-01). Tid og utvalg skrives med det kanoniske vokabularet (years=/countries=/filters={}) — ALDRI startPeriod= som kwarg (parseren avviser den; years= oversettes til den). Verifisert 2026-07-25: 406 på sdmx-csv-Accept — adapterens format=csvdata-fallback tar den. CORS *.

## Typiske spørsmål

- «Hva er dollarkursen (EUR/USD) i dag/nå?»
- «Hvordan har eurokursen mot dollar utviklet seg over tid?»
- «Hva er ECBs innskuddsrente (styringsrente) nå?»

## Oppskrift: dagskurs euro/dollar (verifisert 2026-08-16)

```
# valuta = ecb.read("EXR/D.USD.EUR.SP00.A", years="2026:2026")
```

158 rader (handledager i 2026); siste = 2026-08-14: 1,1567 USD per EUR.
Nøkkelen `D.USD.EUR.SP00.A` = FREQ.CURRENCY.CURRENCY_DENOM.EXR_TYPE.EXR_SUFFIX
(dag, USD mot EUR, spotkurs, gjennomsnitt). Samme resultat med
`filters={"FREQ": "D", "CURRENCY": "USD", "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"}`
— men filters tar KUN én kode per dimensjon; en liste (f.eks. for flere
valutaer samtidig) gir ValueError, bekreftet også for CURRENCY.

## Oppskrift: ECBs innskuddsrente (verifisert 2026-08-16)

```
# rente = ecb.read("FM/D.U2.EUR.4F.KR.DFR.LEV", years="2023:2026")
```

1323 rader (dagsobservasjoner); siste = 2026-08-15: 2,25 %. Nøkkelen
`D.U2.EUR.4F.KR.DFR.LEV` = FREQ.REF_AREA.CURRENCY.PROVIDER_FM.INSTRUMENT_FM.
PROVIDER_FM_ID.DATA_TYPE_FM — dette ER innskuddsrenten (DFR), ikke
utlånsrenten (MLF) eller styringsrenten (MRO); LEV = nivå (ikke endring).

## Om kilden

European Central Bank Data Portal — euro-area and EU monetary, financial, and exchange-rate time series via SDMX.

