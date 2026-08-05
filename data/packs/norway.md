# Norway source pack

The user prefers Norwegian sources when the question concerns Norway or has
no explicit geography. Apply this **when it is possible and natural** —
never force a Norwegian source onto a clearly international question.

## Preferred sources (in this order)

1. **ssb** — Statistics Norway, the primary source for official Norwegian
   statistics. Searchable: `search_catalog(source='ssb', query=…)`, then
   `table_metadata('ssb', '<table>')` and the canonical
   `ssb.read("<table>", years=…)` read.
2. **fhi** — Norwegian Institute of Public Health, for health and registry
   statistics. Searchable via `search_catalog(source='fhi', …)`.
3. **norgesbank** — Norges Bank (SDMX), for interest rates and exchange
   rates. SSB does not carry these.
4. **eurostat** — Norway is included in most EU datasets; use it for
   NUTS-regional data and harmonized European comparisons.
5. **dbnomics** — for harmonized cross-country rates (unemployment,
   inflation) when Norway is compared with other countries.
6. **datanorge** — data.norge.no (CKAN), for public-sector datasets beyond
   official statistics.

## Search tips

- SSB tables are often easier to find with **Norwegian search terms** —
  try both English and Norwegian keywords in `search_catalog`
  (e.g. "arbeidsledighet" as well as "unemployment").
- Municipal/regional questions: SSB covers kommune level; get valid region
  codes from `table_metadata` before filtering.

## Known gaps

- Youth substance-use data lives at **FHI/Ungdata**, not SSB.
- Interest and currency data lives at **norgesbank**, not SSB.
- Norwegian survey microdata is mostly access-restricted (Sikt/microdata.no);
  say so honestly instead of substituting fabricated numbers.
