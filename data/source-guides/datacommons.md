# Google Data Commons — kildeguide (statistiske variabler, global dekning)

- Sti er statvar-dcid-en direkte: `# x = datacommons.read("Count_Person", countries=["NOR", "SWE"])`.
- SJEKK DEKNING FØR lasting: `table_metadata('datacommons', '<dcid>', find='<landkode>')`. Et resolve-/søketreff (dcid finnes) er IKKE det samme som at variabelen har observasjoner for landet du vil ha — hopp aldri rett fra søk til read().
- countries= tar ISO3-koder (`NOR`, `SWE`, …) og oversettes til `country/<KODE>`-noder. Andre geografier (delstat/fylke/by, egen dcid) går via `filters={"entity": ["geoId/06", …]}` i stedet.
- indicators()/regions() finnes ikke her — «indikatoren» ER dcid-en i stien, og geografi er alltid countries() eller filters(entity=).
- years="fra:til" filtreres KLIENT-side (API-et har ingen tidsvindu-parameter, som dbnomics) — hele serien hentes først, årene siles etterpå.
- Samme variabel/land har ofte FLERE fasetter (kilder) med ulike tall (f.eks. Verdensbanken vs. OECD). Lasteren velger ALDRI stille: `facet_kilde`-kolonnen navngir alltid kilden som ble brukt. Sjekk kolonnen — dekningssjekken over lister antall fasetter og bør konsulteres først hvis tallet virker feil.
- ALDRI kilde for nordiske detaljer (kommune/fylke, norske registerdata) — bruk ssb/fhi/eurostat der. Data Commons er sterkest for global/US-dekning og grove landsammenligninger.
- Krever API-nøkkel (site-nøkkel — injiseres server-side av /api/hent; nøkkelen når aldri klienten).
- Verifisert 2026-08-16: v2/observation live (HTTP 200) for Count_Person/country/NOR — 4 fasetter (multi-fasett-fella reell), siste obs 2025 = 5 594 340.

## Typiske spørsmål

- «Grov landsammenligning av en global indikator» (befolkning, utslipp)
- IKKE for norske detaljer (kommune/fylke) — bruk ssb/fhi
