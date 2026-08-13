# Innebygde kilder i forbedringssløyfa — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementere spec
`docs/superpowers/specs/2026-08-14-innebygde-kilder-i-sloyfa-design.md`:
ref_docs (involverte innebygde kilders beskrivelser som lese-referanse i
sløyfa-payloaden), admin-flagget som åpner `builtin:<id>`-forslag rendret
som diff-kort med [Send som PR] rett mot `data/sources/<id>.md`, og
prompt-regler som får kodesaker til å SITERE beskrivelsen.

**Architecture:** Ren matcher (`involverteInnebygde`) + payload-passthrough
i js/kilde-forslag.js; async ref-doc-henting i kjorRunde (statiske filer,
modul-cachet registerliste fra data/data-sources.json som HAR base_url);
builtin-kort i renderForslag (validert mot hentede ref_docs, PR-knappen
gjenbruker kilde-pr `of`-veien UENDRET server-side). Server-side kun
koersjon av to nye body-felter + promptseksjoner. Parseren er UENDRET
(`builtin:`-id-er passerer allerede formkravet). Ingen nye i18n-nøkler
(builtin-kortet gjenbruker `built-in`, `Send as PR`, `Discard` osv.).

**Tech Stack:** som forrige runde — ES5-JS + node:test, Deno edge
functions + deno.land/std@0.224.0-asserts.

## Global Constraints

- js/: ES5 (`var`), `'use strict'`, norske kommentarer, module.exports.
- Node: `node --test 'tests/js/*.test.js'` (fnutter). Deno (fra
  netlify/edge-functions/): `deno test --allow-all _lib/` +
  `deno check kilde-forslag.ts`.
- Caps (spec §1): maks 3 ref_docs; tekst-klipp 8 000 per dokument (samme
  tak som guidene); id-regex `^[a-z0-9_-]{1,32}$` (samme som
  guides_override) — håndheves i payloadbyggeren OG re-valideres
  server-side.
- Admin-flagget i payloaden er PROMPT-styring, aldri autorisasjon —
  PR-endepunktets adminGate er sperren (uendret, ingen serverendring der).
- Builtin-forslag har INGEN lokal skrivevei: kun [Send som PR] og
  [Forkast]; kort rendres kun bak erAdmin() og kun for id-er i hentede
  ref_docs (modell-hallusinerte dokumenter filtreres).
- Aldri push; commit per task på gren `innebygde-kilder-sloyfa` fra main.

---

### Task 1: Ren kjerne — matcher + payload-passthrough

**Files:**
- Modify: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js`

**Interfaces:**
- Produces: `KildeForslag.involverteInnebygde(sources, registry) ->
  ['<id>', …]` — registry er `[{id, base_url}]` (injisert; produksjon
  bruker data/data-sources.json-oppføringene). Treff når en kilde-URL
  STARTER med base_url ELLER inneholder den URL-kodet (proxy-formen
  `/api/hent?url=<encoded>`); dedup; maks 3 i første-treff-orden.
- Produces: `byggForslagsPayload` sender `ref_docs: [{id, text}]`
  (id-regex-filtrert, text klippet 8 000, maks 3) og `admin: true` KUN når
  `inn.admin === true`; begge utelates ellers.

- [ ] **Step 1: Skriv feilende tester** — legg til i
`tests/js/kilde-forslag.test.js`:

```js
test('involverteInnebygde: base_url-prefiks, kodet proxy-form, dedup, maks 3', () => {
  const reg = [
    { id: 'ess', base_url: 'https://api.ess.sikt.no/v1/' },
    { id: 'eurostat', base_url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/' },
    { id: 'ssb', base_url: 'https://data.ssb.no/api/pxwebapi/v2/' },
    { id: 'oecd', base_url: 'https://sdmx.oecd.org/public/rest/data/' },
    { id: 'fred', base_url: 'https://api.stlouisfed.org/fred/' },
  ];
  const sources = [
    '/api/hent?url=https%3A%2F%2Fapi.ess.sikt.no%2Fv1%2Fdata%2FdataFile%2Fx%3FfileFormat%3Dparquet',  // kodet proxy
    'https://api.ess.sikt.no/v1/data/annet',                    // dedup (ess igjen)
    'https://data.ssb.no/api/pxwebapi/v2/tables/x/data',        // direkte prefiks
    'https://sdmx.oecd.org/public/rest/data/OECD.SDD/x',        // nr 3
    'https://api.stlouisfed.org/fred/series',                   // nr 4 → kappes (maks 3)
  ];
  assert.deepEqual(KF.involverteInnebygde(sources, reg), ['ess', 'ssb', 'oecd']);
  assert.deepEqual(KF.involverteInnebygde([], reg), []);
  assert.deepEqual(KF.involverteInnebygde(['https://ukjent.example/x'], reg), []);
  assert.deepEqual(KF.involverteInnebygde(null, null), []);
});

test('byggForslagsPayload: ref_docs klippes/takles og admin sendes kun ved true', () => {
  const p = KF.byggForslagsPayload({
    docs: [], admin: true,
    ref_docs: [
      { id: 'ess', text: 'g'.repeat(9000) },
      { id: 'UGYLDIG ID', text: 'x' },
      { id: 'a', text: 'x' }, { id: 'b', text: 'x' }, { id: 'c', text: 'x' },
    ],
  }, deps);
  assert.equal(p.admin, true);
  assert.deepEqual(p.ref_docs.map((d) => d.id), ['ess', 'a', 'b']);   // ugyldig filtrert, maks 3
  assert.equal(p.ref_docs[0].text.length, 8000);
  const uten = KF.byggForslagsPayload({ docs: [] }, deps);
  assert.ok(uten.admin === undefined);
  assert.ok(uten.ref_docs === undefined);
});
```

- [ ] **Step 2: Kjør — feiler.** `node --test tests/js/kilde-forslag.test.js`

- [ ] **Step 3: Implementer** i js/kilde-forslag.js (ren del, før `var api`):

```js
  // Involverte innebygde kilder (spec 2026-08-14 §1): registeroppføringer
  // hvis base_url treffer kjøringens kilde-URL-er — direkte prefiks ELLER
  // URL-kodet bak /api/hent?url=… (ESS-klassen). Maks 3, første-treff-orden.
  var REF_DOC_MAKS = 3;
  var REF_ID_RE = /^[a-z0-9_-]{1,32}$/;
  function involverteInnebygde(sources, registry) {
    var ut = [];
    var kilder = Array.isArray(sources) ? sources : [];
    var reg = Array.isArray(registry) ? registry : [];
    reg.forEach(function (r) {
      if (ut.length >= REF_DOC_MAKS) return;
      if (!r || !r.base_url || !REF_ID_RE.test(String(r.id || ''))) return;
      var enc = encodeURIComponent(r.base_url);
      var treff = kilder.some(function (u) {
        var s = String(u || '');
        return s.indexOf(r.base_url) === 0 || s.indexOf(enc) >= 0 ||
          s.indexOf(r.base_url) > 0;   // proxy-form med rå indre URL
      });
      if (treff && ut.indexOf(r.id) < 0) ut.push(r.id);
    });
    return ut;
  }
```

…og i `byggForslagsPayload`, ved oppgave-linjen:

```js
    if (inn.admin === true) p.admin = true;
    if (Array.isArray(inn.ref_docs) && inn.ref_docs.length) {
      var rd = inn.ref_docs.filter(function (d) {
        return d && REF_ID_RE.test(String(d.id || '')) && typeof d.text === 'string' && d.text;
      }).slice(0, REF_DOC_MAKS).map(function (d) {
        return { id: d.id, text: klipp(d.text, 8000) };
      });
      if (rd.length) p.ref_docs = rd;
    }
```

Legg `involverteInnebygde: involverteInnebygde,` i api-objektet.
NB matcher-detaljen: første-treff-orden er REGISTER-orden i koden over
(reg.forEach) — testen forventer ['ess','ssb','oecd'] som ER registerorden
i test-fixturen; hold fixturens rekkefølge slik at forventningen stemmer.

- [ ] **Step 4: Kjør — grønne**, deretter full suite (quoted glob).

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: involverteInnebygde-matcher + ref_docs/admin i payloaden"
```

---

### Task 2: Server — koersjon + promptseksjoner

**Files:**
- Modify: `netlify/edge-functions/_lib/kilde-forslag-prompt.ts` (+test)
- Modify: `netlify/edge-functions/prompts/kilde-forslag.md`
- Modify: `netlify/edge-functions/kilde-forslag.ts`

**Interfaces:**
- `KildeForslagBody` får `ref_docs?: {id: string; text: string}[]` og
  `admin?: boolean`.
- `byggKildeForslagPrompt`: ny seksjon `REFERANSE: INNEBYGDE KILDER`
  (per dokument: `### <id> (innebygd)\n<text>`) plassert ETTER
  PROBEDE KILDER og FØR TIDLIGERE RUNDER; når `admin === true` legges
  linjen `ADMIN: forslag mot innebygde dokumenter er tillatt
  (id-form builtin:<kilde-id>).` rett etter seksjonen. Utelates helt
  når ref_docs er tom/fraværende.
- Endepunktet koercer: ref_docs → array maks 3 av {id (regex
  `^[a-z0-9_-]{1,32}$`), text (string, klipp 8 000)}, ugyldige droppes
  stille; admin → `body.admin === true`.
- prompts/kilde-forslag.md (fasit-tekst, kopieres ordrett; TS-konstanten
  holdes byte-lik):
  1. Nytt avsnitt etter KODESAK-avsnittet:
     «REFERANSE-DOKUMENTER: Forespørselen kan inneholde seksjonen
     REFERANSE: INNEBYGDE KILDER — appens egne beskrivelser av innebygde
     datakilder. De er LESE-referanse: bruk dem til å diagnostisere, og
     SITER relevant innhold i "melding" og "kode_sak" («beskrivelsen sier
     X, loggen viser Y»). Foreslå endringer i et innebygd dokument KUN når
     forespørselen har ADMIN-linjen OG evidensen peker på en faktisk feil
     i dokumentet (feil URL, parameter eller påstand) — bruk da id-formen
     "builtin:<kilde-id>" i forslaget, med hele den reviderte fila som
     ny_tekst. Uten ADMIN-linjen: aldri builtin-forslag; kodefeil går
     fortsatt til kode_sak.»
  2. Kodesak-avsnittet får tilleggssetningen: «Siter relevant
     linje/påstand fra referansedokumentet når det finnes.»

- [ ] **Step 1: Feilende deno-tester** i `_lib/kilde-forslag-prompt.test.ts`:

```ts
Deno.test("byggKildeForslagPrompt: ref_docs-seksjon + admin-linje, riktig plassering", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [],
    ref_docs: [{ id: "ess", text: "## Guide\nparquet anbefales" }],
    admin: true,
    history: [{ forslag_raatekst: "f", tilbakemelding: "t" }],
  });
  assertStringIncludes(p, "REFERANSE: INNEBYGDE KILDER");
  assertStringIncludes(p, "### ess (innebygd)");
  assertStringIncludes(p, "parquet anbefales");
  assertStringIncludes(p, "ADMIN: forslag mot innebygde dokumenter er tillatt");
  assert(p.indexOf("REFERANSE: INNEBYGDE KILDER") < p.indexOf("TIDLIGERE RUNDER"));
});

Deno.test("byggKildeForslagPrompt: uten ref_docs ingen seksjon; uten admin ingen ADMIN-linje", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [],
    ref_docs: [{ id: "ess", text: "x" }],
  });
  assert(!p.includes("ADMIN:"));
  const p2 = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [] });
  assert(!p2.includes("REFERANSE: INNEBYGDE KILDER"));
});
```

- [ ] **Step 2: Kjør — feiler**, implementer i prompt-builderen (etter
PROBEDE KILDER-blokken, før TIDLIGERE RUNDER-blokken):

```ts
  if (body.ref_docs?.length) {
    deler.push("REFERANSE: INNEBYGDE KILDER\n");
    for (const rd of body.ref_docs) {
      deler.push(`### ${rd.id} (innebygd)\n\n${rd.text}\n`);
    }
    if (body.admin === true) {
      deler.push("ADMIN: forslag mot innebygde dokumenter er tillatt (id-form builtin:<kilde-id>).\n");
    }
  }
```

…og feltene i interfacet. Kjør builder-testene grønne.

- [ ] **Step 3: Prompt-fasiten** — de to tilleggene fra Interfaces inn i
`prompts/kilde-forslag.md` (ordrett), byte-kopier alt under `---` inn i
KILDE_FORSLAG_SYSTEM (verifiser byte-likhet med deno-eval-diffen som i
forrige runde; noter resultatet i rapporten).

- [ ] **Step 4: Endepunkt-koersjonen** i kilde-forslag.ts, ved
oppgave-koersjonen:

```ts
  const REF_ID_RE = /^[a-z0-9_-]{1,32}$/;
  body.admin = body.admin === true;
  body.ref_docs = Array.isArray(body.ref_docs)
    ? body.ref_docs
      .filter((d): d is { id: string; text: string } =>
        !!d && typeof d.id === "string" && REF_ID_RE.test(d.id) &&
        typeof d.text === "string" && !!d.text)
      .slice(0, 3)
      .map((d) => ({ id: d.id, text: d.text.slice(0, 8_000) }))
    : undefined;
```

(Typene: juster mot interfacets faktiske form — body er allerede
`KildeForslagBody`, så koercionen kan trenge en `as`-mellomform for det
ukjente innkommende feltet; følg fila's etablerte stil for slike felt.)

- [ ] **Step 5: Kjør alt + typecheck.**
`deno test --allow-all _lib/ && deno check kilde-forslag.ts`

- [ ] **Step 6: Commit**

```bash
git add netlify/edge-functions/_lib/kilde-forslag-prompt.ts netlify/edge-functions/_lib/kilde-forslag-prompt.test.ts netlify/edge-functions/prompts/kilde-forslag.md netlify/edge-functions/kilde-forslag.ts
git commit -m "feat: ref_docs-referanse + admin-regel i kilde-forslag-kontrakten"
```

---

### Task 3: Klient-wiring — henting, kjorRunde og builtin-kortet

**Files:**
- Modify: `js/kilde-forslag.js`
- Test: `tests/js/kilde-forslag.test.js` (kun rene deler)

**Interfaces:**
- `hentRefDocs(ctx, deps) -> Promise<[{id, text}]>` — deps `{fetchImpl}`
  injiserbar (node-testbar): laster `data/data-sources.json` (modul-cachet
  per økt), kjører `involverteInnebygde(ctx.sources, register)`, henter
  `data/sources/<id>.md` per treff (404/nettfeil → utelates stille),
  klipper 8 000.
- kjorRunde: await ref-docs FØR payloadbygging; `state.refDocs =
  {id: text}` (builtin-kortenes diffgrunnlag OG valideringssett);
  payload får `ref_docs` + `admin: erAdmin()`.
- renderForslag: forslag med id `builtin:<kilde-id>` håndteres i EGEN gren
  FØR dagens user:-gren: (a) hopp over hele kortet når `!erAdmin()` ELLER
  `<kilde-id>` ikke finnes i `state.refDocs` (hallusinert dokument);
  (b) ellers kort med tittel `<kilde-id> (` + T('built-in') + `)`, diff
  mot `state.refDocs[<kilde-id>]`, begrunnelse, og KUN knappene
  [Send som PR] (body `{id: f.id, name: <kilde-id>, of: <kilde-id>,
  ny_tekst, evidens}` — samme fetch-mønster som dagens PR-knapp) og
  [Forkast]. INGEN Bruk, INGEN kildeforslag:brukt-event.

- [ ] **Step 1: Feilende test for hentRefDocs** (ren, injisert fetch):

```js
test('hentRefDocs: register → matcher → dokumenter; 404 utelates stille', async () => {
  const svar = {
    'data/data-sources.json': JSON.stringify([
      { id: 'ess', base_url: 'https://api.ess.sikt.no/v1/' },
      { id: 'ssb', base_url: 'https://data.ssb.no/api/pxwebapi/v2/' },
    ]),
    'data/sources/ess.md': '## Guide\nparquet anbefales',
  };
  const fetchImpl = async (url) => (url in svar
    ? { ok: true, text: async () => svar[url] }
    : { ok: false, status: 404, text: async () => '' });
  const ut = await KF.hentRefDocs(
    { sources: ['https://api.ess.sikt.no/v1/data/x', 'https://data.ssb.no/api/pxwebapi/v2/t'] },
    { fetchImpl });
  // ess har dokument; ssb.md finnes ikke i stubben → utelatt stille
  assert.deepEqual(ut.map((d) => d.id), ['ess']);
  assert.ok(ut[0].text.indexOf('parquet anbefales') >= 0);
});
```

NB modul-cachen på registeret: la cache-variabelen være PER MODUL men gi
testen ren tilstand — enklest ved at hentRefDocs KUN cacher når deps ikke
er injisert (produksjonsveien), eller ved en `_nullstillRefCache`-eksport;
velg én, dokumenter i rapporten.

- [ ] **Step 2: Kjør — feiler**, implementer hentRefDocs (async, ren-ish),
og koble i kjorRunde:

```js
    hentRefDocs(ctxSiste).then(function (refDocs) {
      state.refDocs = {};
      refDocs.forEach(function (d) { state.refDocs[d.id] = d.text; });
      var payload = byggForslagsPayload({
        /* …dagens felter uendret… */
        ref_docs: refDocs,
        admin: erAdmin() || undefined,
      });
      /* …dagens fetch-kjede uendret, flyttet inn i then-blokka… */
    });
```

(admin-feltet: byggForslagsPayload sender kun ved === true — `erAdmin() ||
undefined` er derfor trygt. Abort: hentRefDocs-fetchene tar
state.ctrl.signal når tilgjengelig.)

- [ ] **Step 3: Builtin-grenen i renderForslag** — først i
forslag-løkka:

```js
      if (String(f.id).indexOf('builtin:') === 0) {
        var bid = String(f.id).slice(8);
        // Kun admin, og kun dokumenter modellen faktisk FIKK (hallusinerte
        // builtin-id-er filtreres) — spec 2026-08-14 §2.
        if (!erAdmin() || !state.refDocs || !(bid in state.refDocs)) return;
        var bKort = el('div', 'kf-kort');
        bKort.appendChild(el('h4', null, bid + ' (' + T('built-in') + ')'));
        var bDiff = el('div', 'kf-diff');
        linjeDiff(state.refDocs[bid], f.ny_tekst).forEach(function (d) {
          bDiff.appendChild(el('div', 'kf-diff-' + d.type,
            (d.type === 'ny' ? '+ ' : d.type === 'slettet' ? '− ' : '  ') + d.tekst));
        });
        bKort.appendChild(bDiff);
        if (f.begrunnelse) bKort.appendChild(el('div', 'ask-pop-hint', f.begrunnelse));
        var bRad = el('div', 'sources-info-actions');
        // Ingen lokal skrivevei for innebygde dokumenter (bevisst):
        // kun PR (adminGate server-side er sperren) eller Forkast.
        bRad.appendChild(lagPrKnapp({ id: f.id, name: bid, of: bid, ny_tekst: f.ny_tekst }, bRad));
        var bForkast = el('button', 'ai-codeblock-btn', T('Discard'));
        bForkast.type = 'button';
        bForkast.addEventListener('click', function () { bKort.remove(); });
        bRad.appendChild(bForkast);
        bKort.appendChild(bRad);
        innhold.appendChild(bKort);
        return;
      }
```

…der `lagPrKnapp(body, rad)` er dagens PR-knapp-logikk TRUKKET UT som
delt hjelper (samme fetch/headers/lenke/feilhåndtering; dagens user:-gren
kaller den med sitt eksisterende body-objekt — ingen oppførselstendring
der; evidens legges på i hjelperen via byggEvidens(ctxSiste)).

- [ ] **Step 4: Kjør — grønne** (nye + hele suiten; modul-load i node ren).

- [ ] **Step 5: Commit**

```bash
git add js/kilde-forslag.js tests/js/kilde-forslag.test.js
git commit -m "feat: ref_docs-henting i sløyfa + builtin-diff-kort m/PR for admin"
```

---

### Task 4: Full verifisering

- [ ] `node tools/list_i18n_keys.mjs && git diff --exit-code tools/ask_i18n_keys.json`
  — forventet STABIL (ingen nye nøkler; builtin-kortet gjenbruker
  eksisterende). Får du diff: legg de nye nøklene i alle 12 ordbøker etter
  forrige runders prosedyre før du fortsetter.
- [ ] `node --test 'tests/js/*.test.js'` — alt grønt.
- [ ] Fra netlify/edge-functions/: `deno check kilde-forslag.ts &&
  deno test --allow-all _lib/` — alt grønt.
- [ ] Commit ev. restendringer.

---

### Task 5: Manuell smoke (Hans)

- [ ] ESS-spørsmål med friksjon → forbedringsknappen → meldingen/kodesaken
  SITERER ESS-guiden (payloaden i nettverksfanen har ref_docs).
- [ ] Som admin: konstruer en beskrivelsesfeil-situasjon → builtin-kort med
  diff mot data/sources/<id>.md → [Send som PR] → PR-en oppdaterer riktig
  fil.
- [ ] Som ikke-admin (utlogget/BYOK): ingen builtin-kort; melding refererer
  fortsatt beskrivelsen.
- [ ] Dev-fellene: hard reload, netlify dev-restart, porter 8899/3998.

---

## Selvreview-notater

- Parseren er bevisst UENDRET: `builtin:<id>` passerer dagens formkrav
  (string id + string ny_tekst); all validering skjer i rendringen mot
  state.refDocs — hallusinerte id-er dør der.
- PR-knapp-logikken trekkes ut som delt `lagPrKnapp`-hjelper i stedet for å
  dupliseres — dagens user:-gren skal kalle den uten oppførselstendring
  (reviewer: sjekk at utrekket er rent).
- Matcherens «rå indre URL i proxy-form»-gren (`indexOf(base_url) > 0`)
  fanger /api/hent?url=<ukodet> — sjeldent, men gratis.
- admin-flagget sendes som `erAdmin() || undefined` — byggeren slipper kun
  `=== true` gjennom, så payloaden er identisk for ikke-admin.
