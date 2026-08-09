---
id: nchs
navn: CDC/NCHS surveyfiler (NHANES XPT, NHIS CSV)
utgiver: CDC / National Center for Health Statistics
tillit: offisiell
tilgang: fil
base_url: https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/
cors: false
tags: [mikro, usa]
order: 23
---

# CDC/NCHS surveyfiler (NHANES XPT, NHIS CSV)

## Kort

åpne helse-mikrodatafiler uten registrering; NHANES: XPT-filer (0,5–15 MB) via pandas.read_sas — GAMMEL sti gir 200-med-HTML (soft-404, sjekk content-type!); NHIS: csv-zip på ftp.cdc.gov — se guiden

## Guide

# nchs — CDC/NCHS surveyfiler: NHANES XPT + NHIS CSV (kildeguide)

kilde: wwwn.cdc.gov + ftp.cdc.gov, verifisert live 2026-08-06

## Hva dette er

Åpne amerikanske helse-mikrodata som DIREKTE filer — ingen registrering,
ingen nøkkel, ingen extract-kø:

- **NHANES** — National Health and Nutrition Examination Survey: intervju
  + klinisk undersøkelse + lab (blodtrykk, BMI, biomarkører), ~5–15k
  personer per 2-årssyklus, 1999–.
- **NHIS** — National Health Interview Survey: årlig husholdningssurvey
  (helsetilstand, forsikring, atferd), CSV siden 2019-redesignet.
  (IPUMS-kilden harmoniserer NHIS på tvers av år — bruk den for
  flerårsanalyser; direktefilene her er raskest for ETT år.)

Ingen CORS på noen av vertene → ALT via `/api/hent`:

```
# navn = ost.read("/api/hent?url=<url-enkodet fil-URL>")
```

## NHANES: riktig sti + soft-404-fella

**Riktig mønster** (verifisert 200, `text/plain`):

```
https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{startår}/DataFiles/{FIL}_{suffiks}.xpt
```

- `{startår}` = syklusens første år (2021-2023 → `2021`); suffiks per
  syklus: 2021-2023=`L`, 2017-2018=`J`, 2015-2016=`I`, … (bakover i
  alfabetet).
- Kjernefilene: `DEMO` (demografi + vekter), `BMX` (kroppsmål), `BPXO`
  (blodtrykk), `TCHOL` (kolesterol), `SMQ` (røyking), `ALQ` (alkohol),
  `DIQ` (diabetes), `HIQ` (forsikring).
- Verifiserte størrelser: DEMO_L 2,6 MB, BMX_L 1,6 MB — de fleste filer
  0,5–15 MB, trygt for nettleseren.

**FELLE (verifisert):** den gamle stien
`wwwn.cdc.gov/Nchs/Nhanes/2021-2023/DEMO_L.XPT` svarer **200 med
HTML-«Page Not Found»** — pandas feiler da kryptisk. Stol aldri på 200
alene; sjekk at innholdet ikke er HTML (proben viser content-type).

Lesing: `pd.read_sas(<lokal/bytes>, format="xport")` — XPT bærer
variabelnavn, men IKKE verdietiketter.

Proxy-eksempel:

```
# demo = ost.read("/api/hent?url=https%3A%2F%2Fwwwn.cdc.gov%2FNchs%2FData%2FNhanes%2FPublic%2F2021%2FDataFiles%2FDEMO_L.xpt")
```

## NHANES: kodebok

Samme sti med `.htm` i stedet for `.xpt` (verifisert 200) — HTML-kodebok
med verdifrekvenser. web_fetch den og SITER kodeboklinjene som betyr noe
(missing-koder, enheter) i stedet for å gjette.

## NHANES: vekter og design (obligatorisk for estimater)

- Intervju-variabler: vekt `WTINT2YR`; undersøkelse/lab: `WTMEC2YR`.
- Kompleks design (`SDMVPSU`/`SDMVSTRA`) — for enkle andeler: vekt og si
  at estimatet er vektet; ikke lov bort designkorrekte SE-er.
- Spesialkoder (7/9, 77/99 = refused/don't know) — sjekk kodeboka FØR
  beregning.

## NHIS: direkte CSV per år

Verifisert: `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHIS/{år}/adult{yy}csv.zip`
(2023: 4,8 MB zip → adult23.csv 29 MB; også `child{yy}csv.zip`).
`pd.read_csv` leser zip-en direkte. Vekt: `WTFA_A`. Kodebok/layout ligger
i samme katalog. 29 MB er innenfor, men tungt — les kolonneutvalg med
`usecols` når spørsmålet tillater det.

## Hva som IKKE bor her

- **BRFSS-mikrodata**: åpne, men ~93 MB zip / ~1 GB XPT — for stort for
  nettleseren. Bruk `cdc`-kilden (data.cdc.gov) for BRFSS/PLACES-prevalens.
- **NVSS dødelighetsmikrodata**: åpne, men 150+ MB zip med fixed-width —
  bruk `cdc`-kildens NCHS-dødelighetstabeller i stedet.

## Etikk

Vis kun aggregater — aldri enkeltrader. Siter «CDC/NCHS, NHANES
{syklus}» eller «NHIS {år}». Dataene er avidentifiserte offentlige filer;
forsøk aldri re-identifisering.

## Om kilden

CDC/NCHS survey files — direct downloads of NHANES health-examination and NHIS health-interview microdata for the United States; no registration required.

