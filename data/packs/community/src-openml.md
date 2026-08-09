---
id: src-openml
name: OpenML
scale: 6,400 active datasets, overwhelmingly ML benchmarks (UCI classics, Kaggle mirrors) — near-zero primary statistical sources
use: classic example datasets only, not primary statistical sources
access: fully CORS-open, keyless
lookup_api: https://www.openml.org/api/v1/json/data/list/data_name/{name}/limit/5
gotcha: free-text search does NOT exist — wrong name gives a 412
data_api: data/{id} -> metadata incl. a direct parquet_url (CORS-open, pandas-ready); data/features/{id} -> per-variable types/values
note: no search_catalog adapter — use the lookup/data APIs above directly
---

# OpenML

An ML benchmark dataset repository — 6,400 active datasets, overwhelmingly
ML benchmarks (UCI classics, Kaggle mirrors) with near-zero primary
statistical sources. Use only for classic example/teaching datasets, not
substantive analysis. Fully CORS-open, keyless.



Lookup is by exact name only (`data_name/{name}`) — there is no free-text
search, so an unrecognised name returns a 412 rather than an empty result
list. Once you have an id, `data/{id}` returns metadata including a direct
`parquet_url`, and `data/features/{id}` gives per-variable types/values.

