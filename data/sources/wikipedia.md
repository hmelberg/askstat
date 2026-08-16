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

## Oppskrift: tabell-lesing fra en artikkel (verifisert 2026-08-16)

```
# raw = ost.read("/api/hent?url=<url-enkodet artikkel-URL>")
# import lxml
# tabeller = pd.read_html(io.StringIO(raw))
# df = tabeller[i]
```

Verifisert mot `https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)`:
2 tabeller totalt; `tabeller[0]` er hovedtabellen (239 rader × 6 kolonner,
kolonner `Country or territory`/`Population (1 July 2023)`/…) — Norge 2023 =
5 519 167. Siste tabell på siden er ofte en navigasjonsboks, ikke data —
sjekk `.shape`/`.head()` på riktig indeks FØR bruk, gjett aldri `i`.

## Typiske spørsmål

- Hvor mange land ligger i tabellen over EUs BNP per innbygger på Wikipedia?
- Hva var Norges innbyggertall ifølge FN-tabellen på Wikipedia i 2023?
- Hent medaljetabellen for [OL-år] fra Wikipedia-artikkelen.

## Om kilden

Wikipedia — tabular data extracted directly from tables inside Wikipedia articles.

