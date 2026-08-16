# wbmicro — World Bank Microdata Library, NADA-API (kildeguide)

kilde: microdata.worldbank.org/api-documentation + ihsn.github.io/nada-documentation,
verifisert live 2026-08-06

## Hva dette er — og den ENE regelen

~7 100 studier (husholdnings-/helse-/arbeidsmarkedssurveys verden over,
inkl. speilede UNHCR-/FAO-samlinger). API-et er nøkkelfritt og CORS-åpent
for SØK og METADATA — helt ned på variabelnivå med spørsmålstekst og
verdietiketter. Men SELVE DATAFILENE er i praksis login-gated (gratis
WB-konto + avtale per studie).

**E17-regelen gjelder absolutt:** API-et gir metadata, ikke tall. Du kan
si «LSMS Tanzania 2019 HAR en variabel for helseutgifter (spørsmål X,
koder Y)» — du kan ALDRI presentere verdier/andeler/snitt herfra. Finnes
det ikke en åpen fil du faktisk har probet ✅, degrader ærlig: pek på
registreringen og tilby aggregerte fallbacks (worldbank/dhs/who).

## Endepunkter (alle GET, JSON, nøkkelfrie — verifisert)

Kilden er SØKBAR direkte: `search_catalog(source='wbmicro', query=…)` og
`table_metadata('wbmicro', '<IDNO>', find=…)` (variabelordboka) — bruk
dem framfor rå URL-er. Rå-formene under er for detaljoppslag proxy-veien.

Base: `https://microdata.worldbank.org/index.php/api/`

- Søk: `catalog/search?sk=<ord>&ps=<antall>&format=json`
  → `result.rows[]` med `idno`, `title`, `nation`, `year_start/end`,
  `varcount`, `form_model`, `url` (landingsside), `doi`.
  FELLE: `sk` OR-er ordene («health survey norway» ga Afghanistan øverst)
  — søk smalt og filtrer treffene selv på `nation`/år.
- Studie: `catalog/{IDNO}?format=json` (bruk IDNO-strengen, IKKE numerisk
  id) → full DDI-studiebeskrivelse + `data_access_type`.
- **Variabelordbok**: `catalog/{IDNO}/variables` → alle variabler
  (`vid`, `name`, `labl`); `catalog/{IDNO}/variables/{vid}` → full DDI
  per variabel: spørsmålstekst (`var_qstn_qstnlit`), verdietiketter
  (`catgry`), univers. `catalog/{IDNO}/data_files` → filer med
  case_count/var_count.

CORS-åpent (`Access-Control-Allow-Origin: *` verifisert) — direkte
`ost.read` uten proxy virker:

```
# treff = ost.read("https://microdata.worldbank.org/index.php/api/catalog/search?sk=health%20expenditure&ps=10&format=json")
```

## Typiske spørsmål

- «Finnes det levekårsundersøkelser fra Tanzania?»
- «Hvilke husholdningssurveys finnes for Ghana/Malawi?»
- «Er det gjort en LSMS-undersøkelse i et gitt land?»

## Oppskrift: finn levekårsundersøkelser i et utviklingsland (verifisert 2026-08-16)

```
# treff = ost.read("https://microdata.worldbank.org/index.php/api/catalog/search?sk=LSMS&ps=250&format=json")
# tanzania = [r for r in treff["result"]["rows"] if r["nation"] == "Tanzania"]
```

Verifisert 2026-08-16: `sk=LSMS` gir 229 treff totalt, hvorav 16 for
Tanzania (`TZA_2020_NPS-R5_v02_M`, «National Panel Survey 2020-21, Wave
5»). `sk` OR-er alltid ordene (E17-fellen over) — filtrer landet
CLIENT-SIDE på `nation` etter henting, ikke i URL-en. Bytt `LSMS` med et
annet emneord (f.eks. `health`) for andre temaer.

## Tilgangsklasser (form_model)

Av 100 samplede studier: `remote` 78 (data hos annen katalog, se
`remote_data_url`), `public` 9 (gratis login + avtale), `direct` 7,
`open` 4, `licensed` 2. Anonym direktenedlasting ble IKKE verifisert
selv for «open»-studier — anta login-gate og si det i svaret.

## Samme API, andre kataloger

Identisk NADA-API (bytt bare vert; begge verifisert 200 + CORS-åpne):

- IHSN: `https://catalog.ihsn.org/index.php/api/catalog/search?...`
  (~5 400 studier fra nasjonale arkiver; metadata-pekere)
- FAO FAM: `https://microdata.fao.org/index.php/api/catalog/search?...`
  (landbruk/matsikkerhet; NB: tall som strenger i `result`)

Også NADA (uverifisert her): microdata.unhcr.org, microdata.who.int,
ILO Survey Catalogue + ~130 nasjonale statistikkbyrå-kataloger.

## Bruksmønster

1. Søk smalt → filtrer på `nation`/år → velg IDNO.
2. Hent variabelordboka og SITER spørsmålstekst/verdietiketter — det er
   ofte selve svaret på «finnes det data om X?».
3. Vil brukeren ha tallene: pek på `url` (landingssiden) og forklar
   registreringen (gratis WB-konto). Aldri fabrikker.

## Sitering

Siter studien med IDNO/DOI + «World Bank Microdata Library» (evt.
IHSN/FAO) når metadata brukes i svaret.
