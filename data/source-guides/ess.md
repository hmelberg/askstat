# ESS — European Social Survey (kildeguide, survey-mikrodata via åpen REST-API)

kilde: api.ess.sikt.no (OpenAPI på /docs/openapi), verifisert live 2026-08-06

## Hva dette er

Europas viktigste holdnings-/velferdssurvey: ~30 land (inkl. Norge), 11
runder 2002–2023, personnivå. Sterke moduler om helse, velferdsstat,
tillit, subjektiv livskvalitet. Data leveres per FIL-DOI (én fil per
runde/utgave), format parquet (default!), csv, sav eller dta.

## Ingen adapter — proxy-formen direkte

ESS har ingen `kind` i registeret → ingen kanonisk `ess.read(...)`.
API-et sender ingen CORS-headere, så ALT går via `/api/hent`:

```
# navn = ost.read("/api/hent?url=<url-enkodet mål>")
```

## Bruker-ID (IKKE en hemmelighet, IKKE en nøkkel)

Nedlastingskallet krever `userId=<uuid>` som queryparam. Dokumentert av
Sikt som «not for authentication — used to track usage statistics», men
den VALIDERES: ugyldig ID gir 400 med kode 205 («Error registering
download. Is the user ID valid?») — verifisert live 2026-08-06. Brukeren
skaffer ID-en med én gratis e-postregistrering på ess.sikt.no.

- ID-en er en sporings-ID — det er OK at den står i URL-en.
- Har brukeren ikke oppgitt ESS-bruker-ID (i profilen/pakken/spørsmålet):
  IKKE gjett en UUID. Si ærlig at gratis registrering på ess.sikt.no
  trengs, og tilby aggregerte fallbacks (eurostat/owid/dbnomics) i mellomtiden.

## Endepunktet (ett)

```
GET https://api.ess.sikt.no/v1/data/dataFile/{doiPrefix}/{doiSuffix}
    ?userId=<uuid>&fileFormat=csv|parquet|sav|dta[&recodeMissingValues=true]
```

- DOI-er er på FIL-nivå, prefix `10.21338`, suffix som `ess11e01_0`
  (= ESS runde 11, hovedfil, utgave 01_0). Mønster: `ess{runde}e{utgave}`.
- `recodeMissingValues=true` rekoder ESS' spesialkoder (66/77/88/99-familien)
  til ekte missing — bruk den, ellers MÅ du selv håndtere kodene (se under).
- Svært store filer er ekskludert fra API-et (dokumentert); kumulative
  flerlandsfiler kan mangle — degrader da til per-runde-filer.

Eksempel (runde 11, csv):

```
# ess11 = ost.read("/api/hent?url=https%3A%2F%2Fapi.ess.sikt.no%2Fv1%2Fdata%2FdataFile%2F10.21338%2Fess11e01_0%3FuserId%3D<BRUKER-ID>%26fileFormat%3Dcsv%26recodeMissingValues%3Dtrue")
```

UVERIFISERT (krever gyldig bruker-ID): selve 200-nedlastingen og eksakt
filstørrelse per runde er ikke live-testet — 400-valideringen beviser at
endepunkt og parameterform er riktige. Probe før du bygger svaret, som alltid.

## Finn DOI-suffikser og variabler

Registeret har ingen søkbar ESS-katalog. Finn runde/fil og variabelnavn via:

- ESS Data Portal: https://ess.sikt.no (variabelsøk, kodebøker, spørreskjema)
- web_search/web_fetch mot europeansocialsurvey.org (spørreskjema per runde)
- CESSDA-kilden (`cessda`) finner ESS-studiene med DOI-er og sammendrag

Vanlige variabler: `cntry` (ISO2), `essround`, `agea` (alder), `gndr`,
`health` (egenvurdert helse, 1=very good … 5=very bad), `happy` (0–10),
`stflife` (0–10), analysevekter `anweight` (post-stratifisering, bruk denne),
`dweight`, `pspwght`, `pweight`.

## Analyseregler (survey)

- Bruk `anweight` for populasjonsestimater; si i svaret om tall er vektet.
- Uten `recodeMissingValues=true`: koder som 66/77/88/99 (og 6666/7777/…)
  er refusal/don't know/not applicable — filtrer FØR beregning.
- Sammenlign land KUN innen samme runde med mindre spørsmålet gjelder trend.

## Etikk

- Vis kun AGGREGATER (andeler, snitt, krysstabeller) — aldri enkeltrader.
- Siter «European Social Survey ERIC» med runde og DOI i svaret.
- Respekter ESS' vilkår (ikke-kommersiell forskning/utdanning).
