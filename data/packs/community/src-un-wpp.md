# UN World Population Prospects (WPP)

Aggregate population estimates 1950-2023 plus projections to 2100, open
access via API or bulk files.

```yaml
- id: src-un-wpp
  name: UN World Population Prospects
  kind: AGGREGATE — estimates 1950-2023 + projections 2024-2100
  access: open
  api_base: https://population.un.org/dataportalapi/api/v1/
  gotcha: "CSV responses begin with a 'sep=|' header line to skip; prefer the bulk files/wpp2024 package for a vintage-consistent full indicator set"
```

CSV responses from the API begin with a `sep=|` header line to skip;
prefer the bulk files or the wpp2024 package for a vintage-consistent
full indicator set.
