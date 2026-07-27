# S4: post-run-sveip + publiserings-søm — miniplan

**Goal:** pandas-lastede rammer synlige i sidepanelet (alle Python-motorer) og
publiserbare (bro-cachen bakes som tags; publisert side serverer `read_csv(url)`
fra tags, ikke nett).

**Målt grunnlag (2026-07-27):**
- Brython/mpy sveiper ALLEREDE brukerglobals (`_dataset_info`, 2026-07-24,
  «både # load-bundne og AVLEDEDE») — gapet er kun Pyodide:
  `refreshDatasetSidebarFromPy` (index.html:8706) leser bare `e.datasets`,
  aldri `_g`. Det var hele smoke 3-funnet.
- Publisert dokument = appens egen index.html + injiserte tags
  (`publishStandaloneDashboard`, :1582) → `js/read-bridge.js` er med på
  publiserte sider. Å bake bro-cachen som tags gjør publisering motor-uniform
  uten å skrive om én linje brukerkode.

## Global Constraints
- Aldri stille feil data; sveipen skal aldri VELTE en kjøring (all refleksjon i try/except).
- Ingen omskriving av brukerens kodelinjer ved publisering.
- Dynamisk bygde URL-er bakes ikke (hint-prinsippet: publisert side henter dem
  live, CORS tillatende) — dokumenteres.
- Suiter: node 1013 / deno 277 / pytest 1401 — 0 fail.

## Task 1: Pyodide-sveipen (`_g` i tillegg til `e.datasets`)
`refreshDatasetSidebarFromPy`-snippeten utvides: gå gjennom `_g`, ta med
`isinstance(v, pd.DataFrame)` der navnet ikke starter med `_` og ikke alt
ligger i `e.datasets`. Samme kontrakt ({columns, nrows, dtypes}); speiler
brython-docstringen. Verifiseres i browser (smoke 3 på nytt) — inline-python
har ingen node-flate.

## Task 2: ReadBridge tag-baking + seeding
- `exportTags(script) -> [{url, contentType, b64}]` — scanUrls ∩ cache-entries
  med bytes (b64 for uniformitet; parquet er binært).
- `_seedEntries(list)` (ren, node-testbar) + `seedFromDocument()` som leser
  `script[type="application/json"][id^="ostbridgedata_"]` og kalles ved
  modul-init i browser (guarded: `typeof document !== 'undefined'`).
- Node-tester: export fra seeded cache; seed → `getCached` treffer; b64-rundtur
  byte-nøyaktig (æøå/binært).

## Task 3: publish-koblingen
`publishStandaloneDashboard`: etter spec-tag-løkka, emit én
`ostbridgedata_<n>`-tag per `ReadBridge.exportTags(rawScript)`-entry.
Ufarlig no-op når broen er tom/ubrukt.

## Task 4: dokumentasjon + gate
bro-smoke §6 omskrives: forventningen er nå «publisert bry03 kjører fra bakte
tags — Network-fanen viser INGEN henting av csv-en». Resten av
eksempelkonverteringen forblir gated på Hans' §6-verifisering.
