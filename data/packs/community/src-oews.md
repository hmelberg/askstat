# Occupational Employment and Wage Statistics (OEWS)

Occupation × industry × area wage and employment cells, open annual
download.

```yaml
- id: src-oews
  name: Occupational Employment and Wage Statistics
  unit: occupation × industry × area cell
  access: open — https://www.bls.gov/oes/special-requests/oesm{YY}all.zip
  gotcha: "SOC revision years (2010, 2018) and OMB metro redefinitions break the series"
```

SOC revision years (2010, 2018) and OMB metro-area redefinitions break
the series — flag the break rather than pooling silently across it.
