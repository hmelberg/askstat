# Data catalogs and discovery engines

Use this pack when a question is "does data on X exist, and where" rather
than "give me a value" — or when the user names a catalog directly (NADA,
Dateno, ICPSR, CKAN, Socrata, Hugging Face, Kaggle). It is a map of *how to
search*, not a source of values itself. For datasets this pack helps you
find, always fetch through the app's own tools (`search_catalog`, `/api/hent`,
or `web_fetch`) — never claim numbers from a catalog hit alone.

## The three-tier mental model

1. **Registries of portals** — tell you which catalog to query next, not
   what data exists (`dataportals-registry`).
2. **Cross-catalog search engines** — index metadata from many catalogs and
   link back to the source (Dateno, Google Dataset Search, DataCite).
3. **Catalogs with download-capable APIs** — where you actually get files
   (NADA, CKAN, Socrata, Dataverse, Zenodo, Hugging Face, Kaggle).

A search hit from tier 1/2 is never a downloadable file — follow the link to
the source portal and resolve the actual file there.

## NADA — the microdata catalog standard (use the built-in sources first)

```yaml
id: data-catalogs
name: NADA (IHSN cataloguing software) — the shared API behind dozens of catalogs
maintainer: International Household Survey Network + World Bank
api_shape: "GET /index.php/api/catalog?sk=<keywords>&ps=<page size>&from=&to=&country_iso3="
response_shape: "{result: {rows: [{id, idno, doi, type, title, nation, year_start, year_end, varcount, url}]}}"
metadata_standard: DDI Codebook (XML)
built_in_instances:
  wbmicro: "World Bank Microdata Library — search_catalog(source='wbmicro'). 7,000+ surveys, full variable dictionaries free; data files login-gated."
  ihsn: "IHSN Central Data Catalog — search_catalog(source='ihsn'). ~5,400 surveys aggregated from national archives. TRAP: server-side fetch (search_catalog//api/hent) FAILS against this host (TLS chain Deno cannot verify) — use direct browser ost.read (CORS-open) instead, never the proxy."
other_known_instances: "ILO (microdata.ilo.org), FAO, UNHCR, WHO NCD/STEPS, and dozens of national statistical offices — NO adapter for these. Same API shape as wbmicro/ihsn; query them directly with web_fetch/probe against '<host>/index.php/api/catalog?sk=...' if the user names one specifically."
```

**Always read the per-dataset access field** (`open` / `direct` / `public use`
/ `licensed` / `data enclave`) before promising a download — the catalog is
candid about this and exposes it in metadata. wbmicro and ihsn cover the same
software family the World Bank/ILO/FAO/UNHCR/WHO STEPS run — see the
`global-surveys` pack for wbmicro in a development-survey context.

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **Dateno** (id: src-dateno) — cross-catalog dataset search engine, ~19M records indexed, API key required, discovery layer only (does not host files).
- **dataportals-registry** (id: src-dataportals-registry) — registry of ~13,877 data portals (bulk files, no public API yet); finds which catalog to query.
- **CKAN** (id: src-ckan) — catalog software family behind data.gov, data.gov.uk and hundreds of other government portals; open, no key.
- **Socrata** (id: src-socrata) — catalog software family behind cdc and other SODA portals; open, no key, X-App-Token optional.
- **data.europa.eu** (id: src-data-europa) — EU open-data portal search + SPARQL over DCAT-AP metadata; open, no key.
- **OpenML** (id: src-openml) — ML benchmark dataset repository, CORS-open, keyless; classic example datasets, not primary statistical sources.
- **UCI Machine Learning Repository** (id: src-uci) — classic benchmark datasets for teaching examples, not primary statistical sources.
- **ICPSR** (id: src-icpsr) — tens of thousands of social-science studies, 250,000+ files; free account + click-through, restricted-use needs a DUA or enclave.

## Other sources (no separate pack)

- Hugging Face Hub — registry source, see the hf source guide; the built-in `hf` adapter (search_catalog source='hf') gives search, typed preview and auto-converted parquet, all CORS-open, no key, and is preferred over hand-rolling the raw datasets-server API. Much of the content is unofficial copies of primary data — prefer primary sources and check licence/provenance before citing.
- Kaggle — registry source; the built-in `kaggle` adapter (search_catalog source='kaggle') needs a user key for private/competition data, but open datasets work keyless — catalog search verified keyless and CORS-open as of 2026-08-06. Downloads are often uncredited re-uploads of someone else's data — prefer the primary source when one exists.
- CESSDA — registry source, see the cessda source guide; the built-in `cessda` adapter (also detailed in the europe-surveys pack) federates UKDS/GESIS/Sikt/DANS discovery into one search — download still happens at the origin archive.
- UK Data Service — UK national social/economic microdata archive; access tiers: End User Licence (free registration), Special Licence, Secure Lab. Non-UK researchers can register.
- GESIS (general holdings) — ISSP, Eurobarometer, EVS, ALLBUS, German EU-SILC access; no usable public search API (bot-walled). See the europe-surveys pack for the fuller GESIS/CESSDA picture.

## Practical rules

- **Know the tier before choosing a strategy.** "Find household survey
  microdata for country X" → try the NADA-based sources (wbmicro, ihsn)
  first. "Find any dataset about X" → Dateno or DataCite. "Find a portal in
  a specific country" → dataportals-registry.
- **Auth splits into three groups**: fully open read (CKAN, Socrata
  discovery, data.europa.eu, NADA search), free key required (hf, kaggle,
  Dateno), registration plus a use agreement before *any* download (ICPSR,
  UK Data Service, most restricted NADA studies).
- **Never treat a search hit as a downloadable file.** Follow the link to
  the source portal and resolve the actual file before writing analysis code.
- **Prefer the built-in adapters** (wbmicro, ihsn, cessda, hf, kaggle, cdc)
  over hand-rolling the same API from this pack's raw endpoints — they are
  already wired through `search_catalog`/`/api/hent`.
