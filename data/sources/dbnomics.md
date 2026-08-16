---
id: dbnomics
navn: DBnomics (aggregator, ~80 kilder)
utgiver: DBnomics/Cepremap
tillit: etablert
tilgang: rest
kind: dbnomics
base_url: https://api.db.nomics.world/v22/series/
cors: true
join_nokler: [period, series_code]
tags: [makro]
order: 17
---

# DBnomics (aggregator, ~80 kilder)

## Kort

Ressurssti = <provider>/<dataset> (f.eks. IMF/WEO:latest) med filters={"<dimensjon>": "<kode>"} — oversettes til ?dimensions=<url-enkodet JSON> (verifisert live 2026-08-01: IMF/WEO ufiltrert = 8624 serier mot 1000-taket → hard feil; med filters={"weo-country": "NOR"} = 44). Dimensjons- og verdikodene kommer fra table_metadata. Serie-masken (IMF/WEO:latest/NOR.NGDP_RPCH) virker fortsatt når man kjenner den eksakte koden. :latest 302-redirecter til versjonert dataset (fetch følger). Adapteren tvinger observations=1 og flater til langt format (series_code + dimensjoner + period + value). years= filtreres KLIENT-side (API-et har ingen tidsvindu-parametre). Datafriskhet avhenger av DBnomics' høsting. Utenfor openstat: python-pakken dbnomics, R-pakken rdbnomics.; per-produsent-speil kan henge etter kilden (OECD-speilet frosset siden 2024-10 etter OECDs API-omlegging) — «sist indeksert» vises i søketreff/metadata; sjekk den

## Guide

# DBnomics — kildeguide (internasjonal ryggrad, ~90 kilder bak én kontrakt)

- Sti er `<PROVIDER>/<DATASET>`: `# d = dbnomics.read("IMF/WEO:latest", filters={"weo-country": ["NOR"], "weo-subject": ["NGDP_RPCH"]}, years="2015:2029")`.
- Versjonerte datasett: bruk ALLTID `:latest` — aldri hardkod en release («WEO:2024-10» råtner).
- **Frosne speil er UEGNET for «nå»-spørsmål** (målt r10: OECD-speilet, frosset 2024-10, ga des 2023-tall som svar på «nå» — substansielt galt): er «sist indeksert» eldre enn spørsmålets horisont, hent fra en ferskere kilde i registeret i stedet — ikke datér deg ut av det.
- countries=/indicators= finnes IKKE her: dimensjonsnavnene varierer per datasett (weo-country, geo, REF_AREA …). ALT utvalg går i filters={} med koder fra table_metadata (bruk find="Norway" for landkoder).
- filters-verdier kan være lister; years= filtreres klient-side etter henting.
- Treffer spørringen >1000 serier feiler lasteren med råd — snevre inn med flere filters-dimensjoner.
- IMF/BIS/ILO/FRED med flere nås HER uten egne nøkler — foretrekk dbnomics framfor kildens eget API når begge finnes.
- Flere serier i ÉN spørring: legg `align_periods=1` rett i sti-argumentet (ikke i filters=, som bare tar dimensions=) — DBnomics joiner seriene server-side på felles perioder (spec §3a).

## Oppskrift: IMF WEO-anslag for Norge (verifisert 2026-08-16)

```
# d = ost.connect("dbnomics")
# weo = d.read("IMF/WEO:latest/NOR.NGDP_RPCH", years="2020:2026")
```

7 rader (2026-anslag: 1,72 % BNP-vekst). Serie-masken tar flere land med
`+` (NOR+SWE). For å sammenligne WEO-RUNDER (fasit-spørsmålet «hvordan
har anslagene endret seg»): :latest er alltid nyeste runde — eldre runder
ligger som egne datasett (WEO:2025-04 osv.), les to og diff.

## Om kilden

DBnomics — an aggregator of roughly 80 statistical providers (IMF, BIS, ILO, and more) behind one unified API.

