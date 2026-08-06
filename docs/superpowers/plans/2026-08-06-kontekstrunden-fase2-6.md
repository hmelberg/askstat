# Kontekstrunden fase 2–6 — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flervalg av kildepakker med tegnbudsjett og lazy henting, egne kilder på profilmaskineriet, utvidet søk-bryter med oppdagelses-playbook, og import av microdata_sources-innholdet — per spec `docs/superpowers/specs/2026-08-06-kontekstrunden-design.md`.

**Architecture:** Klienten eier pakkevalg (`doc.packs` i profiles-dokumentet, synket hele-settet-nyeste-vinner) og komponerer `packs[]`-payloaden med detaljnivå per pakke (L1 summary / L2 yaml-manifest / L3 full) innenfor ~80k-budsjett; serveren håndhever defensive caps og rendrer én `## Aktive kildepakker`-blokk. `get_pack` følger run_code-resume-mønsteret (klientutført verktøy). Egne kilder = profil-lageret med `kind`-felt. Utvidet søk = payload-flagg som slår på en playbook-blokk i data-rutens prompt.

**Tech Stack:** Vanilla ES5-js i `js/` (match omkringliggende stil: `var`, `function`, IIFE), Deno/TypeScript i `netlify/edge-functions/`, node:test + deno test.

## Global Constraints

- **Arbeidskatalog:** ALT arbeid skjer i worktreen `/Users/hom/Documents/GitHub/askstat-kontekst` (branch `kontekstrunden`). Commit per steg. ALDRI push — kontrolleren pusher.
- **Ingen bakoverkompat:** ingen brukere finnes. Slett/erstatt (`doc.pack`, `coercePack`, `renderPackBlock`, `md_packs_imported`) i stedet for å migrere API-er. Gamle data i localStorage skal likevel ikke krasje koden (skrubbes stille).
- **Testkommandoer:** node: `node --test tests/js/*.test.js` (Node v26 krever eksplisitt glob). Deno: `cd netlify/edge-functions && deno check *.ts _lib/*.ts && deno test --allow-all _lib/`. Begge suiter skal være grønne ved hver task-slutt.
- **i18n-regelen:** hver ny brukersynlig streng = ENGELSK nøkkel i markup/js + oversettelse i ALLE 12 ordbøker (`js/i18n/{no,da,de,es,fi,fr,hi,is,ja,pt,sv,zh}.js`), deretter `node tools/list_i18n_keys.mjs` (regenererer fasit) og `node --test tests/js/i18n-dicts.test.js`. Etter SCRIPTEDE ordbok-endringer: vm-parse-sjekk av alle 13 ordbøker (kjent `,,`-felle). Innsettinger gjøres alfabetisk der mulig.
- **Prompt-speil:** endringer i promptblokker i `_lib/svar-prompt.ts` skal speiles i `netlify/edge-functions/prompts/svar.md` (drift-test finnes). `tolk-resultat.ts`/`prompts/tolk-resultat.md` røres ALDRI (byte-speil mot openstat).
- **Aldri temaspesifikke prompt-regler** (Hans-regel: generiske mekanismer og kildefakta, aldri regler om ledighet/helse/osv.).
- **Tegn-konstanter (spec §4/§5):** L1_CAP=1500, L3_CAP=40000, TOTAL_BUDGET=80000 (klient); server: navn ≤60, per pakke ≤40000, totalt ≤100000, maks 20 pakker, id ≤100.
- **Stil:** js/-filer er ES5 (var/function/IIFE, norske kommentarer). Edge-filer TypeScript med norske kommentarer. Følg eksisterende mønstre i fila du endrer.

---

### Task 1: Flervalgs-lager i profiles.js (`doc.packs`)

**Files:**
- Modify: `js/profiles.js` (lagringsdelen: packState/setPack/setAutoPack erstattes)
- Modify: `js/konto-sync.js:74-75` (pack→packs i uptodate-vilkåret)
- Test: `tests/js/profiles.test.js`, `tests/js/konto-sync.test.js`

**Interfaces:**
- Produces: `Profiles.packsState(): {ids: string[], auto: boolean}`, `Profiles.setPacks(ids: string[])`, `Profiles.togglePack(id: string)`, `Profiles.setAutoPack(id: string|null)` (uendret signatur, ny guard). `packState`/`setPack` SLETTES.
- `doc.packs = {ids: string[], updated: ISO-string}` i profiles-dokumentet; synkes via eksisterende exportDoc/mergeRemote.

- [ ] **Step 1: Skriv failende tester** i `tests/js/profiles.test.js` (erstatt de to gamle pack-slot-testene):

```js
test('packs: tomt default; auto-forslag gir ett id m/auto-flagg', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  assert.deepEqual(P.packsState(), { ids: [], auto: false });
  P.setAutoPack('norway');
  assert.deepEqual(P.packsState(), { ids: ['norway'], auto: true });
});

test('packs: setPacks vinner over auto, rydder md_pack_auto, dedupper', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  P.setAutoPack('norway');
  P.setPacks(['a', 'b', 'a']);
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false });
  assert.equal(s.getItem('md_pack_auto'), null);
  P.setAutoPack('norway'); // no-op når manuelt sett finnes
  assert.deepEqual(P.packsState(), { ids: ['a', 'b'], auto: false });
});

test('packs: togglePack legger til og fjerner; tom liste = manuelt tomt', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  P.togglePack('a');
  P.togglePack('b');
  assert.deepEqual(P.packsState().ids, ['a', 'b']);
  P.togglePack('a');
  assert.deepEqual(P.packsState().ids, ['b']);
  P.togglePack('b');
  assert.deepEqual(P.packsState(), { ids: [], auto: false });
});

test('packs: mergeRemote hele-settet-nyeste-vinner; likhet → uendret', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  P.setPacks(['a']);
  const nyere = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['x', 'y'], updated: '2099-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(nyere), true);
  assert.deepEqual(P.packsState().ids, ['x', 'y']);
  const eldre = { v: 1, active: null, updated: '', profiles: {},
    packs: { ids: ['z'], updated: '2000-01-01T00:00:00.000Z' } };
  assert.equal(P.mergeRemote(eldre), false);
  assert.deepEqual(P.packsState().ids, ['x', 'y']);
});

test('packs: gammel doc.pack ignoreres og skrubbes ved neste skriving', () => {
  const s = mkStorage();
  s.setItem('md_profiles', JSON.stringify({ v: 1, active: null, updated: '',
    profiles: {}, pack: { id: 'country:IT', updated: '2026-08-05T00:00:00.000Z' } }));
  const P = makeProfiles(s, opts);
  assert.deepEqual(P.packsState(), { ids: [], auto: false }); // Italia er død
  P.setPacks(['norway']);
  const doc = JSON.parse(s.getItem('md_profiles'));
  assert.equal('pack' in doc, false);
  // mergeRemote med legacy remote-pack rører ingenting:
  assert.equal(P.mergeRemote({ v: 1, active: null, updated: '', profiles: {},
    pack: { id: 'country:IT', updated: '2099-01-01T00:00:00.000Z' } }), false);
});
```

Bruk fila​s eksisterende `mkStorage`/opts-hjelpere (se toppen av testfila for eksakt navn — gjenbruk dem).

- [ ] **Step 2: Kjør og se dem faile:** `node --test tests/js/profiles.test.js` — FAIL (packsState is not a function).

- [ ] **Step 3: Implementer i `js/profiles.js`:**

I `writeDoc`, rett etter `pruneTombstones(doc);`, legg til skrubbingen:

```js
      delete doc.pack; // kontekstrunden fase 2: gammelt én-pakke-valg droppes
```

Erstatt `packState`/`setPack` i return-objektet med (behold `PACK_AUTO`-konstanten):

```js
      // Pakkevalg (kontekstrunden 2026-08-06 §2): FLERVALG. Manuelt sett bor
      // i doc.packs = {ids, updated} (synkes, hele settet = én verdi); auto-
      // forslag (fra locale) bor KUN i md_pack_auto (per enhet). Fraværende
      // doc.packs = aldri berørt → auto-forslaget gjelder; {ids:[]} = manuelt
      // tomt (internasjonal). Gammelt doc.pack skrubbes i writeDoc.
      packsState: function () {
        var doc = readDoc();
        if (doc.packs && typeof doc.packs === 'object' && Array.isArray(doc.packs.ids)) {
          return { ids: doc.packs.ids.map(String), auto: false };
        }
        var a = null;
        try { a = storage.getItem(PACK_AUTO); } catch (e) {}
        return a ? { ids: [String(a)], auto: true } : { ids: [], auto: false };
      },
      setPacks: function (ids) {
        var doc = readDoc();
        var seen = {};
        var clean = [];
        (Array.isArray(ids) ? ids : []).forEach(function (id) {
          var s = String(id);
          if (!seen[s]) { seen[s] = true; clean.push(s); }
        });
        doc.packs = { ids: clean, updated: now() };
        try { storage.removeItem(PACK_AUTO); } catch (e) {}
        writeDoc(doc);
      },
      togglePack: function (id) {
        var st = this.packsState();
        var s = String(id);
        var ids = st.ids.indexOf(s) >= 0
          ? st.ids.filter(function (x) { return x !== s; })
          : st.ids.concat([s]);
        this.setPacks(ids);
      },
```

`setAutoPack`-guarden endres fra `doc.pack` til `doc.packs`:

```js
        if (doc.packs && typeof doc.packs === 'object') return; // manuelt valg vinner
```

I `mergeRemote`: SLETT hele `var rp = remoteDoc.pack;`-blokka og erstatt med:

```js
        var rp = remoteDoc.packs;
        if (rp && typeof rp === 'object' && Array.isArray(rp.ids)) {
          var lp = doc.packs;
          var rU = String(rp.updated || '');
          var rIds = rp.ids.map(String);
          if ((!lp || rU > String(lp.updated || '')) &&
              (!lp || String(lp.updated || '') !== rU ||
               JSON.stringify(lp.ids) !== JSON.stringify(rIds))) {
            doc.packs = { ids: rIds, updated: rU };
            changed = true;
          }
        }
```

- [ ] **Step 4: `js/konto-sync.js`:** linje ~74-75: kommentaren og vilkåret `!out.pack` → `!out.packs` (pakkevalg uten profiler skal fortsatt synkes).

- [ ] **Step 5: Kjør testene:** `node --test tests/js/profiles.test.js tests/js/konto-sync.test.js` — PASS. Sjekk at konto-sync-testene ikke refererer `pack:`-feltet; oppdater dem til `packs:`-formen der de gjør det.

- [ ] **Step 6: Kjør HELE node-suiten** (`node --test tests/js/*.test.js`) — packs.test.js og andre som bruker `packState`/`setPack` vil feile; oppdater deres kall til `packsState`/`setPacks` (adferden de tester flyttes/erstattes i Task 2-3; her holder det at Task 1-flatene brukes riktig). Grep etter `packState\|setPack(` i `js/` og `tests/` — `js/packs.js`-treff fikses i Task 2, men noter dem i rapporten.

- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(kontekst): fase 2 lager — doc.packs flervalg, hele-settet-merge, doc.pack droppet"`

### Task 2: `packs[]`-kontrakt klient→server

**Files:**
- Modify: `js/packs.js` (payload/ensureCurrent → flervalg)
- Modify: `js/ai-chat.js:689-694` (pack → packs)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (coercePack→coercePacks, renderPackBlock→renderPacksBlock, buildSvarSystem-opts)
- Modify: `netlify/edge-functions/svar.ts` (body.pack→body.packs; «Pack applied»-sporet)
- Modify: `js/ask-history.js` + `js/feil-telemetri.js` HVIS de lagrer pack-feltet (grep `pack` — oppdater til `packs`-ids-liste fra `Profiles.packsState().ids`; ikke legg til nye felter der ingen fantes)
- Test: `netlify/edge-functions/_lib/svar-prompt-prefs.test.ts`, `tests/js/packs.test.js`

**Interfaces:**
- Consumes: `Profiles.packsState()` fra Task 1.
- Produces: klient-payload `packs: [{name, text}] | undefined`; `Packs.payload()` returnerer den; `Packs.ensureSelected()` (erstatter `ensureCurrent`); server `coercePacks(p: unknown): {name,text}[]` og `renderPacksBlock` i `_lib/svar-prompt.ts`; `buildSvarSystem(..., { packs })`.

- [ ] **Step 1: Failende deno-tester** i `svar-prompt-prefs.test.ts` — erstatt de gamle pack-testene:

```ts
Deno.test("packs-blokk: flere pakker rendres i rekkefølge m/felles intro", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [{ name: "Norway", text: "## Preferred\nssb first" },
            { name: "ESS", text: "ess api" }],
  });
  assert(sys.includes("## Aktive kildepakker (valgt av brukeren)"));
  assert(sys.indexOf("### Kildepakke: Norway") < sys.indexOf("### Kildepakke: ESS"));
  assert(sys.includes("#### Preferred")); // demotert
});

Deno.test("coercePacks: caps — navn 60, tekst 8000, maks 20, søppel filtreres", () => {
  const packs = coercePacks([
    { name: "N".repeat(80), text: "t".repeat(9000) },
    { name: "", text: "x" }, null, "streng",
    ...Array.from({ length: 25 }, (_, i) => ({ name: "p" + i, text: "t" })),
  ]);
  assert(packs.length <= 20);
  assert(packs[0].name.length === 60 && packs[0].text.length === 8000);
});

Deno.test("packs-blokk: tom liste → ingen blokk; utforsk-ruten får den ikke", () => {
  assert(!buildSvarSystem("data", "python", "", { packs: [] })
    .includes("Aktive kildepakker"));
  assert(!buildSvarSystem("utforsk", "python", "", {
    packs: [{ name: "N", text: "t" }] }).includes("Aktive kildepakker"));
});
```

(Behold utforsk-eksklusjonen slik dagens pack-blokk gjør det — se hvor renderPackBlock kobles inn i buildSvarSystem i dag og bevar rutefilteret.)

- [ ] **Step 2: Kjør:** `deno test --allow-all _lib/svar-prompt-prefs.test.ts` — FAIL.

- [ ] **Step 3: Implementer i `_lib/svar-prompt.ts`:** SLETT `coercePack` og `renderPackBlock`; nytt:

```ts
/** Kildepakker fra klienten (js/packs.js): [{name, text}]. Defensive caps —
 *  klienten budsjetterer, serveren begrenser (spec 2026-08-06 §4). */
export function coercePacks(p: unknown): { name: string; text: string }[] {
  if (!Array.isArray(p)) return [];
  const out: { name: string; text: string }[] = [];
  for (const item of p.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as Record<string, unknown>).name ?? "").trim().slice(0, 60);
    const text = String((item as Record<string, unknown>).text ?? "").trim().slice(0, 8000);
    if (name && text) out.push({ name, text });
  }
  return out;
}

function renderPacksBlock(packs: { name: string; text: string }[]): string {
  if (!packs.length) return "";
  const parts = packs.map((p) =>
    `### Kildepakke: ${p.name}\n\n${demoteHeadings(p.text)}`);
  return `## Aktive kildepakker (valgt av brukeren)

Brukeren har valgt disse kildepakkene. Bruk den eller de som er relevante
for spørsmålet; ignorer pakker som ikke angår det. De har forrang over
landrutingen — men opphever ALDRI ærlighetsreglene (probe-✅,
fabrikasjonsvern, budsjettene):

${parts.join("\n\n")}`;
}
```

`buildSvarSystem`-opts: `pack?: unknown` → `packs?: unknown`; koblingspunktet bytter til `renderPacksBlock(coercePacks(opts?.packs))` med samme ruteguard som før. Speil endringen i `prompts/svar.md` (kjør speil-drift-testen).

- [ ] **Step 4: `svar.ts`:** `pack?: unknown` → `packs?: unknown` (linje ~34); `pack: body.pack` → `packs: body.packs` (linje ~168). Finn «Pack applied»-sporet (grep `Pack applied`) og emit én linje PER pakke (nøkkelen `Pack applied: {name}` finnes i alle ordbøker — gjenbruk den).

- [ ] **Step 5: `js/packs.js`:** erstatt `currentId`/`payload`/`ensureCurrent`:

```js
    function selectedIds() {
      var st = profiles && profiles.packsState ? profiles.packsState() : null;
      return st ? st.ids : [];
    }
    function payload() {
      var out = [];
      selectedIds().forEach(function (id) {
        var got = mem[id] || readJson(TXT_CACHE + id);
        if (got) out.push({ name: got.name, text: got.text });
      });
      return out.length ? out : undefined;
    }
    async function ensureSelected() {
      var ids = selectedIds();
      for (var i = 0; i < ids.length; i++) {
        if (!mem[ids[i]]) await resolve(ids[i]);
      }
    }
```

Oppdater return-objektet (`ensureCurrent`→`ensureSelected`), boot/onLangChange-kallene, og DOM-delens `P.ensureCurrent()`-kall (blir `P.ensureSelected()`); `Prof.setPack(...)`-kall i renderInto blir `Prof.togglePack(...)` midlertidig (Task 3 bygger om menyen helt). «International default»-raden blir `Prof.setPacks([])`. Explore-import: `Prof.setPacks(selectedIds().concat(['imported:' + expSelected.entry.id]))`.

- [ ] **Step 6: `js/ai-chat.js`:** feltet `pack:` → `packs: (window.Packs && window.Packs.payload && window.Packs.payload()) || undefined` (payload er alt flervalg). Oppdater kommentarlinja.

- [ ] **Step 7: `tests/js/packs.test.js`:** oppdater payload-testene til array-formen (payload → `[{name,text}]` for flere valgte; `undefined` når tomt). `context-pill`-etiketten røres i Task 3.

- [ ] **Step 8: Kjør begge suiter** (globale testkommandoer) — PASS. `js/context-pill.js` bruker `packState` (fase 1) — oppdater label-koden til `packsState`: `st.ids.length ? P.displayName(st.ids[0]) + (st.ids.length > 1 ? ' +' + (st.ids.length - 1) : '') + (st.auto ? T(' (auto)') : '') : null`.

- [ ] **Step 9: Commit:** `git add -A && git commit -m "feat(kontekst): fase 2 kontrakt — packs[] klient→server, renderPacksBlock, spor per pakke"`

### Task 3: Flervalgs-UI — sjekkbokser, landvelger-drill-inn, temapakker synlige

**Files:**
- Modify: `js/packs.js` (renderInto: sjekkbokser + drill-inn + grupper)
- Modify: `js/context-pill.js` (kun hvis Task 2 ikke alt fikset etiketten)
- Modify: `js/i18n/*.js` ×12 + `tools/ask_i18n_keys.json` (regenerert)
- Test: `tests/js/packs.test.js` (list-gruppering), manuell DOM-smoke i rapporten

**Interfaces:**
- Consumes: `Profiles.packsState/togglePack/setPacks`, `Packs.list/listCommunity/ensureSelected`.
- Produces: kildeseksjonens endelige fase-2-anatomi (spec §2): sjekkboksliste (builtin → community/topics → imported → valgte land), «Choose country →»-drill-inn med «← Back», Explore nederst. «International default»-raden SLETTES.

- [ ] **Step 1: Bygg om `renderInto` i packs.js.** Intern view-tilstand (`var view = 'main';` nullstilles hver gang popoveren åpnes — dvs. sett `view = 'main'` først i renderInto når kalleren signaliserer nyåpning; la `renderInto(container, close, opts)` ta `opts && opts.fresh`). Adferd:
  - **Sjekkboks-rader** (gjenbruk `ask-pop-check`-anatomien): klikk kaller `Prof.togglePack(id)` + `P.ensureSelected()` og RE-RENDRER menyen (via `Profiles.onChange` → context-pill re-render; IKKE `close()`). Checked = `packsState().ids` inneholder id; når `auto` er sann vises raden med suffiks `T(' (auto)')`.
  - **Grupper i main-view:** (1) builtin (kuraterte ikke-community), (2) community-pakker DIREKTE i menyen: importerte (`imported:`-id finnes) som vanlige sjekkbokser, uimporterte åpner Explore-preview for posten (les-før-aktiver beholdes — gjenbruk openExplore, men la den forhåndsvelge posten når den åpnes fra en rad: nytt valgfritt argument `openExplore(entry)`), (3) valgte `country:`-ider som sjekkbokser, (4) raden `Choose country →` (bytter `view = 'countries'`), (5) sep + `View/Import shared packs…` som før.
  - **countries-view:** første rad `← Back` (view='main', re-render), deretter alle land fra `list()`-country-gruppa som sjekkbokser (klikk toggler, BLIR i countries-view).
- [ ] **Step 2: context-pill.js:** når menyen ÅPNES kalles `renderInto(packSec, close, {fresh: true})`; onChange-re-render bruker `{fresh: false}` (behold view). Verifiser etiketten fra Task 2 step 8.
- [ ] **Step 3: i18n:** nye nøkler `Choose country →` og `← Back` (norsk: `Velg land →`, `← Tilbake`) i alle 12 ordbøker; `International default`-oppføringen kan stå (ubrukt). Kjør `node tools/list_i18n_keys.mjs` + drift-test + vm-parse-sjekk.
- [ ] **Step 4: Test:** oppdater/utvid `tests/js/packs.test.js` sin list()-test om nødvendig (list() selv er uendret). DOM-adferden røyk-testes av kontrolleren; beskriv i rapporten hva som ble verifisert med `node --check` + suitene.
- [ ] **Step 5: Kjør begge suiter** — PASS.
- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(kontekst): fase 2 UI — sjekkbokser, landvelger-drill-inn, temapakker i menyen"`

### Task 4: Unifisert lager — kind profile|source, egne kilder, import-migrering

**Files:**
- Modify: `js/profiles.js` (kind-felt, create-signatur, list-filter, modal i source-modus, prefill)
- Modify: `js/packs.js` (`user:`-ider, importPack → lageret, engangsmigrering av `md_packs_imported`, «New source…»-rad)
- Modify: `js/i18n/*.js` ×12 + fasit
- Test: `tests/js/profiles.test.js`, `tests/js/packs.test.js`, `tests/js/konto-sync.test.js`

**Interfaces:**
- Produces: `Profiles.create(name, text, kind, origin)` (kind `'profile'|'source'`, default `'profile'`; origin valgfri, lagres som-er), `Profiles.list(kind)` (uten argument = alle levende), `Profiles.active()/activeText()` ser KUN kind profile; `Profiles.openModal(opts)` med `{kind, prefillName, prefillText}`; pakke-id-rommet får `user:<profilId>`; `Packs.displayName/resolve/payload` håndterer `user:`-prefikset (oppslag i Profiles, aldri fetch).

- [ ] **Step 1: Failende tester** (`tests/js/profiles.test.js`):

```js
test('kind: create default profile; sources filtreres; active ser kun profiler', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  const pid = P.create('Meg', 'tekst');
  const sid = P.create('ESS-kilde', 'yaml her', 'source');
  assert.deepEqual(P.list('profile').map(x => x.id), [pid]);
  assert.deepEqual(P.list('source').map(x => x.id), [sid]);
  P.setActive(sid); // avvises — kilder kan ikke være aktiv profil
  assert.equal(P.active(), null);
  P.setActive(pid);
  assert.equal(P.activeText(), 'tekst');
});

test('kind: origin lagres; legacy-oppføringer uten kind = profile', () => {
  const s = mkStorage();
  const P = makeProfiles(s, opts);
  const id = P.create('Import', 't', 'source', { source: 'community', id: 'x' });
  assert.deepEqual(P.get(id).origin, { source: 'community', id: 'x' });
  const doc = JSON.parse(s.getItem('md_profiles'));
  doc.profiles['gammel'] = { name: 'G', text: 't', updated: '2026-01-01T00:00:00.000Z' };
  s.setItem('md_profiles', JSON.stringify(doc));
  assert.equal(P.list('profile').some(x => x.id === 'gammel'), true);
});
```

Og i `tests/js/packs.test.js` (bruk filas eksisterende makePacks-oppsett med mock-fetch):

```js
test('user:-pakker resolves fra Profiles-lageret, aldri fetch', async () => { /* opprett source via makeProfiles på delt storage; displayName + resolve('user:'+id) gir {name,text}; fetch-mocken skal IKKE kalles */ });
test('migrering: md_packs_imported flyttes til kind:source og velges om valgt', async () => { /* seed md_packs_imported {x:{name,text,origin}} + doc.packs ids ['imported:x']; kjør P.migrateImported(profiles); assert Profiles.list('source') har posten, packsState().ids inneholder 'user:<ny>', storage-nøkkelen er borte */ });
```

- [ ] **Step 2: Kjør — FAIL.** Deretter implementer:
  - `profiles.js`: entry-felt `kind` (kun lagret når 'source' — sparer bytes; `list(kind)` filtrerer `(p.kind || 'profile') === kind`), `create(name, text, kind, origin)`, `setActive` avviser id der kind==='source', `active()/activeText()` guard samme vei. `clampText` for kind source bruker 40000 (ny konstant `SOURCE_TEXT_MAX = 40000`; profiler beholder 8000) — også i `update` (les eksisterende kind).
  - `openModal(opts)`: `opts = {kind: 'profile'|'source', prefillName, prefillText}`; modal-tittel og liste filtreres på kind (i18n-nøkler `My sources`, `New source`); «New»-knappen oppretter med gjeldende kind; prefill åpner editEl direkte med verdiene. Radioknappene (aktiv-valg) vises KUN i profile-modus; i source-modus vises radene med Edit-knapp uten radio.
  - `packs.js`: `displayName`: `user:`-prefiks → `profiles.get(id.slice(5))`-navn; `resolve`: `user:` → `{name, text}` fra Profiles (ingen fetch, ingen TXT_CACHE-skriving nødvendig men mem-cache ok); `importPack`: opprett via `profiles.create(entry.name, text, 'source', {source:'community', id: entry.id, updated: entry.updated || ''})` og RETURNER `'user:'+nyId` (Explore-knappen velger den); SLETT `IMPORTED`-lageret og `imported()`-hjelperen etter migrering: `migrateImported()` kalles fra boot — leser `md_packs_imported`, oppretter kilder, mapper `imported:key`→`user:<id>` i `doc.packs` via `profiles.setPacks` (BARE hvis doc.packs finnes — ikke skap manuelt sett av migreringen; auto-tilstand bevares), fjerner nøkkelen. `list()`-gruppen `imported` hentes nå fra `profiles.list('source')` (id `user:<id>`, group 'imported').
  - Menyrad «New source…» i renderInto (main-view, etter grupper, før Explore): åpner `Profiles.openModal({kind:'source'})`, lukker popover.
- [ ] **Step 3: i18n:** nøkler `New source…`, `My sources`, `New source` (+ evt. modal-tittel) ×12 + fasit + vm-parse + drift-test.
- [ ] **Step 4: Kjør begge suiter — PASS.** Sjekk konto-sync-testene: kind/origin skal overleve merge (de rider på entry-objektene — legg én assert i eksisterende merge-test).
- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(kontekst): fase 3 — kind-lager, egne kilder, synkede importer m/migrering"`

### Task 5: Budsjett, detaljnivåer og get_pack

**Files:**
- Modify: `data/packs/index.json` (summary-felt for norway/finland + community-postene)
- Modify: `js/packs.js` (compose, nye caps, payload m/nivå+id, composeInfo-hint)
- Modify: `js/ai-chat.js` (get_pack-event i resume-løkka)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` (coercePacks nye caps + level/id; blokkintro nevner get_pack)
- Modify: `netlify/edge-functions/svar.ts` (+ get_pack som klientverktøy — speil run_code-mønsteret; verktøydefinisjon kun når noen pakke ikke er full)
- Modify: `netlify/edge-functions/prompts/svar.md` (speil)
- Test: `tests/js/packs.test.js` (compose), `_lib/svar-prompt-prefs.test.ts` (caps/nivåmerker), `tests/js/run-kontrakt.test.js` (get_pack-kontraktlås hvis run_code har en slik — følg mønsteret)

**Interfaces:**
- Produces: `Packs.compose(list)` ren funksjon (eksporteres i module.exports for node-test): inn `[{id,name,text,summary}]` i valgrekkefølge → ut `[{id,name,text,level}]` (level `'full'|'manifest'|'summary'`), prioritet sist-valgt-først, konstanter L1_CAP=1500/L3_CAP=40000/TOTAL_BUDGET=80000; `Packs.payload()` → `[{id,name,text,level}]`; `Packs.fullTextFor(id)` (≤40000, for get_pack-svar); `Packs.composeInfo()` → `{total, shortForm}` for meny-hintet; server `coercePacks` → `{id,name,text,level}[]` (id ≤100 sanitert `[A-Za-z0-9:_-]`, per-tekst ≤40000, SUM tekst ≤100000 — stopp når taket nås, level valideres, default 'full').
- get_pack-protokoll: server sender event `{type:'get_pack', id}` og avslutter invokasjonen med continue-token (NØYAKTIG som run_code — les `svar.ts`/`_lib`-provideren og `ai-chat.js:661-740` FØR du skriver noe); klienten svarer i resume-POSTen med `get_pack_result: {id, text}` (server-cap 40000). Prompten (packs-blokkintroen) sier: «Pakker merket kortform/maskinutdrag kan hentes i full tekst med get_pack-verktøyet (id står i overskriften).»

- [ ] **Step 1: Failende compose-tester** (`tests/js/packs.test.js`):

```js
test('compose: alt får full innenfor budsjettet; nivå og rekkefølge bevares', () => {
  const out = compose([{ id: 'a', name: 'A', text: 'x'.repeat(100) },
                       { id: 'b', name: 'B', text: 'y'.repeat(100) }]);
  assert.deepEqual(out.map(p => p.level), ['full', 'full']);
  assert.deepEqual(out.map(p => p.id), ['a', 'b']);
});
test('compose: sist valgt prioriteres; overskytende degraderes manifest→summary', () => {
  const stor = 'z'.repeat(50000); // > L3_CAP kuttes til 40000
  const medYaml = 'intro\n```yaml\nid: x\n```\nprosa'.padEnd(60000, 'q');
  const out = compose([
    { id: 'gammel', name: 'G', text: medYaml, summary: 'kort om G' },
    { id: 'ny', name: 'N', text: stor },
  ]);
  assert.equal(out[1].level, 'full');           // sist valgt vinner budsjettet
  assert.equal(out[1].text.length, 40000);      // L3-cap
  assert.equal(out[0].level, 'manifest');       // yaml-blokka plukkes
  assert(out[0].text.includes('id: x'));
});
test('compose: uten yaml → summary; summary-cap 1500; alle får ALLTID minst L1', () => {
  const out = compose([
    { id: 'a', name: 'A', text: 'p'.repeat(41000) },
    { id: 'b', name: 'B', text: 'q'.repeat(41000) },
    { id: 'c', name: 'C', text: 'r'.repeat(41000), summary: 's'.repeat(2000) },
  ]);
  assert.equal(out[2].level, 'full');
  assert.equal(out[1].level, 'full');           // 80000 rommer to L3-kutt
  assert.equal(out[0].level, 'summary');
  assert(out[0].text.length <= 1500);
});
```

- [ ] **Step 2: Implementer compose + hjelpere i packs.js** (over makePacks-return, eksporter i module.exports):

```js
  var L1_CAP = 1500;
  var L3_CAP = 40000;
  var TOTAL_BUDGET = 80000;
  function yamlManifest(text) {
    var m = String(text).match(/```yaml\n[\s\S]*?```/g);
    return m ? m.join('\n\n') : '';
  }
  function summaryOf(p) {
    if (p.summary) return String(p.summary).slice(0, L1_CAP);
    var first = String(p.text || '').split(/\n\s*\n/)[0] || '';
    return first.slice(0, L1_CAP);
  }
  // Budsjettering (spec §4): prioritet = sist valgt først; L3→L2→L1;
  // alle valgte får ALLTID minst L1. Ren funksjon — node-testes direkte.
  function compose(list) {
    var budget = TOTAL_BUDGET;
    var byId = {};
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      var full = String(p.text || '').slice(0, L3_CAP);
      var man = yamlManifest(full);
      var pick;
      if (full.length <= budget) pick = { level: 'full', text: full };
      else if (man && man.length <= budget) pick = { level: 'manifest', text: man };
      else pick = { level: 'summary', text: summaryOf(p) };
      budget -= pick.text.length;
      byId[p.id] = pick;
    }
    return list.map(function (p) {
      return { id: p.id, name: p.name, text: byId[p.id].text, level: byId[p.id].level };
    });
  }
```

`payload()` bygger `[{id,name,text,summary}]` fra valgte (summary fra katalogposten: index.json-pakker har `summary`-felt; `country:` bruker `'Prefer national sources for ' + navn + '.'`; `user:` bruker første avsnitt-fallbacken) og returnerer `compose(...)`. `fullTextFor(id)`: resolvet tekst ≤40000. `composeInfo()`: `{total: n, shortForm: antall level!=='full'}`. Hev slicene 8000→40000 i `resolve` og der importtekst klippes. Meny-hint i renderInto-footer når `shortForm > 0`: i18n-nøkkel `“{short} of {total} packs sent in short form”` (norsk «{short} av {total} pakker sendes i kortform»).

- [ ] **Step 3: Server-caps + nivåmerker** (`svar-prompt.ts` + speilfila): coercePacks per Interfaces; renderPacksBlock: overskrift per pakke `### Kildepakke: ${p.name} (id: ${p.id})` + for manifest `*(maskinutdrag — hent full tekst med get_pack)*`, for summary `*(kortform — hent full tekst med get_pack)*`; intro +get_pack-setningen KUN når noen pakke ikke er full. Deno-tester: caps (40k/100k-sum/20), level-validering, id-sanitering, nivåmerkene, get_pack-setningens tilstedeværelse/fravær.
- [ ] **Step 4: get_pack-protokollen.** LES run_code-veien først (svar.ts + provider + ai-chat.js:661-740). Server: verktøydef `get_pack {id}` legges til KUN når `packs.some(p => p.level !== 'full')`; håndtering = som run_code: event `{type:'get_pack', id}` + continue; resume-body-feltet `get_pack_result: {id, text}` (cap 40000, id må matche utestående) mates tilbake som tool_result. Klient (`ai-chat.js`): `ev.type === 'get_pack'` → `pendingGetPack = ev.id` → etter strøm: `window.Packs.fullTextFor(id)` → re-POST resume med `get_pack_result`. Gjenbruk run_code-rørleggingen (pendingRun-mønsteret) — IKKE dupliser resume-mekanikken; generaliser varsomt hvis nødvendig.
- [ ] **Step 5: `data/packs/index.json`:** summary-felt (≤1500 tegn, skal liste kildene) for norway, finland og de 6 community-postene. Skriv reelle summaries fra pakketekstene (les .md-filene), f.eks. norway: `"Norwegian sources first: SSB and FHI (first-class adapters via search_catalog), Norges Bank for rates/FX. Use for questions about Norway or with no explicit geography."`.
- [ ] **Step 6: Kjør begge suiter + speil-drift-testen — PASS.**
- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(kontekst): fase 4 — compose L1/L2/L3, nye caps, get_pack via resume, summaries"`

### Task 6: Utvidet søk — bryter, playbook, lagre-som-kilde

**Files:**
- Modify: `js/packs.js` (bryter nederst i kildeseksjonen)
- Modify: `js/ai-chat.js` (discover-flagget i payloaden)
- Modify: `netlify/edge-functions/svar.ts` (+ `discover?: unknown` → opts)
- Modify: `netlify/edge-functions/_lib/svar-prompt.ts` + `prompts/svar.md` (DISCOVER-blokk + hint-linje)
- Modify: `js/ask-view.js` (```pack-fence → «Save as source»-knapp)
- Modify: `js/i18n/*.js` ×12 + fasit
- Test: `_lib/svar-prompt-prefs.test.ts`, `tests/js/ask-view.test.js`

**Interfaces:**
- Consumes: `Profiles.openModal({kind:'source', prefillName, prefillText})` fra Task 4.
- Produces: localStorage `md_ask_discover` = `'1'` når på (sticky per enhet, synkes IKKE); payload-felt `discover: true|undefined`; `buildSvarSystem(..., { discover })` → DISCOVER-blokk KUN for data-ruten når flagget er sant; hint-linje når flagget er usant.

- [ ] **Step 1: Failende deno-tester:** DISCOVER-blokka (`## Utvidet kildesøk`) finnes for `("data", …, {discover: true})`, finnes IKKE for `discover: false/undefined`, finnes IKKE for andre ruter; hint-linja («Extended search» nevnes) finnes i data-ruten uten discover, ikke med.
- [ ] **Step 2: Implementer DISCOVER-blokka** i svar-prompt.ts (+ speilfila), ORDRETT:

```
## Utvidet kildesøk (aktivert av brukeren)

Registerkildene er fortsatt førstevalget. Dekker de ikke spørsmålet, kan du
lete utenfor kildegrunnlaget — strukturert og ærlig:

1. SØK BREDT (maks 1 runde): bruk search_datasets (alle scope) og websøk til
   en kandidatliste (maks 5) med hva hver kandidat trolig inneholder og
   hvordan den kan leses.
2. FORDYP topp-kandidatene (maks 3): hent metadata og PRØVELES ekte bytes
   med run_code (bruk /api/hent ved CORS-stopp). En kilde der du ikke har
   sett faktiske kolonner, brukes ALDRI i svaret.
3. KONKLUDER — eller ta maks ÉN runde til hvis alle kandidatene falt.
   Off-registry-kilder merkes tydelig i svaret som utenfor det kuraterte
   registeret.

Etter et vellykket svar bygget på en off-registry-kilde: avslutt med en
```pack-blokk (YAML med id, name, content, access, api/data_url_pattern,
example og gotchas fra prøvelesingen) slik at brukeren kan lagre kilden.
```

Hint-linja (data-ruten, kun når discover er av — plasseres ved dagens dekningssjekk-/ærlighetsregler): `Hvis ingen registerkilde dekker spørsmålet: si det ærlig, og nevn at «Extended search» i kildemenyen lar deg lete bredere.`

- [ ] **Step 3: Klient:** bryter-rad nederst i kildeseksjonen (etter Explore; egen `ask-pop-sep` over): sjekkboks-rad med nøkkelen `Extended search — also look beyond the built-in sources (slower)`; klikk toggler `localStorage.md_ask_discover` ('1'/fjernes) og re-rendrer (IKKE close). ai-chat.js payload: `discover: (localStorage.getItem('md_ask_discover') === '1') || undefined`. svar.ts: `discover: body.discover === true` inn i buildSvarSystem-opts.
- [ ] **Step 4: Lagre-som-kilde:** i ask-view.js sin markdown-rendering: fenced blokk med språk `pack` rendres som kodeblokk + knapp `Save as source` under; klikk → `Profiles.openModal({kind: 'source', prefillName: (YAML-linja `name:` om den finnes, ellers 'New source'), prefillText: blokkens innhold})`. Node-test i ask-view.test.js etter filas eksisterende render-testmønster: pack-fence → knappemarkup finnes; vanlig ```yaml-fence → ingen knapp.
- [ ] **Step 5: i18n:** `Extended search — also look beyond the built-in sources (slower)` (norsk: `Utvidet søk — let også utenfor kildegrunnlaget (tregere)`), `Save as source` (norsk: `Lagre som kilde`) ×12 + fasit + vm-parse + drift-test.
- [ ] **Step 6: Kjør begge suiter — PASS.**
- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(kontekst): fase 5 — utvidet søk-bryter, oppdagelses-playbook, lagre-som-kilde"`

### Task 7: Innhold — microdata_sources som community-pakker

**Files:**
- Create: `data/packs/community/data-catalogs.md`, `nordic-microdata.md`, `europe-national-microdata.md`, `labour-firms.md`, `demography-migration-housing.md`, `crime-transport-energy-politics.md`
- Modify: `data/packs/community/us-health-surveys.md`, `europe-surveys.md`, `global-surveys.md`, `education-skills.md` (berikes)
- Modify: `data/packs/index.json` (6 nye poster + summaries for alt)
- Test: `tests/js/packs-lint.test.js` (skal være grønn; utvid ved behov med summary-krav ≤1500)

**Kilde:** `~/microdata_sources/` (13 filer). Mapping (spec §7 + kontrollerens ruling): 01→data-catalogs (NY), 02→berik us-health-surveys, 03+04→berik europe-surveys og global-surveys (fordel etter geografi), 05→nordic-microdata (NY), 08→europe-national-microdata (NY), 09→labour-firms (NY), 10→berik education-skills, 11→demography-migration-housing (NY), 12→crime-transport-energy-politics (NY). 00-INDEX brukes til summaries. 06 (tooling) og 07 (metadatastandarder) HOPPES OVER (verktøy-/standardkunnskap, ikke kildebeskrivelser).

- [ ] **Step 1:** Les kildefilene og de eksisterende pakkene. Skriv/berik pakkene: behold YAML-blokk-per-kilde-formatet (L2-manifestet plukker ```yaml-blokkene!), behold UNVERIFIED-merking ORDRETT, maks 40000 tegn per fil, prompt-rettet prosa (handlingsrettet, ærlig om tilgangstier — samme tone som eksisterende community-pakker).
- [ ] **Step 2:** index.json: nye poster `{id, name, description, file: "community/<fil>", community: true, author: "hans", updated: "2026-08-06", summary: "…"}`; summary ≤1500 tegn og skal LISTE kildene pakken dekker. Summaries også på de 4 berikede.
- [ ] **Step 3:** Kjør `node --test tests/js/packs-lint.test.js` (+ hele suiten) — PASS. Om linten mangler summary-regel: legg til `summary finnes og ≤1500 for community-poster`.
- [ ] **Step 4: Commit:** `git add -A && git commit -m "content(kontekst): fase 6 — microdata_sources-innholdet som community-pakker m/summaries"`

---

## Self-review-notat (kontrolleren)

Spec-dekning: §1 (fase 1) er levert på main. §2→Task 1-3, §3→Task 4, §4→Task 5, §5→Task 6, §7→Task 7, §8 (telemetri/historikk) → Task 2. Kontrollerens etterarbeid (utenfor tasks): e2e-smoke m/netlify dev + merge til main + push + prod-smoke.
