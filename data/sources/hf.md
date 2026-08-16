---
id: hf
navn: Hugging Face Datasets
utgiver: (varierer — HF-brukere)
tillit: etablert
tilgang: rest
base_url: https://datasets-server.huggingface.co/
cors: true
tags: [mikro]
order: 29
---

# Hugging Face Datasets

## Kort

søk + typet forhåndsvisning + auto-konvertert parquet, alt CORS-åpent uten nøkkel; mye er uoffisielle kopier — foretrekk primærkilder og sjekk lisens/proveniens; gated datasett støttes ikke — se guiden

## Guide

# hf — Hugging Face Datasets (kildeguide)

kilde: huggingface.co/docs/datasets-server, verifisert live 2026-08-06

## Hva dette er — og når det skal brukes

Verdens største ML-datasetthub. For askstat er dette en LANGHALE-kilde:
tabulære datasett som ikke finnes hos offisielle kilder (eller er
tungvinte der). Mye er UOFFISIELLE KOPIER av UCI/Kaggle/WB-data med
uklar proveniens — **foretrekk alltid primærkilder**; sjekk `license`-
taggen og opphav før bruk, og si i svaret at kilden er en HF-opplasting.

Alt under er nøkkelfritt og CORS-åpent for offentlige datasett
(verifisert) — direkte `ost.read` uten proxy. Gated/private datasett gir
401 og støttes IKKE — degrader ærlig.

## 1. Søk (Hub-API)

```
# treff = ost.read("https://huggingface.co/api/datasets?search=census&filter=modality:tabular&limit=20")
```

→ liste med `id` (eier/navn), `downloads`, `likes`, `tags` (inkl.
`format:csv`, `size_categories:…`, `license:…`), `description`.
**Bruk alltid `filter=modality:tabular`** — uten den drukner treffene i
LLM-korpora. Rate: 500 kall/5 min.

## 2. Størrelses-sjekk FØR nedlasting

```
# str = ost.read("https://datasets-server.huggingface.co/size?dataset=<eier%2Fnavn>")
```

→ `num_rows`, `num_bytes_parquet_files`, `num_columns` per config/split.
Over ~50 MB parquet: IKKE last hele — bruk /rows eller /filter (under).

## 3. Forhåndsvisning med typet skjema

```
# rader = ost.read("https://datasets-server.huggingface.co/rows?dataset=scikit-learn%2Fadult-census-income&config=default&split=train&offset=0&length=100")
```

→ `{features: [{name, type}], rows: [{row_idx, row: {...}}]}` — skjema og
data i ett. `length` maks 100 (verifisert — mer gir 200-MED-FEILKROPP
`{"error": ...}`; sjekk for `error`-felt!). `offset` gir random access.

## 4. Hele datasettet som parquet

```
# pq = ost.read("https://datasets-server.huggingface.co/parquet?dataset=<eier%2Fnavn>")
```

→ direkte parquet-URL-er per split (auto-konvertert for alle offentlige
datasett; CORS-åpne, verifisert). `pd.read_parquet(<url>)` rett inn.

## 5. Server-side filter (store datasett)

```
https://datasets-server.huggingface.co/filter?dataset=...&config=default&split=train&where="age">80&offset=0&length=100
```

Henter en skive uten å laste alt (`where` må url-enkodes). FELLE: første
kall mot et «kaldt» datasett kan time ut — prøv én gang til før du gir opp.

## Typiske spørsmål

- «Finnes det et tabellarisk datasett om census/inntekt jeg kan bruke?»
- «Hent hele et bestemt Hugging Face-datasett som en dataframe»
- «Er dette HF-datasettet en pålitelig kilde, eller en uoffisiell kopi?»

## Oppskrift: søk + hent parquet direkte (verifisert 2026-08-16)

```
# treff = ost.read("https://huggingface.co/api/datasets?search=census&filter=modality:tabular&limit=20", kind="json")
# df = ost.read("https://huggingface.co/datasets/scikit-learn/adult-census-income/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet", kind="parquet")
```

Verifisert 2026-08-16: søket ga 20 treff med lesbare kolonner (`id`,
`downloads`, `likes`, `tags`); `scikit-learn/adult-census-income` var
treff nr. 2. Parquet-lesingen ga 32 561 rader × 15 kolonner (`age`,
`workclass`, … `income`). FELLE (STILLE FEIL): søke-URL-en har INGEN
`.json`-endelse, så `ost.read` UTEN `kind="json"` gjetter CSV og gir
en søppel-dataframe UTEN feilmelding (verifisert: 0 rader, 563
hulter-til-bulter-kolonner) — alltid `kind="json"` på
`/api/datasets`-søket. Parquet-mønsteret over
(`.../resolve/refs%2Fconvert%2Fparquet/{config}/{split}/0000.parquet`)
virker for datasett med ÉTT parquet-shard (de fleste små/middels); for
større, delte datasett: bruk `/parquet`-endepunktet (avsnitt 4 over)
og hent riktig `url` derfra i stedet for å gjette filnavnet.

## Feller

- datasets-server-feil kommer ofte som **200 med `{"error": ...}`-kropp**
  — sjekk alltid for `error`-feltet før parsing.
- `dataset`-parameteren trenger url-enkodet `/` (`eier%2Fnavn`).
- Config/split-navn varierer (`default`/`train` er vanligst) — /size
  eller /parquet viser de faktiske navnene.
- Croissant-metadata (skjema som JSON-LD): 
  `https://huggingface.co/api/datasets/{eier/navn}/croissant` — nyttig
  når kolonnebetydning er uklar.

## Sitering

Siter HF-datasettets `id` + opplaster, OG den oppgitte originalkilden
når den finnes — HF-opplastingen er distribusjonskanalen, ikke kilden.

## Om kilden

Hugging Face Datasets — a hub of machine-learning datasets with tabular search and preview; many entries are unofficial copies of other sources, so check provenance and license.

