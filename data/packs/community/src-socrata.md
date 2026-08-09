---
id: src-socrata
kind: "catalog software family (built-in example: the cdc source)"
discovery_api: GET https://api.us.socrata.com/api/catalog/v1?q=<terms>&limit=10
data_api: GET https://{domain}/resource/{4x4_id}.json?$where=…   # SoQL
auth: none required; free X-App-Token header avoids throttling
built_in_example: cdc (search_catalog source='cdc') is a Socrata/SODA domain — same query shape works on any other Socrata portal you find via the discovery API
flow: two steps — Discovery API tells you the hosting domain + resource id, then query that domain's SODA endpoint directly
---

# Socrata

The catalog software family behind SODA/Socrata open-data portals — the
`cdc` registry source in this app is a Socrata domain, and the same query
shape works on any other Socrata portal found via the discovery API.
Open, no key required (a free X-App-Token header avoids throttling).



Two-step flow: the Discovery API tells you which domain and 4x4 resource
id hold the data, then you query that domain's own SODA endpoint with a
`$where` SoQL filter directly.

