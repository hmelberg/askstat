# Eurostat — kildeguide

- Kanonisk vei: `# e = eurostat.read("<datasettkode>", years="2015:2024", filters={"geo": "NO", "unit": "PC_GDP"})` — kildens EGNE dimensjoner (geo, unit, na_item, sex, age, siec …) går ALLTID i filters={}. indicators= finnes IKKE for eurostat (velg med filters); countries=/regions= aksepteres og oversettes til geo=-parametre — men foretrekk filters={"geo": "..."} så utvalget står samlet ett sted.
- geo-koder er Eurostats egne: "NO" (ikke NOR), EU-aggregat "EU27_2020". Sjekk kodene med table_metadata(find="Norway") — aldri gjett.
- Norge ER med i de fleste datasett (EFTA-rapportering), ofte også regionalt (NUTS: NO0…-koder).
- years="2015:2024" oversettes til sinceTimePeriod/untilTimePeriod. Kvartals-/månedsdata: filtrer heller med kildens egne tidskoder via filters.
- Datasettkoder er små bokstaver (nama_10_gdp, hlth_sha11_hf) — store bokstaver 404-er.
- Uttrekk uten filters kan bli enorme — velg alltid geo + de sentrale dimensjonene eksplisitt.
