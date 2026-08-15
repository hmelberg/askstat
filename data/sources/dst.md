---
id: dst
navn: Danmarks Statistik (StatBank API)
utgiver: Danmarks Statistik
tillit: offisiell
tilgang: rest
kind: dst
base_url: https://api.statbank.dk/v1/
cors: true
join_nokler: [TID (år/kvartal), OMRÅDE]
sporrings_url_mal: https://api.statbank.dk/v1/data/{tabell}/CSV?{var}={koder}
tags: [makro, danmark]
order: 15
---

# Danmarks Statistik (StatBank API)

## Kort

Verifisert 2026-07-23: GET /v1/data/{tabell}/CSV med variabelfiltre som query-parametre (f.eks. ?Tid=2024K1) gir CSV med ; som skilletegn; /v1/tableinfo/{tabell}?format=JSON gir variabler og koder; /v1/tables?format=JSON lister alle tabeller ({id,text,firstPeriod,lastPeriod,variables}) — ingen søkeadapter, bruk tabellisten som katalog.

**Verifisert eksempel (2026-08-15):**
`pd.read_csv("https://api.statbank.dk/v1/data/FOLK1A/CSV?Tid=2009K1", sep=";")`
— FOLK1A er befolkningstabellen; gyldige Tid-koder står i
`/v1/tableinfo/FOLK1A?format=JSON`.

## Om kilden

Statistics Denmark (StatBank) — official Danish statistics: population, economy, labour, and other topics by region.

