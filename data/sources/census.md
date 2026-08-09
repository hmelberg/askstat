---
id: census
navn: US Census Microdata API (ACS/CPS PUMS)
utgiver: U.S. Census Bureau
tillit: offisiell
tilgang: rest
base_url: https://api.census.gov/
cors: true
auth:
  type: api_key
  env: CENSUS_API_KEY
  plassering: query:key
tags: [mikro, usa]
order: 22
---

# US Census Microdata API (ACS/CPS PUMS)

## Kort

ekte personnivå-rader (PUMS) som JSON-matrise; variables.json (kodebok + vekter) er nøkkelfri og CORS-åpen, datakall krever nøkkel; vekt PWGTP + 80 replikatvekter — se guiden

## Guide

# census — US Census Microdata API, ACS/CPS PUMS (kildeguide)

kilde: api.census.gov + census.gov/data/developers, verifisert live 2026-08-06

## Hva dette er

EKTE mikrodata (én rad per person/husholdning) som ren REST-JSON — ingen
extract-kø som hos IPUMS:

- **ACS PUMS**: `/data/{år}/acs/acs1/pums` (1-års) og `/acs/acs5/pums`
  (5-års) — demografi, utdanning, inntekt, arbeid, bolig, helseforsikring.
- **CPS**: `/data/{år}/cps/basic/{mnd}` (månedlig arbeidsmarked) og
  supplementer (f.eks. `/cps/asec/mar` — inntekt/fattigdom).

## Nøkkel er nå OBLIGATORISK for datakall

Verifisert 2026-08-06: datakall uten nøkkel gir 302 → missing_key.html
(header `X-DataWebAPI-KeyError: 1`). Gratis nøkkel:
api.census.gov/data/key_signup.html. Nøkkelen er en site-nøkkel
(`CENSUS_API_KEY`) og injiseres av `/api/hent` — datakall går ALLTID via
proxyen:

```
# pums = ost.read("/api/hent?url=<url-enkodet api.census.gov-data-URL>")
```

**Metadata er fortsatt nøkkelfri og CORS-åpen** (verifisert:
`Access-Control-Allow-Origin: *`) — variables.json kan leses direkte:

```
# vars = ost.read("https://api.census.gov/data/2023/acs/acs1/pums/variables.json")
```

## Spørreform

```
https://api.census.gov/data/2023/acs/acs1/pums?get=AGEP,SEX,PWGTP&SCHL=24&for=state:36
```

- `get=` velger variabler (maks ~50); filtre som `SCHL=24` legges rett på;
  `for=state:36` (FIPS) velger geografi (state/PUMA-nivå — IKKE county).
- Svar: JSON-matrise av matriser; rad 0 er kolonnenavn — les med
  `pd.DataFrame(data[1:], columns=data[0])`; ALT er strenger, konverter
  numerisk eksplisitt.
- Ingen server-paging: en ufiltrert delstatsspørring gir alle radene
  (noen MB). Filtrer i URL-en, ikke klientside, når det er mulig.

Proxy-eksempel (doktorgradsutdannede i New York, alder/kjønn/vekt):

```
# ny = ost.read("/api/hent?url=https%3A%2F%2Fapi.census.gov%2Fdata%2F2023%2Facs%2Facs1%2Fpums%3Fget%3DAGEP%2CSEX%2CPWGTP%26SCHL%3D24%26for%3Dstate%3A36")
```

Verifisert live med nøkkel 2026-08-06: spørringen over ga 200 med 2 893
personrader. NB: filtervariablene (`SCHL`, `state`) echoes som EGNE
kolonner i svaret — header var `AGEP,SEX,PWGTP,SCHL,state`. Datakallet
sender også `Access-Control-Allow-Origin: *`.

## Kodebok og vekter (maskinlesbart!)

`variables.json` per datasett-årgang (verifisert: 525 variabler for 2023
ACS1 PUMS) gir label + verdikart per variabel (f.eks. `SCHL`: `24` =
«Doctorate degree»). Slå ALLTID opp verdikoder der før filtrering.

- Personvekt: `PWGTP`; husholdningsvekt: `WGTP` (bruk husholdningsfila).
- Replikatvekter `PWGTP1`–`PWGTP80` finnes som egne variabler
  (successive-difference-replication for standardfeil). For enkle andeler:
  vekt med PWGTP og si i svaret at estimatet er vektet; SE-beregning med
  replikatvekter er mulig men sjelden nødvendig i denne pipelinen.
- Geografi: kun state/PUMA i PUMS — kommune-/countyspørsmål kan IKKE
  besvares her; si det ærlig og pek på aggregert ACS i stedet.

## Feller

- Årgang står i STIEN — variabelnavn/verdier endres mellom årganger
  (sjekk variables.json for akkurat den årgangen du spør).
- 2020 ACS1 PUMS finnes ikke (pandemi-årgangen) — bruk 2019 eller 2021.
- Uten `CENSUS_API_KEY` i miljøet feiler datakall via `/api/hent` med
  klar feilmelding — metadata går fortsatt direkte (CORS-åpent). Si da
  ærlig at nøkkelen mangler i miljøet; ikke bygg svaret på kilden.
- **Nøkkel-aktiveringsfella (verifisert 2026-08-06):** en fersk nøkkel
  som IKKE er aktivert via lenken i Census' e-post gir 302 →
  `invalid_key.html` med header `X-DataWebAPI-KeyError: 1` — samme
  symptom som manglende nøkkel. Ser du dette: nøkkelen må aktiveres,
  ikke re-genereres — og aktiveringen tar et par minutter å propagere
  (målt: 302 → 200 innen ~2 min etter klikk).

## Etikk

Vis kun aggregater (andeler, snitt, krysstabeller) — aldri enkeltrader.
Siter «U.S. Census Bureau, ACS PUMS {årgang}» (evt. CPS {mnd/år}).

## Om kilden

US Census Bureau microdata API — person/household-level ACS and CPS survey rows (demographics, education, income, employment, housing, health insurance); requires a free API key.

