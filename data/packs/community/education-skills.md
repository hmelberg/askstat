# Education & skills microdata (PIAAC, PISA, TALIS)

Use this pack when questions concern **adult skills, student performance
or teachers** across countries (OECD studies). All data below are open
and registration-free, but file sizes differ wildly — that decides what
is actually usable in the app.

## PIAAC — the sweet spot (use first)

Adult skills (literacy/numeracy/problem-solving, 16–65). Per-country CSV
files are direct open URLs on webfs.oecd.org (live-verified 2026-08-06,
no CORS → via /api/hent):

- Cycle 1: `https://webfs.oecd.org/piaac/cy1-puf-data/CSV/prg{ccc}p1.csv`
  (Norway: prgnorp1.csv, 18.3 MB)
- Cycle 2 (2022–23): `https://webfs.oecd.org/piaac/cy2-puf-data/CSV/prg{ccc}p2.csv`
  (Norway: prgnorp2.csv, 32.1 MB)
- Codebook (open XLSX): search oecd.org for "International Codebook PIAAC"
  — quote it for variable names/values.

Trap: older documented paths (`/piaac/puf-data/...`) are dead (404) — the
`cy1-`/`cy2-` prefixes are current. Probe before building.

Analysis: skills are **10 plausible values** (PVLIT1–10 etc.) — for simple
answers use the mean of plausible values and say so; weights SPFWT0
(final) exist and should be used for population statements.

## PISA — open but heavy (be honest)

Student performance (15-year-olds). Full SPSS zips are open direct URLs
(webfs.oecd.org/pisa2022/STU_QQQ_SPSS.zip — **682 MB**, 2018: 501 MB;
live-verified) — far beyond the app's ceiling, and 2018+ cognitive files
use DEFLATE64 compression that standard unzip tools reject. Honest paths:

- Aggregate country results: oecd source (registry) or the PISA Data
  Explorer website.
- Curated country-level subsets exist in the R package `learningtower`
  (its GitHub hosts small extracts) — a probe-able alternative for simple
  score questions; label provenance clearly.

## TALIS — teachers survey

Open SPSS zip (webfs.oecd.org/talis/SPSS_2018_international.zip, 192 MB,
live-verified) — also too heavy; use OECD aggregate tables instead.

## Analysis notes

- Always weighted estimates; compare within the same cycle/wave.
- Cite "OECD PIAAC cycle {1|2}" / "OECD PISA {year}" with country list.
