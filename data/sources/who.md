---
id: who
navn: WHO Global Health Observatory (OData)
utgiver: WHO
tillit: offisiell
tilgang: rest
base_url: https://ghoapi.azureedge.net/api/
cors: true
join_nokler: [SpatialDim (ISO3), TimeDim (år)]
tags: [makro]
order: 4
---

# WHO Global Health Observatory (OData)

## Kort

OData: /api/{INDIKATORKODE}?$filter=...; JSON med value-liste

**Verifisert eksempel (2026-08-15, 66 rader):**
`GET {base}WHOSIS_000001?$filter=SpatialDim eq 'NOR'` (forventet
levealder, Norge) — JSON-svarets `value`-liste er radene.

## Typiske spørsmål

- Hva er forventet levealder i Norge sammenlignet med Sverige/Danmark?
- Hvordan har norsk forventet levealder utviklet seg over tid?

## Oppskrift: forventet levealder Norge vs naboland (verifisert 2026-08-16)

```python
import urllib.parse
filt = "(SpatialDim eq 'NOR' or SpatialDim eq 'SWE' or SpatialDim eq 'DNK') and Dim1 eq 'SEX_BTSX'"
url = "https://ghoapi.azureedge.net/api/WHOSIS_000001?" + urllib.parse.urlencode({"$filter": filt})
df = pd.read_json(url)
rows = pd.json_normalize(df["value"])
```

66 rader (2000–2021, 3 land × 22 år). Siste FELLES år er 2021 (WHO har
etterslep, ikke 2026-tall ennå): NOR=82,88, SWE=82,66, DNK=81,18 år.
`Dim1 eq 'SEX_BTSX'` velger begge kjønn samlet (utelates det, kommer 3
rader per land/år — MLE/FMLE/BTSX). HOVEDFELLE: `pd.read_json(url)`
alene gir KUN 2 kolonner (`@odata.context`, `value`) — selve dataene
ligger som ett dict per rad inni `value`-kolonnen og MÅ flates ut med
`pd.json_normalize(df["value"])` før bruk.

## Om kilden

WHO Global Health Observatory — global health indicators (mortality, disease burden, health systems) by country and year.

