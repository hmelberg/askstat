---
id: src-microdata-no
name: microdata.no
kind: remote-execution platform over SSB administrative registers
provider: Sikt + Statistics Norway, funded by the Research Council of Norway
landing: https://www.microdata.no/en/
variable_catalog: https://www.microdata.no/discovery
content: unmanipulated SSB register microdata — population, education, income/tax, social security (FD-Trygd), employment, family/household, criminal justice; some series back to 1964. Health registries (NPR/MFR/Kreftregisteret) are NOT here — that is Helsedata.no's domain.
access: institutional agreement; no per-project ethics application
export: "NONE — no bulk export. Only aggregated tables and model output leave the platform (automatic on-the-fly anonymisation: rounding, cell suppression, hexbin scatterplots)."
foreign_researcher_eligibility: UNVERIFIED — historically required a Norwegian institutional affiliation
---

# microdata.no

Remote-execution platform over SSB administrative registers, run by Sikt
and Statistics Norway. Queries execute server-side and only anonymised
aggregate output leaves — the fastest defensible answer from Norwegian
register data, at the cost of never seeing a row. Access is by
institutional agreement, no per-project ethics application.



The query language is Stata-like and executes server-side — by far the
fastest way to a defensible answer from Norwegian register data (hours, not
months), at the cost of never seeing a row:

```
require no.ssb.fdb:15 as db
import db/BEFOLKNING_KJOENN as gender
import db/INNTEKT_WYRKINNT 2019-01-01 as income
generate age = 2015 - int(birth_year_month/100)
keep if age >= 18
tabulate gender, summarize(income) p50
regress workincome male high_edu_father high_edu_mother
```

Verbs: `require`, `create-dataset`, `import`/`import-event`/`import-panel`,
`generate`, `replace`, `recode`, `collapse`, `merge`, `tabulate`,
`summarize`, `regress`, `logit`, `regress-panel`. If the user's question is
answerable this way, you can draft the script even without running it.

