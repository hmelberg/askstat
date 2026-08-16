---
id: kaggle
navn: Kaggle Datasets
utgiver: (varierer — Kaggle-brukere)
tillit: etablert
tilgang: rest
base_url: https://www.kaggle.com/api/v1/
cors: false
auth:
  type: api_key
  user: true
  valgfri: true
  plassering: basic
nokkel_hint: brukernavn:nøkkel — lag på kaggle.com → Settings → API
sporrings_url_mal: https://www.kaggle.com/api/v1/datasets/download/{eier}/{slug}/{filnavn}
order: 12
---

# Kaggle Datasets

## Kort

krever brukernøkkel (Basic auth via /api/hent); åpne datasett kan hentes uten nøkkel; privat-/konkurransedata krever registrert nøkkel; nedlasting redirecter til Google Storage (proxyen følger); enkeltfil-URL gir fila, uten {filnavn} kommer hele datasettet som zip (unngå); datasett er ofte uoffisielle kopier — foretrekk primærkilder og sjekk lisens; katalogsøk verifisert nøkkelfritt + CORS-åpent 2026-08-06: GET https://www.kaggle.com/api/v1/datasets/list?search={q} (felter: ref/title/totalBytes/licenseName/downloadCount) — bruk det FØR web_search; fil-liste-endepunktet datasets/list/files er dødt (404)

### Oppskrift: laste ned et ÅPENT datasett (verifisert 2026-08-16)

```
# df = pd.read_csv("https://www.kaggle.com/api/v1/datasets/download/<eier>/<slug>/<filnavn>", compression="zip")
```

Verifisert mot `imdevskp/corona-virus-report/covid_19_clean_complete.csv`
UTEN nøkkel: 49 068 rader × 10 kolonner — Norge 2020-07-27: 9132
bekreftede tilfeller. Endepunktet redirecter til en tidsbegrenset Google
Storage-lenke som her ga csv-en ZIPPET (derfor `compression="zip"` — uten
den: `UnicodeDecodeError`). Dette virker KUN for offentlig tilgjengelige
datasett; private/konkurranse-datasett og enkelte eiere svarer 401/403 og
krever da registrert nøkkel (Basic auth via `/api/hent`, se «Kort»
øverst) — prøv alltid nøkkelfritt først.

## Typiske spørsmål

- Finn et Kaggle-datasett om [tema] og last ned csv-en.
- Søk i Kaggle-katalogen etter datasett om [emne] (uten å logge inn).

## Om kilden

Kaggle Datasets — a community platform of user-uploaded datasets across many topics; provenance and licensing vary by dataset.

