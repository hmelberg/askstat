# UTKAST: fhi (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/fhi.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): vaksinasjon, barnevaksinasjon, dekning
- **daar/754** — daar/754
  - `DAAR` — 30 kode(r) [OBLIGATORISK] — eksempler: 1996, 1997, 1998, 1999, 2000
  - `KJONN` — 1 kode(r) [OBLIGATORISK] — eksempler: Total
  - `HJERTEKAR` — 1 kode(r) [OBLIGATORISK] — eksempler: Total
  - `MEASURE_TYPE` — 2 kode(r) [OBLIGATORISK] — eksempler: RATE_NO, RATE_EU
  - _FHI: ALLE dimensjoner må filtreres i POST-uttrekket (400 ellers); kun json-stat2._
- **nokkel/394** — nokkel/394
  - `GEO` — 1 kode(r) [OBLIGATORISK] — eksempler: 0
  - `AAR` — 23 kode(r) [OBLIGATORISK] — eksempler: 2002_2002, 2003_2003, 2004_2004, 2005_2005, 2006_2006
  - `KJONN` — 1 kode(r) [OBLIGATORISK] — eksempler: 0
  - `ALDER` — 3 kode(r) [OBLIGATORISK] — eksempler: 2_2, 9_9, 16_16
  - `VAKSINE` — 13 kode(r) [OBLIGATORISK] — eksempler: Difteri, HIB, HPV, HPV_M, HepatittB
  - `MEASURE_TYPE` — 2 kode(r) [OBLIGATORISK] — eksempler: RATE, SMR
  - _FHI: ALLE dimensjoner må filtreres i POST-uttrekket (400 ellers); kun json-stat2._

## Guide (hentelaget — eksempel først)
### POST json-stat2 (daar/754)
```python
# load /api/hent?url=<enkodet https://statistikk-data.fhi.no/api/open/v1/daar/table/754/data>&body=<enkodet {"dimensions": [{"code": "DAAR", "filter": "item", "values": ["1996"]}, {"code": "KJONN", "filter": "item", "values": ["Total"]}, {"code": "HJERTEKAR", "filter": "item", "values": ["Total"]}, {"code": "MEASURE_TYPE", "filter": "item", "values": ["RATE_NO"]}], "response": {"format": "json-stat2"}}> as df
```
1 rad, kolonner: DAAR, KJONN, HJERTEKAR, MEASURE_TYPE, value

### POST json-stat2 (nokkel/394)
```python
# load /api/hent?url=<enkodet https://statistikk-data.fhi.no/api/open/v1/nokkel/table/394/data>&body=<enkodet {"dimensions": [{"code": "GEO", "filter": "item", "values": ["0"]}, {"code": "AAR", "filter": "item", "values": ["2002_2002"]}, {"code": "KJONN", "filter": "item", "values": ["0"]}, {"code": "ALDER", "filter": "item", "values": ["2_2"]}, {"code": "VAKSINE", "filter": "item", "values": ["Difteri"]}, {"code": "MEASURE_TYPE", "filter": "item", "values": ["RATE"]}], "response": {"format": "json-stat2"}}> as df
```
1 rad, kolonner: GEO, AAR, KJONN, ALDER, VAKSINE, MEASURE_TYPE, value


## Kjente feller (målt i denne utforskningen)
ALLE dimensjoner må filtreres (400 ellers); kun json-stat2; POST via proxyens body-param i appen.

## Økosystem (klientpakker)

Adapterne er førstevalget i appen. Python-pakkene under KAN brukes i
python-modus (auto-installeres ved import; sdmx→sdmx1-aliaset finnes)
der adapterne ikke dekker behovet — MEN aldri mot STYRTE kilder
(pakkens HTTP avvises av skinnen), og requests-baserte pakker kan
feile i wasm (kun urllib er patchet). For portable skript utenfor
appen gjelder pakkene fullt ut.

- Ingen kjente dedikerte klientpakker — bruk API-formene over direkte.


## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
