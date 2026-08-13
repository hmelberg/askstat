# Kort/lang-splitt — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementere spec
`docs/superpowers/specs/2026-08-13-kort-lang-splitt-design.md`: `## Kort`
ivrig / `## Guide` lat også for egne kilder (guides_override for kopier,
kort-som-summary for rene egne kilder), KI-vedlikehold av begge lag
(lag-regel, oppgave:'kort', editor-knapp), og kode-sporet for admin
(kode_sak → GitHub-issue).

**Architecture:** Splitt-parseren bor i `js/source-doc.js` (som allerede
har seksjonsparsing m/kort/guide-alias og lastes i både browser og node).
Compose-policyen gjenbruker EKSISTERENDE nivå `'summary'` — serverens
kortform-merke «hent full tekst med get_pack» rendres allerede for det
nivået (svar-prompt.ts:164-168), så §3 krever NULL serverendring.
guides_override erstatter guides_off i attacheren (Map i stedet for
skip-Set). kode_sak/issue gjenbruker kilde-pr-endepunktet med issue-modus.

**Tech Stack:** som forrige runde — ES5-JS + node:test, Deno edge functions
+ deno.land/std@0.224.0-asserts, GitHub REST.

## Global Constraints

- js/-filer: ES5 (`var`, function-uttrykk), `'use strict'`, norske
  kommentarer, IIFE + module.exports (mønster: js/feil-telemetri.js).
- Node: `node --test 'tests/js/*.test.js'` (fnutter!); enkeltfil
  `node --test tests/js/<fil>.test.js`. Deno (fra netlify/edge-functions/):
  `deno test --allow-all _lib/` + `deno check kilde-forslag.ts kilde-pr.ts svar.ts`;
  asserts fra `https://deno.land/std@0.224.0/assert/mod.ts`.
- Caps (spec): guide-override-verdi 8 000 tegn (samme som repo-guider,
  klippes BEGGE sider); ivrig kort-tekst 2 500 tegn; små dokumenter
  ≤ 1 500 tegn flyter fulle (L1_CAP-tallet); issue-tittel ≤ 200,
  issue-kropp ≤ 20 000.
- `guides_off` UTGÅR helt (klient + server + tester) — ingen bakoverkompat.
- Scrub-regimet uendret; kode_sak-kroppen bygges av MODELLEN fra allerede
  scrubbet evidens (payloaden var scrubbet inn).
- i18n: engelske nøkler via t()/T(); ordbok-runden er egen task (Task 9).
- Aldri push; commit per task på gren `kort-lang-splitt` fra main.
- Sikkerhetsinvariant fra forrige runde STÅR: kilde-pr kaller adminGate
  UTEN allowByok/allowLlmKey — også for issue-modusen.

---

### Task 1: `SourceDoc.splitKortGuide` — splitt-parseren

**Files:**
- Modify: `js/source-doc.js`
- Test: `tests/js/source-doc.test.js`

**Interfaces:**
- Produces: `SourceDoc.splitKortGuide(text) -> {prefix, hode, kort, guide}`
  — rå-tekst-bevarende: `prefix` = maskindelen (front matter/yaml/nakne
  felter, tom streng om ingen), `hode` = tittellinje + ledende prosa før
  første `## `-overskrift, `kort` = hele `## Kort`-blokken (inkl.
  overskriftslinja; '' om ingen), `guide` = resten av bodyen (alle andre
  blokker, inkl. overskrifter). Invariant: `prefix + hode + kort + guide`
  inneholder all tekst (rekkefølgen kort/guide kan avvike fra originalen
  når Kort står sist — det er OK, konsumentene konkatenerer selv).
  Postel-fallback: ingen kort-overskrift → `kort` = første ikke-tomme
  avsnitt av hode-prosaen (flyttes UT av hode), `guide` = resten.
- Consumes: interne `extractFields` (body-invariant: body er streng-suffiks
  av text i alle tre former) og `sectionKey` ('kort'-alias: kort/short/
  summary).

- [ ] **Step 1: Skriv feilende tester** — legg til i `tests/js/source-doc.test.js`
(gjenbruk filas eksisterende require av `../../js/source-doc.js`):

```js
test('splitKortGuide: front matter + Kort + Guide splittes rått og tapsfritt', () => {
  const doc = '---\nid: oecd\ncors: true\n---\n\n# OECD\n\nIntro-linje.\n\n## Kort\n\nMakrodata for OECD-land.\n\n## Guide\n\nBruk sdmx-adapteret.\n\n## Variabler\n\n- a\n';
  const r = SourceDoc.splitKortGuide(doc);
  assert.ok(r.prefix.startsWith('---\nid: oecd'));
  assert.ok(r.hode.indexOf('# OECD') >= 0);
  assert.ok(r.hode.indexOf('Intro-linje.') >= 0);
  assert.ok(r.kort.indexOf('## Kort') === 0 || r.kort.indexOf('## Kort') > 0);
  assert.ok(r.kort.indexOf('Makrodata') >= 0);
  assert.ok(r.guide.indexOf('sdmx-adapteret') >= 0);
  assert.ok(r.guide.indexOf('## Variabler') >= 0);        // alt ikke-Kort → guide
  assert.ok(r.kort.indexOf('sdmx') === -1);
  // Innholdsbevarende: hver LINJE havner i nøyaktig én del (join taper kun
  // mellomgruppe-linjeskift — derfor linje-sett, ikke tegnlengde).
  var alle = (r.prefix + '\n' + r.hode + '\n' + r.kort + '\n' + r.guide).split('\n').filter(Boolean).sort();
  assert.deepEqual(alle, doc.split('\n').filter(Boolean).sort());
});

test('splitKortGuide: Postel — uten overskrifter blir første avsnitt kort', () => {
  const r = SourceDoc.splitKortGuide('Min kilde om priser.\n\nLang forklaring\nover flere linjer.\n');
  assert.ok(r.kort.indexOf('Min kilde om priser.') >= 0);
  assert.ok(r.guide.indexOf('Lang forklaring') >= 0);
  assert.equal(r.prefix, '');
});

test('splitKortGuide: kun Kort, ingen Guide — guide er tom', () => {
  const r = SourceDoc.splitKortGuide('## Kort\n\nAlt her.\n');
  assert.ok(r.kort.indexOf('Alt her.') >= 0);
  assert.equal(r.guide.trim(), '');
});

test('splitKortGuide: tom/ikke-streng tåles', () => {
  assert.deepEqual(SourceDoc.splitKortGuide(''), { prefix: '', hode: '', kort: '', guide: '' });
  assert.deepEqual(SourceDoc.splitKortGuide(null), { prefix: '', hode: '', kort: '', guide: '' });
});
```

(Tilpass `test`/`assert`-formen til filas eksisterende stil — les toppen
først. `short`/`summary`-alias for Kort-overskriften dekkes av sectionKey
og trenger ikke egen test.)

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/source-doc.test.js`

- [ ] **Step 3: Implementer** i `js/source-doc.js` (etter
extractTitleAndSections, før `var SourceDoc`):

```js
  // splitKortGuide (spec 2026-08-13-kort-lang-splitt §1): rå-tekst-bevarende
  // to-lags-splitt. prefix = maskindelen (extractFields-body er alltid en
  // streng-SUFFIKS av text i alle tre former — invariant-testet), hode =
  // tittel + ledende prosa, kort = ## Kort-blokken (inkl. overskrift),
  // guide = alle andre blokker. Postel: ingen Kort-overskrift → første
  // avsnitt av hode-prosaen blir kort.
  function splitKortGuide(text) {
    if (typeof text !== 'string' || !text) {
      return { prefix: '', hode: '', kort: '', guide: '' };
    }
    var body = extractFields(text).body;
    var prefix = text.slice(0, text.length - body.length);
    var lines = body.split('\n');
    var hodeLinjer = [];
    var kortLinjer = [];
    var guideLinjer = [];
    var maal = hodeLinjer;
    for (var i = 0; i < lines.length; i++) {
      var hm = /^##\s+(.+)$/.exec(lines[i]);
      if (hm) maal = sectionKey(hm[1].trim()) === 'kort' ? kortLinjer : guideLinjer;
      maal.push(lines[i]);
    }
    var hode = hodeLinjer.join('\n');
    var kort = kortLinjer.join('\n');
    var guide = guideLinjer.join('\n');
    if (!kort) {
      // Postel: første ikke-tomme avsnitt etter ev. tittellinje blir kort.
      var deler = hode.split(/\n\s*\n/);
      for (var d = 0; d < deler.length; d++) {
        var avsnitt = deler[d];
        if (avsnitt.trim() && !/^#\s/.test(avsnitt.trim())) {
          kort = avsnitt;
          deler.splice(d, 1);
          hode = deler.join('\n\n');
          break;
        }
      }
    }
    return { prefix: prefix, hode: hode, kort: kort, guide: guide };
  }
```

…og legg `splitKortGuide: splitKortGuide,` inn i `SourceDoc`-objektet.
(Merk at join-en taper mellomgruppe-linjeskift — derfor sjekker test 1
linje-SETT, ikke tegnlengde; konsumentene konkatenerer selv med '\n'.)

- [ ] **Step 4: Kjør — grønne**, inkl. hele source-doc-suiten (parse/
serialize/normalize uendret). `node --test tests/js/source-doc.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/source-doc.js tests/js/source-doc.test.js
git commit -m "feat: SourceDoc.splitKortGuide — rå to-lags-splitt m/Postel-fallback"
```

---

### Task 2: Compose-policy — egne kilder sender Kort som `level:'summary'`

**Files:**
- Modify: `js/packs.js` (compose)
- Test: `tests/js/packs.test.js`

**Interfaces:**
- Consumes: `SourceDoc.splitKortGuide` (Task 1) via `global.SourceDoc` —
  LØPETIDS-oppslag med vakt (packs.js skal ikke hard-require source-doc;
  node-testene require'r source-doc først, som setter globalThis.SourceDoc).
- Produces: compose() gir user-kilder (id `user:`-prefiks, kind !==
  'overview') med tekst > 1 500 tegn pick `{level:'summary',
  text: (prefix + hode + kort) klippet 2 500}` — serverens eksisterende
  kortform-merke + get_pack-hint slår inn uten serverendring
  (svar-prompt.ts:164-168 rendrer noten for level 'summary'; coercePacks
  aksepterer 'summary' allerede). Små dokumenter og overview: uendret.
  Kopier (origin builtin-copy) følger SAMME policy her — deres Guide går i
  tillegg lat via Task 3-4.

- [ ] **Step 1: Skriv feilende tester** i `tests/js/packs.test.js`:

```js
test('compose: stor egen kilde → summary-nivå med prefix+hode+Kort, ikke full tekst', () => {
  require('../../js/source-doc.js');   // setter globalThis.SourceDoc
  const stor = '---\nid: x\n---\n# T\n\n## Kort\n\nVelg meg for priser.\n\n## Guide\n\n' + 'g'.repeat(5000);
  const ut = compose([{ id: 'user:a', name: 'A', text: stor, kind: 'source', tags: [] }]);
  assert.equal(ut[0].level, 'summary');
  assert.ok(ut[0].text.indexOf('Velg meg for priser.') >= 0);
  assert.ok(ut[0].text.indexOf('ggggg') === -1);              // Guide er IKKE med
  assert.ok(ut[0].text.length <= 2500);
});

test('compose: liten egen kilde (≤1500) flyter full', () => {
  const ut = compose([{ id: 'user:b', name: 'B', text: '## Kort\n\nkort tekst', kind: 'source', tags: [] }]);
  assert.equal(ut[0].level, 'full');
});

test('compose: overview og kuraterte pakker er uendret', () => {
  const stor = 'x'.repeat(5000);
  const ut = compose([
    { id: 'user:c', name: 'C', text: stor, kind: 'overview', tags: [] },
    { id: 'norway', name: 'N', text: stor, kind: 'source', tags: [] },
  ]);
  assert.equal(ut[0].level, 'full');
  assert.equal(ut[1].level, 'full');
});
```

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/packs.test.js`

- [ ] **Step 3: Implementer** i compose() i `js/packs.js` — i for-løkka,
FØR dagens full/manifest/summary-valg:

```js
      // Kort/lang-splitt (spec 2026-08-13 §3): store EGNE enkeltkilder
      // sender KUN maskindel+hode+Kort ivrig — resten hentes lat med
      // get_pack (serverens kortform-merke rendres for 'summary'-nivået).
      // Løpetids-vakt på SourceDoc: mangler den (isolerte tester), faller
      // vi til dagens oppførsel.
      var SD = (typeof global !== 'undefined' && global.SourceDoc) || null;
      if (String(p.id).indexOf('user:') === 0 && p.kind !== 'overview' &&
          full.length > 1500 && SD && SD.splitKortGuide) {
        var deler = SD.splitKortGuide(full);
        var ivrig = (deler.prefix + deler.hode + '\n' + deler.kort).slice(0, 2500);
        var pickKort = { level: 'summary', text: ivrig };
        budget -= pickKort.text.length;
        byId[p.id] = pickKort;
        continue;
      }
```

(compose er definert UTENFOR makePacks men INNI IIFE-en — `global` er
IIFE-parameteren og er i scope. Verifiser før du antar; står compose et
sted uten `global`, bruk `(typeof globalThis !== 'undefined' && globalThis.SourceDoc)`.)

- [ ] **Step 4: Kjør — grønne**, inkl. alle eksisterende compose-tester.
`node --test tests/js/packs.test.js` og full suite.

- [ ] **Step 5: Commit**

```bash
git add js/packs.js tests/js/packs.test.js
git commit -m "feat: compose sender store egne kilder som Kort-ivrig summary m/get_pack-hale"
```

---

### Task 3: `guides_override` klientside (erstatter guides_off)

**Files:**
- Modify: `js/packs.js` (`builtinOverstyringer` erstatter `builtinOverstyrte`)
- Modify: `js/ai-chat.js` (payload-feltet)
- Test: `tests/js/packs.test.js`

**Interfaces:**
- Produces: `Packs.builtinOverstyringer() -> {<of-id>: <guide-tekst ≤8000>}`
  — for AKTIVE builtin-kopier; guide-teksten er `splitKortGuide(pr.text).guide`
  (fallback hele teksten om splitten gir tom guide — bedre en ivrigløs
  kopi enn ingen veiledning). `builtinOverstyrte` SLETTES (eneste bruker
  var ai-chat-payloaden).
- ai-chat sender `guides_override: {…}` når ikke-tomt, `undefined` ellers;
  `guides_off`-feltet fjernes.

- [ ] **Step 1: Skriv feilende tester** (tilpass Task 9-testene fra forrige
runde — de tester `builtinOverstyrte` som nå skiftes ut):

```js
test('builtinOverstyringer: of→guide-tekst for aktive kopier, klippet 8000, dedupet', () => {
  require('../../js/source-doc.js');
  const langGuide = '## Kort\n\nk\n\n## Guide\n\n' + 'g'.repeat(9000);
  const profiles = {
    get: (id) => ({
      k1: { name: 'A', text: langGuide, origin: { source: 'builtin-copy', of: 'ssb' } },
      k2: { name: 'B', text: 'x', origin: { source: 'community', id: 'x' } },
    })[id] || null,
    packsState: () => ({ ids: ['user:k1', 'user:k2'] }),
    countryState: () => ({ mode: 'none' }),
    list: () => [], create: () => 'x',
  };
  const P = makePacks(fakeStorage(), async () => ({ ok: false }), profiles);
  const o = P.builtinOverstyringer();
  assert.deepEqual(Object.keys(o), ['ssb']);
  assert.ok(o.ssb.indexOf('## Guide') >= 0);
  assert.ok(o.ssb.length <= 8000);
  assert.equal(typeof P.builtinOverstyrte, 'undefined');   // gammelt navn borte
});
```

- [ ] **Step 2: Kjør — feiler** (og de gamle builtinOverstyrte-testene må
SLETTES/omskrives i samme åndedrag — de tester et navn som fjernes).

- [ ] **Step 3: Implementer** i `js/packs.js` — ERSTATT `builtinOverstyrte`
med:

```js
    // guides_override (kort/lang-splitt §2): aktive builtin-kopier →
    // {of: Guide-tekst}. Guiden ankommer LAT server-side (attacheren) på
    // samme tidspunkt som repo-guiden ellers ville kommet; 8k-taket
    // speiler MAX_GUIDE_CHARS i _lib/source-guides.ts.
    function builtinOverstyringer() {
      var ut = {};
      var SD = (typeof global !== 'undefined' && global.SourceDoc) || null;
      effectiveIds().forEach(function (id) {
        if (String(id).indexOf('user:') !== 0) return;
        var pr = profiles && profiles.get ? profiles.get(id.slice(5)) : null;
        var of = pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of;
        if (!of || ut[of]) return;
        var tekst = String(pr.text || '');
        var guide = SD && SD.splitKortGuide ? SD.splitKortGuide(tekst).guide : tekst;
        ut[of] = String(guide && guide.trim() ? guide : tekst).slice(0, 8000);
      });
      return ut;
    }
```

…og bytt navnet i return-objektet. I `js/ai-chat.js`: erstatt hele
`guides_off`-feltet (med kommentaren) med:

```js
              // Kort/lang-splitt §2: aktive builtin-kopiers GUIDE-tekst
              // leveres LAT via serverens guide-attacher — Kort-delen
              // flyter ivrig i packs-feltet over. Erstatter guides_off.
              guides_override: (function () {
                var o = window.Packs && Packs.builtinOverstyringer ? Packs.builtinOverstyringer() : {};
                return Object.keys(o).length ? o : undefined;
              })(),
```

- [ ] **Step 4: Kjør — grønne.** `node --test 'tests/js/*.test.js'`

- [ ] **Step 5: Commit**

```bash
git add js/packs.js js/ai-chat.js tests/js/packs.test.js
git commit -m "feat: guides_override klientside — kopiens Guide lat, Kort ivrig (guides_off utgår)"
```

---

### Task 4: `guides_override` serverside (attacher-map, guides_off fjernes)

**Files:**
- Modify: `netlify/edge-functions/_lib/source-guides.ts`
- Modify: `netlify/edge-functions/_lib/source-guides.test.ts`
- Modify: `netlify/edge-functions/svar.ts`

**Interfaces:**
- Produces: `makeGuideAttacher(origin, fetchImpl = fetch,
  override?: Map<string, string>)` — har attacheren en override for id-en,
  settes `result.guide` til DEN teksten (klippet MAX_GUIDE_CHARS, samme
  sent-engangsregel, INGEN fetch). Skip-Set-parameteren fra forrige runde
  ERSTATTES (guides_off er død).
- `svar.ts`: `guides_override?: unknown` i RequestBody;
  `coerceGuidesOverride(v)` (ny, i source-guides.ts): objekt →
  Map<id, tekst> der nøkkel matcher `/^[a-z0-9_-]{1,32}$/`, verdi er
  ikke-tom string klippet 8 000; maks 40 innslag. `guides_off`-feltet og
  -koercionen fjernes.

- [ ] **Step 1: Skriv feilende deno-tester** (ERSTATT forrige rundes
skip-test — oppførselen den låste er byttet ut):

```ts
Deno.test("attach: override-tekst brukes uten fetch; engangsregelen gjelder", async () => {
  let kalt = 0;
  const f = ((..._a: unknown[]) => { kalt++; return Promise.resolve(new Response("# repo-guide", { status: 200 })); }) as typeof fetch;
  const attach = makeGuideAttacher("https://o", f, new Map([["ssb", "# MIN guide"]]));
  const r1: Record<string, unknown> = {};
  await attach("ssb", r1);
  assertEquals(r1.guide, "# MIN guide");
  assertEquals(kalt, 0);
  const r2: Record<string, unknown> = {};
  await attach("ssb", r2);                  // andre gang: ingenting (sent)
  assertEquals(r2.guide, undefined);
  const r3: Record<string, unknown> = {};
  await attach("oecd", r3);                 // uten override: vanlig fetch
  assertEquals(r3.guide, "# repo-guide");
});

Deno.test("coerceGuidesOverride: form, klipp og tak", () => {
  const m = coerceGuidesOverride({ ssb: "x".repeat(9000), "UGYLDIG ID!": "y", tom: "", oecd: "ok" });
  assertEquals([...m.keys()].sort(), ["oecd", "ssb"]);
  assertEquals(m.get("ssb")!.length, 8000);
  assertEquals(coerceGuidesOverride(null).size, 0);
  assertEquals(coerceGuidesOverride("streng").size, 0);
});
```

- [ ] **Step 2: Kjør — feiler.**
`cd netlify/edge-functions && deno test --allow-all _lib/source-guides.test.ts`

- [ ] **Step 3: Implementer** i `_lib/source-guides.ts`:

```ts
const OVERRIDE_ID_RE = /^[a-z0-9_-]{1,32}$/;
const OVERRIDE_MAX = 40;

/** guides_override (kort/lang-splitt §2): brukerens kopi-Guide per kilde-id.
 *  Ukjent JSON fra klienten — samme stille filter-toleranse som
 *  coerceSourcesOff. */
export function coerceGuidesOverride(v: unknown): Map<string, string> {
  const ut = new Map<string, string>();
  if (!v || typeof v !== "object" || Array.isArray(v)) return ut;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (ut.size >= OVERRIDE_MAX) break;
    if (!OVERRIDE_ID_RE.test(k) || typeof val !== "string" || !val.trim()) continue;
    ut.set(k, val.slice(0, MAX_GUIDE_CHARS));
  }
  return ut;
}
```

…og i `makeGuideAttacher`: signatur
`(origin: string, fetchImpl: typeof fetch = fetch, override?: Map<string, string>)`;
erstatt skip-blokken med (plassert ETTER sent-sjekken, FØR fetch-try-en):

```ts
    sent.add(sourceId);
    // Kopi-Guide (kort/lang-splitt §2): brukerens tekst overtar guiderollen
    // på nøyaktig samme late tidspunkt — aldri fetch når override finnes.
    const egen = override?.get(sourceId);
    if (egen) { result.guide = egen; return; }
```

I `svar.ts`: bytt `guides_off?: unknown;` → `guides_override?: unknown;`,
importer `coerceGuidesOverride`, og bytt attacher-linja til:

```ts
  const attachGuide = makeGuideAttacher(origin, fetch, coerceGuidesOverride(body.guides_override));
```

- [ ] **Step 4: Kjør — grønne + typecheck.**
`deno test --allow-all _lib/ && deno check svar.ts`

- [ ] **Step 5: Commit**

```bash
git add netlify/edge-functions/_lib/source-guides.ts netlify/edge-functions/_lib/source-guides.test.ts netlify/edge-functions/svar.ts
git commit -m "feat: guides_override serverside — kopi-Guide lat i attacheren, guides_off fjernet"
```

---

### Task 5: Prompt- og kontraktutvidelser — lag-regel, kode_sak, oppgave:'kort'

**Files:**
- Modify: `netlify/edge-functions/prompts/kilde-forslag.md`
- Modify: `netlify/edge-functions/kilde-forslag.ts` (TS-konstant + body)
- Modify: `netlify/edge-functions/_lib/kilde-forslag-prompt.ts` (+test)

**Interfaces:**
- Prompt-fasiten får tre tillegg (og TS-konstanten holdes byte-lik):
  1. Under REGLER, nytt punkt: «Vurder EKSPLISITT hvilket LAG endringen
     hører hjemme i: feil kildeVALG → `## Kort`-seksjonen; feil BRUK av
     riktig kilde → `## Guide`-seksjonen. Navngi laget i "begrunnelse".
     "ny_tekst" skal alltid inneholde begge seksjoner; mangler `## Kort` i
     originalen, generer den (2–4 setninger destillert fra langversjonen).»
  2. Nytt avsnitt KODESAK: «Peker evidensen på selve appen/adapterne
     (f.eks. en målt serverfeil beskrivelsen ikke kan påvirke): gjør INGEN
     tekstendring for det problemet — beskriv det i stedet i feltet
     "kode_sak": {"tittel": "<kort>", "kropp": "<strukturert bestilling til
     en kode-KI som senere får repoet: hva feilet, hva virket, mistenkt
     kilde/adapter, antatt mekanisme, foreslått retning — ALDRI kodeforslag>"}.
     Utelat feltet ellers.»
  3. Nytt avsnitt OPPGAVEMODUS KORT: «Står det OPPGAVE: KORT i
     forespørselen, er jobben KUN `## Kort`-seksjonen: finnes den, revider
     den i lys av resten av dokumentet; mangler den, destiller en ny fra
     langversjonen. "ny_tekst" er fortsatt hele dokumentet med kun
     Kort-endringen.»
  …og svarformat-linja utvides med det valgfrie kode_sak-feltet.
- `kilde-forslag.ts`: `oppgave?: unknown` i body; `question` er VALGFRI når
  `body.oppgave === 'kort'` (docs kreves fortsatt); `byggKildeForslagPrompt`
  får `oppgave` i KildeForslagBody og appender `OPPGAVE: KORT\n` sist (før
  språklinja) når satt.

- [ ] **Step 1: Feilende deno-tester** i `_lib/kilde-forslag-prompt.test.ts`:

```ts
Deno.test("byggKildeForslagPrompt: oppgave kort → OPPGAVE-linje med", () => {
  const p = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "", runs: [], oppgave: "kort", ui_lang: "no" });
  assertStringIncludes(p, "OPPGAVE: KORT");
});
Deno.test("byggKildeForslagPrompt: uten oppgave ingen OPPGAVE-linje", () => {
  const p = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [] });
  assert(!p.includes("OPPGAVE: KORT"));
});
```

- [ ] **Step 2: Kjør — feiler.** Deretter implementer: `oppgave?: string;`
i interfacet; i byggeren, rett før språklinja:
`if (body.oppgave === "kort") deler.push("OPPGAVE: KORT\n");`

- [ ] **Step 3: Prompt-tekstene.** Skriv de tre tilleggene inn i
`prompts/kilde-forslag.md` (formuleringene over er fasit-tekst — bruk dem
ordrett), oppdater svarformat-eksempelet til:

```json
{"forslag": [...], "melding": "...", "kode_sak": {"tittel": "...", "kropp": "..."}}
```

…og kopier HELE teksten under `---`-streken byte-likt inn i
KILDE_FORSLAG_SYSTEM i kilde-forslag.ts.

- [ ] **Step 4: Body-endringen** i kilde-forslag.ts: erstatt
question-valideringen med:

```ts
  const oppgave = body.oppgave === "kort" ? "kort" : undefined;
  body.oppgave = oppgave;
  if (!oppgave && (typeof body.question !== "string" || !body.question.trim())) {
    return new Response("question mangler", { status: 400 });
  }
  if (typeof body.question !== "string") body.question = "";
```

- [ ] **Step 5: Kjør alt + typecheck.**
`deno test --allow-all _lib/ && deno check kilde-forslag.ts`

- [ ] **Step 6: Commit**

```bash
git add netlify/edge-functions/prompts/kilde-forslag.md netlify/edge-functions/kilde-forslag.ts netlify/edge-functions/_lib/kilde-forslag-prompt.ts netlify/edge-functions/_lib/kilde-forslag-prompt.test.ts
git commit -m "feat: lag-regel + kode_sak-utfall + oppgave:kort i kilde-forslag-kontrakten"
```

---

### Task 6: Klientparser og payload — kode_sak + oppgave

**Files:**
- Modify: `js/kilde-forslag.js` (parseForslagSvar, byggForslagsPayload)
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- `parseForslagSvar` returnerer i tillegg `kode_sak: {tittel, kropp} | null`
  (begge ikke-tomme strings, ellers null; tittel klippes 200, kropp 20 000).
- `byggForslagsPayload` sender `oppgave: inn.oppgave` gjennom når satt
  ('kort' er eneste verdi; feltet utelates ellers).

- [ ] **Step 1: Feilende tester:**

```js
test('parseForslagSvar: kode_sak plukkes opp og valideres', () => {
  const r = KF.parseForslagSvar(JSON.stringify({ forslag: [], melding: 'kodesak', kode_sak: { tittel: 'SDMX-dialekt', kropp: 'Bestilling …' } }));
  assert.deepEqual(r.kode_sak, { tittel: 'SDMX-dialekt', kropp: 'Bestilling …' });
  assert.equal(KF.parseForslagSvar('{"forslag":[]}').kode_sak, null);
  assert.equal(KF.parseForslagSvar(JSON.stringify({ forslag: [], kode_sak: { tittel: '', kropp: 'x' } })).kode_sak, null);
});

test('byggForslagsPayload: oppgave sendes gjennom, utelates ellers', () => {
  assert.equal(KF.byggForslagsPayload({ docs: [], oppgave: 'kort' }, deps).oppgave, 'kort');
  assert.ok(!('oppgave' in KF.byggForslagsPayload({ docs: [] }, deps)) ||
    KF.byggForslagsPayload({ docs: [] }, deps).oppgave === undefined);
});
```

- [ ] **Step 2: Kjør — feiler**, implementer:
i parseForslagSvar-returen: `kode_sak: koderSak(obj)` med hjelperen

```js
  function koderSak(obj) {
    var k = obj && obj.kode_sak;
    if (!k || typeof k.tittel !== 'string' || !k.tittel.trim() ||
        typeof k.kropp !== 'string' || !k.kropp.trim()) return null;
    return { tittel: klipp(k.tittel, 200), kropp: klipp(k.kropp, 20000) };
  }
```

(…og `kode_sak: null` i begge fallback-returene.) I byggForslagsPayload:
`if (inn.oppgave === 'kort') p.oppgave = 'kort';` før budsjettløkka.

- [ ] **Step 3: Kjør — grønne.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 4: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: parseForslagSvar forstår kode_sak; payloaden bærer oppgave"
```

---

### Task 7: kilde-pr issue-modus + kodesak-kortet i modalen

**Files:**
- Modify: `netlify/edge-functions/_lib/kilde-pr-core.ts` (+test)
- Modify: `netlify/edge-functions/kilde-pr.ts`
- Modify: `js/kilde-forslag.js` (renderForslag)
- Modify: `netlify/edge-functions/README.md` + `.env.example`

**Interfaces:**
- `opprettIssue(deps: PrDeps, inn: {tittel, kropp, etiketter: string[]})
  -> Promise<{url}>` — ETT kall: POST `/repos/<repo>/issues` med
  `{title, body, labels}`, samme gh-headerhjelper som opprettPr.
- Endepunkt: body `{issue: {tittel, kropp}}` (gjensidig utelukkende med
  ny_tekst-veien — issue sjekkes FØRST): tittel ikke-tom ≤200, kropp
  ikke-tom ≤20 000 → opprettIssue m/etikett `kilde-kodesak` → `{url}`.
  Samme adminGate UTEN allowByok. PAT trenger Issues RW (dok-endring).
- Modal: når `svar.kode_sak` finnes OG `erAdmin()`: eget kort med tittel,
  kropp-forhåndsvisning (pre, klippet 2 000 i visning) og knappen
  «Create GitHub issue» → POST som over m/Bearer mdAuth.token → lenke.
  Ikke-admin: ingenting (melding-linja bærer beskjeden som før).

- [ ] **Step 1: Feilende deno-tester** i `_lib/kilde-pr-core.test.ts`:

```ts
Deno.test("opprettIssue: ett POST /issues med title/body/labels", async () => {
  const kall: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ html_url: "https://github.com/x/issues/7" }), { status: 201 }));
  }) as typeof fetch;
  const r = await opprettIssue({ fetchImpl, token: "t", repo: "hmelberg/askstat" },
    { tittel: "SDMX-dialekt", kropp: "Bestilling", etiketter: ["kilde-kodesak"] });
  assertEquals(r.url, "https://github.com/x/issues/7");
  assertEquals(kall.length, 1);
  assertStringIncludes(kall[0].url, "/repos/hmelberg/askstat/issues");
  assertEquals(kall[0].body, { title: "SDMX-dialekt", body: "Bestilling", labels: ["kilde-kodesak"] });
});
```

- [ ] **Step 2: Kjør — feiler**, implementer `opprettIssue` i
kilde-pr-core.ts (gjenta gh-hjelperen internt eller trekk den ut delt —
trekk ut `ghKall(deps)`-fabrikken så opprettPr og opprettIssue deler
headers; oppdater opprettPr til å bruke den):

```ts
export async function opprettIssue(
  deps: PrDeps,
  inn: { tittel: string; kropp: string; etiketter: string[] },
): Promise<{ url: string }> {
  const gh = ghKall(deps);
  const res = await gh(`/issues`, {
    method: "POST",
    body: JSON.stringify({ title: inn.tittel, body: inn.kropp, labels: inn.etiketter }),
  });
  if (!res.ok) throw new Error(`GitHub issue: ${res.status}`);
  return { url: ((await res.json()) as { html_url: string }).html_url };
}
```

- [ ] **Step 3: Endepunktet** — i kilde-pr.ts, rett etter body-parsingen
(FØR ny_tekst-valideringen):

```ts
  const issue = (body as { issue?: { tittel?: unknown; kropp?: unknown } }).issue;
  if (issue) {
    const tittel = typeof issue.tittel === "string" ? issue.tittel.trim().slice(0, 200) : "";
    const kropp = typeof issue.kropp === "string" ? issue.kropp.slice(0, 20_000) : "";
    if (!tittel || !kropp.trim()) return new Response("issue mangler tittel/kropp", { status: 400 });
    // token/repo-oppslaget gjenbrukes — flytt env-lesingen OVER denne blokka.
    try {
      const r = await opprettIssue({ fetchImpl: fetch, token, repo },
        { tittel, kropp, etiketter: ["kilde-kodesak"] });
      return new Response(JSON.stringify({ url: r.url }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      console.error("kilde-pr issue:", e);
      return new Response("GitHub-kall feilet: " + (e instanceof Error ? e.message : String(e)), { status: 502 });
    }
  }
```

- [ ] **Step 4: Modal-kortet** — i renderForslag i js/kilde-forslag.js,
etter forslag-kortene:

```js
    // Kode-sporet (§4c): rotårsaken ligger i appen — admin får en
    // agent-klar bestilling som GitHub-issue. Ikke-admin ser bare melding.
    if (svar.kode_sak && erAdmin()) {
      var ks = svar.kode_sak;
      var ksKort = el('div', 'kf-kort');
      ksKort.appendChild(el('h4', null, '🔧 ' + ks.tittel));
      var ksPre = el('pre', 'kf-raa');
      ksPre.textContent = ks.kropp.slice(0, 2000);
      ksKort.appendChild(ksPre);
      var ksRad = el('div', 'sources-info-actions');
      var ksBtn = el('button', 'ai-codeblock-btn', T('Create GitHub issue'));
      ksBtn.type = 'button';
      ksBtn.addEventListener('click', function () {
        ksBtn.disabled = true;
        ksBtn.textContent = T('Sending …');
        fetch('/api/kilde-pr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ((global.mdAuth && global.mdAuth.token) || '') },
          body: JSON.stringify({ issue: { tittel: ks.tittel, kropp: ks.kropp } }),
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
            ksBtn.remove();
            var lenke = document.createElement('a');
            lenke.href = d.url; lenke.target = '_blank'; lenke.rel = 'noopener';
            lenke.textContent = T('Issue created:') + ' ' + d.url;
            ksRad.appendChild(lenke);
          }).catch(function (e) {
            try { console.error('kilde-issue:', e); } catch (_) {}
            ksBtn.disabled = false;
            ksBtn.textContent = T('Issue failed — try again');
          });
      });
      ksRad.appendChild(ksBtn);
      ksKort.appendChild(ksRad);
      innhold.appendChild(ksKort);
    }
```

- [ ] **Step 5: Dokumentasjon** — README kilde-pr-linja: legg til
«; issue-modus: body {issue:{tittel,kropp}} → GitHub-issue m/etikett
kilde-kodesak (PAT trenger da også Issues RW)». Samme setning i
.env.example-kommentaren.

- [ ] **Step 6: Kjør alt.** Deno-suiten + typecheck + node-suiten.

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/kilde-pr-core.ts netlify/edge-functions/_lib/kilde-pr-core.test.ts netlify/edge-functions/kilde-pr.ts js/kilde-forslag.js netlify/edge-functions/README.md .env.example
git commit -m "feat(§4c): kode_sak → GitHub-issue — issue-modus i kilde-pr + admin-kort i modalen"
```

---

### Task 8: Editor-knappen «Foreslå/Forbedre Kort (KI)»

**Files:**
- Modify: `js/kilde-forslag.js` (`openKortForslag`)
- Modify: `js/sources-modal.js` (+ ev. knappe-markup i `#sourcesEdit` i index.html)
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- Produces: `KildeForslag.openKortForslag(profileId)` — bygger ctx
  `{docs: [{id: 'user:'+profileId, name, text}], question: '', tolkning: '',
  mode: '', depth: '', runs: [], ok_script: null, trace: [], sources: [],
  kastedeTurer: 0, oppgave: 'kort'}` fra Profiles.get, setter ctxSiste og
  åpner modalen (gjenbruker HELE kjorRunde/renderForslag-maskineriet —
  kjorRunde sender `oppgave` via byggForslagsPayload fra Task 6; sørg for
  at kjorRunde inkluderer `oppgave: ctxSiste.oppgave` i inn-objektet).
- sources-modal: i redigeringsvisningen (openEdit/syncEditVisibility-flyten;
  finn `#sourcesEdit`-markupen i index.html og feltvariablene i
  sources-modal.js — les begge før du fester knappen): ny knapp ved
  Save-knappen. Etikett velges LIVE fra tekstfeltet:
  `SourceDoc.splitKortGuide(textEl.value).kort` tom → «Suggest short
  section (AI)», ellers «Improve short section (AI)». Klikk: LAGRE først
  utkastet (samme vei som saveEdit, uten å lukke), så
  `KildeForslag.openKortForslag(editingId)`.

- [ ] **Step 1: Feilende test** (den rene delen):

```js
test('openKortForslag-ctx: bygges fra Profiles med oppgave kort', () => {
  const profiles = { get: (id) => (id === 'p1' ? { name: 'A', text: 'T' } : null) };
  const ctx = KF.byggKortCtx('p1', profiles);
  assert.deepEqual(ctx.docs, [{ id: 'user:p1', name: 'A', text: 'T' }]);
  assert.equal(ctx.oppgave, 'kort');
  assert.equal(ctx.runs.length, 0);
  assert.equal(KF.byggKortCtx('finnes-ikke', profiles), null);
});
```

- [ ] **Step 2: Kjør — feiler**, implementer `byggKortCtx(profileId,
profiles)` som ren funksjon (eksportert) + `openKortForslag(profileId)`
som setter `ctxSiste = byggKortCtx(profileId)` og kaller `openModal()`
(null-vakt: gjør ingenting når ctx er null). Utvid kjorRundes
byggForslagsPayload-kall med `oppgave: ctxSiste.oppgave`.

- [ ] **Step 3: Knappen i sources-modal.** Les `openEdit`/`saveEdit`/
`syncEditVisibility` i js/sources-modal.js og `#sourcesEdit`-markupen i
index.html først (feltnavnene under må matche de FAKTISKE — nameEl/textEl/
editingId er navnene fra runde-koden; avviker de, tilpass). Legg knappen
dynamisk i openEdit (gjenskapes per åpning, så etiketten er fersk):

```js
        // Kort-KI-knappen (kort/lang-splitt §4b): destiller når Kort
        // mangler, revider når den finnes. Lagrer utkastet FØRST — ellers
        // ville forslaget diffe mot en gammel versjon og «Bruk» overskrive
        // uskrevne endringer.
        var gammelKortBtn = document.getElementById('sourcesEditKortBtn');
        if (gammelKortBtn) gammelKortBtn.remove();
        var kortBtn = document.createElement('button');
        kortBtn.type = 'button';
        kortBtn.id = 'sourcesEditKortBtn';
        kortBtn.className = 'ai-codeblock-btn';
        var harKort = !!(global.SourceDoc && global.SourceDoc.splitKortGuide &&
          global.SourceDoc.splitKortGuide(textEl.value).kort.trim());
        kortBtn.textContent = harKort ? T('Improve short section (AI)') : T('Suggest short section (AI)');
        kortBtn.addEventListener('click', function () {
          Prof.update(editingId, { name: nameEl.value, text: textEl.value });
          if (global.KildeForslag && global.KildeForslag.openKortForslag) {
            global.KildeForslag.openKortForslag(editingId);
          }
        });
        saveBtn.parentNode.insertBefore(kortBtn, saveBtn);
```

(Vaktene: knappen legges KUN når editingId !== 'NY' — en ulagret ny kilde
har ingen profil-id å foreslå mot; pakk hele blokka i
`if (editingId !== 'NY') { … }`.)

- [ ] **Step 4: Kjør — grønne.** `node --test 'tests/js/*.test.js'`

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js js/sources-modal.js index.html tests/js/kilde-forslag.test.js
git commit -m "feat: Foreslå/Forbedre Kort (KI) i kilde-editoren via oppgave:kort"
```

---

### Task 9: i18n + full verifisering

**Files:**
- Modify: `js/i18n/{no,da,sv,fi,is,de,fr,es,pt,zh,ja,hi}.js` (ALDRI en.js),
  `tools/ask_i18n_keys.json` (regenerert)

**Interfaces:** samme prosedyre som forrige rundes i18n-task —
`node tools/list_i18n_keys.mjs` og `git diff tools/ask_i18n_keys.json` er
FASIT for hvilke nøkler som er nye (skann-lista har allerede
js/kilde-forslag.js og js/sources-modal.js). Forventede kandidater
(diffen vinner): `Create GitHub issue` · `Issue created:` ·
`Issue failed — try again` · `Suggest short section (AI)` ·
`Improve short section (AI)`. Norsk fasit: «Opprett GitHub-issue»,
«Issue opprettet:», «Issue feilet — prøv igjen», «Foreslå Kort (KI)»,
«Forbedre Kort (KI)». Oversett til de øvrige 11 språkene i hver ordbok.

- [ ] **Step 1:** Regenerer fasit, se diffen, kjør
`node --test tests/js/i18n-dicts.test.js` (skal feile), legg nøklene i
alle 12 ordbøker, regenerer igjen (stabil).

- [ ] **Step 2: Full verifisering:**

```bash
node tools/list_i18n_keys.mjs && git diff --exit-code tools/ask_i18n_keys.json; node --test 'tests/js/*.test.js' && cd netlify/edge-functions && deno check kilde-forslag.ts kilde-pr.ts svar.ts && deno test --allow-all _lib/
```

- [ ] **Step 3: Commit**

```bash
git add tools/ask_i18n_keys.json js/i18n/
git commit -m "i18n: kort/lang-splitt-rundens nøkler i alle ordbøker + regenerert fasit"
```

---

### Task 10: Manuell smoke (Hans) — sjekkliste

Ingen kode. Husk dev-fellene (hard reload, netlify dev-restart, porter
8899/3998) og PAT-justeringen (Issues RW legges til i GitHub-innstillingene
for tokenet).

- [ ] OECD-kopien: førstespørsmål → nettverksfanen viser LITEN ivrig
  pakketekst (prefix+hode+Kort, ikke 40k) og `guides_override` i payloaden;
  Details-sporet viser at DIN guide ankommer ved første katalogkall.
- [ ] Rediger Kort i kopien → neste spørsmåls payload speiler endringen.
- [ ] Egen kilde uten `## Kort` → editor-knappen «Foreslå Kort (KI)» →
  forslaget destillerer fra langversjonen → Bruk.
- [ ] Kopi (har Kort) → knappen heter «Forbedre Kort (KI)» og reviderer.
- [ ] Fremprovoser en kodesak (kilde med kjent adapterfeil) → admin ser
  🔧-kortet → «Opprett GitHub-issue» → issue på GitHub med etikett
  kilde-kodesak og agent-klar bestilling; som ikke-admin: kun melding.
- [ ] Stream-observasjonen fra i dag: gjenta eurosone-spørsmålet kaldt —
  er førstekall-feilen sjeldnere nå som payloaden er slank?

---

## Selvreview-notater (avvik/valg låst her)

- §3 gjenbruker nivået `'summary'` i stedet for et nytt `'kort'`-nivå —
  serverens coercePacks/renderPacksBlock håndterer det ALLEREDE
  (kortform-merket + get_pack-hintet), null serverendring. Semantikken er
  identisk; specens «nytt nivå 'kort'» er implementert som policy, ikke
  vokabular.
- splitKortGuide legger alle ikke-Kort-seksjoner (Variabler, Om, ukjente) i
  `guide` — informasjonsbevarende, og matcher at repo-guidefila genereres
  fra hele ikke-Kort-innholdet ved bygg.
- Editor-knappen LAGRER utkastet før KI-kallet (ellers ville forslaget
  diffe mot en gammel versjon og «Bruk» overskrive uskrevne endringer).
- kode_sak-kortet rendres kun for admin OGSÅ selv om modellen leverer det
  for alle — ikke-admin har ingen handling å utføre, og melding-feltet
  bærer beskjeden (spec §4c).
