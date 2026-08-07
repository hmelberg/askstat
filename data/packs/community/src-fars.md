# FARS — Fatality Analysis Reporting System

A complete census of US fatal motor-vehicle crashes since 1975, openly
downloadable, with crash/vehicle/person files linked per year.

```yaml
- id: src-fars
  name: Fatality Analysis Reporting System
  unit: crash / vehicle / person (three linked files per year)
  kind: CENSUS of fatal motor-vehicle crashes, not a sample
  coverage: "50 states + DC + PR, 1975-2024"
  access: OPEN
  packages: {r: [rfars, crashapi]}
  gotcha: "fatal crashes only — pair with CRSS for non-fatal severity; coding schemes change across years, use the year-specific manual"
```

Covers fatal crashes only — pair with CRSS (id: src-crss) for non-fatal
severity. Coding schemes change across years, so use the year-specific
coding manual. `rfars` and `crashapi` are R packages for direct access.
