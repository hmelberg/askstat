# NVSS — National Vital Statistics System (natality/mortality public-use files)

Record-level US birth (~3.6M/yr) and death (~3.3M/yr) data — one row per
event. Open public-use micro files; identified or geo-detailed versions
require application. Genuine record-level data, distinct from CDC WONDER,
which only returns tabulated, suppressed cells.

```yaml
- id: src-nvss
  name: National Vital Statistics System (natality/mortality public-use files)
  provider: CDC/NCHS
  unit: "one record per birth (~3.6M/yr) or death (~3.3M/yr)"
  access: "open (public micro files); application for identified/geo-detailed"
  mirror: https://www.nber.org/research/data/vital-statistics-natality-birth-data
  note: "genuine record-level data, distinct from CDC WONDER (below) which returns tabulated cells only"
```

The NBER mirror above is a convenient bulk-download path for the natality
public-use files. See the US health surveys overview pack for the standing
CDC/NCHS 2025-26 caveat before promising a download from any CDC-hosted
file. For aggregated queries instead of record-level files, see CDC
WONDER (id: src-cdc-wonder).
