# Quarterly Census of Employment and Wages (QCEW)

Near-census establishment employment and wage data from unemployment-
insurance wage records — covers ~95% of US jobs. Open CSV slices by
industry, area and size.

```yaml
- id: src-qcew
  name: Quarterly Census of Employment and Wages
  unit: establishment (near-census from UI wage records, ~95% of US jobs)
  access: open — CSV slices by industry/area/size at data.bls.gov/cew/data/api/
  gotcha: "excludes self-employed, some agricultural/railroad/most military workers; small county cells suppressed"
```

Excludes the self-employed, some agricultural/railroad workers and most
military workers; small county cells are suppressed.
