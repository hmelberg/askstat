# Zenodo

Zenodo (CERN-run, DOI-first) is the cheapest of the research-data
repositories to use — ~670k dataset-type records, fully CORS-open with
no auth, so direct ost.read works without a proxy.

~670k dataset-type records (CERN-run, DOI-first). Search AND file
downloads are CORS-open with no auth — direct ost.read works:

- `https://zenodo.org/api/records?q=<terms>&type=dataset&size=10&access_status=open`
- Each hit carries `files[]` with direct `/api/records/{id}/files/{name}/content`
  URLs and sizes.
- Rate limit ~30 searches/min; quality varies a lot (many hits are PDFs
  or zips) — filter on file extension before promising data.
