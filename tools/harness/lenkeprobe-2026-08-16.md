# Lenkeprobe 2026-08-16 — community-pakkene

Probet 31 URL-forekomster (31 unike, global dedup) i 98 pakker.
Problemer: 5 døde (4xx/5xx), 0 nettfeil/timeout.

Maler ({...}/<...>) og duplikater hoppes over; maks 12 URL-er per pakke.
«NETT» kan være transient — reprob før pakken endres.

## Pakker med problemer

- **crime-transport-energy-politics.md** (3 URL-er probet):
  - DØD (429): https://api.gdeltproject.org/api/v2/doc/doc
- **src-manifesto-project.md** (1 URL-er probet):
  - DØD (404): https://manifesto-project.wzb.eu/api/v1/ — NB: API-rot uten endepunkt kan 404-e legitimt; sjekk manuelt
- **src-microdata-no.md** (2 URL-er probet):
  - DØD (404): https://www.microdata.no/discovery
- **src-thl.md** (1 URL-er probet):
  - DØD (404): https://thl.fi/en/statistics-and-data/data-and-services/open-data/open-apis
- **src-un-wpp.md** (1 URL-er probet):
  - DØD (404): https://population.un.org/dataportalapi/api/v1/ — NB: API-rot uten endepunkt kan 404-e legitimt; sjekk manuelt

## Triage og aksjoner (kontrolleren, 2026-08-16)

- **src-microdata-no.md: FIKSET** — `www.microdata.no/discovery` 404-er,
  `microdata.no/discovery` (uten www) gir 200 (curl-verifisert); pakken
  oppdatert til naken form.
- **src-thl.md: REELL RÅTE, uavklart erstatning** — thl.fi har
  restrukturert (kandidatstier 404-er også); trenger manuelt oppslag før
  pakken endres.
- manifesto/un-wpp: API-røtter uten endepunkt — 404 kan være legitimt;
  sjekk ved neste bruk, ikke endret.
- gdelt 429: rate-limit, ikke råte.
- Nøkkelgatede 403-er (api.data.gov, eia.gov, cdc.gov-sider) er
  FORVENTET uten nøkkel/nettleser og rapporteres ikke som råte.
- **Malprøve BRFSS** (instansiert {YEAR}=2023): cdc.gov svarer 403 også
  m/nettleser-UA headless — XPT-nedlastingen lar seg ikke verifisere
  utenfor ekte nettleser; pakkens form står uendret (browser-verifisering
  ved neste anledning).
