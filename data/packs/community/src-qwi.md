# Quarterly Workforce Indicators (QWI)

Census Bureau establishment × demographic-group cell data (hires,
separations, earnings) via a free-key API. Cells, not individual worker
records.

```yaml
- id: src-qwi
  name: Quarterly Workforce Indicators
  unit: establishment × demographic-group CELL, not individual records
  api_endpoints: {sex_age: "https://api.census.gov/data/timeseries/qwi/sa", sex_education: "…/qwi/se", race_ethnicity: "…/qwi/rh"}
  auth: Census API key (free)
  gotcha: "cells suppressed/noise-infused when small; state coverage start years differ"
```

Cells are suppressed or noise-infused when small, and state coverage
start years differ — check the specific state/quarter before pooling.
