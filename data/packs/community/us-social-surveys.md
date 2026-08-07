# US social surveys (GSS, Census PUMS, Pew)

Use this pack when questions concern **US attitudes, demographics and
social behavior at the individual level**. (For US health surveys —
NHIS/MEPS/NHANES — use the "US health surveys" pack and the nchs source.)

## Machine-reachable (use these first)

- **census** (registry source) — ACS/CPS PUMS: real person-level rows as
  REST JSON with machine-readable codebooks (variables.json) and weights
  (PWGTP + 80 replicate weights). Needs the site's CENSUS_API_KEY;
  metadata endpoints are keyless. See the census source guide.

## Analysis notes

- Always weight (GSS wtss*, PUMS PWGTP) and say so in the answer.
- GSS missing codes: .i/.n/.d appear as distinct missing categories in
  Stata files — inspect value labels before computing shares.
- Cite "GSS {year}, NORC" / "ACS PUMS {vintage}, U.S. Census Bureau".

## Individual source packs

Each source below has its own pack — fetch full details (access, URLs,
weights, gotchas) with the get_pack tool using the id in parentheses.

- **GSS** (id: src-gss) — General Social Survey, US attitudes 1972–2024, open direct Stata downloads, no registration.

## Other sources (no separate pack)

- **Pew Research Center** — ATP waves and international surveys: free
  account + terms acceptance per download (.sav files), no API, and new
  waves are released with a lag. Topline questionnaires on the open
  dataset pages are quotable.
