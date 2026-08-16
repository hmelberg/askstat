---
id: norgesbank
navn: Norges Bank (SDMX)
utgiver: Norges Bank
tillit: offisiell
tilgang: sdmx
base_url: https://data.norges-bank.no/api/data/
cors: true
join_nokler: [TIME_PERIOD]
kind: sdmx
tags: [makro, norge]
order: 7
---

# Norges Bank (SDMX)

## Kort

SDMX 2.1; ressurssti = <flow>/<nøkkel> (f.eks. EXR/B.USD.NOK.SP); komma-formen fra search_catalog (NB,EXR) virker også (målt 2026-08-01). Tid og utvalg skrives med det kanoniske vokabularet (years=/countries=/filters={}) — ALDRI startPeriod= som kwarg (parseren avviser den; years= oversettes til den). Verifisert 2026-07-25: kun Accept application/vnd.sdmx.data+csv;labels=id gir komma-CSV med rene koder — format=csv gir semikolon+labels, Accept text/csv gir XML. Adapteren håndterer dette.

**Verifisert eksempel (2026-08-16, 502 rader):**
`norgesbank.read("EXR", years="2024:2025", filters={"FREQ": "B",
"BASE_CUR": "USD", "QUOTE_CUR": "NOK", "TENOR": "SP"})` — liste-verdier
i filters avvises med instruktiv feil (én kode per dimensjon).

## Typiske spørsmål

- «Hvordan har styringsrenta utviklet seg?» (IR/KPRA)
- «Hva er kronekursen mot dollar/euro over tid?» (EXR)

## Oppskrift: styringsrenta (verifisert 2026-08-16)

```
# nb = ost.connect("norgesbank")
# rente = nb.read("IR", years="2021:2026", filters={"FREQ": "M", "INSTRUMENT_TYPE": "KPRA", "TENOR": "SD"})
```

67 rader (månedssnitt; 2026-07 = 4,25). `INSTRUMENT_TYPE="KPRA"` ER
styringsrenta (foliorenten); `FREQ="B"` gir dagsobservasjoner i stedet.
NB: filters tar ÉN kode per dimensjon for sdmx-kilder — aldri liste.

## Om kilden

Norges Bank — Norway's central bank statistics: exchange rates, interest rates, and other Norwegian monetary/financial series via SDMX.

