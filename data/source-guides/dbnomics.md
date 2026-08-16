# DBnomics — kildeguide (internasjonal ryggrad, ~90 kilder bak én kontrakt)

- Sti er `<PROVIDER>/<DATASET>`: `# d = dbnomics.read("IMF/WEO:latest", filters={"weo-country": ["NOR"], "weo-subject": ["NGDP_RPCH"]}, years="2015:2029")`.
- Versjonerte datasett: bruk ALLTID `:latest` — aldri hardkod en release («WEO:2024-10» råtner).
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
