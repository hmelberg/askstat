# Research data repositories (Dataverse, Zenodo, OpenML, Figshare)

Use this pack when a question needs **replication data behind a published
study** or long-tail research datasets that official statistics don't
cover. All claims live-verified 2026-08-06.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **Dataverse** (id: src-dataverse) — Harvard + ~100 installations, ~300k datasets, dominated by social-science replication data; needs a CORS proxy, expect 403s on restricted files.
- **Zenodo** (id: src-zenodo) — ~670k dataset-type records, DOI-first, fully CORS-open with no auth; the cheapest of the four to use.
- **OpenML** (id: src-openml) — ML benchmark repository, ~6,400 datasets, fully CORS-open and keyless; use only for classic example datasets, not primary statistical sources.
- **Figshare** (id: src-figshare) — article supplements (figures, PDFs, .sav); mostly skip — POST-only/no-CORS search API, signed download URLs expire in ~10 s.

## Honesty rules

- Repository datasets are researcher uploads: check license and
  provenance, prefer primary sources, and name the uploader/DOI in the
  answer.
- A search hit is not coverage — probe the actual file URL before
  writing analysis code.
