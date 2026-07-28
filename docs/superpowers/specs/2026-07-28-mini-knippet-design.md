# Mini-knippet — design (2026-07-28)

**Mål:** Lukk de fire mini-oppfølgingene fra r-factor-runden: (1) sort_values
ignorerer kategoriorden, (2) ingen dtype-kwarg i mini-read_csv (ledende
nuller blir tall — 0301-vernet umulig), (3) ingen panel-typemeta for
mini-rammer, (4) convert_dtypes tar kun URL-meta. Kjernen KAN vokse (Hans'
stående ord fra pandas-paritet-runden).

## §1 sort_values respekterer _cats (begge tvillinger)

Ekte pandas sorterer category-kolonner etter KATEGORIORDEN (alltid — ordered
styrer kun sammenlikningsoperatorer, ikke sortering). Mini: DataFrame.sort_values
og Series.sort_values bruker kategoriindeks som nøkkel når `_cats`/`_cat`
finnes; verdier utenfor kategoriene (skal ikke finnes) → sist, som NaN.
ascending/na_position bevares. PARITETSTEST: sammenlign resultatet mot EKTE
pandas i pytest (CPython har begge). r-factor-låsetesten
(test_read_csv_time_kvartalskoder…) oppgraderes: sort_values-asserten som
måtte fjernes da, settes inn igjen — nå skal den bestå.

## §2 dtype-kwarg i mini-read_csv + 0301-vern i ost_core

- `read_csv(..., dtype=None)` i BEGGE tvillinger: dict `{kol: str|"str"|"object"}`
  → kolonnen beholder tekstform (ingen tallinferens for den); skalar
  `str`/"str" → alle kolonner tekst. Andre dtype-verdier → HØYLYTT
  ValueError («ikke støttet i mini-pandas») — aldri stille ignorering.
- shared/ost_core.py `read_csv(convert=True)`: typemeta hentes FØR parse
  (rekkefølgeflipp, R-tvilling-mønsteret), dims får dtype=str-vern —
  brukerens egen dtype-kwarg VINNER (dict flettes m/ bruker-vinner; skalar
  bruker-dtype → intet vern; py-tvillingens regel). Lukker den dokumenterte
  ledende-null-begrensningen: 0301-koder blir nå category.
- Dokumentasjon følger med: ost_core-docstring, smoke-eksemplene
  bry09/mpy12 (ledende-null-noten erstattes med forventet category), og
  hjelp.html/hjelp.en.html-parentesen «uten vern mot …» fjernes.

## §3 Panel-typemeta for mini-rammer (R-arkitekturen gjenbrukt)

- ost_core setter `df.attrs["ost_url"]` for gjenkjent kilde (uansett
  convert — R-paritet; mini-attrs finnes, bevist i test_meta_to_attrs).
- Runnernes `_dataset_info()` (brython_runner/micropython_runner) tar med
  `ost_url` fra attrs per ramme (tom/utelatt når fraværende).
- `refreshDatasetSidebarFromEngineInfo` (index.html:8681) forblir sync
  (boolsk retur brukes av kallstedene) — berikelsen er FIRE-AND-FORGET:
  etter første updateSidebarDatasets, hent typemeta via
  `ReadBridge.typemetaForUrl` for rammer med ost_url og kall
  updateSidebarDatasets på nytt når noe kom. Aldri blokkerende, feil →
  uberiket + console.warn.

## §4 dict-meta i convert_dtypes

`ost.convert_dtypes(df, meta=)` tar i tillegg py-formet typemeta-dict
(`{"dims": {did: {"categories": [...]}}, "time": [...]}`) — konverteres
lokalt til entries (ingen PxWeb-rundtur); URL-formen uendret; annet →
høylytt ValueError som i dag.

## §5 Testkontrakt

pytest (CPython, ekte mini-pandas): sort_values-paritet mot ekte pandas
(begge tvillinger), dtype-dict/skalar/ukjent-verdi (begge tvillinger),
vern-flyten i ost_core (0301 → category; bruker-dtype vinner), dict-meta,
ost_url-attrs, runner-_dataset_info m/ ost_url. node: kildetekst/logikk der
det er testbart; index.html-berikelsen dekkes av live-smoke (brython-modus:
Alder blir category + panelet viser etiketter). deno urørt.

## §6 Utenfor scope

parse_dates i mini-read_csv, heuristikk-meta=None, pyjstat-shim,
R-factor-knippet.
