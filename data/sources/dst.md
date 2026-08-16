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

## Typiske spørsmål

- Hvordan har Danmarks befolkning utviklet seg de siste årene?
- Hva er ledigheten i Danmark nå, og hvordan har den endret seg?
- Sammenlign dansk befolkning/ledighet med norske tall over tid.

## Oppskrift: Danmarks folkemengde over tid (verifisert 2026-08-16)

```python
import urllib.parse
url = "https://api.statbank.dk/v1/data/FOLK1A/CSV?" + urllib.parse.urlencode(
    {"OMRÅDE": "000", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT", "Tid": ">=2016K1"}
)
pd.read_csv(url, sep=";")
```

43 rader (kvartalsvis 2016K1–2026K3; siste = 2026K3: 6 031 699).
`OMRÅDE=000` er hele landet, `KØN=TOT`/`ALDER=IALT`/`CIVILSTAND=TOT` gir
totalen (utelates de, kommer én rad PER undergruppe i stedet). Tid tar
operatorer: `>=2016K1` (åpent intervall), `>`, eller `*` (alt, 75 rader
tilbake til 2008K1). FELLE: OMRÅDE/KØN har danske bokstaver i
parameternavnet — bygg URL-en med `urllib.parse.urlencode` (ikke
f-streng), ellers feiler `pd.read_csv` med `UnicodeEncodeError`.

## Oppskrift: dansk ledighet (verifisert 2026-08-16)

```python
import urllib.parse
url = "https://api.statbank.dk/v1/data/AUS07/CSV?" + urllib.parse.urlencode(
    {"YD": "NET", "SAESONFAK": "9", "Tid": ">=2024M01"}
)
pd.read_csv(url, sep=";")
```

30 rader (månedlig fra 2024M01; siste = 2026M06: 2,7 %). AUS07 er
sesongkorrigert ledighet; `YD=NET` (nettoledige) + `SAESONFAK=9`
(sesongkorrigert i pct. af arbejdsstyrken) gir DEN vanlige
ledighetsraten — `SAESONFAK=10` gir i stedet antall PERSONER, ikke
prosent. FELLE: tallene kommer som dansk komma i strengform (`"2,7"`) —
konverter med `.str.replace(",", ".").astype(float)` ved behov.

## Om kilden

Statistics Denmark (StatBank) — official Danish statistics: population, economy, labour, and other topics by region.

