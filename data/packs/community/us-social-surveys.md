# US social surveys (GSS, Census PUMS, Pew)

Use this pack when questions concern **US attitudes, demographics and
social behavior at the individual level**. (For US health surveys —
NHIS/MEPS/NHANES — use the "US health surveys" pack and the nchs source.)

## Machine-reachable (use these first)

1. **census** (registry source) — ACS/CPS PUMS: real person-level rows as
   REST JSON with machine-readable codebooks (variables.json) and weights
   (PWGTP + 80 replicate weights). Needs the site's CENSUS_API_KEY;
   metadata endpoints are keyless. See the census source guide.
2. **GSS** — General Social Survey (attitudes 1972–2024, ~72k cumulative
   respondents), open direct downloads, no registration:
   `https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/{YEAR}_stata.zip`
   (per-year, ~6 MB zip → ~12 MB .dta; pandas.read_stata keeps variable/
   value labels). Live-verified 2026-08-06. Traps:
   - The NORC CDN intermittently answers **HTTP 204 with an empty body**
     — retry once before concluding the file is gone.
   - No CORS → always fetch via /api/hent.
   - The cumulative file (GSS_stata.zip, ~47 MB zip) is too heavy —
     prefer per-year files.
   - Weights: use `wtssall` (pre-2021) / `wtssnrps` (2021+ redesign);
     2021+ moved to web mode — flag mode effects in trend answers.
   Variable lookup: GSS Data Explorer (gssdataexplorer.norc.org) is a web
   UI (no API); SDA at UC Berkeley offers online cross-tabs.

## Login-walled

- **Pew Research Center** — ATP waves and international surveys: free
  account + terms acceptance per download (.sav files), no API, and new
  waves are released with a lag. Topline questionnaires on the open
  dataset pages are quotable.

## Analysis notes

- Always weight (GSS wtss*, PUMS PWGTP) and say so in the answer.
- GSS missing codes: .i/.n/.d appear as distinct missing categories in
  Stata files — inspect value labels before computing shares.
- Cite "GSS {year}, NORC" / "ACS PUMS {vintage}, U.S. Census Bureau".
