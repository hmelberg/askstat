# R-prompt-dtypes-runden — design (2026-07-28)

**Mål:** MODE_R i data-svar-prompten lærer dtype-håndtering (samme
overraskelsesprinsipp-pedagogikk som MODE_PY fikk i dtypes-prompt-runden) og
de nye R-veiene fra r-factor-runden (`ost_read_csv`/`ost_convert_dtypes`).
Måles med eval-harnessen på R-modus-spørsmålene før merge.

## §1 MODE_R får DTYPES-seksjon (speiler MODE_PY-strukturen)

- STANDARD R-idiomer først (portabilitet — «samme kode gir samme ramme i
  RStudio»): `colClasses = c(<kol> = "character")` for kodekolonner med
  ledende nuller, eksplisitt dato/kvartal-håndtering, `factor(...)`.
- Samme tre vanskelige klasser som MODE_PY navngir (koder/datoer/kategorier)
  — ETT idiom, ikke meny.
- `ost_read_csv(url)`/`ost_convert_dtypes(df, meta=url)` som eksplisitt
  metadata-vei, med ÆRLIG ramme: **«KUN I OPENSTAT (ikke RStudio)»** —
  R-tvillingen er app-infrastruktur (js/ost-r.js), ingen R-pakke. (Metadata-
  rundens lærdom: hjelpeteksten lovet en gang ost.read_csv i RStudio —
  task-reviewer fanget det; prompten skal ikke gjenta feilen. MODE_PY-
  omtalen er portabel og forblir uendret.)
- Nye kodeblokk-eksempler må parse rent i direktivgrammatikken (deno-vakten
  parser promptens egne eksempelblokker — DELIVERY-halekommentar-fella).

## §2 Kriterium 12 utvides til R

- «generert python-kode» → «generert python/R-kode»; R-formene navngis
  (colClasses / as.Date / ost_read_csv m/ kun-i-appen-forbeholdet).
- Ingen andre kriterier røres.

## §3 Deno-vakter

- MODE_R-needle-lista i data-svar-prompt.test.ts utvides (colClasses,
  ost_read_csv, KUN I OPENSTAT). TDD: needles først (rød), så prompt.

## §4 Måling (port før merge)

- Batch i r-modus, Deep: q3 (boligpris/lønn — r-bro-sporet), q7 (OWID),
  q14 (statfin+ssb flerkilde-join — join-nøkkel-kriteriet er kjernen).
- Verify-fellene gjelder: TS-endring → RESTART netlify dev + 400-smoke +
  GET /data/data-sources.json=200 FØR måling; nøkkel fra .env.
- Bedømming: kriterium 12-R (joiner/grupperer koden på talltolkede
  kodekolonner?) + de vanlige (ingen re-fetch av direktivvariabler, ærlig
  probe-merking). Resultat logges i docs/eval/data-svar-evalsett.md.

## §5 Utenfor scope

- Mini-modusene (data-svar har kun python/r/duckdb — DataMode-typen).
- DST-cors-quirk/dynamisk-URL-regelen fra q15-funnet (egen spak, kø).
- MODE_PY/MODE_DUCK uendret.
