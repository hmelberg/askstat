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
id: nada_family
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

## Dateno — cross-catalog search (verify before relying on it)

```yaml
id: dateno
name: Dateno
kind: cross-catalog dataset search engine
api_base: https://api.dateno.io/
auth: API key from my.dateno.io
scale: "19M+ dataset records indexed across thousands of catalogs (per the dateno-public repo)"
role: "discovery layer — indexes metadata and links back to the source portal; does not host files"
python_client: UNVERIFIED — no confirmed PyPI package; treat as REST-only
free_tier: UNVERIFIED — pricing page could not be read reliably
```

No registry adapter exists for Dateno. If the user has a key, probe
`https://api.dateno.io/` directly before building a query against it — the
docs page is JS-rendered and its exact contract was not independently
confirmed.

## dataportals-registry — find which catalog to query

```yaml
id: dataportals_registry
name: commondataio/dataportals-registry
kind: registry of PORTALS, not datasets
repo: https://github.com/commondataio/dataportals-registry
scale: "~13,877 catalog/portal records; 136 software-platform definitions, sliced by country x type"
bulk_files: [catalogs.jsonl, full.parquet, datasets.duckdb]
public_api: "announced but not shipped — consume the bulk files"
use: "answers 'find every microdata portal in country X' or 'which portals run NADA' — filter the bulk export by type=microdata or software=NADA"
```

## Government open-data portals

```yaml
- id: ckan
  kind: catalog software family
  api_pattern: "GET https://{portal}/api/3/action/package_search?q=<terms>&rows=10"
  other_actions: [package_show, resource_show, datastore_search]
  auth: none for read
  deployments: [catalog.data.gov, data.gov.uk, hundreds of national/city portals]
- id: socrata
  kind: catalog software family (built-in example: the cdc source)
  discovery_api: "GET https://api.us.socrata.com/api/catalog/v1?q=<terms>&limit=10"
  data_api: "GET https://{domain}/resource/{4x4_id}.json?$where=…   # SoQL"
  auth: "none required; free X-App-Token header avoids throttling"
  built_in_example: "cdc (search_catalog source='cdc') is a Socrata/SODA domain — same query shape works on any other Socrata portal you find via the discovery API"
  flow: "two steps — Discovery API tells you the hosting domain + resource id, then query that domain's SODA endpoint directly"
- id: data_europa
  name: data.europa.eu
  search_api: "https://data.europa.eu/api/hub/search/search?page=0&limit=100&q=<terms>"
  sparql: https://data.europa.eu/sparql
  metadata: DCAT-AP
  auth: none
```

## ML-oriented hubs — use the built-in adapters where they exist

```yaml
- id: huggingface
  built_in: "hf (search_catalog source='hf') — search + typed preview + auto-converted parquet, all CORS-open, no key. Prefer this over documenting the raw datasets-server.huggingface.co API by hand."
  caveat: "much of the content is unofficial copies of primary data — prefer primary sources and check licence/provenance before citing"
- id: kaggle
  built_in: "kaggle (search_catalog source='kaggle') — needs a user key for private/competition data; open datasets work keyless. Catalog search verified keyless+CORS-open 2026-08-06."
  caveat: "downloads are often uncredited re-uploads of someone else's data — prefer the primary source when one exists"
- id: openml
  note: "see the research-repositories pack — OpenML is documented there alongside Dataverse/Zenodo/Figshare, no adapter here to avoid duplication"
- id: uci
  name: UCI Machine Learning Repository
  landing: https://archive.ics.uci.edu/
  packages: {python: [ucimlrepo]}
  use: "classic benchmark datasets for teaching examples, not primary statistical sources"
```

## Social science archives (metadata layer — data usually lives elsewhere)

```yaml
- id: icpsr
  name: ICPSR
  scale: "tens of thousands of studies, 250,000+ files"
  ⚠_deprecation: "legacy OAI-PMH/DDI-XML bulk export was RETIRED, guaranteed only 'until at least August 2026' — may already be gone. Do not build new integrations on it."
  current_api: https://icpsr.github.io/metadata/icpsr_metadata_api/
  access: "free account + click-through for most studies; restricted-use needs a DUA or enclave"
- id: uk_data_service
  name: UK Data Service
  role: "UK national social/economic microdata archive"
  access_tiers: [End User Licence (free registration), Special Licence, Secure Lab]
  note: "non-UK researchers CAN register"
- id: gesis
  name: GESIS
  holdings: [ISSP, Eurobarometer, EVS, ALLBUS, German EU-SILC access]
  note: "no usable public search API (bot-walled) — see the europe-surveys pack for the fuller GESIS/CESSDA picture"
- id: cessda
  built_in: "cessda (search_catalog source='cessda') is already an adapter — see the europe-surveys pack. It federates UKDS/GESIS/Sikt/DANS discovery into one search; download still happens at the origin archive."
```

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
