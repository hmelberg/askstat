---
id: datacommons
navn: Google Data Commons
utgiver: Google
tillit: etablert
tilgang: rest
kind: datacommons
base_url: https://api.datacommons.org/v2/
cors: true
auth:
  type: api_key
  env: DATACOMMONS_API_KEY
  plassering: query:key
tags: [makro]
order: 19
---

# Google Data Commons

## Kort

søketreff ≠ dekning — table_metadata(find=<land>) FØR read; multi-fasett: navngi kilden

## Guide

# Google Data Commons — kildeguide (statistiske variabler, global dekning)

- Sti er statvar-dcid-en direkte: `# x = datacommons.read("Count_Person", countries=["NOR", "SWE"])`.
- SJEKK DEKNING FØR lasting: `table_metadata('datacommons', '<dcid>', find='<landkode>')`. Et resolve-/søketreff (dcid finnes) er IKKE det samme som at variabelen har observasjoner for landet du vil ha — hopp aldri rett fra søk til read().
- countries= tar ISO3-koder (`NOR`, `SWE`, …) og oversettes til `country/<KODE>`-noder. Andre geografier (delstat/fylke/by, egen dcid) går via `filters={"entity": ["geoId/06", …]}` i stedet.
- indicators()/regions() finnes ikke her — «indikatoren» ER dcid-en i stien, og geografi er alltid countries() eller filters(entity=).
- years="fra:til" filtreres KLIENT-side (API-et har ingen tidsvindu-parameter, som dbnomics) — hele serien hentes først, årene siles etterpå.
- Samme variabel/land har ofte FLERE fasetter (kilder) med ulike tall (f.eks. Verdensbanken vs. OECD). Lasteren velger ALDRI stille: `facet_kilde`-kolonnen navngir alltid kilden som ble brukt. Sjekk kolonnen — dekningssjekken over lister antall fasetter og bør konsulteres først hvis tallet virker feil.
- ALDRI kilde for nordiske detaljer (kommune/fylke, norske registerdata) — bruk ssb/fhi/eurostat der. Data Commons er sterkest for global/US-dekning og grove landsammenligninger.
- Krever API-nøkkel (site-nøkkel — injiseres server-side av /api/hent; nøkkelen når aldri klienten).

## Om kilden

Google Data Commons — a knowledge graph of statistical variables aggregating many public sources, with broad global and US statistical coverage; requires an API key.

