# Finland source pack

The user prefers Finnish sources when the question concerns Finland or has
no explicit geography. Apply this **when it is possible and natural** —
never force a Finnish source onto a clearly international question.

## Preferred sources (in this order)

1. **statfin** — Statistics Finland (Tilastokeskus), the primary source for
   official Finnish statistics. Searchable:
   `search_catalog(source='statfin', query=…)`, then follow the hit's
   `how_to_read` hint.
2. **eurostat** — Finland is in all EU datasets; use it for NUTS-regional
   data and harmonized European comparisons.
3. **dbnomics** — for harmonized cross-country rates (unemployment,
   inflation, interest) when Finland is compared with other countries;
   ECB series (fresh) cover euro-area rates that apply to Finland.

## Search tips

- StatFin tables are often easier to find with **Finnish search terms** —
  try both English and Finnish keywords in `search_catalog`
  (e.g. "työttömyys" as well as "unemployment").
- StatFin table ids are agency-local — never reuse SSB/SCB table ids;
  search per source.

## Known gaps

- Health and welfare indicators live at **THL/Sotkanet** (no adapter —
  sotkanet.fi has an open JSON API reachable with web_fetch/probe).
- Finland is in the euro area: policy rates come from **ECB**, not a
  national central bank source.
