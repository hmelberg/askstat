# Vane-myking (retning 2) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-08-04-vane-myking-design.md`: patch_urllib ved boot + ærlig regel 4, parser-toleranse for etterfølgende kommentarer, ukjente kwargs → filters, Eurostat-metadata-adapter med befolkede koder.

**Architecture:** Myking i parse-laget uten å svekke laste-lagets verifisering; boot-patch i python-motorens init (aldri blokkerende); Eurostat-adapter gjenbruker ecbMetadata-XML-mønsteret + availability-filtreringen fra OECD-fiksen.

**Tech Stack:** Vanilla JS (directive-parser/data-directives, node --test), Deno/TS (table-metadata, prompt, deno test), index.html (motor-init).

## Global Constraints

- Verifiserings-/ærlighetsreglene (probe-✅, dekningssjekk, ID-fra-verktøy, run-disiplin, tomt-vakter) røres IKKE.
- ALDRI `patch_all` — kun `patch_urllib()` (målt: patch_all nedgraderer requests fra native JSPI til sync XHR). Patch-feil → console.warn, boot fortsetter.
- Kwargs→filters-mykingen skjer KUN i parse-laget; lasterlagets per-kind-oversettelse og harde feil (SDMX-dimensjonsintrospeksjon, dbnomics-dimensjonskrav) er uendret.
- Nær-treff på kanoniske nøkler (editDistance ≤ 2 mot years/countries/regions/indicators/filters) gir fortsatt suggest-FEIL, aldri stille filters-tolkning.
- Prompt og mekanikk forteller samme historie (alle promptendringer testlåses; «tåler ingen kommentar»-tekstene oppdateres NÅR toleransen lander — aldri før).
- Eksterne API-former verifiseres med curl i egne steg (Eurostat XML-formene) — juster koden til målt form.
- Testkommandoer: `node --test tests/js/*.test.js`; `python3 -m pytest -q`; `cd netlify/edge-functions && deno check ./*.ts _lib/*.ts && deno test --allow-all _lib/`.
- Commits per task; **push først i Task 5** etter grønn sluttsjekk + browser-smoke.

## File Structure

- Modify `js/directive-parser.js` og/eller `js/data-directives.js` — kommentar-stripping etter `)`; kwargs→filters i optionsFromKwargs.
- Modify `netlify/edge-functions/_lib/svar-prompt.ts` — regel 4-omskriving; «ingen etterfølgende kommentar»-tekstene; NB-linja om at direktivlinjer tåler kommentar.
- Modify `index.html` — python-motorens init: patch_urllib-lasting.
- Modify `netlify/edge-functions/_lib/tools/table-metadata.ts` — `case "eurostat"`-gren (XML) + gjenbruk av availability-filtreringen.
- Tests: `tests/js/directive-parser.test.js` + `data-directives-apikinds.test.js` (append), `_lib/svar-prompt-budsjett.test.ts` (append), `_lib/tools/table-metadata.test.ts` (append m/XML-fixtures), `_lib/tools/hints-parse.test.ts` (uendret — skal bestå).

---

### Task 1: Parser-toleranse — etterfølgende kommentar strippes

**Files:** Modify `js/directive-parser.js` (eller `js/data-directives.js` — les begge først og legg strippingen der linje→direktiv-parsingen faktisk skjer); test append i `tests/js/directive-parser.test.js`.

**Interfaces:** Produces: en direktivlinje med tekst etter avsluttende `)` (f.eks. `# e = eurostat.read("x")  # forklaring` eller `… ) — kilde: Eurostat`) parses som om halen ikke fantes. Halen kan inneholde `#`, `—`, ord — alt etter SISTE balanserte `)` på linja ignoreres. En linje UTEN `)` er uendret oppførsel.

- [ ] **Step 1: Les dagens parse-vei** — `grep -n "kommentar\|trailing" js/directive-parser.js js/data-directives.js` og finn hvor kommentar-etter-`)` i dag gir feil (juli-klassen). Noter hvilken funksjon som ser hele linja.
- [ ] **Step 2: Feilende tester** (append, filens mønster):

```js
test('direktivlinje tåler etterfølgende kommentar etter ) — strippes', () => {
  const p1 = DD.parse('# e = eurostat.read("nrg_pc_202")  # åpen GET, probet');
  assert.equal(p1.loads.length, 1);
  assert.equal(p1.loads[0].target, 'eurostat/nrg_pc_202');
  const p2 = DD.parse('# o = oecd.read("A,B@C", years="2020:2024") — kilde: OECD');
  assert.equal(p2.loads.length, 1);
  assert.equal(p2.loads[0].options.canonical.years.from, '2020');
  // uten sluttparentes: uendret (fortsatt feil/ikke-direktiv som før)
  const p3 = DD.parse('# x = ssb.read("05839"  # halvferdig');
  assert.equal(p3.loads.length, 0);
});
```

(juster assertion-detaljene til parserens faktiske retur-form — les eksisterende tester for target/options-formene først.)

- [ ] **Step 3: FAIL → implementer** — strip-regel: finn siste `)` som balanserer direktivets åpnings-`(`; alt etter (whitespace + hale) fjernes FØR videre parsing. Kommentér med juli-klassen som begrunnelse.
- [ ] **Step 4: Prompt-samme-historie** — i svar-prompt.ts: NB-teksten «en direktivlinje tåler INGEN etterfølgende kommentar etter `)` — parseren avviser den» erstattes med «tekst etter avsluttende `)` ignoreres av parseren — men hold direktivlinjer rene; forklaringer hører i prosa/kode» + tilsvarende i R-modusblokka om den finnes. Grep etter «etterfølgende» i svar-prompt.ts og prompts/svar.md (speilet!) — oppdater begge.
- [ ] **Step 5: Full node- + deno-suite** (hints-parse skal bestå urørt — toleransen kan bare gjøre flere hint gyldige, aldri færre).
- [ ] **Step 6: Commit** `feat(parser): etterfølgende kommentar etter ) strippes — juli-feilklassen død`

---

### Task 2: Ukjente kwargs → filters (parse-laget)

**Files:** Modify `js/data-directives.js` (`optionsFromKwargs`, ~linje 203; CANON_KEYS/suggest ~linje 160–195); test append i `tests/js/data-directives-apikinds.test.js`.

**Interfaces:** Produces: en kwarg som verken er kanonisk (years/countries/regions/indicators/filters/all) eller plain (secret_key/exec/kind/cache) og IKKE er nær-treff (suggest), folder inn i `canonical.filters[nøkkel] = verdi` (literal-verdier: streng/tall/liste). Nær-treff (editDistance ≤ 2 mot kanoniske nøkler) gir FORTSATT suggest-feilen. Eksplisitt `filters={...}` OG løse kwargs samtidig: flettes (kollisjon på samme nøkkel → høylytt feil).

- [ ] **Step 1: Les optionsFromKwargs + suggest** — forstå dagens feilvei for ukjente nøkler og hvor filters bygges.
- [ ] **Step 2: Feilende tester:**

```js
test('ukjente kwargs blir filters-oppføringer (vane-myking)', () => {
  const r = resolveOne('# e = eurostat.read("nrg_pc_202", geo="NO", unit="KWH")');
  assert.equal(r.error, undefined);
  assert.ok(r.url.includes('geo=NO') && r.url.includes('unit=KWH'));  // eurostat: filters → params
});
test('nær-treff på kanonisk nøkkel gir fortsatt suggest-feil', () => {
  const p = DD.parse('# e = eurostat.read("x", yeras="2020")');
  assert.ok(p.errors.length >= 1 && /years/.test(p.errors[0]));
});
test('kwarg + eksplisitt filters flettes; kollisjon feiler høylytt', () => {
  const ok = resolveOne('# e = eurostat.read("x", geo="NO", filters={"unit": "KWH"})');
  assert.ok(ok.url.includes('geo=NO') && ok.url.includes('unit=KWH'));
  const kollisjon = DD.parse('# e = eurostat.read("x", geo="NO", filters={"geo": "SE"})');
  assert.ok(kollisjon.errors.length >= 1);
});
```

(bruk filens eksisterende `resolveOne`/registry-hjelpere — les toppen først; sdmx-kind: verifiser også at en ukjent kwarg lander i needsSdmxKey.filters slik at lasterens dimensjonsintrospeksjon fortsatt hardfeiler på ikke-eksisterende dimensjon.)

- [ ] **Step 3: FAIL → implementer** i optionsFromKwargs: ny gren FØR feilkastet — literal-verdi + ikke-nær-treff → `canonical.filters[navn] = verdi`; kollisjonssjekk mot eksplisitt filters. Kommentar: «vane-myking 2026-08-04: kildens egne parametre aksepteres og oversettes — verifiseringen bor i lasterlaget (SDMX-introspeksjon, dbnomics-dimensjonskrav), som før.»
- [ ] **Step 4: Prompt-samme-historie** — EVAL-regel 1s «Parseren avviser ukjente argumenter høylytt, så `eurostat.read("nrg_pc_202", geo="NO")` FEILER før den kjører» er nå USANN → skriv om: kildens egne parametre kan gis rett på direktivlinja og tolkes som filters; filters={} er fortsatt den eksplisitte formen. Oppdater svar-prompt.ts + prompts/svar.md-speilet + ev. guider som siterer regelen (grep «geo="NO"»).
- [ ] **Step 5: Full suite; commit** `feat(parser): kildens egne kwargs folder inn i filters — verifiseringen består i lasterlaget`

---

### Task 3: patch_urllib ved boot + ærlig regel 4

**Files:** Modify `index.html` (python-motorens init — nær loadPackagesFromImports-blokka i runSelf, eller i selve pyodide-boot-funksjonen: les init-flyten først og velg stedet som kjører NØYAKTIG ÉN gang per boot); modify `netlify/edge-functions/_lib/svar-prompt.ts` + `prompts/svar.md`; test append i `_lib/svar-prompt-budsjett.test.ts`.

**Interfaces:** Produces: etter Pyodide-boot virker `urllib.request.urlopen` (via pyodide-http 0.2.2, KUN patch_urllib); regel 4-teksten forteller sannheten og styrer fortsatt mot bro/direktiv.

- [ ] **Step 1: Finn boot-punktet** — der pyodide er klar og micropip finnes, én gang per tolk (IKKE per kjøring — «Kjør» reinitialiserer tolken, så patchen må ligge i selve init-sekvensen som kjører ved hver tolk-oppstart). Grep `loadPyodide|pyodideReady|__ensure` i index.html.
- [ ] **Step 2: Implementer boot-patchen:**

```js
          // Vane-myking (spec 2026-08-04): stdlib urllib virker ikke nativt i
          // wasm (RuntimeError: TLS not supported — målt). patch_urllib gjør
          // den fungerende som SIKKERHETSNETT for modell-/bibliotekskode.
          // ALDRI patch_all: den nedgraderer requests fra native urllib3-JSPI
          // til sync XHR (målt 2026-08-04). Best effort — aldri blokker boot.
          try {
            await py.loadPackage('pyodide-http').catch(async function () {
              await py.runPythonAsync('import micropip as _mp\nawait _mp.install("pyodide-http")');
            });
            await py.runPythonAsync('import pyodide_http\npyodide_http.patch_urllib()');
          } catch (e) { console.warn('patch_urllib hoppet over:', e); }
```

(tilpass variabelnavnet `py` til init-koden; verifiser at pyodide-http finnes i distribusjonens loadPackage-indeks — gjør den ikke det, er micropip-fallbacken veien.)

- [ ] **Step 3: Regel 4-omskriving** (svar-prompt.ts + prompts/svar.md-speilet):

```
4. FORETREKK broen og direktivene for datahenting: pd.read_csv(url)/direktiv
   gir proxy-fallback ved CORS, forståelige feil, tomt-vakter og at kilden
   havner i kildelisten. requests og urllib VIRKER teknisk (urllib via
   sikkerhetsnett-patch), men gir deg INGENTING av dette — bruk dem kun når
   et bibliotek krever det, og oppgi da kilde-URL-en eksplisitt i svaret.
```

- [ ] **Step 4: Testlås** (append i svar-prompt-budsjett.test.ts): `assert(sys.includes("FORETREKK broen"))` + `assert(!sys.includes("Ingen requests/urllib/pyfetch"))` (gamle absolutten borte).
- [ ] **Step 5: Browser-smoke** (playwright/manuelt): kjør `import urllib.request; print(urllib.request.urlopen("https://api.worldbank.org/v2/country/NOR?format=json").read()[:60])` som ENESTE script i python-modus (fersk tolk) — skal virke UTEN eksplisitt pyodide_http-import i scriptet. Kjør også et requests-kall og verifiser adapteren fortsatt er urllib3-native (`type(requests.Session().get_adapter("https://x")).__module__` skal IKKE være pyodide_http._requests).
- [ ] **Step 6: Full suite; commit** `feat(boot): patch_urllib som sikkerhetsnett + ærlig regel 4 — aldri patch_all`

---

### Task 4: Eurostat-metadata-adapter (XML + befolkede koder)

**Files:** Modify `netlify/edge-functions/_lib/tools/table-metadata.ts` (ny `case "eurostat"` i kind-switchen + `eurostatMetadata`); test append i `_lib/tools/table-metadata.test.ts` (XML-fixtures).

**Interfaces:** Produces: `tableMetadata('eurostat', '<datasettkode>', {find?})` → TableMeta med dimensjoner/koder fra SDMX 2.1-strukturen, verdilister filtrert til befolkede koder fra contentconstraint (`kun_befolkede`/`tilgjengelighet` — samme kontrakt som sdmx-grenen), find=-filter via pickValues. Guiden leveres nå på SUKSESSveien (attachGuide i svar.ts, uendret).

- [ ] **Step 1: Verifiser XML-formene med curl** (målt 2026-08-04: begge 200, XML-only):
  - Struktur: `curl -s "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/ei_lmhr_m?references=all"` — sjekk om DSD+kodelister følger med references=all (forventet: `<s:DataStructure>` + `<s:Codelist>`-elementer, samme skjelett som ECB); noter navnerom/element-former (mes:/str:-prefikser kan avvike fra ECBs — juster xmlParser-oppslagene til MÅLT form).
  - Befolkede koder: `curl -s ".../sdmx/2.1/contentconstraint/ESTAT/ei_lmhr_m"` — noter KeyValue-formen (`<c:KeyValue id="geo"><c:Value>NO</c:Value>…`).
- [ ] **Step 2: Feilende tester** — XML-fixtures (miniatyr: 2 dimensjoner, én kodeliste med 3 koder hvorav contentconstraint befolker 2; + tidsdimensjon): assert (a) dimensjoner/koder ut; (b) verdier filtrert til befolkede + `kun_befolkede`; (c) contentconstraint-feil → ufiltrert fallback uten kast; (d) dispatch: `case "eurostat"` treffer (registry-oppføringen har kind="eurostat"); (e) find= filtrerer.
- [ ] **Step 3: Implementer** — `eurostatMetadata` etter ecbMetadata-mønsteret (fast-xml-parser, asArray/xmlText-hjelperne finnes) + en XML-variant av availability-filtreringen (gjenbruk sdmxAvailability-IDEEN, egen liten XML-parser for KeyValues; best effort → null). Base-URL: utled strukturroten fra registerets base_url (data-endepunktet) — verifiser formen fra Step 1, hardkod aldri host utenom registeret.
- [ ] **Step 4: Full deno-suite** (hints-parse består; eurostat-armens hint refererer allerede table_metadata? — sjekk eurostat.ts-hintet: peker det på probe i dag, oppdater det til `table_metadata('eurostat', '<kode>')`-formen NÅR adapteren finnes, og oppdater hint-testens forventning + owid/eurostat-testene om de asserterer hintteksten).
- [ ] **Step 5: Live-verifisering** — `deno run`-snutt eller curl-sammenligning: kjør adapteren mot ekte `ei_lmhr_m` og bekreft at `s_adj`/`indic`-dimensjonene kommer ut med befolkede koder (de modellen manglet i transkriptet).
- [ ] **Step 6: Commit** `feat(eurostat): metadata-adapter m/befolkede koder — blindflygings-hullet tettet`

---

### Task 5: Sluttsjekk, push og verifisering

**Files:** ingen nye.

- [ ] **Step 1: Full suite alle miljøer** (node + pytest + deno) — grønt.
- [ ] **Step 2: Push** (Netlify autodeployer).
- [ ] **Step 3: Verifisering (playwright, lokal fersk server m/.env-nøkkel):** still ledighetsspørsmålet («Which Nordic country has the highest unemployment right now?»). Suksesskriterier fra spec: ≤ 3 kjøringer; INGEN «TLS not supported»-runde; ingen tom-direktiv-runde forårsaket av manglende eurostat-metadata; svar med ferske tall (2025+). Noter resultatet i `docs/eval/2026-08-baseline.md` («Vane-myking-måling»).
- [ ] **Step 4: ROADMAP + telemetri-notat** — oppdater «DSL vs. LLM-vaner»-punktet: retning 2 gjennomført (liste); A1-full-myking og sdmx1-motor venter på feilraten i `feilrapporter`-tabellen (tagging-analysen).
- [ ] **Step 5: Rapporter.**

---

## Self-review (utført ved skriving)

- **Spec-dekning:** beslutning 1 → Task 3; 2 → Task 1; 3 → Task 2; 4 → Task 4; verifisering/telemetri-notat → Task 5. Utsatt-listen respekteres.
- **Ingen plassholdere:** kode/tekst utskrevet der formen er kjent; XML-formene har eksplisitte mål-først-steg (husets curl-disiplin) siden fixtures må speile målt virkelighet.
- **Typekonsistens:** `kun_befolkede`/`tilgjengelighet` gjenbruker feltene fra OECD-fiksen; parse-endringene navngir eksisterende funksjoner (optionsFromKwargs, CANON_KEYS, suggest); prompt-asserts matcher de nye tekstene.
- **Same-story-sjekk:** hver mekanisk endring (Task 1/2/3) har sitt prompt-oppdaterings-steg i SAMME task — tekst og mekanikk kan ikke drifte.
