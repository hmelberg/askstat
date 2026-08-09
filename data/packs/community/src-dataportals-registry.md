---
id: src-dataportals-registry
name: commondataio/dataportals-registry
kind: registry of PORTALS, not datasets
repo: https://github.com/commondataio/dataportals-registry
scale: ~13,877 catalog/portal records; 136 software-platform definitions, sliced by country x type
bulk_files: [catalogs.jsonl, full.parquet, datasets.duckdb]
public_api: announced but not shipped — consume the bulk files
use: answers 'find every microdata portal in country X' or 'which portals run NADA' — filter the bulk export by type=microdata or software=NADA
---

# dataportals-registry

A registry of data PORTALS, not datasets — ~13,877 catalog/portal records
plus 136 software-platform definitions, sliced by country and type.
Answers "find every microdata portal in country X" or "which portals run
NADA". No public API yet; consume the bulk export files directly. Open.



Filter the bulk export (`catalogs.jsonl` / `full.parquet` / `datasets.duckdb`)
by `type=microdata` or `software=NADA` to answer either question.

