---
id: fred
navn: FRED (St. Louis Fed)
utgiver: Federal Reserve
tillit: etablert
tilgang: rest
base_url: https://api.stlouisfed.org/fred/
cors: false
join_nokler: [date]
sporrings_url_mal: https://api.stlouisfed.org/fred/series/observations?series_id={id}&file_type=json
auth:
  type: api_key
  env: FRED_API_KEY
  plassering: query:api_key
tags: [makro]
order: 6
---

# FRED (St. Louis Fed)

## Kort

krever api_key (injiseres av /api/hent); file_type=json

**Nøkkelfri lesing (verifisert 2026-08-15, 943 rader):**
`pd.read_csv("https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE")`
— fredgraph-formen trenger ingen nøkkel (CORS varierer: stol på proben,
proxy ved målt cors:false). API-et under base_url krever api_key
(injiseres av /api/hent).

## Typiske spørsmål

- Hvordan har amerikansk inflasjon utviklet seg de siste årene?
- Hva er ledigheten i USA nå/historisk?
- Sammenlign amerikansk KPI og arbeidsledighet over tid.

## Oppskrift: amerikansk inflasjon og ledighet (verifisert 2026-08-16)

```
# usa = ost.read("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL,UNRATE")
```

955 rader, kolonner `observation_date, CPIAUCSL, UNRATE` (to serier i
ett nøkkelfritt kall — komma i `id=` holder). Siste måned 2026-07:
UNRATE = 4,1 %. CPIAUCSL er KPI-NIVÅET, ikke inflasjonsraten — regn
tolvmånedersvekst selv: `usa["CPIAUCSL"].pct_change(12) * 100` gir
3,3 % for 2026-07. Kolonnenavnet er alltid seriekoden.

## Om kilden

FRED (Federal Reserve Bank of St. Louis) — US and international macroeconomic and financial time series.

