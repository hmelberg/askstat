# UK Companies House

The UK company register — an open bulk file of ~5M companies, plus a
free-registration API for live lookups.

```yaml
- id: src-companies-house
  name: UK Companies House
  access: "open bulk + free registration for the API key"
  bulk: "download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-YYYY-MM-01.zip   # ~5M companies, ~400MB; scheme UNVERIFIED, try https first"
  gotcha: "basic bulk extract excludes officers/PSC data and financial-statement figures — financials need the separate XBRL bulk product"
```

The basic bulk extract excludes officers/PSC data and financial-statement
figures — financials need the separate XBRL bulk product.
