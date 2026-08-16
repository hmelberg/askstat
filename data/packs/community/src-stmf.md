---
id: src-stmf
name: Short-Term Mortality Fluctuations
kind: AGGREGATE — weekly all-cause deaths by country/sex/broad age group
access: registration required as of 2026-08 (bulk CSV now behind mortality.org login)
bulk_csv: https://www.mortality.org/File/GetDocument/Public/STMF/Outputs/stmf.csv
use: excess-mortality and mortality-shock monitoring
gotcha: bulk CSV returns an HTML login page without an account (measured 2026-08-16, twice) — machine fetch fails; weekly data provisional and revised; age groups coarse; ALL-CAUSE only, no cause-of-death breakdown
---

# Short-Term Mortality Fluctuations (STMF)

Weekly all-cause deaths by country/sex/broad age group. Use for
excess-mortality and mortality-shock monitoring.



The bulk CSV URL now returns an HTML login page without a mortality.org
account (measured 2026-08-16 — a proxy fetch got HTML, not CSV), so
machine access requires registration. For Norway, SSB table 12954 gives
weekly deaths openly and is the better in-app path. Weekly figures are
provisional and revised, and age groups are coarse. The data is ALL-CAUSE
only — there is no cause-of-death breakdown in STMF.

