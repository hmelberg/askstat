# ESS — European Social Survey (kildeguide, survey-mikrodata via åpen REST-API)

kilde: api.ess.sikt.no/docs (OpenAPI), full nedlastingsflyt verifisert live 2026-08-06

## Hva dette er

Europas viktigste holdnings-/velferdssurvey: ~30 land (inkl. Norge), 11
runder 2002–2023, personnivå. Sterke moduler om helse, velferdsstat,
tillit, subjektiv livskvalitet. Data leveres per FIL-DOI (én fil per
runde/utgave), format parquet (default), csv, sav eller dta.

## Ingen adapter — proxy-formen direkte, nøkkelen injiseres

ESS har ingen `kind` i registeret → ingen kanonisk `ess.read(...)`.
API-et sender ingen CORS-headere, og site-nøkkelen (`ESS_API_KEY` — en
ESS-bruker-ID Sikt selv dokumenterer som sporings-ID, ikke autentisering)
injiseres av `/api/hent` som `userId`-queryparam for alt mot verten
`api.ess.sikt.no`. Ta ALDRI med userId selv — bare bruk proxy-formen:

```
# navn = ost.read("/api/hent?url=<url-enkodet mål UTEN userId>")
```

## Endepunktet (ett)

```
GET https://api.ess.sikt.no/v1/data/dataFile/{doiPrefix}/{doiSuffix}
    ?fileFormat=csv|parquet|sav|dta[&recodeMissingValues=true]
```

- DOI-er er på FIL-nivå: prefix `10.21338`, suffix som `ess11e01_0`
  (= ESS runde 11, hovedfil, utgave 01_0; mønster `ess{runde}e{utgave}`).
  Studie-DOI-er (NSD-ESS10-2020-typen) virker IKKE her.
- `recodeMissingValues=true` rekoder ESS' missing-koder (66/77/88/99-
  familien) til ekte missing — bruk den, ellers MÅ du filtrere kodene selv.
- Suksess = **307-redirect** til en signert Azure-fil-URL (~1 time
  gyldig) — proxyen følger redirecten; ikke gjenbruk den signerte URL-en
  senere, gjør heller et nytt kall.
- **50 MB-fella (målt i smoke 2026-08-06):** siste UTGAVE av en runde
  (f.eks. ess11e04_0, 31 land) er >50 MB som CSV → proxyen AVKORTER
  (`x-hent-truncated`) og lesingen feiler. Velg `fileFormat=parquet`
  (mye mindre) og/eller en tidlig utgave (e01, færre land) når landene
  dine er med — sjekk landlisten FØR du velger fil, ikke etter.
- Svært store filer er ekskludert fra API-et (dokumentert); kumulative
  flerlandsfiler kan mangle — degrader da til per-runde-filer.

Verifisert live 2026-08-06 (ekte bruker-ID): runde 11-csv = 200 via
307-redirect, **32,4 MB**, kolonner `name, essround, edition, proddate,
idno, cntry, dweight, pweight, nwspol, …` — inntil ~30 MB csv er OK i
appen, men foretrekk `fileFormat=parquet` (mindre og typet). Ugyldig/
manglende userId gir 400 med kode 205.

Eksempel (runde 11, csv, missing rekodet):

```
# ess11 = ost.read("/api/hent?url=https%3A%2F%2Fapi.ess.sikt.no%2Fv1%2Fdata%2FdataFile%2F10.21338%2Fess11e01_0%3FfileFormat%3Dcsv%26recodeMissingValues%3Dtrue")
```

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

- Bruk `anweight` for populasjonsestimater — IKKE `dweight` alene
  (designvekt uten post-stratifisering; smoken 2026-08-06 valgte feil).
  Si i svaret hvilken vekt som er brukt.
- Uten `recodeMissingValues=true`: 66/77/88/99-koder (og 6666/7777/…) er
  refusal/don't know/not applicable — filtrer FØR beregning.
- Sammenlign land KUN innen samme runde med mindre spørsmålet gjelder trend.
- Last én runde av gangen (filene er ~30 MB) og bruk `usecols` når
  spørsmålet tillater det.

## Etikk

- Vis kun AGGREGATER (andeler, snitt, krysstabeller) — aldri enkeltrader.
- Siter «European Social Survey ERIC» med runde og DOI i svaret.
- Respekter ESS' vilkår (ikke-kommersiell forskning/utdanning).
