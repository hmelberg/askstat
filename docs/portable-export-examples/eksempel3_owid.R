# ── Portabel eksport fra OpenStat ──
# «# load»-direktivene er oversatt til frittstående lastekode.
# Generert av appen — rediger fritt.
# Levealder i Norden (OWID) — R-eksempel
# levealder = ost.read("https://ourworldindata.org/grapher/life-expectancy.csv")
levealder <- read.csv("https://ourworldindata.org/grapher/life-expectancy.csv")  # NB: sjekk skilletegn — nordiske CSV-er bruker ofte sep=";"
norden <- subset(levealder, Code %in% c('NOR','SWE','DNK','FIN'))
print(aggregate(norden[['Life.expectancy']], by = list(land = norden$Code), FUN = max))
