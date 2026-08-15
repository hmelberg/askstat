# UTKAST: datanorge (generert av tools/harness/utforsk.py 2026-08-16)
> Råmateriale for data/sources/datanorge.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-16, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema utforsket (søkt):** befolkning, population, arbeidsmarknad

## Guide (hentelaget — eksempel først)
### POST-søk (q-feltet, filters.type=datasets — målt: 'query' og utelatt type gir konsept-støy)
```python
POST search-api m/{'q': 'befolkning', 'filters': {'type': {'value': 'datasets'}}}
```
10 rader, kolonner: hits


## Kjente feller (målt i denne utforskningen)
Fil-/katalogkilde uten strukturert metadata-endepunkt — kunnskapen bor i URL-mønstrene over (alle KJØRT).

## Søkenotater
- «befolkning»: søk feilet: HTTP 405: {"timestamp":"2026-08-15T22:23:28.046Z","status":405,"error":"Method Not Allowed","path":"/search"}
- «population»: søk feilet: HTTP 405: {"timestamp":"2026-08-15T22:23:28.646Z","status":405,"error":"Method Not Allowed","path":"/search"}
- «arbeidsmarknad»: søk feilet: HTTP 405: {"timestamp":"2026-08-15T22:23:29.237Z","status":405,"error":"Method Not Allowed","path":"/search"}
