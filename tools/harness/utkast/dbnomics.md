# UTKAST: dbnomics (generert av tools/harness/utforsk.py 2026-08-15)
> Råmateriale for data/sources/dbnomics.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert 2026-08-15, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): unemployment, arbeidsledighet, harmonized, WEO, NGDP_RPCH

## Guide (hentelaget — eksempel først)
### Enkeltserie (IMF WEO Norge)
```python
dbnomics.read("IMF/WEO:latest/NOR.NGDP_RPCH", years="2020:2026")
```
7 rader, kolonner: series_code, unit, weo-country, weo-subject, period, value

### Flerserie-maske (+)
```python
dbnomics.read("IMF/WEO:latest/NOR+SWE.NGDP_RPCH", years="2022:2026")
```
10 rader, kolonner: series_code, unit, weo-country, weo-subject, period, value


## Kjente feller (målt i denne utforskningen)
Sti-/maskebasert kilde: ingen generisk metadata-probe — dimensjonskunnskapen bor i stien/masken (se lesemønstrene over).

## Søkenotater
Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over.
