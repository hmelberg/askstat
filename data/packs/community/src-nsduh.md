# NSDUH — National Survey on Drug Use and Health (SAMHDA)

The primary US person-level source for substance use, substance use
disorder, serious psychological distress, major depressive episode and
suicidality — persons aged 12+. Public-use files are open with
click-through registration; restricted-use files with finer geography
require application.

```yaml
- id: src-nsduh
  name: National Survey on Drug Use and Health (SAMHDA)
  provider: SAMHSA
  unit: person aged 12+
  access: "open (public-use, click-through); application for restricted-use with finer geography"
  formats: [spss, sas, stata]
  weight_vars: [ANALWT_C]
  use: "substance use, SUD, serious psychological distress, major depressive episode, suicidality"
  gotcha: "the public-use file has NO state identifier; 2020-21 fieldwork disrupted by COVID, not cleanly comparable to earlier years"
```

Weight with `ANALWT_C` for population estimates. The public-use file has
no state identifier — apply for restricted-use access if state-level
analysis is required. Treat 2020-21 as a break in comparability: fieldwork
was disrupted by COVID and is not cleanly comparable to earlier years.
