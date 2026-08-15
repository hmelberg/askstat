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

## Om kilden

WHO Global Health Observatory — global health indicators (mortality, disease burden, health systems) by country and year.

