---
id: src-gss
name: GSS — General Social Survey
kind: US attitudes/demographics survey, 1972-2024 (~72k cumulative respondents)
access: open direct downloads, no registration
url_pattern: https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/{YEAR}_stata.zip
---

# GSS — General Social Survey

General Social Survey: US attitudes, demographics and social behavior,
1972–2024 (~72k cumulative respondents). Open direct downloads, no
registration — one of the two sources listed as "machine-reachable" in
the US social surveys pack, alongside Census PUMS.

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
