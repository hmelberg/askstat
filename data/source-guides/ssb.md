# SSB (Statistisk sentralbyrå) — PxWebApi v2

kilde: SSBs api-eksempler (janbrus), destillert 2026-07-31

## Reglene som forhindrer feil (les FØRST)

**Mandatory-regelen.** En FILTRERT spørring mot `/data` MÅ oppgi verdier
for ALLE dimensjoner som har `elimination: false` i tabellens metadata.
To dimensjoner er ALLTID obligatoriske — `ContentsCode` (hva som måles)
og `Tid` (tid) — selv i tabeller med bare ett innholdsalternativ. Mangler
én: SSB svarer `400 Bad Request` med `detail`-teksten
`"Missing selection for mandatory variable(s): ..."` og lister nettopp de
manglende kodene. Sjekk `mandatory`-flagget per dimensjon i
`table_metadata`-svaret FØR du bygger spørringen — ikke gjett hvilke som
trengs.

**Kanonisk lesevei.** Default-CSV fra `/data` (uten `outputFormat=`) er
BRED (én kolonne per Tid-verdi) og kodet i latin-1 (iso-8859-1) — begge
deler er feller for kode som antar tidy UTF-8. `outputFormat=json-stat2`
er den tidy, kodede varianten, og er det `<alias>.read(...)`
(direktivveien) bruker under panseret. Skriv aldri en rå
`outputFormat=csv`-URL sammen med analysekode som forventer tidy data —
konverter heller via json-stat2.

## URL-mønstre

| Formål | Endepunkt |
|---|---|
| Søk tabeller | `GET /tables?query=<ord>&lang=no` |
| Tabellinfo | `GET /tables/{id}` |
| Metadata (dimensjoner, koder, elimination) | `GET /tables/{id}/metadata` |
| Data | `GET`/`POST /tables/{id}/data?...` |
| Kodelisteoppslag | `GET /codelists/{id}` |

Base: `https://data.ssb.no/api/pxwebapi/v2/`. **`/v2-beta/` er død** —
svarer 503 på søk, metadata og data likt (verifisert 2026-07-31). Bruk
alltid `/v2/`, aldri `/v2-beta/`.

## Tidsuttrykk (Tid-dimensjonen)

Funksjonsfiltre brukes ALENE i valueCodes for Tid (ikke sammen med
eksplisitte koder):

- `top(n)` — de n nyeste periodene
- `from(år)` — fra og med gitt periode
- `range(fra,til)` — intervall, begge grenser inkludert

Eksplisitte tidskoder må matche tabellens `timeUnit` (årlig: `"2024"`;
kvartalsvis: `"2024K2"`). I `<alias>.read(...)` skrives dette som
`years="2015:2024"` — adapteren oversetter til riktig `valueCodes[Tid]=`.

## Codelists (aggregering/utvalg)

Listet per dimensjon i `dimension.<variabel>.extension.codelists` i
metadata, to typer:

- `agg_`-prefiks — aggregering, mange koder summeres til én (f.eks.
  kommune → fylke)
- `vs_`-prefiks — valueset, et alternativt (ofte kortere) utvalg av koder

Bruk i spørring: `codelist[Region]=agg_...&valueCodes[Region]=*`. Med en
aggregeringscodelist styrer `outputValues[Region]=aggregated|single` om
summerte eller enkeltverdier returneres. Slå opp selve kodene/etikettene
med `GET /codelists/{id}` — koder fra ulike codelists må ikke blandes.

## Kjente feller

- **`/v2-beta/` er død** — svarer 503, bruk `/v2/`.
- **Default-CSV er bred og latin-1** — bruk json-stat2/`<alias>.read(...)`
  som gir tidy, UTF-8-kodede data.
- **Ingen CORS på data-endepunktet** (`/tables/{id}/data`) — en rå
  `fetch()`/`pd.read_csv(url)` fra nettleseren feiler stille uten proxy;
  direktivveien håndterer dette automatisk.
- Ukjent variabel-/verdikode, feil tidsformat, for mange celler (sjekk
  `/config` → `maxDataCells`) og manglende obligatorisk dimensjon gir
  alle `400` — `detail`-feltet forteller hvilken.

## Komplett eksempel (Oslos folkemengde, tabell 11342)

```
# ssb = ost.connect("ssb")
# oslo = ssb.read("11342", regions=["0301"], indicators=["Folkemengde"], years="2015:2024")
```

Verifisert 2026-07-31: `Region=0301` (Oslo kommune) sammen med
`ContentsCode=Folkemengde` gir data uten 400. Fant du ikke riktig
regionkode i kodelisten? Bruk `find="Oslo"` i `table_metadata` fremfor å
gjette koder.
