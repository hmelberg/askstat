# CRSS — Crash Report Sampling System

A nationally representative weighted sample of police-reported crashes
of all severities, openly downloadable.

```yaml
- id: src-crss
  name: Crash Report Sampling System
  kind: "nationally representative SAMPLE of police-reported crashes, all severities"
  coverage: "2016-2023 (latest public year UNVERIFIED for 2026)"
  access: OPEN
  gotcha: "WEIGHT variable required — never pool FARS (census) and CRSS (weighted sample) counts without adjustment"
```

The WEIGHT variable is required for any population estimate. Never pool
FARS (a census, id: src-fars) and CRSS (a weighted sample) counts
without adjustment.
