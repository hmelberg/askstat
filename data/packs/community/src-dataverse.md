---
id: src-dataverse
name: Dataverse
kind: research-data repository (~300k datasets, Harvard + ~100 installations)
access: open search; many files access-restricted
gotcha: needs a CORS proxy; strong on social-science replication data
---

# Dataverse

Harvard Dataverse (plus ~100 other installations) is the biggest and
best-content research-data repository — ~300k datasets, dominated by
social-science replication data behind published studies — but needs a
CORS proxy and many files are access-restricted.

~300k datasets on Harvard Dataverse alone, dominated by social-science
replication data. No CORS on the API → always via /api/hent.

- Search: `https://dataverse.harvard.edu/api/search?q=<terms>&type=dataset&per_page=10`
  (add `&type=file` to get file ids + sizes; filter
  `fq=fileTypeGroupFacet:"Tabular Data"`).
- Files: `https://dataverse.harvard.edu/api/access/datafile/{id}` — open
  files redirect to S3 (CORS-open); ingested tabular files arrive as
  clean tab-separated text (`?format=original` for the original
  Stata/SPSS file).
- **Expect 403s**: many replication files are restricted — probe first,
  degrade honestly, never assume access.
