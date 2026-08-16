---
id: src-piaac
name: PIAAC — OECD adult skills survey
kind: adult skills microdata (literacy/numeracy, ages 16-65)
access: open, registration-free
url_pattern: https://webfs.oecd.org/piaac/cy1-puf-data/CSV/prg{ccc}p1.csv
gotcha: no CORS on webfs.oecd.org — fetch via /api/hent
---

# PIAAC — OECD adult skills survey

Adult skills (literacy/numeracy/problem-solving, ages 16–65) — the sweet
spot in this domain: open and registration-free, and the recommended
first stop for adult-skills questions.

Per-country CSV files are direct open URLs on webfs.oecd.org
(live-verified 2026-08-06, no CORS → via /api/hent):

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
