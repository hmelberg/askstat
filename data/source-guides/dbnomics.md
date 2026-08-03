# DBnomics — kildeguide (internasjonal ryggrad, ~90 kilder bak én kontrakt)

- Sti er `<PROVIDER>/<DATASET>`: `# d = dbnomics.read("IMF/WEO:latest", filters={"weo-country": ["NOR"], "weo-subject": ["NGDP_RPCH"]}, years="2015:2029")`.
- Versjonerte datasett: bruk ALLTID `:latest` — aldri hardkod en release («WEO:2024-10» råtner).
- countries=/indicators= finnes IKKE her: dimensjonsnavnene varierer per datasett (weo-country, geo, REF_AREA …). ALT utvalg går i filters={} med koder fra table_metadata (bruk find="Norway" for landkoder).
- filters-verdier kan være lister; years= filtreres klient-side etter henting.
- Treffer spørringen >1000 serier feiler lasteren med råd — snevre inn med flere filters-dimensjoner.
- IMF/BIS/ILO/FRED med flere nås HER uten egne nøkler — foretrekk dbnomics framfor kildens eget API når begge finnes.
