---
id: src-bronnoysund
name: Enhetsregisteret (Norway)
access: open, no key
api_base: https://data.brreg.no/enhetsregisteret/api
bulk: [/api/enheter/lastned (JSON), /api/enheter/lastned/csv]
gotcha: search capped at 10,000 results; bulk endpoints are gzip and CORS-blocked in browsers (measured 2026-08-16) — for counts, use the search API's page.totalElements per filter instead; accounting figures live in a separate dataset (Regnskapsregisteret)
---

# Enhetsregisteret (Norway)

Norway's business register — open, keyless API and bulk download.



Search is capped at 10,000 results, and the bulk endpoints
(`/enheter/lastned`) are gzip-compressed and CORS-blocked in browsers
(measured 2026-08-16). For COUNTS this doesn't matter: every search query
returns `page.totalElements`, so totals and per-organisasjonsform
breakdowns come from `?size=1&organisasjonsform=<kode>` without any bulk
download (verified live — 1 170 446 enheter across 44 forms, sums exactly).
Accounting figures live in a separate dataset (Regnskapsregisteret).

