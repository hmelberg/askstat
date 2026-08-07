# FBI NIBRS / UCR via Crime Data Explorer

Incident-level crime data for most US agencies, via the FBI Crime Data
Explorer. Bulk downloads are open with no login; the developer API needs
a free api.data.gov key.

```yaml
- id: src-nibrs
  name: FBI NIBRS / UCR via Crime Data Explorer
  unit: incident, with offense/victim/offender/arrestee segments
  coverage: "~18,000 agencies; national transition completed ~2021; legacy SRS back to the 1930s"
  access: "open bulk downloads, no login; developer API needs a free api.data.gov key"
  ⚠_gotcha: "agency coverage was NOT complete before ~2021 — pre-2021 national totals undercount large agencies that reported only SRS. Records multiple offenses per incident (no hierarchy rule) — totals won't match legacy UCR index-crime counts."
```

National agency coverage was not complete until ~2021 — pre-2021 national
totals undercount large agencies that reported only legacy SRS data.
NIBRS also records multiple offenses per incident with no hierarchy rule,
so totals will not match legacy UCR index-crime counts.
