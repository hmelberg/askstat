---
id: src-pisa
name: PISA — OECD student performance study
kind: student performance microdata (15-year-olds)
access: open direct URLs, but VERY heavy (2022 STU_QQQ 682 MB)
gotcha: far beyond the app's size ceiling; 2018+ cognitive files use DEFLATE64 that standard unzip fails on — be honest about size before promising a download
---

# PISA — OECD student performance study

Student performance (15-year-olds) — open but heavy: be honest about the
file sizes before promising a download.

Full SPSS zips are open direct URLs (webfs.oecd.org/pisa2022/STU_QQQ_SPSS.zip
— **682 MB**, 2018: 501 MB; live-verified) — far beyond the app's ceiling,
and 2018+ cognitive files use DEFLATE64 compression that standard unzip
tools reject. Honest paths:

- Aggregate country results: oecd source (registry) or the PISA Data
  Explorer website.
- Curated country-level subsets exist in the R package `learningtower`
  (its GitHub hosts small extracts) — a probe-able alternative for simple
  score questions; label provenance clearly.
