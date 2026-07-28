# R-URL-bro-oppfølgingene — design (2026-07-28)

**Mål:** Lukk de fire kode-oppfølgingene fra R-URL-bro-rundens slutt-review
(punkt 2 er Hans' manuelle §8d-test; punkt 6 var rapportnotis uten handling).

## §1 Forklar-inngangen (oppfølging 1)

`forklarRunOneRBlock` (index.html:12023) er tredje R-inngang og mangler
bro-kallene de to andre har (runHybridR:9358/9793, notatbokcelle:10985):
- `await rBridgePreRun(block.codeTrim)` FØR captureR-kjøringen (etter
  ui-init-blokken, rett før try) — gir prefetch/seed OG `.ost_bridge_config`
  (origin+auth), som i dag mangler: proxy-retry i Forklar feiler høylytt
  ved tom origin.
- `await rBridgePostRun()` etter kjøringen (etter finally-blokken, før
  scrollOutputToTop) — post-run-import til ReadBridge/publisering.
Begge er allerede feiltolerante (egen try/catch + console.warn) — ingen ny
feilflate i Forklar.

## §2 x-hent-truncated konsumeres — samlet, høylytt (oppfølging 4)

hent-core setter `x-hent-truncated: 1` ved 50MB-avkorting; ingen konsument
leser den → STILLE TRUNKERT DATA (bryter aldri-stille-feil-data). Fiks i
alle fire konsumenter, alltid HØYLYTT FEIL (aldri warn — en avkortet CSV er
feil data):
- `DataLoader.fetchRawUrl`: etter resp, header satt → throw
  («avkortet ved proxyens 50MB-grense (x-hent-truncated) for <url>»).
  Dekker også brython/mpy (ensureText → fetchRawUrl).
- `DataLoader.fetchLoadTarget` (direktivveien): samme sjekk i viaProxy- og
  r0-grenene (direktesvar fra fremmede verter har aldri headeren — sjekken
  er proxy-spesifikk).
- `ReadBridge.syncXhr`: returnerer `truncated`-flagg
  (getResponseHeader); `forPyodideSync` gjør flagget til error-retur på
  BEGGE legg (headers-legget inkludert).
- rPatchSource `.ost_fetch` (R-worker-XHR): header satt → `ERR:`-retur →
  eksisterende høylytte stop-vei.
Kjent rest (dokumentert): disk-L2-cachede svar fra FØR fiksen kan mangle
flagget — TTL-styrt, ikke jaget.

## §3 .ost_json_str kontrolltegn (oppfølging 3)

Escaper i dag kun backslash+quote; kontrolltegn i input (URL/sti/origin/
headers-JSON) knekker den genererte JS-strengen høylytt. Fiks: escap
`\n`→`\\n`, `\r`→`\\r`, `\t`→`\\t`, og DROPP øvrige C0-tegn (ugyldige i
URL/sti uansett; kommentar sier hvorfor).

## §4 BASE_R-lista (oppfølging 5)

`extractRPackages` sin ekskluderingsliste (index.html:9065) mangler
base-tilbehør (grid, splines, stats4, tcltk) og recommended-settet (MASS,
Matrix, boot, class, cluster, codetools, foreign, KernSmooth, lattice,
mgcv, nlme, nnet, rpart, spatial, survival) — webR har dem; install-forsøk
er bomskudd. Utvid lista.

## §5 Testkontrakt

- node: fetchRawUrl/fetchLoadTarget m/ fake fetchImpl + truncated-header →
  kaster m/ «50MB»; forPyodideSync m/ `_setXhr`-truncated → error-retur
  begge legg; kildetekst-asserter på rPatchSource (x-hent-truncated-sjekken
  + kontrolltegn-escapingen i .ost_json_str).
- §1/§4 (index.html) er ikke node-testbare: desk-verifiseres i review
  (Rscript-parse av .ost_json_str-endringen; kall-plassering mot de to
  eksisterende inngangene) + lett live-smoke av normal R-kjøring
  (regresjonsvern for bro/jsonstr); Forklar-E2E ligger hos Hans (§8d-løpet).

## §6 Utenfor scope

R-factor-oppfølgingene (PxWeb-mangler-notat, rSource-eval ut av pxweb-try,
attrs fra ost_convert_dtypes, domenemelding malformet meta) — eget knippe i
køen. Readr/notatbok-E2E (Hans). 50MB-grensen selv (bevisst).
