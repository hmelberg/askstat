---
id: scb
navn: Statistikmyndigheten SCB (PxWebApi 2)
utgiver: SCB
tillit: offisiell
tilgang: pxweb
kind: pxweb
sprak: en
base_url: https://api.scb.se/ov0104/v2beta/api/v2/
sok_endepunkt: https://api.scb.se/ov0104/v2beta/api/v2/tables?query={q}&lang=sv
cors: true
join_nokler: [region, år, kön]
sporrings_url_mal: https://api.scb.se/ov0104/v2beta/api/v2/tables/{id}/data?valueCodes[{var}]={koder}&outputFormat=csv&lang=sv
tags: [makro, sverige]
order: 13
---

# Statistikmyndigheten SCB (PxWebApi 2)

## Kort

Verifisert 2026-07-23: søk (GET .../tables?query={q}&lang=sv|en) gir {"tables":[{id,label,firstPeriod,lastPeriod,...}]} — adapter-kompatibel; i motsetning til SSB virker /data på SAMME v2beta-sti (ingen v2/v2-beta-splitt); outputFormat=csv gir CSV direkte uten filter, og med valueCodes[dim]=kode når man vil begrense; dataendepunktet sender Access-Control-Allow-Origin: * (CORS OK, verifisert med curl -sI mot .../data); valueCodes-nøkler må være metadata-dimensjonskoder (f.eks. 'Alder', 'Kon', 'Tid' — fra /tables/{id}/metadata), IKKE søkeresultatets variableNames-etiketter (som er små bokstaver, f.eks. 'region', 'år', 'kön'); mangler obligatorisk dimensjon gir HTTP 400 'Missing selection for mandantory variable'.

## Verifisert (kildeutforskeren 2026-08-15)

- API-et avviser `lang=no` (400 Unsupported language; sv/en gir 200) —
  appen setter `lang=en` automatisk (sprak-feltet i registeret); skriver
  du URL-er manuelt: alltid eksplisitt `lang=en`/`sv`.
- Kjørt eksempel: `scb.read("TAB4552", indicators=["000000YE"],
  years="2024", filters={"TypAnsl": "60"})` — obligatoriske dimensjoner
  utover ContentsCode/Tid (her TypAnsl) MÅ velges (400 «Missing selection
  for mandantory variable» — skrivefeilen er SCBs egen).

## Typiske spørsmål

- Hvor mange innbyggere har Sverige (i dag / siste år)?
- Hvordan har Sveriges folkemengde utviklet seg de siste ti årene?
- Hvor stor er Sveriges befolkningsvekst fra ett år til et annet?

## Oppskrift: Sveriges folkmängd over tid (verifisert 2026-08-16)

```
# scb = ost.connect("scb")
# pop = scb.read("TAB4365", indicators=["000000LV"], filters={"Tid": "top(10)"})
```

10 rader (2016–2025; 2025 = 10 605 529). `TAB4365`
(«Befolkningsutvecklingen i riket efter kön») er DEN riktige tabellen for
nasjonal folkemengde over tid — ren nasjonal serie (ingen Region-dimensjon),
rekker 1749–2025; `000000LV` er ContentsCode for «Population» (ikke
Births/Deaths/Immigrations/…). `Kon` er eliminerbar og UTELATES her — det
gir totalen (menn+kvinner), ikke en feil.

## Om kilden

Statistics Sweden — official Swedish statistics: population, economy, labour, and other topics by region.

