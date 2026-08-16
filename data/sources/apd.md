---
id: apd
navn: Awesome Public Datasets (fellesskapskatalog)
utgiver: awesomedata/apd-core (GitHub-fellesskap)
tillit: funnet
tilgang: fil
kind: apd
base_url: https://github.com/awesomedata/apd-core
cors: false
order: 18
---

# Awesome Public Datasets (fellesskapskatalog)

## Kort

868 datasett-oppføringer (35 kategorier), datasett-nivå kun — ingen kolonneskjema. homepage er ofte en landingsside, ikke en direkte data-URL. Søkes LOKALT mot en forhåndshøstet katalog (data/apd-catalog.json), ingen live GitHub-kall.

### Oppskrift: finne et datasett i katalogen

Ingen nettverksoppskrift — dette er et LOKALT katalogsøk, ikke et
API-kall. Oppskriften ER `search_catalog('apd', '<søkeord>')`: søker mot
den forhåndshøstede `data/apd-catalog.json` og gir treff med
`identifier`/`name`/`url`/`category`/`keywords`. `url`/`homepage` peker
ofte til en landingsside — les den (web_fetch) for å finne selve
data-lenken, forvent ikke en direkte CSV/API-URL i katalogoppføringen.

## Typiske spørsmål

- Finnes det et datasett om [tema] i Awesome Public Datasets-katalogen?
- List datasett i kategorien [kategori] fra apd-katalogen.

## Om kilden

Awesome Public Datasets — a community-curated GitHub catalogue of 868 public dataset listings across 35 categories; dataset-level pointers only, no column-level schema.

