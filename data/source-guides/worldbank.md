# World Bank — kildeguide

- Ressursstien er OBLIGATORISK: `# x = worldbank.read("country/NOR;SWE/indicator/SH.XPD.CHEX.GD.ZS", years="2000:2023")` — read uten sti FEILER (målt: kostet tre reparasjonsrunder).
- Land = ISO3 adskilt med `;`, eller `all`. Aggregater er «land» i stien: EUU (EU), OED (OECD), WLD (verden).
- years="2000:2023" → date-parameteren; åpne ender fylles automatisk.
- ÉN indikator per read-linje er normen; flere variabler = flere read-linjer + merge på countryiso3code+date (join-nøklene i rammen).
- Lasteren paginerer selv og feiler med råd hvis uttrekket er >10 sider — snevre da inn (years=, færre land).
- Ekstra parametre (mrv, gapfill) kan gis i filters={"mrv": "5"}.

## Typiske spørsmål

- «Hvor stor andel av BNP bruker land X på helse?» (SH.XPD.CHEX.GD.ZS)
- «Sammenlign BNP/befolkning globalt over tid» — bredeste landdekningen, årsdata m/~1-2 års lag

## Oppskrift: helseutgifter %BNP, Norden (verifisert 2026-08-16)

```
# wb = ost.connect("worldbank")
# helse = wb.read("country/NOR;SWE;DNK;FIN;ISL/indicator/SH.XPD.CHEX.GD.ZS", years="2015:2022")
```

40 rader (5 land × 8 år; DK 2022 = 9,47 %). Landlisten skilles med `;`
i stien — aldri komma.
