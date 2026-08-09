---
id: src-cdc-wonder
name: CDC WONDER
kind: query API returning AGGREGATED/TABULATED cells (suppressed <10), NOT microdata
api_method: POST only, entire query as an XML document in a request_xml field, response as XML
api_base: https://wonder.cdc.gov/controller/datarequest/{DATABASE_ID}
rate_limit: recommended max 1 query / 2 minutes for automated use
gotcha: no OpenAPI spec, no structured registry of database IDs — confirm the current mortality DB id at wonder.cdc.gov/ucd-icd10.html before querying
---

# CDC WONDER

A query API that returns aggregated, tabulated cells (suppressed below
10), NOT microdata — use it for population-level mortality/natality rates
and counts, not record-level analysis. For genuine record-level birth and
death files, see NVSS instead.



There is no OpenAPI spec and no structured registry of database IDs —
confirm the current mortality database id at wonder.cdc.gov/ucd-icd10.html
before querying, and keep automated use to roughly one query every 2
minutes. See the US health surveys overview pack for the standing
CDC/NCHS 2025-26 caveat — WONDER download infrastructure is confirmed live
as of Aug 2026. For record-level birth/death data instead of tabulated
cells, use NVSS (id: src-nvss).

