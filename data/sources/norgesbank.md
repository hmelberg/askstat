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

## Om kilden

Norges Bank — Norway's central bank statistics: exchange rates, interest rates, and other Norwegian monetary/financial series via SDMX.

