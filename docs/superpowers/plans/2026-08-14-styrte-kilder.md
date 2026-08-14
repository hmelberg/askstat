# Styrte kilder — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementere spec
`docs/superpowers/specs/2026-08-14-styrte-kilder-design.md`: `styrt: true`
på ssb/oecd/eurostat/ess; skinner i probe (server) og script-laget
(klient); `lese_linje`-forslag fra table_metadata; guide-omlegging
(eksempel først, HTTP-stoff ut); svar.md-styrt-linje.

**Architecture:** Feltpropageringen er nesten gratis (source_docs.mjs
kopierer ALLE front matter-felter generisk; kun parseRegistry +
DataSource-interfacet må ta feltet imot). Probe-skinnen gjenbruker
`sourceForUrl` som probeUrl alt kaller. Klient-skinnen bor i
data-loader.js som delt helper `styrtKildeFor(url, registry)` brukt av (a)
read-bridgens wrapped rå-lesere og (b) resolve-veien for RÅ url-loads —
adapterveien (registrert kilde m/kind) passerer alltid. lese_linje bygges
i table-metadata-svaret for kind pxweb/sdmx.

**Tech Stack:** som før (ES5+node:test; Deno + std@0.224.0).

## Global Constraints

- ES5/'use strict'/norske kommentarer i js/; node
  `node --test 'tests/js/*.test.js'` (fnutter); deno fra
  netlify/edge-functions/: `deno test --allow-all _lib/` + `deno check
  svar.ts hent.ts`.
- Styrt-avvisningens tekst (BEGGE lag, verbatim kjerne): «<id> er en
  STYRT kilde — rå URL-er avvises. Bruk <id>.read(…): lese-linjen får du
  ferdig fra table_metadata.»
- Adapterveien må ALDRI blokkeres: registrerte kilder m/kind passerer
  alltid klient-skinnen; /api/hent-proxyen røres IKKE (adapterne bruker
  den ved CORS); v0-skinnen består uendret.
- Kildedokument-redigering: `node tools/source_docs.mjs generate` +
  normalize + commit av fasit OG artefakter (drift-testen håndhever).
- Ingen bakoverkompat-hensyn; ingen nye i18n-nøkler (alt er
  verktøy-/prompttekst, ikke UI).
- Aldri push; commit per task på gren `styrte-kilder` fra main.

---

### Task 1: styrt-flagget ende-til-ende

**Files:** data/sources/{ssb,oecd,eurostat,ess}.md (front matter),
tools/source_docs.mjs (INGEN endring ventes — verifiser generisk
passthrough), netlify/edge-functions/_lib/registry.ts (+test),
regenererte data/data-sources.json.

**Interfaces:** `DataSource.styrt?: boolean`; parseRegistry setter
`styrt: e.styrt === true` (fravær/ikke-boolsk → false-ish, aldri kast).

- [ ] **Step 1 (RED):** i `_lib/registry.test.ts` (følg filas
fixture-stil):

```ts
Deno.test("parseRegistry: styrt-flagget tas imot, fravær er falsy", () => {
  const [a, b] = parseRegistry([
    { ...GYLDIG_KILDE, id: "ssb", styrt: true },
    { ...GYLDIG_KILDE, id: "fri" },
  ]);
  assertEquals(a.styrt, true);
  assertEquals(!!b.styrt, false);
});
```

(`GYLDIG_KILDE` = en minimal gyldig fixture — gjenbruk/lag én med de
påkrevde feltene id/navn/utgiver/beskrivelse/tillit/tilgang/base_url/cors.)

- [ ] **Step 2:** implementer feltet i interfacet + parseRegistry-returen;
kjør deno grønt.
- [ ] **Step 3:** legg `styrt: true` i front matter i de fire
kildedokumentene (etter `kind:`-linja); kjør
`node tools/source_docs.mjs generate`; verifiser at data-sources.json nå
bærer feltet for de fire (grep) — generatorens fieldOrder-kopiering er
generisk, så ingen mjs-endring skal trenges (rapportér hvis den likevel
gjorde det). Full node-suite grønn (drift-testen).
- [ ] **Step 4:** commit `feat: styrt-flagget — front matter → registry for ssb/oecd/eurostat/ess`

---

### Task 2: Probe-skinnen (server)

**Files:** _lib/tools/probe.ts (+test).

**Interfaces:** probeUrl har alt `src = sourceForUrl(registry, url)` —
når `src?.styrt`: returner `{...empty, note: <styrt-teksten m/src.id>}`
FØR fetch (som v0-skinnen). v0-skinnen består (den treffer også uten
registry-deps).

- [ ] **Step 1 (RED):**

```ts
Deno.test("probe: styrt kilde avvises med lese-linje-veiviser, aldri fetch", async () => {
  const reg = parseRegistry([{ ...GYLDIG_KILDE, id: "ssb",
    base_url: "https://data.ssb.no/api/pxwebapi/v2/", styrt: true }]);
  let kalt = 0;
  const r = await probeUrl("https://data.ssb.no/api/pxwebapi/v2/tables/07459/data?x=1", {
    registry: reg,
    fetchImpl: (() => { kalt++; return Promise.resolve(new Response("x")); }) as typeof fetch,
  });
  assertEquals(r.ok, false);
  assertEquals(kalt, 0);
  assertEquals((r.note ?? "").includes("STYRT"), true);
  assertEquals((r.note ?? "").includes("ssb.read"), true);
});
```

(Import parseRegistry/fixture som i Task 1-testen; sjekk hvor i probeUrl
`src` slås opp — skinnen legges rett etter oppslaget, før headers/fetch.)

- [ ] **Step 2:** implementer + hele deno-suiten grønn.
- [ ] **Step 3:** commit `feat(styrt): probe avviser rå URL-er mot styrte kilder m/veiviser`

---

### Task 3: Script-lags-skinnen (klient)

**Files:** js/data-loader.js (+ registry-helper), js/read-bridge.js,
tests/js/ (ny eller eksisterende data-directives/read-bridge-testfil —
følg mønsteret der).

**Interfaces:**
- `DataLoader.styrtKildeFor(url, registry) -> {id}|null` — ren, matcher
  url mot base_url (direkte prefiks ELLER URL-kodet forekomst, samme
  toleranse som involverteInnebygde) for oppføringer med `styrt === true`.
- **Rå-vei-avvisning:** (a) i resolve-/fetch-veien for URL-loads UTEN
  registrert kind (rå `load("url")`/url-direktiver): før fetch — treff i
  styrtKildeFor → kast norsk Error med styrt-teksten. (b) i read-bridgens
  wrapped lesere (pd.read_csv m.fl. på URL): samme sjekk før henting
  (read-bridge har/får tilgang til registry via DataLoader — finn
  eksisterende registry-tilgang i data-loader (loadRegistry) og eksponer
  behovet minimal; les begge filer FØR du velger eksakt kroksted, og
  dokumenter valget i rapporten).
- **Adapterveien passerer:** items med registrert kilde/kind sjekkes IKKE.

- [ ] **Step 1 (RED):** ren test for styrtKildeFor (deno-testfila for
data-loader, `_lib/data-loader.test.ts`, eval-mønsteret):

```ts
Deno.test("styrtKildeFor: prefiks + kodet form, kun styrt===true", () => {
  const reg = [
    { id: "ssb", base_url: "https://data.ssb.no/api/pxwebapi/v2/", styrt: true },
    { id: "fri", base_url: "https://api.fri.no/" },
  ];
  assertEquals(DL.styrtKildeFor("https://data.ssb.no/api/pxwebapi/v2/tables/x/data", reg)?.id, "ssb");
  assertEquals(DL.styrtKildeFor("/api/hent?url=https%3A%2F%2Fdata.ssb.no%2Fapi%2Fpxwebapi%2Fv2%2Ftables%2Fx", reg)?.id, "ssb");
  assertEquals(DL.styrtKildeFor("https://api.fri.no/x", reg), null);
  assertEquals(DL.styrtKildeFor(null, null), null);
});
```

…og en integrasjonstest i samme fil som viser at en RÅ url-load mot styrt
kilde kaster den norske feilen mens en registrert kilde-lesing går
gjennom (gjenbruk filas eksisterende resolveAndFetchLoads-fixturer; den
nye styrt-oppføringen legges i test-registeret).

- [ ] **Step 2:** implementer helper + kroker; hele node- og
data-loader-deno-suiten grønn.
- [ ] **Step 3:** commit `feat(styrt): script-laget avviser rå lesing mot styrte kilder — adapterveien urørt`

---

### Task 4: lese_linje i table_metadata

**Files:** _lib/tools/table-metadata.ts (+test).

**Interfaces:** når kilden er styrt OG kind ∈ {pxweb, sdmx}: svaret får
`lese_linje: string` —
- pxweb: `# df = <id>.read("<tabell>", regions=["<Region-kodeeksempel>"], years="2015:2024", indicators=["<ContentsCode-kodeeksempel>"])`
  der eksempelkodene tas fra FØRSTE verdi i hhv. Region/ContentsCode-
  dimensjonene når de finnes (ellers `<kode>`-plassholder); ta med øvrige
  mandatory-dimensjoner som `filters={"<DIM>": "<kode>"}`.
- sdmx: `# df = <id>.read("<flowRef>", years="2015:2024", countries=["NOR"], filters={"<MANDATORY_DIM>": "<kode>"})`.
- Andre kinds/ikke-styrt: feltet utelates. Ren byggefunksjon
  (`byggLeseLinje(source, tableId, dimensions)`) eksportert og deno-testet
  direkte; svar-sammenstillingen kaller den.

- [ ] **Step 1 (RED):** test byggLeseLinje for pxweb (Region+ContentsCode+
Kjonn-mandatory → filters), sdmx, ukjent kind → undefined, ikke-styrt →
undefined.
- [ ] **Step 2:** implementer + koble i svar-sammenstillingen; deno grønt.
- [ ] **Step 3:** commit `feat(styrt): table_metadata rekker frem ferdig lese_linje (pxweb/sdmx)`

---

### Task 5: Guide-omlegging + promptslanking

**Files:** data/sources/{ssb,oecd,eurostat,ess}.md, regenererte
artefakter, prompts/svar.md + _lib/svar-prompt.ts.

**Interfaces/innhold:**
- **Per styrt kildedokument:** Kort = innhold/dekning (behold
  eksisterende innholdsfakta; STRYK HTTP-/format-/CORS-setninger). Guide
  restruktureres: (1) FØRST det komplette arbeidseksempelet (finnes i
  ssb/oecd — flytt øverst; skriv tilsvarende 2-linjers eksempel for
  eurostat/ess fra deres eksisterende guidestoff), (2) deretter innholds-/
  kodeverkskunnskap (behold PA-vs-PC, SHA-råd, anweight-fallback,
  mandatory-SEMANTIKKEN («oppgi indicators= også ved ett alternativ»),
  tidsuttrykk-semantikk (years-syntaks), codelist-typene), (3) STRYK:
  URL-mønster-tabeller, GET/POST-diskusjoner, encoding/CORS-avsnitt,
  arbeidsrekkefølge-/probe-regler (skinnene + lese_linje eier dette nå).
  SSB: det gjenværende v0-punktet får SSBs navngiving: «PxWebApi v1
  (= `/api/v0/`) er stengt i appen». Normaliser + regenerer.
- **svar.md/svar-prompt.ts (byte-lik som alltid):** i registerblokk-
  omtalen: ny setning «Kilder merket styrt: bruk <id>.read(…) — rå URL-er
  mot dem avvises av verktøyene; table_metadata gir ferdig lese_linje.»
  + STRYK setninger som nå er skinne-håndhevet for styrte kilder
  (SDMX-sikkerhetsskinne-setningen om «ALDRI rå pd.read_csv-URL mot
  SDMX» kan f.eks. reduseres til styrt-setningen). Vær KIRURGISK: endre
  kun disse punktene, verifiser mot svar-prompt-testene (omskriv tester
  som asserterer strøket tekst).
- [ ] **Step 1:** dokument-omleggingene + regenerate + normalize; full
node-suite grønn.
- [ ] **Step 2:** promptendringene + deno-suiten grønn (`deno check
svar.ts`).
- [ ] **Step 3:** commit `feat(styrt): guide-omlegging (eksempel først, HTTP-stoff ut) + styrt-linje i prompten`

---

### Task 6: Verifisering (kontroller) + smoke (Hans)

- [ ] Begge suiter + typecheck; i18n-fasit stabil; sluttreview av grenen;
  merge-meny.
- [ ] Hans' smoke: Oslo-spørsmålet — MÅL: ≤ ~6 turer, null rå SSB-URL-er,
  lese_linje synlig brukt; eurosone (oecd) og lykke-spørsmålet (ess)
  tilsvarende; en IKKE-styrt kilde (f.eks. en ren CSV-URL) uendret fri.

## Selvreview-notater

- source_docs.mjs ventes uendret (generisk feltkopiering) — Task 1
  verifiserer i stedet for å anta.
- Klient-skinnens kroksted velges av implementeren ETTER å ha lest begge
  filer (read-bridge-fetchen og resolve-rå-veien er de to kandidatene);
  kravet er atferden (rå avvist, adapter urørt), ikke linjenummeret.
- lese_linje er FORSLAG (kommentarlinje-format som guidens eksempler) —
  modellen justerer parameterverdier; determinismen ligger i at
  formen/vokabularet aldri må konstrueres.
