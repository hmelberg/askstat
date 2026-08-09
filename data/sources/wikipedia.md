---
id: wikipedia
navn: Wikipedia (tabeller i artikler)
utgiver: Wikimedia
tillit: etablert
tilgang: fil
base_url: https://en.wikipedia.org/wiki/
cors: false
oppskrift:
  python: "# load /api/hent?url=<url-enkodet artikkel-URL> as raw_html  →  import micropip; await micropip.install('lxml'); tabeller = pd.read_html(io.StringIO(raw_html)); df = tabeller[i]"
order: 11
---

# Wikipedia (tabeller i artikler)

## Kort

tabeller er load-bare via /api/hent + pd.read_html (lxml via micropip); velg riktig tabellindeks; no.wikipedia.org for norske artikler

## Om kilden

Wikipedia — tabular data extracted directly from tables inside Wikipedia articles.

