# MIMIC-IV (critical-care EHR)

Critical-care electronic health record microdata maintained by the MIT
Laboratory for Computational Physiology. Full access requires
PhysioNet-credentialed access (CITI training, signed DUA, human review);
a ~100-patient demo version needs no credentialing at all and is the
right starting point for prototyping.

```yaml
- id: src-mimic-iv
  name: MIMIC-IV (critical-care EHR)
  provider: MIT Laboratory for Computational Physiology
  access: "application — PhysioNet credentialed access (CITI training + signed DUA + human review)"
  demo_version: "mimic-iv-demo (~100 patients) requires NO credentialing — use for prototyping"
  gotcha: "dates are randomly shifted per patient — intervals within a patient are preserved but absolute calendar time is meaningless; cannot align with external events"
```

Dates are randomly shifted per patient for de-identification —
within-patient intervals (e.g. time between admission and a lab result)
stay valid, but absolute calendar dates are meaningless and cannot be
aligned with external events.
