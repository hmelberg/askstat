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

## Om kilden

Kaggle Datasets — a community platform of user-uploaded datasets across many topics; provenance and licensing vary by dataset.

