# R-factor-runden — design (2026-07-28)

**Mål:** Samme typing-historie i R og mini-motorene som Pyodide fikk i
metadata-/eksplisitt-dtypes-rundene: naken innlasting forblir byte-lik og
får KUN annotering (attrs/panel), typing skjer eksplisitt via
`ost_read_csv`/`ost_convert_dtypes` (R) og `ost.read_csv`/`ost.convert_dtypes`
(Brython/MicroPython). Omfang avtalt med Hans 2026-07-28: R OG mini-motorene
i samme runde; navnevalg `ost_read_csv` (vanlig R-funksjon med underscore).

## §0 Prinsipper (arvet, bindende)

- **Overraskelsesprinsippet:** `read.csv(url)` / mini-`pd.read_csv` i appen
  er byte-lik naken oppførsel i verdier OG typer. Automatisk skjer KUN
  annotering (attributt + panel). Typing krever eksplisitt kall.
- **Aldri gjetting, aldri kast for metadata:** metadata-feil → utypet/
  uberiket + høylytt notat (console/stderr), aldri veltet kjøring. Verdier
  endres ALDRI av typing (koder forblir koder — factor av kodene, ikke
  klartekst-etiketter).
- **Én kilde for typemeta-logikken:** js/pxweb.js-tvillingen
  (recognizeUrl/dataUrlFor/typeMetaFromJsonStat) er ENESTE kilde for R og
  mini-motorene. Ingen tredje tvilling i R — vi har ingen R-testsuite som
  kunne håndhevet pariteten. Mini-motorene kaller `window.PxWeb` (main
  thread); R-workeren får pxweb.js evaluert inn i worker-scope (§5).

## §1 R-annotering ved naken innlasting

`.ost_wrap_reader` (js/read-bridge.js, rPatchSource) stempler
`attr(df, "ost_url") <- url` på resultatet når fil-argumentet var en
bro-URL. Kun proveniens — ingen metadata-henting R-side, ingen
verdiendring. Gjenkjenning (register-kilde eller ei) avgjøres JS-side i
panelsveipen (§2). Attributtet overlever tilordning; at subsetting mister
det er akseptert (samme fødsels-eller-aldri-semantikk som pandas-attrs).

## §2 Panelberikelse for R

`refreshDatasetSidebarFromR` (index.html:8724) utvides:

- R-evalen returnerer i tillegg `ost_url` per ramme
  (`attr(v, "ost_url")`, tom streng når fraværende).
- JS-side, per ramme med ost_url: `PxWeb.recognizeUrl` → gjenkjent →
  `PxWeb.dataUrlFor` (json-stat2-formen av samme spørring) →
  `ReadBridge.ensureText` → `JSON.parse` → `PxWeb.typeMetaFromJsonStat` →
  `info[name].typemeta` — samme felt som py-sveipen allerede sender, så
  `updateSidebarDatasets` og js/sidebar-typemeta.js er UENDRET.
- Derivasjonen skilles ut som en navngitt, node-testbar funksjon (f.eks.
  `ReadBridge.typemetaForUrl(url) -> Promise<tm|null>`) — brukes av
  R-sveipen; feil/ukjent URL → null + console.warn, aldri kast.
  Metadata-hentingen deler dermed bro-cachen (prefetch-hint og
  runtime-ost-hentinger gjenbrukes gratis).

## §3 `ost_read_csv` / `ost_convert_dtypes` i R

Definert i R-kilden som injiseres ved webR-boot (samme leveransested som
rPatchSource; node-testene asserter på kildeteksten — pyPatchSource-
presedensen).

- `ost_read_csv(url, convert = TRUE, ...)`:
  1. `.ost_fetch(url)` → lokal sti (broen: proxy-fallback, manifest-føring
     og publiserings-baking gratis). HTTP-feil er høylytt stop (dagens
     .ost_fetch-oppførsel).
  2. `utils::read.csv(sti, ...)` — brukerens `...` går urørt videre.
  3. `attr(df, "ost_url") <- url` (panelet, §2) — settes ved convert=TRUE
     OG FALSE.
  4. `convert=TRUE` (default, speiler py-beslutningen «eksplisitt kall =
     eksplisitt samtykke»): typemeta hentes via §5-mekanismen og anvendes:
     - dim-kolonner hvis verdier matcher kildens koder eksakt →
       `factor(x, levels = kildens koder i kildens orden)` (best-effort:
       kolonner som ikke matcher røres ikke — py-paritet)
     - intlike tidskolonne → `as.integer` (R-integer har NA — ingen
       Int64-spesialtilfelle som i pandas)
     - verdikolonnen → `as.numeric`
     - metadata-feil → utypet ramme + høylytt melding, aldri kast.
  5. Ukjent URL (ikke gjenkjent registerkilde): ren passthrough — hent +
     parse, ingen typing, ingen attr (py-paritet med read_csv-passthrough).
- `ost_convert_dtypes(df, meta)`: samme regler på ferdig ramme; `meta` er
  typemeta-liste eller register-URL. **Krever meta i denne runden** —
  py-sidens meta=None-heuristikker dupliseres IKKE i R nå (utestbar
  logikk-tvilling uten R-suite; ført som oppfølging). Manglende/ukjent
  meta → høylytt feil.

## §4 Mini-ost (Brython + MicroPython)

- LIB_REGISTRY-oppføringer `ost_brython`/`ost_mpy`, aliaser
  `['openstat', 'ost']`, deps `['pandas_brython']`/`['pandas_mpy']`.
  Kilde: delt fil om window-tilgangen lar seg abstrahere (shared/-
  presedensen fra ui_core; Brython: `from browser import window`, mpy:
  `import js`) — ellers to små filer etter katalogkonvensjonen. Planen
  avgjør etter måling; API-et er uansett identisk.
- `ost.read_csv(url, convert=True)`: tekst via motorens replay-bro
  (ensureText-veien — delt cache/auth/feilsemantikk), parse med
  mini-pandas, typemeta via `window.PxWeb` (main thread — null
  duplisering), typing:
  - dims → `astype("category")` (finnes i begge mini-pandas)
  - intlike tid → int-typing der mini-pandas støtter det; NaN-i-intlike →
    forbli utypet + notat (ingen Int64 i mini-pandas — aldri gjetting)
  - (meta-veien bruker aldri `to_datetime` — py-tvillingens apply-regler
    har ingen dato-konvertering; det hører til heuristikk-oppfølgingen i
    §8, der mpy-strptime-forbeholdet også hører hjemme)
- `ost.convert_dtypes(df, meta)`: som §3 — krever meta, heuristikk-None er
  oppfølging (samme begrunnelse).
- Panel-typemeta for mini-rammer er UTENFOR scope (mini-pandas-attrs
  uavklart; føres som oppfølging).
- **Pyodide-symmetri (bitteliten):** `sys.modules["ost"] =
  sys.modules["openstat"]` ved Pyodide-boot, så `import ost` virker likt i
  alle tre python-motorene (i dag krever Pyodide `import openstat as ost`).

## §5 pxweb.js inn i webR-workeren

- Ved webR-boot (etter rPatchSource-evalen): hent js/pxweb.js-teksten
  (samme cache-bust-mønster som openstat.py-lastingen) og kjør den i
  worker-scope via `webr::eval_js` — fila fester seg på `globalThis`, så
  `globalThis.PxWeb` finnes i workeren (verifisert: UMD-halen bruker
  `typeof window !== 'undefined' ? window : globalThis`).
- R-hjelper (i §3-kilden): metadata-URL bygges med PxWeb i workeren,
  hentes med `.ost_fetch` (bro/proxy/manifest), og typemeta deriveres i
  én `eval_js` som leser den hentede fila fra `Module.FS` (path inn,
  typemeta-JSON ut — ingen streng-escaping av store JSON-kropper
  gjennom R).
- Lasting feilet (offline, publisert side uten fila e.l.) → ost_read_csv
  faller til utypet + høylytt notat; naken vei upåvirket.

## §6 Feilhåndtering (samlet)

| Situasjon | Oppførsel |
|---|---|
| HTTP-feil ved datahenting (ost_read_csv/mini-ost.read_csv) | Høylytt feil (stop/exception) — som dagens bro-konvensjon |
| Metadata-feil (alle veier) | Utypet/uberiket + høylytt notat, aldri kast |
| Ukjent URL i ost_read_csv | Ren passthrough uten typing/attr |
| ost_convert_dtypes uten meta | Høylytt feil («angi meta=») |
| mpy uten strptime | Høylytt guard-melding, dato-kolonnen forblir utypet |
| PxWeb utilgjengelig i worker | ost_read_csv utypet + notat; naken vei upåvirket |

## §7 Testkontrakt

- node: (a) `ReadBridge.typemetaForUrl` med `_setFetcher` (treff, ukjent
  URL → null, metadata-feil → null + warn); (b) kildetekst-asserter på ny
  R-kilde (funksjonsnavn, factor-i-kildens-orden-uttrykk, aldri-kast-
  formen) — pyPatchSource-presedensen; (c) mini-ost gjennom motorenes
  eksisterende node-harness (pandas-paritet-mønsteret): read_csv m/
  convert, category-dtype, best-effort-avvik, meta-krav i convert_dtypes.
- pytest: kun §4-symmetrilinjen om den berører openstat.py (ellers urørt).
- deno: urørt (ingen TS).
- R-delen bevises med kontrollørens live-smoke mot ekte SSB (R-URL-bro-
  presedensen): naken read.csv → panel med etiketter/nivåer; ost_read_csv
  → factor med kildens nivåer i kildens orden; ost_convert_dtypes(df,
  meta=url).
- Hjelpetekstene (hjelp.html + hjelp.en.html) oppdateres: «R har
  foreløpig ingen tilsvarende funksjon»-forbeholdet erstattes med de nye
  veiene (inkl. mini-begrensningen for ledende-null-koder).

## §8 Utenfor scope

- Heuristikk-typing uten meta i R/mini (py-paritet for meta=None) — kø.
- Panel-typemeta for mini-motor-rammer — kø.
- dst/statfin-gjenkjenning (andre API-former) — kø.
- Promptomtale av ost-veiene (egen eval-runde) — kø.
- Factor med klartekst-etiketter som verdier — aldri (verdiendring).
- R-heuristikker i `read.csv` selv (stringsAsFactors o.l. røres ikke).
