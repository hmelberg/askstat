# BRFSS — Behavioral Risk Factor Surveillance System

The only US source giving reliable state-level (and via SMART, some
county/MSA) chronic-disease prevalence at the record level. The cdc
registry source's PLACES/BRFSS tables give the aggregate shortcut; this
is the microdata behind them. Open, no key.

```yaml
- id: src-brfss
  name: Behavioral Risk Factor Surveillance System
  provider: CDC
  unit: person (adult), state-representative
  n_per_year: "~400,000+ (2024: 457,670)"
  access: open, no key
  data_url_pattern: "https://www.cdc.gov/brfss/annual_data/{YEAR}/files/LLCP{YEAR}XPT.zip"
  weight_vars: [_LLCPWT]
  design_vars: [_PSU, _STSTR]
  use: "state-level chronic-disease prevalence microdata"
  gotcha: "states add optional modules — variable availability varies by state x year; weighting changed to raking + cell phones added in 2011, don't cross that break naively"
```

Weight with `_LLCPWT` and use the `_PSU`/`_STSTR` design variables for
variance estimation. See the US health surveys overview pack for the
standing CDC/NCHS 2025-26 caveat.
