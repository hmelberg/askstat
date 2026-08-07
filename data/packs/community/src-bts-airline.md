# BTS airline on-time performance and DB1B ticket data

Bureau of Transportation Statistics flight-segment on-time data plus a
10% sample of airline tickets (DB1B), openly downloadable.

```yaml
- id: src-bts-airline
  name: BTS airline on-time performance and DB1B ticket data
  units: {on_time: flight segment, db1b: "10% sample of airline tickets"}
  access: OPEN
  gotcha: "DB1B is a 10% sample — weight for market-share estimates; BTS appears to be renaming DB1B→DB1C circa 2025/26"
```

DB1B is a 10% sample — weight it for market-share estimates. BTS appears
to be renaming DB1B to DB1C circa 2025/26; check the current table name
before querying.
