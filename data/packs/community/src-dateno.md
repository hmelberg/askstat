---
id: src-dateno
name: Dateno
kind: cross-catalog dataset search engine
api_base: https://api.dateno.io/
auth: API key from my.dateno.io
scale: 19M+ dataset records indexed across thousands of catalogs (per the dateno-public repo)
role: discovery layer — indexes metadata and links back to the source portal; does not host files
python_client: UNVERIFIED — no confirmed PyPI package; treat as REST-only
free_tier: UNVERIFIED — pricing page could not be read reliably
---

# Dateno

A cross-catalog dataset search engine indexing ~19M dataset records across
thousands of catalogs — a discovery layer that links back to the source
portal, it does not host files itself. Requires an API key from
my.dateno.io. No registry adapter exists for this in the app.



If the user has a key, probe `https://api.dateno.io/` directly before
building a query against it — the docs page is JS-rendered and its exact
contract was not independently confirmed.

