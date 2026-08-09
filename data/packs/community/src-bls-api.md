---
id: src-bls-api
name: BLS Public Data API v2
base: https://api.bls.gov/publicAPI/v2/timeseries/data/
auth: registrationkey in the POST body (free)
limits: 500 queries/day, 50 series/request, 20 years of history
---

# BLS Public Data API v2

The general-purpose Bureau of Labor Statistics time-series API — the
common access layer behind CPS, QCEW, OEWS and other BLS series. Open
with a free registration key.



Limits: 500 queries/day, 50 series/request, 20 years of history per
request.

```python
import requests
r = requests.post("https://api.bls.gov/publicAPI/v2/timeseries/data/",
    json={"seriesid": ["CES0000000001"], "startyear": "2020", "endyear": "2026",
          "registrationkey": "YOUR_KEY"}, timeout=60)
```

