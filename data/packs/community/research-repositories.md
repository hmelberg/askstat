# Research data repositories (Dataverse, Zenodo, OpenML, Figshare)

Use this pack when a question needs **replication data behind a published
study** or long-tail research datasets that official statistics don't
cover. All claims live-verified 2026-08-06.

## Dataverse (Harvard + ~100 installations) — best content, needs proxy

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

## Zenodo — cheapest to use (fully CORS-open)

~670k dataset-type records (CERN-run, DOI-first). Search AND file
downloads are CORS-open with no auth — direct ost.read works:

- `https://zenodo.org/api/records?q=<terms>&type=dataset&size=10&access_status=open`
- Each hit carries `files[]` with direct `/api/records/{id}/files/{name}/content`
  URLs and sizes.
- Rate limit ~30 searches/min; quality varies a lot (many hits are PDFs
  or zips) — filter on file extension before promising data.

## OpenML — ML benchmarks with parquet + variable metadata

6,400 active datasets, overwhelmingly ML benchmarks (UCI classics,
Kaggle mirrors) — near-zero primary statistical sources, so use only for
classic example datasets. Fully CORS-open, keyless:

- Exact-name lookup: `https://www.openml.org/api/v1/json/data/list/data_name/{name}/limit/5`
  (free-text search does NOT exist — wrong name → 412).
- `data/{id}` → metadata incl. a direct `parquet_url` (CORS-open,
  pandas-ready); `data/features/{id}` → per-variable types/values.

## Figshare — mostly skip

Article supplements (figures, PDFs, .sav) — search API is POST-only and
missing CORS headers; downloads work but signed URLs expire in ~10 s.
Prefer Zenodo/Dataverse; mention Figshare only if a specific DOI points
there.

## Honesty rules

- Repository datasets are researcher uploads: check license and
  provenance, prefer primary sources, and name the uploader/DOI in the
  answer.
- A search hit is not coverage — probe the actual file URL before
  writing analysis code.
