# dhs — DHS Program indikator-API (kildeguide)

kilde: api.dhsprogram.com (åpen dokumentasjon på /rest/dhs), verifisert live 2026-08-06

## Hva dette er

Demographic and Health Surveys: standardiserte helse-/demografisurveys i
lav- og mellominntektsland siden 1984. API-et serverer AGGREGERTE
indikatorer (fertilitet, barnedødelighet, vaksinasjon, ernæring, HIV,
mødrehelse) beregnet fra surveyene — 374 surveys, 92 land (verifisert).
Nøkkelfritt, CORS-åpent (`Access-Control-Allow-Origin: *` verifisert) —
direkte `ost.read` uten proxy virker.

## Endepunkter (GET, JSON)

Base: `https://api.dhsprogram.com/rest/dhs/`

- Data: `data?indicatorIds=<ID>&countryIds=<ISO2>&perPage=1000&f=json`
  → `{TotalPages, Data: [{Indicator, Value, CountryName, SurveyYear,
  CharacteristicLabel, ...}]}`. Flere land/indikatorer: kommaseparert.
  Paging: `page=` + `TotalPages`. `perPage` opptil 5000 (dokumentert,
  uverifisert).
- Kataloger: `indicators?f=json` (indikator-ID-er + definisjoner),
  `surveys?f=json`, `countries?f=json`, `tags?f=json`.
- Nedbrytninger: `breakdown=national|subnational|background` — background
  gir by/land, utdanning, velstandskvintil (nyttig for ulikhetsspørsmål).

Eksempel (total fertilitetsrate, Egypt):

```
# tfr = ost.read("https://api.dhsprogram.com/rest/dhs/data?indicatorIds=FE_FRTR_W_TFR&countryIds=EG&perPage=1000&f=json")
```

Finn indikator-ID-en i `indicators`-katalogen FØRST (ID-ene er koder som
`FE_FRTR_W_TFR`, `CM_ECMR_C_U5M`) — gjett aldri.

## Typiske spørsmål

- «Hvilke helse-/levekårsundersøkelser finnes for Ghana?»
- «Er det gjort en DHS-survey i et gitt utviklingsland, og når?»
- «Hvor mange DHS-runder finnes for et land over tid?»

## Oppskrift: finn levekårsundersøkelser (DHS-surveyer) i et land (verifisert 2026-08-16)

```
# surveyer = ost.read("https://api.dhsprogram.com/rest/dhs/surveys?countryIds=GH&f=json")
```

Verifisert 2026-08-16: 200 OK, `RecordsReturned = 9` DHS-surveyer for
Ghana (1988–2022), bl.a. `GH2014DHS`. `countryIds` tar DHS' 2-bokstavs
landkode (IKKE alltid ISO2 — slå opp i `countries?f=json` ved tvil);
dette finner DATASETTENE (survey-metadata), ikke selve tallene — bruk
`data?indicatorIds=...&countryIds=...` (se Endepunkter over) for
aggregerte indikatorer fra en valgt survey.

## Feller

- Verdier gjelder SURVEYÅRET (SurveyYear) — ikke kalenderår-serier;
  land har hull mellom surveys. Ikke interpoler stille.
- Samme indikator kan finnes for flere survey-typer (DHS, MIS, AIS) —
  nevn survey-typen når det betyr noe.
- Kun lav-/mellominntektsland — nordiske/OECD-spørsmål hører hjemme i
  andre kilder.

## Mikrodataene (recode-filene)

Selve survey-mikrodataene krever gratis konto + prosjektsøknad med
godkjenning på dhsprogram.com — kan IKKE automatiseres her. Si det ærlig
når personnivå trengs; indikator-API-et + `breakdown=background` dekker
overraskende mye (andeler per kvintil/utdanning/region).

## Sitering

Siter «DHS Program, {SurveyId/SurveyYear}» — verdiene er offisielle
survey-estimater, allerede vektede.
