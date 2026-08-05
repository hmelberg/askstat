# US health surveys (NHIS / MEPS)

Use this pack when questions concern **individual-level US health data** —
health status, insurance coverage, healthcare use and expenditure.

## Preferred sources

1. **ipums** (registry source, user key required) — IPUMS Health Surveys
   harmonizes the two key surveys:
   - **NHIS** — National Health Interview Survey: annual household survey
     on health status, conditions, insurance and behaviors.
   - **MEPS** — Medical Expenditure Panel Survey: healthcare use and
     **expenditure** panels; the go-to for cost questions.
   The ipums source guide (attached on first catalog call) describes the
   stateless extract flow. A user API key must be registered in the AI
   settings; without it, say so honestly and fall back to aggregate sources.
2. **Aggregate fallbacks** when microdata is not needed:
   - CDC/NCHS published tables — search the open web and probe URLs
     (https://www.cdc.gov/nchs/nhis/index.htm).
   - MEPS summary tables: https://meps.ahrq.gov/mepsweb/
   - worldbank/oecd/dbnomics for internationally comparable US health
     indicators.

## Analysis notes (survey data)

- Both surveys need **weights** for population estimates — look for weight
  and strata variables and say in the answer whether estimates are weighted.
- Check special missing codes (7/8/9, 97/98/99 patterns = don't know /
  refused / not ascertained) before computing.
- Documentation: NHIS https://www.cdc.gov/nchs/nhis/documentation/index.html
  and MEPS https://meps.ahrq.gov/mepsweb/data_stats/download_data_files.jsp
  — quote the codebook lines that matter rather than guessing.
