# World Bank — kildeguide

- Ressursstien er OBLIGATORISK: `# x = worldbank.read("country/NOR;SWE/indicator/SH.XPD.CHEX.GD.ZS", years="2000:2023")` — read uten sti FEILER (målt: kostet tre reparasjonsrunder).
- Land = ISO3 adskilt med `;`, eller `all`. Aggregater er «land» i stien: EUU (EU), OED (OECD), WLD (verden).
- years="2000:2023" → date-parameteren; åpne ender fylles automatisk.
- ÉN indikator per read-linje er normen; flere variabler = flere read-linjer + merge på countryiso3code+date (join-nøklene i rammen).
- Lasteren paginerer selv og feiler med råd hvis uttrekket er >10 sider — snevre da inn (years=, færre land).
- Ekstra parametre (mrv, gapfill) kan gis i filters={"mrv": "5"}.
