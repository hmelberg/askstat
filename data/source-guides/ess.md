# ESS — European Social Survey (kildeguide, survey-mikrodata via åpen REST-API)

kilde: api.ess.sikt.no/docs (OpenAPI), full nedlastingsflyt verifisert live 2026-08-06

## Komplett eksempel (runde 11, csv, missing rekodet)

ESS har ingen `kind` i registeret, så `table_metadata` gir ingen
`lese_linje` (kun pxweb/sdmx-kilder får den) — eksempelet under ER
derfor den kanoniske lese-linjen for ESS: kopier og juster kun
DOI-suffiks/format. Den er ferdig verifisert — `ess.read` trenger aldri
probe (probe avviser uansett alle rå ESS-URL-er).

```
# ess = ost.connect("ess")
# ess11 = ess.read("v1/data/dataFile/10.21338/ess11e01_0?fileFormat=csv&recodeMissingValues=true")
```

`ess.read(...)` limer registerets `base_url` sammen med stien du gir —
skriv ALDRI `ost.read("/api/hent?url=<full ESS-URL>")`: ESS er en STYRT
kilde, og en slik literal URL (selv proxy-innpakket) avvises av
verktøyene. Ta ALDRI med `userId` selv — nøkkelen (`ESS_API_KEY`, en
ESS-bruker-ID Sikt selv dokumenterer som sporings-ID) injiseres
server-side fordi kilden har `cors: false` og `auth` i registeret.
Verifisert live 2026-08-06 (ekte bruker-ID): runde 11-csv ga **32,4
MB**, kolonner `name, essround, edition, proddate, idno, cntry,
dweight, pweight, nwspol, …`.

## Typiske spørsmål

- «Er nordmenn lykkeligere enn tyskere?» / «Sammenlign livstilfredshet i Norge og Tyskland»
- «Hvor lykkelige er skandinaver sammenlignet med resten av Europa?»
- «Har mellommenneskelig tillit endret seg over tid i Norge?» (trend — flere runder)

## Oppskrift: lykke/livstilfredshet Norge vs Tyskland (verifisert 2026-08-16)

```
# ess = ost.connect("ess")
# ess11 = ess.read("v1/data/dataFile/10.21338/ess11e01_0?fileFormat=csv&recodeMissingValues=true")
# sub = ess11[ess11.cntry.isin(["NO","DE"])].assign(w=lambda d: d.dweight*d.pweight)
```

Verifisert 2026-08-16: 22 190 rader × 558 kolonner (13 land i e01).
Kolonnene MANGLER `anweight` (sjekket — ikke i lista) — derfor
dweight×pweight-fallbacken over. Vektet snitt `happy` (0–10): NO =
**7,95**, DE = **7,76** (`stflife`, 0–10: NO = 7,78, DE = 7,67). Si
ALLTID i svaret at vekten er dweight×pweight (ikke ekte anweight) fordi
e01 er en tidlig utgave — en senere utgave med anweight brukes direkte.

## Sti og parametre (DOI, format)

Stien til `.read(...)` er
`v1/data/dataFile/<doiPrefix>/<doiSuffix>?fileFormat=csv|parquet|sav|dta[&recodeMissingValues=true]`.

- DOI-er er på FIL-nivå: prefix `10.21338`, suffiks som `ess11e01_0`
  (= ESS runde 11, hovedfil, utgave 01_0; mønster `ess{runde}e{utgave}`).
  Studie-DOI-er (NSD-ESS10-2020-typen) virker IKKE her.
- `recodeMissingValues=true` rekoder ESS' missing-koder (66/77/88/99-
  familien) til ekte missing — bruk den, ellers MÅ du filtrere kodene selv.
- Suksess er et signert, tidsbegrenset filsvar (~1 t gyldig) — kjør et
  nytt `read(...)`-kall i stedet for å gjenbruke en tidligere URL.
- **50 MB-fella (målt i smoke 2026-08-06):** siste UTGAVE av en runde
  (f.eks. ess11e04_0, 31 land) er >50 MB som CSV → proxyen AVKORTER
  (`x-hent-truncated`) og lesingen feiler. Velg `fileFormat=parquet`
  (mye mindre) og/eller en tidlig utgave (e01, færre land) når landene
  dine er med — sjekk landlisten FØR du velger fil, ikke etter.
- Svært store filer er ekskludert fra API-et (dokumentert); kumulative
  flerlandsfiler kan mangle — degrader da til per-runde-filer.

## Finn DOI-suffikser og variabler

Registeret har ingen søkbar ESS-katalog. Finn runde/fil og variabelnavn via:

- ESS Data Portal: https://ess.sikt.no (variabelsøk, kodebøker, spørreskjema)
- web_search/web_fetch mot europeansocialsurvey.org (spørreskjema per runde)
- CESSDA-kilden (`cessda`) finner ESS-studiene med DOI-er og sammendrag

Vanlige variabler: `cntry` (ISO2), `essround`, `agea` (alder), `gndr`,
`health` (egenvurdert helse, 1=very good … 5=very bad), `happy` (0–10),
`stflife` (0–10), analysevekt `anweight` (bruk denne; også `dweight`,
`pspwght`, `pweight`).

## Analyseregler (survey)

- Bruk `anweight` for populasjonsestimater. NB (målt 2026-08-06):
  TIDLIGE utgaver (e01) MANGLER anweight — sjekk kolonnene; fallback er
  `dweight * pweight` (design- × populasjonsvekt, tilnærmer anweight).
  Si ALLTID i svaret hvilken vekt som faktisk ble brukt.
- Uten `recodeMissingValues=true`: 66/77/88/99-koder (og 6666/7777/…) er
  refusal/don't know/not applicable — filtrer FØR beregning.
- Sammenlign land KUN innen samme runde med mindre spørsmålet gjelder trend.
- Last én runde av gangen (filene er ~30 MB) og bruk `usecols` når
  spørsmålet tillater det.

## Etikk

- Vis kun AGGREGATER (andeler, snitt, krysstabeller) — aldri enkeltrader.
- Siter «European Social Survey ERIC» med runde og DOI i svaret.
- Respekter ESS' vilkår (ikke-kommersiell forskning/utdanning).
