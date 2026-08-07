# IPUMS International

True microdata — harmonised individual/household census records for 90+
countries, covering census rounds from the 1800s to 2020 (most series
start in the 1960s). This is a different IPUMS product from the
survey-harmonization use of the ipums registry source (NHIS/MEPS etc. —
see the us-health-surveys pack); it shares the same stateless extract
API. Registration required, and some extracts need extra approval.

```yaml
- id: src-ipums-international
  name: IPUMS International
  kind: TRUE MICRODATA — harmonised individual/household census records
  coverage: "90+ countries, 1800s-2020 census rounds; most from the 1960s"
  access: registration; some extracts need extra approval
  api: "same extract API as the rest of IPUMS — see the us-health-surveys pack for the flow"
  gotcha: "not every country releases individual-level microdata — some are household-only or sample-restricted; fine geography may be a restricted extract"
```

Not every country releases individual-level microdata — some are
household-only or sample-restricted, and fine geography may require a
restricted extract.
