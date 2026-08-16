---
id: githubraw
navn: GitHub raw-filer
utgiver: (varierer)
tillit: funnet
tilgang: fil
base_url: https://raw.githubusercontent.com/
cors: true
order: 10
---

# GitHub raw-filer

## Kort

discovery via web_search; ALLTID probe før bruk; tillit avhenger av repo-eier

## Oppskrift: CSV fra raw.githubusercontent.com (verifisert 2026-08-16)

```
# df = pd.read_csv("https://raw.githubusercontent.com/<eier>/<repo>/<gren>/<sti>.csv")
```

Verifisert mot `plotly/datasets/master/gapminderDataFiveYear.csv`: 1704
rader × 6 kolonner (`country`, `year`, `pop`, `continent`, `lifeExp`,
`gdpPercap`) — Norge 2007: levealder 80,196 år, BNP/cap 49 357. `cors:
true` → leses direkte, ingen `/api/hent`-proxy nødvendig. Fella: sti/gren
kan endre seg eller repoet slettes — probe med `.shape`/`.head()` FØR
videre bruk, og la aldri stien være en gjetning.

## Typiske spørsmål

- Hent OWID/Gapminder-CSV-en for [land] fra GitHub og vis siste 10 år.
- Finn et rådatasett om [tema] i et kjent GitHub-repo og les det inn.

## Om kilden

GitHub raw files — direct file access for datasets discovered via web search and hosted in GitHub repositories; trust depends on the repository owner.

