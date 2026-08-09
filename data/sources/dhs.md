---
id: dhs
navn: DHS Program (indikator-API)
utgiver: USAID / ICF
tillit: offisiell
tilgang: rest
base_url: https://api.dhsprogram.com/rest/dhs/
cors: true
tags: [mikro]
order: 27
---

# DHS Program (indikator-API)

## Kort

helse-/demografiindikatorer fra 374 surveys i 90+ lav-/mellominntektsland (aggregert, CORS-åpen, nøkkelfri); survey-mikrodataene krever søknad+godkjenning — se guiden

## Guide

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

## Om kilden

DHS Program — aggregated demographic and health indicators (fertility, child mortality, vaccination, nutrition) from 374 surveys in 90+ low- and middle-income countries.

