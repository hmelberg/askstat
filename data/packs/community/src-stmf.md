# Short-Term Mortality Fluctuations (STMF)

Weekly all-cause deaths by country/sex/broad age group — open, no login
(unlike core HMD). Use for excess-mortality and mortality-shock
monitoring.

```yaml
- id: src-stmf
  name: Short-Term Mortality Fluctuations
  kind: AGGREGATE — weekly all-cause deaths by country/sex/broad age group
  access: OPEN, no login (unlike core HMD)
  bulk_csv: https://www.mortality.org/File/GetDocument/Public/STMF/Outputs/stmf.csv
  use: excess-mortality and mortality-shock monitoring
  gotcha: "weekly data provisional and revised; age groups coarse"
```

Weekly figures are provisional and revised, and age groups are coarse.
