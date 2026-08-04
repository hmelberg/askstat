# IPUMS (NHIS/MEPS/International) — kildeguide (survey-mikrodata, asynkron extract-API)

kilde: developer.ipums.org/docs/v2 (microdata.yml, OpenAPI), verifisert live 2026-08-04

## Ingen read-adapter — bruk proxy-formen direkte

IPUMS har INGEN `kind` i registeret → ingen kanonisk `ipums.read(...)`-form
finnes. ALL tilgang (liste, hent, send inn) går via den generiske
proxy-direktivformen:

- GET: `# navn = ost.read("/api/hent?url=<mål>")`
- POST (GET-innpakket): `# navn = ost.read("/api/hent?url=<endepunkt>&body=<url-enkodet JSON>")`

Nøkkelen injiseres av `/api/hent` i `Authorization`-headeren automatisk for
ALT mot verten `api.ipums.org` (host-match mot registerets `base_url`) — ta
ALDRI med nøkkelen selv i URL-en eller JSON-en.

## Tre samlinger (collections)

- `nhis` — National Health Interview Survey (USA, helse, person-/husholdningsnivå)
- `meps` — Medical Expenditure Panel Survey (USA, helseutgifter, panel)
- `ipumsi` — IPUMS International (folketellinger/surveys, mange land)

Base `https://api.ipums.org/`, ALLE kall tar `version=2`.

## Den TILSTANDSLØSE flyten (fire steg, i rekkefølge)

### 1. Sjekk nylige extracts FØRST (aldri send inn blindt)

Verifisert 2026-08-04: `GET /extracts?collection=<coll>&version=2` med
gyldig `Authorization`-header svarer 200 med en liste; uten nøkkel 401
(«Authorization field missing»), med ugyldig nøkkel 403 («Invalid API
key») — endepunktet og parameterformen er altså korrekt. Ferdig
url-enkodede directiv-URL-er (bytt kun `collection`-verdien):

- nhis: `/api/hent?url=https%3A%2F%2Fapi.ipums.org%2Fextracts%3Fcollection%3Dnhis%26version%3D2`
- meps: `/api/hent?url=https%3A%2F%2Fapi.ipums.org%2Fextracts%3Fcollection%3Dmeps%26version%3D2`
- ipumsi: `/api/hent?url=https%3A%2F%2Fapi.ipums.org%2Fextracts%3Fcollection%3Dipumsi%26version%3D2`

Eksempel:

```
# nylige = ost.read("/api/hent?url=https%3A%2F%2Fapi.ipums.org%2Fextracts%3Fcollection%3Dnhis%26version%3D2")
```

Svaret er en JSON-liste (nyeste først), hvert element har `number`,
`status` (`queued`/`completed`/`failed` m.fl.), `extractDefinition`
(description, samples, variables, dataStructure …) og `downloadLinks`
(tomt objekt til extracten er `completed`).

### 2. Finnes en FERDIG extract som dekker spørsmålet?

Se etter et element med `status: "completed"` der `extractDefinition`
faktisk inneholder de samples/variablene spørsmålet trenger — match på
INNHOLDET, gjett aldri at en gammel extract passer uten å sjekke. Treff →
last ned `downloadLinks.data.url` via samme proxy:

```
# data = ost.read("/api/hent?url=<url-enkodet downloadLinks.data.url>")
```

`downloadLinks.data.url` ligger ofte på en ANNEN vert enn `api.ipums.org`
(tidsbegrenset nedlastingslenke) — nøkkelen injiseres da IKKE (host
matcher ikke `base_url`), men lenken er normalt selvstendig gyldig uten
nøkkel. Feiler nedlastingen: ikke fabriker innhold — gå videre til steg 3.

### 3. Ingen treff → send inn en NY extract (POST GET-innpakket)

Kroppen er IPUMS' `DataExtract`-JSON. Obligatoriske felt: `description`
(fri tekst), `dataFormat` (`"csv"` er tryggest for videre pandas/R-lesing),
`dataStructure` (`{"rectangular": {"on": "P"}}` for personnivå-rader),
`samples` (objekt med samplekode(r) som nøkler, f.eks. IPUMS International
bruker landkode+år som `no2011a`) og `variables` (objekt med
variabelnavn som nøkler, store bokstaver, f.eks. `YEAR`, `AGE`, `SEX`).

Samplekoder og variabelnavn er SAMLING-SPESIFIKKE og står IKKE i vårt
register (IPUMS har ingen søkbar katalog via `search_catalog` her) — finn
dem på IPUMS' egen extract-bygger eller variabel-dokumentasjon
(web_search/web_fetch mot nhis.ipums.org / meps.ipums.org /
international.ipums.org) FØR du bygger URL-en. Gjett dem ALDRI, og merk i
svaret at kodene kommer fra IPUMS' dokumentasjon, ikke fra registeret.

Body-eksempel (url-enkod HELE denne JSON-en inn i `body=`):

```json
{
  "description": "askstat-uttrekk",
  "dataFormat": "csv",
  "dataStructure": {"rectangular": {"on": "P"}},
  "samples": {"<SAMPLE_KODE>": {}},
  "variables": {"YEAR": {}, "<VARIABEL>": {}}
}
```

Direktivform:

```
# ny = ost.read("/api/hent?url=https%3A%2F%2Fapi.ipums.org%2Fextracts%3Fcollection%3Dnhis%26version%3D2&body=<url-enkodet JSON over>")
```

Svaret gir en `number` og `status: "queued"` — noter extract-nummeret til
polling.

### 4. Poll ÉN gang, deretter AVSLUTT ÆRLIG

Gjenta steg 1-kallet (eller `GET /extracts/{number}?collection=<coll>&version=2`
for akkurat denne extracten) ÉN gang. Fortsatt ikke `completed`? Ikke lag
en pollingløkke og ikke fabriker et resultat — skriv i sluttsvaret:

> «Extract er sendt inn (nummer N) — spør igjen om ~5 minutter, så
> plukker jeg den opp.»

Dette ER et vellykket utfall, ikke en feil eller et ufullstendig svar —
IPUMS-extracts tar typisk flere minutter å bygge server-side. Si det rett
ut; ALDRI lat som dataene er lastet før `status: "completed"` faktisk er
observert i et faktisk API-svar.

## Mikrodata-etikk (obligatorisk, gjelder ALLTID)

- ALDRI videredistribuer rå IPUMS-mikrodata (enkeltrader) i svaret eller i
  noen fil brukeren tar med seg ut — vis kun AGGREGERTE tall (andeler,
  gjennomsnitt, krysstabeller). Aggreger FØR visning, ikke etter.
- Siter IPUMS ved bruk (IPUMS' brukeravtale krever attribusjon i
  publiserte resultater).
- Respekter IPUMS' bruksvilkår (ipums.org/about/terms) — forskningsbruk,
  ikke kommersiell videresalg av mikrodata.

## Nøkkel

Gratis konto på ipums.org → API key (Account → API Keys). Registreres i
AI-innstillingene som brukernøkkel (IKKE en miljøvariabel) — `/api/hent`
injiserer den i `Authorization`-headeren for alt mot `api.ipums.org`.
