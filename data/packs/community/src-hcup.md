# HCUP — Healthcare Cost and Utilization Project (NIS/NEDS/KID/SID)

The largest all-payer hospital administrative data in the US —
diagnoses, procedures, charges/costs and length of stay across the
National Inpatient Sample, NEDS, KID and SID. Purchase only: account,
training, a signed DUA and a fee (cost not published, varies by
database-year).

```yaml
- id: src-hcup
  name: Healthcare Cost and Utilization Project (NIS/NEDS/KID/SID)
  provider: AHRQ
  content: "the largest all-payer hospital administrative data in the US — diagnoses, procedures, charges/costs, LOS"
  access: "purchase (account + training + signed DUA + fee) — cost not published, varies by database-year"
  free_aggregate_tool: https://datatools.ahrq.gov/hcupnet/
  weight_vars: [DISCWT, TRENDWT]
  gotcha: "NIS redesigned in 2012 from hospital-level to discharge-level sampling — use TRENDWT for series spanning the break"
```

When a purchase is not justified, HCUPnet (see `free_aggregate_tool`
above) gives pre-tabulated statistics with no purchase required. When
microdata is purchased, weight with `DISCWT`, and use `TRENDWT` instead
for any series spanning the 2012 NIS redesign (hospital-level to
discharge-level sampling).
