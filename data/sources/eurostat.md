---
id: eurostat
navn: Eurostat (dissemination API)
utgiver: Eurostat
tillit: offisiell
tilgang: rest
base_url: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/
cors: true
join_nokler: [geo (NUTS/ISO2), time]
sporrings_url_mal: https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{dataset}/?format=SDMX-CSV&{dim}={kode}
kind: eurostat
styrt: true
tags: [makro]
order: 1
---

# Eurostat (dissemination API)

## Kort

Norge er med i de fleste Eurostat-datasett (EFTA-rapportering), ofte også regionalt (NUTS: NO0…-koder). Datasettkoder er små bokstaver (f.eks. nama_10_gdp, hlth_sha11_hf) — store bokstaver gir treff-feil.

## Guide

# Eurostat — kildeguide

## Komplett eksempel (Norges BNP, løpende priser)

Eurostat er en styrt kilde uten `kind`-basert `lese_linje` fra
`table_metadata` (kun pxweb/sdmx-kilder får den) — eksempelet under ER
derfor den kanoniske lese-linjen for eurostat: kopier og juster kun
datasettkode/filtre. Flere land angis ALLTID som
`countries=["NO", "SE", "DK"]` — aldri som kommaliste i filters
(`filters={"geo": "NO,SE"}` svarer Eurostat STILLE TOMT på). Den er ferdig verifisert — `eurostat.read` trenger
aldri probe (probe avviser uansett alle rå eurostat-URL-er).

```
# e = eurostat.read("nama_10_gdp", years="2015:2024", filters={"geo": "NO", "unit": "CP_MEUR", "na_item": "B1GQ"})
```

Verifisert live 2026-08-14 (Norges BNP i løpende priser, mill. euro, 2015–2024).

- Kildens EGNE dimensjoner (geo, unit, na_item, sex, age, siec …) kan gis i filters={} ELLER skrives direkte som egne parametre på direktivlinja (f.eks. `geo="NO", unit="PC_GDP"`) — de oversettes automatisk til filters. indicators= finnes IKKE for eurostat (velg med filters); countries=/regions= aksepteres og oversettes til geo=-parametre — men foretrekk filters={"geo": "..."} så utvalget står samlet ett sted.
- geo-koder er Eurostats egne: "NO" (ikke NOR), EU-aggregat "EU27_2020". Sjekk kodene med table_metadata(find="Norway") — aldri gjett.
- years="2015:2024" oversettes til sinceTimePeriod/untilTimePeriod. Kvartals-/månedsdata: filtrer heller med kildens egne tidskoder via filters.
- Uttrekk uten filters kan bli enorme — velg alltid geo + de sentrale dimensjonene eksplisitt.
- **unit-fella (målt eval-rundene 2–3, une_rt_m):** tabeller med en
  unit-dimensjon leverer FØRSTE unit-kategori STILLE når `unit=` utelates
  — for ledighets-/rate-tabeller får du da absoluttall (THS_PER) som ser
  ut som rare prosenter. Sett ALLTID `unit=` eksplisitt (ledighetsrate:
  `unit="PC_ACT"`); gyldige koder står i table_metadata.
- **Rangeringer/flerlandssammenligninger:** behold geo-kolonnen hele
  veien og merge/sortér PÅ den — aldri posisjonsjoin av separate verdi-
  og landlister (målt: riktige verdier koblet til feil land tre av tre
  runder når dette glapp). Print (geo, value)-parene før du rangerer.
- **Glissen siste måned (målt ×2, une_rt_m juli 2026):** siste periode i
  månedstabeller kan mangle tall for noen land — pivot/fyll på tvers gir
  da STOKKEDE verdier som ser plausible ut. For rangeringer: bruk siste
  KOMPLETTE periode (dropp perioder med NaN for noen av enhetene), og
  aldri ffill/bfill på tvers av enheter.
- **Revisjonstabeller (målt r6-1): unngå tabeller med `revdate`-dimensjon**
  (sanntids-/revisjonsvarianter, ofte `_rt`-suffiks) for vanlige spørsmål —
  hundrevis av revisjonsdatoer per serie brenner kjøringer; bruk
  standardtabellen (une_rt_m er OK — «rt» der er del av navnet, ikke
  revisjonsdimensjon).

## Om kilden

Eurostat — official EU/EFTA statistics (incl. Norway): economy, population, health, environment, and other harmonized European indicators.

