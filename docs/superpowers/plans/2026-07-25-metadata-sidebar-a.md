# Metadata i sidebar — Leveranse A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `# meta`-direktiv, offentlig `/api/metadata`-endepunkt, og sidebar-UI (ⓘ-container på kilderader, klikkbare variabelrader, `# meta` i `showVariableDetail`) — Leveranse A fra `docs/superpowers/specs/2026-07-25-metadata-sidebar-design.md`.

**Architecture:** Direktivparsing i `js/data-directives.js` (ren parsing, som `# connect`). Én MetaInfo-form (spec §1) med renderer i ny modul `js/meta-info.js` (node-testbar, ikke inline i index.html). Endepunktet er en tynn offentlig wrapper rundt eksisterende `tableMetadata`-adaptere med ren mapping i `_lib/meta-info-map.ts`. index.html wirer bare sammen.

**Tech Stack:** Vanilla JS (IIFE-moduler som `data-directives.js`), Deno/TS edge-funksjoner, node --test + deno test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-metadata-sidebar-design.md` — MetaInfo-formen (§1), flettingsregelen (§2: `# meta` vises ØVERST, overstyrer aldri stille), direktivreglene (§3), endepunktreglene (§4).
- **Commit lokalt kun — ALDRI push** (memory `feedback-openstat-no-autopush`). Push er Hans'/kontrollørens eksplisitte beslutning etter live smoke-test.
- `# meta`-direktivet: mål er alltid eksplisitt (`<alias>` eller `<alias>.<variabel>`, split på FØRSTE punktum); innhold som starter med `http` → lenke (rest av linjen = valgfri etikett), ellers beskrivelse; gjentatte direktiver AKKUMULERER; ukjent mål → advarsel i sidebar, ALDRI stille dropp.
- `/api/metadata`: ingen auth, per-IP rate-limit via eksisterende `_lib/rate-limit.ts`-mønster, input KUN `(source, table?)` mot registeret (aldri rå URL-er), `Cache-Control: public, max-age=3600`. GET only.
- All HTML fra metadata/direktiver escapes (`escapeHtml`) — brukerstyrt tekst går rett inn i sidebar-DOM.
- UI-strenger på norsk via `t('…')` i index.html; `js/meta-info.js` returnerer kun struktur/HTML med ferdig-escapede verdier og tar etiketter som parametre der oversettelse trengs.
- Lazy henting: `/api/metadata` kalles FØRST ved klikk på ⓘ/variabelrad, aldri ved sideinnlasting; svar caches i `window.__connectedSources[key].metaInfo`.
- Berikelse via endepunktet gjøres KUN for kilder på `<register-id>/<tabell>`-form (f.eks. `ssb/05839`); rene fil-kilder (csv/parquet-URL-er) får container med bare `# meta`-innhold + kilde-URL-lenke — ærlig degradering (spec §4).
- Kommentarlenke-konvensjon (spec §7): `https://github.com/hmelberg/openstat-metadata/discussions?discussions_q=` + URL-enkodet mål (`ssb/05839` eller `ssb/05839.Region`).
- Testkommandoer fra repo-roten: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/` og `node --test 'tests/js/*.test.js'` og `python3 -m pytest tests/ -q` (python-suiten berøres ikke av A, men kjøres i sluttverifiseringen).
- index.html-endringer: husk at lokal Chrome HTTP-cacher js/ — verifisering krever hard-reload m/ ignoreCache (memory `project-openstat-verify-felle`).

---

### Task 1: `# meta`-parser i `js/data-directives.js`

**Files:**
- Modify: `js/data-directives.js`
- Modify: `netlify/edge-functions/_lib/data-directives.test.ts` (deno-testen som eval-er js-fila)

**Interfaces:**
- Produces: `parse(script)` returnerer nå også `metas: [{target, variable, kind: 'link'|'text', url, label, text, line}]` (`variable` er `null` for datasett-nivå; `url`/`label` kun for `kind:'link'`, `text` kun for `kind:'text'`). Konsumeres av Task 4/5 via `DataDirectives.parse`.

- [ ] **Step 1: Skriv feilende tester**

I `data-directives.test.ts` (finn eksisterende test-mønster — fila eval-er js-modulen; følg samme oppsett som eksisterende parse-tester), legg til:

```ts
Deno.test("meta-direktiv: tekst, lenke m/etikett, variabel-nivå, akkumulering", () => {
  const p = DD.parse([
    "# read https://x.example/lonn.csv as lonn",
    "# meta lonn Spørreundersøkelse om lønn, innsamlet 2024",
    "# meta lonn https://x.example/skjema.pdf Spørreskjema",
    "# meta lonn.alder Alder ved utgangen av inntektsåret",
    "-- meta lonn.alder https://x.example/kodebok#alder",
  ].join("\n"));
  assertEquals(p.metas.length, 4);
  assertEquals(p.metas[0], { target: "lonn", variable: null, kind: "text",
    text: "Spørreundersøkelse om lønn, innsamlet 2024", url: undefined, label: undefined,
    line: "# meta lonn Spørreundersøkelse om lønn, innsamlet 2024" });
  assertEquals(p.metas[1].kind, "link");
  assertEquals(p.metas[1].url, "https://x.example/skjema.pdf");
  assertEquals(p.metas[1].label, "Spørreskjema");
  assertEquals(p.metas[2].target, "lonn");
  assertEquals(p.metas[2].variable, "alder");
  assertEquals(p.metas[3].kind, "link");
  assertEquals(p.metas[3].label, undefined); // ingen etikett etter URL
});

Deno.test("meta-direktiv: split på FØRSTE punktum, // og -- kommentartegn, tom linje ignoreres", () => {
  const p = DD.parse("// meta d.a.b tekst her\n# meta   \n# meta d";  );
  assertEquals(p.metas.length, 1);           // de to ufullstendige droppes (mangler innhold)
  assertEquals(p.metas[0].variable, "a.b");  // alt etter første punktum er variabelnavn
});
```

(Nøyaktig assert-form tilpasses filas eksisterende stil — men ALLE oppførslene over skal dekkes.)

- [ ] **Step 2: Kjør, bekreft FAIL** — `cd netlify/edge-functions && deno test --allow-all _lib/data-directives.test.ts` → `p.metas` er undefined.

- [ ] **Step 3: Implementer i `js/data-directives.js`**

Ny regex ved de andre (etter `LOADAS_RE`, ~linje 32):

```js
  // # meta <alias>[.<variabel>] <innhold> — spec 2026-07-25-metadata-sidebar-design §3.
  // Innhold som starter med http(s):// er en lenke (resten = valgfri etikett),
  // ellers beskrivelsestekst. Gjentatte direktiver akkumulerer.
  var META_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*meta[ \t]+([A-Za-z_]\w*(?:\.\S+)?)[ \t]+(\S.*)$/gim;
```

I `parse()` (etter LOAD_RE-løkka, før `return`):

```js
    var metas = [];
    META_RE.lastIndex = 0;
    while ((m = META_RE.exec(script)) !== null) {
      var dot = m[1].indexOf('.');
      var tgt = dot > 0 ? m[1].slice(0, dot) : m[1];
      var variable = dot > 0 ? m[1].slice(dot + 1) : null;
      var content = m[2].trim();
      var um = content.match(/^(https?:\/\/\S+)(?:[ \t]+(.*))?$/i);
      if (um) {
        metas.push({ target: tgt, variable: variable, kind: 'link',
                     url: um[1], label: (um[2] || '').trim() || undefined, text: undefined, line: m[0].trim() });
      } else {
        metas.push({ target: tgt, variable: variable, kind: 'text',
                     url: undefined, label: undefined, text: content, line: m[0].trim() });
      }
    }
```

og endre returen til `return { connects: connects, loads: loads, metas: metas, errors: errors };`. Sjekk at ingen annen konsument av `parse()` destrukturerer strengt (grep `\.parse(` i index.html og js/ — de leser feltvis, så et nytt felt er trygt; bekreft).

- [ ] **Step 4: Kjør testene → PASS.** Kjør også HELE `_lib/`-suiten (parse brukes bredt).

- [ ] **Step 5: Commit** — `git add js/data-directives.js netlify/edge-functions/_lib/data-directives.test.ts && git commit -m "feat: # meta-direktiv — parsing (mål, tekst/lenke, akkumulering)"`

---

### Task 2: MetaInfo-modul `js/meta-info.js` (fletting + renderer + kommentarlenke)

**Files:**
- Create: `js/meta-info.js`
- Create: `tests/js/meta-info.test.js` (node --test, samme mønster som eksisterende `tests/js/*.test.js` — se en av dem for load-oppsettet)

**Interfaces:**
- Produces (global `MetaInfo`-IIFE, samme stil som `DataDirectives`):
  - `merge(apiMeta, metas, target)` → MetaInfo-objekt per spec §1: fletter endepunkt-svar (kan være null) med `# meta`-direktiver for `target` (datasett-nivå: `variable === null`; direktiv-innhold FØRST i beskrivelse/lenker per spec §2).
  - `forVariable(mi, metas, target, varName)` → `{label, beskrivelse, kodeliste, lenker}` for én variabel (slår sammen `mi.variabler`-oppføring med variabel-nivå-direktiver).
  - `render(mi, opts)` → HTML-streng for containeren: beskrivelse(r), `<dl>` for `felter`, lenkeliste (alle `lenker` + kommentarlenke), variabel-antall. `opts = {commentTarget, labels: {links, comment, fields}}` — etiketter injiseres (i18n skjer i index.html).
  - `renderVariable(v, opts)` → HTML for variabel-container (label, beskrivelse, kodeliste-tabell capped 40 rader, lenker, kommentarlenke).
  - `commentUrl(target)` → `https://github.com/hmelberg/openstat-metadata/discussions?discussions_q=` + `encodeURIComponent(target)`.
  - Intern `esc()` — modulen escaper ALT selv; index.html skal kunne sette `innerHTML = MetaInfo.render(...)` trygt.

- [ ] **Step 1: Skriv feilende node-tester** — dekk: (a) merge med kun direktiver (apiMeta null) gir beskrivelse+lenker; (b) merge med begge: direktiv-lenker FØRST i lista, api-tittel beholdt; (c) `forVariable` finner kodeliste fra apiMeta og beskrivelse fra direktiv samtidig; (d) `render` escaper `<script>` i direktivtekst (assert at output inneholder `&lt;script&gt;`); (e) `commentUrl("ssb/05839.Region")` gir korrekt enkodet URL; (f) kodeliste-tabell cappes på 40 med «(+N flere)»-rad.

- [ ] **Step 2: Kjør → FAIL** (`node --test tests/js/meta-info.test.js`).

- [ ] **Step 3: Implementer modulen.** IIFE på `data-directives.js`-mønsteret (`(function (global) { … global.MetaInfo = {...}; })(typeof window !== 'undefined' ? window : globalThis);`). Komplett logikk per interfacet over; hold render-HTML-en til eksisterende klassenavn-stil (`var-detail-dl`, `var-detail-prose` osv. gjenbrukes der de passer, pluss nye klasser `meta-info-links`, `meta-info-user` for direktiv-delen — CSS kommer i Task 4).

- [ ] **Step 4: Kjør → PASS.**

- [ ] **Step 5: Commit** — `git add js/meta-info.js tests/js/meta-info.test.js && git commit -m "feat: MetaInfo-modul — fletting, renderer, kommentarlenke"`

---

### Task 3: `/api/metadata`-endepunkt

**Files:**
- Create: `netlify/edge-functions/metadata.ts`
- Create: `netlify/edge-functions/_lib/meta-info-map.ts`
- Create: `netlify/edge-functions/_lib/meta-info-map.test.ts`
- Modify: `netlify.toml` (nytt `[[edge_functions]]`-innslag: function `metadata`, path `/api/metadata`)
- Modify: `netlify/edge-functions/README.md` (én linje i endepunktlista)

**Interfaces:**
- Consumes: `tableMetadata` (`_lib/tools/table-metadata.ts`), `loadRegistry`/`findSource`/`isSearchableSource` (`_lib/registry.ts`), `checkRateLimit` (`_lib/rate-limit.ts`), `clientIp` (`_lib/auth.ts`).
- Produces: `GET /api/metadata?source=<id>[&table=<id>]` → MetaInfo-JSON (spec §1). Uten `table`: register-nivå-info (navn, base_url-lenke, tillit i `felter`). Med `table`: + `tittel` og `variabler` fra `tableMetadata`. Feil: 400 (ukjent/ugyldig source, manglende param), 429 (rate-limit), 502 (kildefeil — feilmelding fra adapteren i klartekst).
- `mapToMetaInfo(src, tm)` i `_lib/meta-info-map.ts`: ren funksjon `(DataSource, TableMeta|null) → MetaInfo` — all mapping-logikk her (testbar), endepunktet er kun wiring.

- [ ] **Step 1: Feilende tester for `mapToMetaInfo`** — dekk: registeroppføring uten TableMeta (felter: Utgiver/Tillit; lenker: base_url m/ etikett «Kilde»); med TableMeta (tittel fra tm.title, variabler mappet 1:1 code→navn/label→label/values→kodeliste, time-flagg → felt «tid» i variabelen); tom variables-liste OK.

- [ ] **Step 2: FAIL-kjøring.**

- [ ] **Step 3: Implementer `meta-info-map.ts`** (ren mapping, ingen fetch) **og `metadata.ts`:**

```ts
// GET /api/metadata?source=<registry-id>[&table=<tabell-id>] — offentlig,
// rate-limited. Spec: docs/superpowers/specs/2026-07-25-metadata-sidebar-design.md §4.
import { checkRateLimit } from "./_lib/rate-limit.ts";
import { clientIp } from "./_lib/auth.ts";
import { findSource, isSearchableSource, loadRegistry } from "./_lib/registry.ts";
import { tableMetadata } from "./_lib/tools/table-metadata.ts";
import { mapToMetaInfo } from "./_lib/meta-info-map.ts";

export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const rate = await checkRateLimit("metadata", clientIp(request));
  if (!rate.allowed) {
    return new Response("Rate limited", { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }
  const u = new URL(request.url);
  const sourceId = (u.searchParams.get("source") ?? "").trim();
  const table = (u.searchParams.get("table") ?? "").trim();
  if (!/^[a-z0-9_-]{1,32}$/.test(sourceId)) return new Response("Ugyldig source", { status: 400 });
  const registry = await loadRegistry(u.origin);
  const src = findSource(registry, sourceId);
  if (!src) return new Response(`ukjent kilde '${sourceId}'`, { status: 400 });
  let tm = null;
  if (table) {
    if (!isSearchableSource(src)) return new Response(`kilden '${sourceId}' har ikke tabell-metadata`, { status: 400 });
    try { tm = await tableMetadata(sourceId, table, { registry }); }
    catch (e) { return new Response(String(e), { status: 502 }); }
  }
  return new Response(JSON.stringify(mapToMetaInfo(src, tm)), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
};
```

netlify.toml: nytt blokk-innslag etter `data-svar`-blokka. README: én linje («`metadata` → `/api/metadata` — offentlig MetaInfo-oppslag (kilde+tabell) for sidebaren, rate-limited»).

- [ ] **Step 4: PASS + `deno check` rent.**
- [ ] **Step 5: Commit** — melding: `feat: /api/metadata — offentlig MetaInfo-endepunkt (kilde+tabell, rate-limited)`

---

### Task 4: Sidebar — ⓘ-container på kilderader + klikkbare variabelrader

**Files:**
- Modify: `index.html` (last `js/meta-info.js` ved de andre script-tagene; endre `updateSidebarSources()` ~linje 7655; ny CSS for `.meta-info-*` og container ved eksisterende `.sidebar-*`-regler)

**Interfaces:**
- Consumes: `DataDirectives.parse(script).metas` (Task 1), `MetaInfo.merge/forVariable/render/renderVariable/commentUrl` (Task 2), `/api/metadata` (Task 3), `window.__connectedSources`.

Ingen enhetstest-fil (inline index.html-kode) — verifiseres i Task 6s smoke-test. Kravene:

- [ ] **Step 1: Erstatt `updateSidebarSources()`** med en versjon som per kilde-oppføring rendrer: navnelinje + ⓘ-knapp (`<button class="meta-info-btn" data-meta-src="…">ⓘ</button>`), skjult container-div under, og variabelrader MED `data-meta-var`-attributt og pointer-cursor (behold `opacity:.65`-stilen på teksten). `# meta`-mål som ikke matcher noen kjent kilde/datasett-nøkkel rendres som egen advarselsrad nederst: `⚠ # meta: ukjent mål «X»` (spec §3, aldri stille).

- [ ] **Step 2: Klikk-logikk (event-delegering på `#sidebarSources`):**
  - ⓘ-klikk: toggle container. Første åpning: hvis nøkkelen er `<register-id>/<tabell>`-form OG register-id finnes i registeret → `fetch('/api/metadata?source=…&table=…')`, cache svaret på `__connectedSources[key].metaInfo`; ellers `metaInfo = null`. Render `MetaInfo.render(MetaInfo.merge(metaInfo, metas, key), {commentTarget: key, labels: {…t()-strenger…}})`. Ved fetch-feil: container viser `# meta`-innholdet + dempet «(kunne ikke hente kildemetadata)» — aldri tom/stille.
  - Variabelrad-klikk: samme mønster med `MetaInfo.renderVariable(MetaInfo.forVariable(mi, metas, key, varName), …)` i en container rett under raden.
  - `metas` hentes ferskt fra `DataDirectives.parse(scriptInput.value).metas` ved hvert klikk (billig, alltid i synk med editoren).

- [ ] **Step 3: CSS** — små regler i stil med eksisterende sidebar-CSS: `.meta-info-btn` (diskret, høyrestilt), `.meta-info-container` (innrykk, ramme, samme bakgrunn som `var-detail`-panelet), `.meta-info-user` (direktiv-innhold, markert med tynn venstre-border), `.meta-info-warn` (advarselsraden).

- [ ] **Step 4: Manuell verifisering med `netlify dev`** (edge-funksjonen må kjøre): script med `# connect ssb` + `# read ssb/05839...`-linje og et par `# meta`-linjer → ⓘ åpner container med SSB-tittel+variabler + direktivinnhold øverst; variabelklikk viser kodeliste; fil-kilde (ren CSV-URL) viser kun direktiv+URL-lenke; ukjent `# meta`-mål gir advarselsrad. Husk hard-reload m/ ignoreCache.

- [ ] **Step 5: Commit** — `feat: sidebar — ⓘ-metadatacontainer og klikkbare variabelrader i Tilkoblede kilder`

---

### Task 5: `# meta` inn i `showVariableDetail` (aktive datasett)

**Files:**
- Modify: `index.html` (`renderVariableDetailHtml`, ~linje 4253)

- [ ] **Step 1:** I `renderVariableDetailHtml(varName, data, cat)`: hent `metas` via `DataDirectives.parse(scriptInput.value).metas`, finn oppføringer der `variable === varName` og `target` matcher datasettnavnet panelet viser (funksjonen må få datasettnavnet — sjekk kallstedet `showVariableDetail(dsName, varName)` og tre `dsName` inn som parameter). Direktiv-tekst rendres som `.meta-info-user`-avsnitt ØVERST i panelet (før `<dl>`-en), direktiv-lenker føyes til i en lenkeseksjon sammen med eksisterende «Mer informasjon»-knapp, pluss 💬-kommentarlenke (`MetaInfo.commentUrl(dsName + '.' + varName)`).
- [ ] **Step 2:** Manuell verifisering (samme økt som Task 4s smoke-test): last penguins-eksempelet, legg `# meta penguins.species Testnotat` i scriptet → notatet vises øverst i variabelpanelet.
- [ ] **Step 3: Commit** — `feat: # meta-innhold og kommentarlenke i variabelpanelet for aktive datasett`

---

### Task 6: `openstat-metadata`-repo + full verifisering

**Files:** Ingen kodeendringer i openstat-repoet.

- [ ] **Step 1 (KONTROLLØR/manuelt — subagent skal IKKE gjøre dette):** Opprett repoet og slå på Discussions:
```bash
gh repo create hmelberg/openstat-metadata --public --description "Fellesskapsmetadata og kommentarer for datasett/variabler i openstat" --add-readme
gh api -X PATCH repos/hmelberg/openstat-metadata -f has_discussions=true
```
README-en i det nye repoet forklarer konvensjonen (én diskusjon per mål, tittel = målet, f.eks. `ssb/05839.Region`).
- [ ] **Step 2:** Verifiser at 💬-lenkene fra Task 4/5 treffer (åpne én i nettleser — search-URL-en skal vise Discussions-søk, tomt er OK).
- [ ] **Step 3: Full suite:** deno check + deno test (`_lib/`), `node --test 'tests/js/*.test.js'`, `python3 -m pytest tests/ -q` — alle grønne.
- [ ] **Step 4:** Ledger-oppdatering. INGEN push — push er egen beslutning etterpå.

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning (leveranse A):** §1→Task 2/3 (formen begge steder, samme feltnavn); §2→Task 2 (merge-rekkefølge testes); §3→Task 1 (alle regler inkl. akkumulering og første-punktum-split; advarselen bor i Task 4 siden kjente mål først finnes der); §4→Task 3; §5→Task 4+5; §7 v1→Task 6.
- **Plassholder-skann:** Task 4/5 gir krav+ankere i stedet for full inline-HTML — bevisst, siden index.html-koden er stor og implementeren MÅ lese de faktiske funksjonene (linjeankere oppgitt) — ingen TBD-er.
- **Type-konsistens:** `metas`-formen fra Task 1 brukes identisk i Task 2s `merge`/`forVariable` og Task 4/5s kallsteder; MetaInfo-feltnavnene (`tittel/beskrivelse/felter/lenker/variabler`, `kodeliste: [{kode, label}]`) er identiske i `meta-info-map.ts` og `js/meta-info.js`.
