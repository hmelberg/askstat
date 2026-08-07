# Business Dynamics Statistics (BDS)

Open establishment/firm entry-exit-and-flow counts by age, size, industry
and geography, 1978-2023 — the public derivative of the restricted
Longitudinal Business Database (see LBD, enclave-only).

```yaml
- id: src-bds
  name: Business Dynamics Statistics
  unit: establishment/firm counts and flows by age, size, industry, state/metro
  years: 1978-2023
  access: open — public derivative of the restricted LBD
  gotcha: "firm age topcoded; NAICS revision breaks at 1997/2002/2007/2012/2017"
```

Firm age is topcoded, and NAICS revisions break the series at
1997/2002/2007/2012/2017 — flag the break rather than pooling silently
across it.
