---
id: cessda
navn: CESSDA Data Catalogue
utgiver: CESSDA ERIC
tillit: offisiell
tilgang: rest
kind: cessda
base_url: https://datacatalogue.cessda.eu/api/DataSets/v2/
cors: true
tags: [mikro]
order: 25
---

# CESSDA Data Catalogue

## Kort

40 000+ europeiske samfunnsvitenskapelige studier (inkl. Sikt/NSD-arkivet) — kun studienivå-metadata + landingssider, data hentes hos arkivet (ofte gratis registrering); limit ≤ 200 — se guiden

## Guide

# cessda — CESSDA Data Catalogue (kildeguide, europeisk studiesøk)

kilde: datacatalogue.cessda.eu/swagger/api/DataSets/v2 (OpenAPI), verifisert live 2026-08-06

## Hva dette er

Metadata-aggregator for de europeiske samfunnsvitenskapelige dataarkivene
(GESIS, UK Data Service, **Sikt/Norge**, SND, FSD, DANS m.fl.): 40 000+
studiebeskrivelser (DDI) fra 20+ land. Dette er SØKELAGET for europeiske
survey-/mikrodata — selve dataene bor hos arkivene (som regel bak gratis
registrering).

**Metadata ≠ data (E17):** treff her beviser at en studie FINNES — aldri
hva tallene er. Datafil må probes ✅ hos arkivet før noe tall bygges.

Kilden er SØKBAR direkte: `search_catalog(source='cessda', query=…)` —
og search_datasets(scope='research') søker den automatisk. Rå-formen
under er for filtrerte oppslag (land/år/tilgang).

## Ett endepunkt (GET, JSON, nøkkelfritt, CORS-åpent — verifisert)

```
GET https://datacatalogue.cessda.eu/api/DataSets/v2/search
    ?q=<ord>&limit=<≤200>&offset=&metadataLanguage=en
    [&studyAreaCountries=Norway][&classifications=...][&keywords=...]
    [&dataCollectionYearMin=2010&dataCollectionYearMax=2024][&publishers=...]
```

`Access-Control-Allow-Origin: *` verifisert — direkte `ost.read` virker:

```
# treff = ost.read("https://datacatalogue.cessda.eu/api/DataSets/v2/search?q=health%20survey&limit=20&metadataLanguage=en")
```

Svarform: `{ResultsCount: {available, retrieved, from, to}, Results: [...]}`.
Per treff: `titleStudy`, `abstract`, `creators`, `publisher`,
`pidStudies` (DOI-er), `studyUrl` (landingsside hos arkivet),
`studyAreaCountries`, `dataCollectionYear/Start/End`, `classifications`
(CESSDA-emnevokabular), `keywords` (ELSST), `typeOfModeOfCollections`,
`unitTypes`, `universe`, `dataAccess`/`dataAccessFreeTexts`, `series`,
til og med `studyXmlSourceUrl` (rå DDI-XML).

- `metadataLanguage=en` gir flest treff; `no` finnes for Sikt-poster.
- Verifisert: `studyAreaCountries=Norway&q=health` → 77 studier.
- INGEN variabelnivå-metadata i aggregatoren — følg `studyUrl`/DDI-XML
  til arkivet for kodebøker.

## Typiske spørsmål

- «Finnes det helseundersøkelser fra Norge?»
- «Hvilke norske studier finnes om levekår/valg?»
- «Er det gjort en survey om X i et gitt europeisk land?»

## Oppskrift: finn helseundersøkelser fra Norge (verifisert 2026-08-16)

```
# import json, urllib.request
# svar = json.loads(urllib.request.urlopen("https://datacatalogue.cessda.eu/api/DataSets/v2/search?q=health&limit=20&metadataLanguage=en&studyAreaCountries=Norway").read())
# treff = pd.json_normalize(svar["Results"]); antall = svar["ResultsCount"]["available"]
```

Verifisert 2026-08-16 (fersk kjøring): 200 OK, `ResultsCount.available =
77` studier. Eksempel blant treffene: «International Social Survey
Programme: Health and Health Care I-II Cumulation» (GESIS, ZA8794).
Bytt `studyAreaCountries=` for andre land og `q=` for andre tema.

## Bruksmønster

1. Søk (engelsk, smalt) → filtrer på land/år/`dataAccess`.
2. Les `abstract` + `universe` — ofte nok til å svare «finnes det en
   studie om X i land Y?» presist, med DOI-sitering.
3. Vil brukeren ha selve dataene: `studyUrl` → forklar arkivets
   tilgangsmodell ærlig (Sikt/GESIS: gratis konto; UKDS: registrering;
   noen studier: søknad). ESS-studier: bruk `ess`-kilden direkte.
4. Nordisk bonus: Sikt-arkivets norske studier (levekår, helse, valg)
   er søkbare her — det nærmeste askstat kommer et norsk
   mikrodata-søkelag uten innlogging.

## Sitering

Siter studiens DOI (`pidStudies`) + arkivet (publisher) når metadata
brukes i svaret; nevn CESSDA som søkevei bare når det er relevant.

## Om kilden

CESSDA Data Catalogue — a metadata aggregator for European social-science data archives (incl. Sikt/NSD for Norway) covering 40,000+ studies; data is hosted by the archives, often behind free registration.

