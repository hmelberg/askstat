# ihsn — IHSN Central Data Catalog (kildeguide)

kilde: catalog.ihsn.org (NADA-API), verifisert live 2026-08-06

## Hva dette er

International Household Survey Networks samlekatalog: ~5 400 surveys
AGGREGERT fra nasjonale statistikkbyrå-arkiver (husholdnings-, helse-,
arbeidsmarkedsundersøkelser i lav- og mellominntektsland). Dette er
metadata-PEKERE: selve dataene bor hos produsentarkivet, som regel bak
login/søknad der.

**Metadata er aldri data (E17):** treff + variabelordbok beviser hva som
FINNES — bygg aldri tallsvar herfra uten probe-✅ på en faktisk fil-URL.

## KUN nettleser-direkte — aldri server-side (TLS-felle)

Målt 2026-08-06: catalog.ihsn.org serverer en TLS-kjede (ECDSA-signert;
openssl-sjekk 2026-08-16 viser ecdsa-with-SHA384) som Deno/rustls IKKE
støtter — `search_catalog('ihsn', …)`,
`table_metadata('ihsn', …)` og `/api/hent`-proxyen FEILER alle mot denne
verten. Nettlesere når den fint, og API-et er CORS-åpent — bruk derfor
ALLTID direkte `ost.read` med full URL:

```
# treff = ost.read("https://catalog.ihsn.org/index.php/api/catalog/search?sk=malaria&ps=10&format=json")
```

Samme API-former som `wbmicro` (se den guiden): søk med `sk` (OR-er
ordene — søk smalt), studie `catalog/{IDNO}?format=json`, variabelordbok
`catalog/{IDNO}/variables` og per-variabel-detalj `variables/{vid}`
(spørsmålstekst + verdietiketter). Svaret er `result.rows[]` med `idno`,
`title`, `nation`, `year_start/end`, `url` (landingsside).

## Typiske spørsmål

- «Finnes det levekårsundersøkelser fra Ghana?»
- «Hvilke husholdningssurveys finnes i et utviklingsland?»
- «Er det gjort en LSMS/GLSS-undersøkelse i et gitt land?»

## Oppskrift: finn levekårsundersøkelser i et utviklingsland (verifisert 2026-08-16)

```
# treff = ost.read("https://catalog.ihsn.org/index.php/api/catalog/search?sk=LSMS&ps=200&format=json", kind="json")
# ghana = [r for r in treff["result"]["rows"] if r["nation"] == "Ghana"]
```

Verifisert 2026-08-16 fra terminal (curl, samme oppførsel som en
nettleser): `sk=LSMS` gir 383 treff totalt, hvorav 7 for Ghana i første
side — bl.a. `GHA_1998_GLSS_v02_M`, «Living Standards Survey IV
1998-1999». TLS-sjekk bekreftet på nytt: curl fikk TLSv1.2 med
ECDHE-ECDSA-sertifikat mot `catalog.ihsn.org` uten problem — kun
server-side Deno-motoren (`search_catalog`/`/api/hent`) feiler mot denne
verten, bruk derfor ALLTID `ost.read`-formen over.

## Når ihsn framfor wbmicro?

wbmicro er WBs egen samling (LSMS, Findex m.m.) og er søkbar via
search_catalog/search_datasets; ihsn favner BREDERE (nasjonale arkiver WB
ikke speiler) men krever altså direkteformen over. Nasjonale kataloger
kan også søkes én-og-én: hent `data/nada-catalog.json` (levende, probet
liste med search_url per land — 40 kataloger per 2026-08-06) og bruk
samme URL-former; foretrekk direkte ost.read der katalogen er CORS-åpen,
`/api/hent` som fallback.

## Sitering

Siter studien (IDNO/DOI) + produsentarkivet; nevn IHSN som søkevei kun
når det er relevant.
