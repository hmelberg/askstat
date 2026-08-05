# cdc — data.cdc.gov, Socrata SODA (kildeguide)

kilde: data.cdc.gov + dev.socrata.com, verifisert live 2026-08-06

## Hva dette er

CDCs åpne dataportal: 1 078 datasett (verifisert via katalog-API-et) —
BRFSS/PLACES-prevalens, NCHS-dødelighet (ledende dødsårsaker, provisoriske
tall), kroniske sykdomsindikatorer, vaksinasjonsdekning, NNDSS meldepliktige
sykdommer. **Aggregert statistikk, IKKE mikrodata** (få unntak). Nøkkelfritt,
CORS-åpent (`Access-Control-Allow-Origin: *` verifisert) — direkte
`ost.read` uten proxy.

## Spørreform (SODA)

```
https://data.cdc.gov/resource/{datasett-id}.json?$limit=1000
```

- `{datasett-id}` er en 4x4-kode (f.eks. `bi63-dtpu` = NCHS ledende
  dødsårsaker per delstat). Verifisert eksempel:

```
# dod = ost.read("https://data.cdc.gov/resource/bi63-dtpu.json?$limit=50000")
```

- SoQL server-side: `$select=`, `$where=`, `$group=`, `$order=`,
  `$limit=` (50 000 verifisert OK) + `$offset=` for paging. Enkle
  kolonnefiltre kan også skrives rett på: `?state=Vermont&year=2017`.
  NB: `$` må url-enkodes (`%24`) inne i en `/api/hent`-form; direkte
  `ost.read` tar den som den er.
- Alle verdier kommer som strenger — konverter numerisk eksplisitt.
- Bonus: svaret bærer `X-SODA2-Fields`/`X-SODA2-Types` (skjema gratis);
  metadata per datasett: `https://data.cdc.gov/api/views/{id}.json`.

## Finn datasett-ID-en

Registeret har ingen søkbar cdc-katalog — bruk Socratas discovery-API
(nøkkelfritt, verifisert):

```
# kat = ost.read("https://api.us.socrata.com/api/catalog/v1?domains=data.cdc.gov&q=leading%20causes%20death&limit=10")
```

→ treff med `resource.id` (4x4), navn, beskrivelse, kolonneliste. Probe
deretter selve resource-URL-en (✅-kravet gjelder som alltid).

## Feller

- Mange datasett finnes i «provisorisk» OG endelig utgave — si hvilken
  du bruker; provisoriske tall revideres.
- BRFSS-datasettene her er PREVALENSESTIMATER (allerede vektede), ikke
  rådata — for BRFSS-mikrodata: filene er ~1 GB, utenfor rekkevidde (si
  det ærlig). NHANES/NHIS-mikrodata: bruk `nchs`-kilden.
- App-token er valgfritt (kun throttling-prioritet) — ikke nødvendig.

## Sitering

Siter «CDC, {datasettnavn} (data.cdc.gov/{id})» + årgang.
