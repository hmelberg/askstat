# England — National Pupil Database and linked cohorts

The National Pupil Database (NPD) plus the linked UK birth cohorts (NCDS,
BCS70, Next Steps, MCS). The NPD itself needs a Secure Research
Service/DfE application; the cohorts themselves are mostly open access.

```yaml
- id: src-uk-cohorts-npd
  name: "England — National Pupil Database and linked cohorts (NCDS, BCS70, Next Steps, MCS)"
  npd_itself: "ONS Secure Research Service or DfE Data Sharing Service — project- and variable-specific, no open microdata; months to approve"
  cohorts: "the UK birth cohorts themselves (via UK Data Service, Centre for Longitudinal Studies) are mostly Open/EUL or Safeguarded — only the NPD- or NHS-linked variables within them need Secure Lab"
  gotcha: "attrition is substantial by later cohort sweeps — apply the supplied longitudinal/attrition weights matched to your analytic sample"
```

Attrition is substantial by later cohort sweeps — apply the supplied
longitudinal/attrition weights matched to your analytic sample.
