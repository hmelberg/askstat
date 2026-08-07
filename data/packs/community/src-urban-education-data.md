# Urban Institute Education Data Portal

A unified open REST API over CCD, CRDC, IPEDS, College Scorecard, SAIPE
and NHGIS, licensed ODC-By v1.0. The practical programmatic entry point
for US education administrative data — prefer it over any single raw
NCES interface.

```yaml
- id: src-urban-education-data
  name: Urban Institute Education Data Portal
  kind: "unified REST API over CCD, CRDC, IPEDS, College Scorecard, SAIPE, NHGIS"
  access: "open, licence ODC-By v1.0"
  base: "https://educationdata.urban.org/api/v1/{topic}/{source}/{endpoint}/{year}/"
  note: "the practical programmatic entry point for US education admin data — prefer it over any single raw NCES interface"
```

Base URL shape is `{topic}/{source}/{endpoint}/{year}/` under
`educationdata.urban.org/api/v1/` — see IPEDS (id: src-ipeds) and College
Scorecard (id: src-college-scorecard) for two of the sources it unifies.
