# Seksjonsvise forslag — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementere spec
`docs/superpowers/specs/2026-08-14-seksjonsvise-forslag-design.md`:
forslag-kontrakten byttes fra full `ny_tekst` til
`deler: [{del, ny_tekst}]` på splitKortGuide-lagene; klienten fletter mot
UKLIPPET original; max_tokens 16k→6k. Fjerner både edge-timeouten og
8k-PR-guarden.

**Architecture:** `flettDeler` bor i js/source-doc.js (inversen av
splitKortGuide, samme rene modul). Parser/rendering i js/kilde-forslag.js:
hentRefDocs slutter å klippe (payloadbyggeren klipper allerede til 8000 på
vei UT — state.refDocs blir dermed uklippet flette-/diffgrunnlag, og
bKlippet-guarden fjernes). Server: kun promptomskriving + max_tokens.

**Tech Stack:** som før (ES5+node:test; Deno + std@0.224.0).

## Global Constraints

- ES5/'use strict'/norske kommentarer i js/; node `node --test
  'tests/js/*.test.js'` (fnutter); deno fra netlify/edge-functions/:
  `deno test --allow-all _lib/` + `deno check kilde-forslag.ts`.
- Del-vokabular NØYAKTIG: `prefix` | `hode` | `kort` | `guide` — ukjente
  filtreres stille; forslag uten gyldige deler filtreres helt.
- Fletting mot UKLIPPET original: user: fra Profiles-lageret, builtin fra
  state.refDocs (som nå er uklippet). Payload-teksten til modellen forblir
  klippet (byggForslagsPayload: docs 40k, ref_docs 8000 — UENDRET).
- INGEN bakoverkompat på ny_tekst-formen; ingen nye i18n-nøkler.
- max_tokens 6_000. prompts/kilde-forslag.md er fasit, TS-konstant
  byte-lik (deno-eval-diff-verifikasjon som i tidligere runder).
- Aldri push; commit per task på gren `seksjonsvise-forslag` fra main.

---

### Task 1: `SourceDoc.flettDeler` (ren invers av splitKortGuide)

**Files:** Modify js/source-doc.js; Test tests/js/source-doc.test.js.

**Interfaces:** `SourceDoc.flettDeler(originalTekst, deler) -> string` —
deler = [{del, ny_tekst}]; ugyldige innslag ignoreres; tomt/ugyldig
deler-array → normalisert original. Rekonstruksjon: `prefix` rått (den
bærer sine egne linjeskift) + [hode, kort, guide] trimmet, tomme utelatt,
joinet med '\n\n', + avsluttende '\n'.

- [ ] **Step 1 (RED):** legg til i tests/js/source-doc.test.js:

```js
test('flettDeler: erstatter enkeltdeler, ignorerer ukjente, normaliserer skjøter', () => {
  const doc = '---\nid: x\n---\n\n# T\n\nIntro.\n\n## Kort\n\nGammel kort.\n\n## Guide\n\nGammel guide.\n';
  const ny = SourceDoc.flettDeler(doc, [
    { del: 'kort', ny_tekst: '## Kort\n\nNY kort.' },
    { del: 'tull', ny_tekst: 'ignoreres' },
  ]);
  assert.ok(ny.indexOf('NY kort.') >= 0);
  assert.ok(ny.indexOf('Gammel kort.') === -1);
  assert.ok(ny.indexOf('Gammel guide.') >= 0);          // urørt del består
  assert.ok(ny.indexOf('---\nid: x') === 0);            // prefix rått
  assert.ok(ny.indexOf('# T') >= 0);
});

test('flettDeler: round-trip — ingen deler gir normalisert original (linje-sett bevart)', () => {
  const doc = '---\nid: y\n---\n\n# T\n\n## Kort\n\nK.\n\n## Guide\n\nG.\n';
  const ut = SourceDoc.flettDeler(doc, []);
  assert.deepEqual(ut.split('\n').filter(Boolean).sort(), doc.split('\n').filter(Boolean).sort());
  assert.equal(SourceDoc.flettDeler(doc, null), ut);     // null tåles
});

test('flettDeler: guide-erstatning bevarer halen ETTER et klipp-scenario', () => {
  // Poenget med runden: flettingen skjer mot UKLIPPET original — en ny
  // kort-del skal aldri røre en lang guide-hale.
  const doc = '## Kort\n\nK.\n\n## Guide\n\n' + 'hale'.repeat(3000) + '\n';
  const ut = SourceDoc.flettDeler(doc, [{ del: 'kort', ny_tekst: '## Kort\n\nNY.' }]);
  assert.ok(ut.indexOf('NY.') >= 0);
  assert.ok(ut.indexOf('hale'.repeat(3000)) >= 0);
});
```

- [ ] **Step 2:** kjør — feiler. **Step 3:** implementer i js/source-doc.js
(etter splitKortGuide, eksporter i SourceDoc-objektet):

```js
  // flettDeler (spec 2026-08-14-seksjonsvise-forslag §2): inversen av
  // splitKortGuide. Erstatter navngitte deler og rekonstruerer med
  // normaliserte blanklinje-skjøter — splitKortGuide-joinens kjente
  // linjeskift-tap håndteres HER, én gang for alle konsumenter.
  var FLETT_DELER = { prefix: 1, hode: 1, kort: 1, guide: 1 };
  function flettDeler(originalTekst, deler) {
    var d = splitKortGuide(originalTekst);
    (Array.isArray(deler) ? deler : []).forEach(function (p) {
      if (p && FLETT_DELER[p.del] === 1 &&
          typeof p.ny_tekst === 'string' && p.ny_tekst.trim()) {
        d[p.del] = p.ny_tekst;
      }
    });
    var kropp = [d.hode, d.kort, d.guide]
      .map(function (s) { return String(s || '').trim(); })
      .filter(Boolean)
      .join('\n\n');
    return d.prefix + kropp + '\n';
  }
```

- [ ] **Step 4:** kjør source-doc-suiten + full suite grønn.
- [ ] **Step 5:** commit `feat: SourceDoc.flettDeler — seksjonsvis fletting mot uklippet original`

---

### Task 2: Parser-kontrakten + uklippet refDocs (klient ren del)

**Files:** Modify js/kilde-forslag.js; Test tests/js/kilde-forslag.test.js.

**Interfaces:**
- parseForslagSvar: forslag-elementer er nå
  `{id, deler: [{del, ny_tekst}], begrunnelse}` — deler filtreres på
  gyldig del-navn + ikke-tom string ny_tekst; forslag uten gyldige deler
  droppes. Gamle ny_tekst-formen dør (ingen bakoverkompat). kode_sak/
  melding uendret.
- hentRefDocs: fjern 8000-klippet på dokumentteksten
  (js/kilde-forslag.js:85 `klipp(await res.text(), 8000)` → `await
  res.text()`) — payloadbyggeren klipper fortsatt til 8000 på vei ut
  (linje ~125, UENDRET), så modellen ser samme mengde; state.refDocs blir
  uklippet flette-/diffgrunnlag.

- [ ] **Step 1 (RED):** i tests/js/kilde-forslag.test.js — ERSTATT
eksisterende parseForslagSvar-tester som asserterer ny_tekst-formen
(de tester en kontrakt som dør; skriv om til deler-formen), og legg til:

```js
test('parseForslagSvar: deler-kontrakten — filtrering av del-navn og tomme tekster', () => {
  const r = KF.parseForslagSvar(JSON.stringify({ forslag: [
    { id: 'user:a', deler: [{ del: 'kort', ny_tekst: 'X' }, { del: 'tull', ny_tekst: 'y' }, { del: 'guide', ny_tekst: '  ' }], begrunnelse: 'b' },
    { id: 'user:b', deler: [{ del: 'ukjent', ny_tekst: 'z' }] },
    { id: 'user:c', ny_tekst: 'GAMMEL FORM' },
  ], melding: 'm' }));
  assert.equal(r.forslag.length, 1);
  assert.deepEqual(r.forslag[0].deler, [{ del: 'kort', ny_tekst: 'X' }]);
  assert.equal(r.forslag[0].begrunnelse, 'b');
});

test('hentRefDocs: teksten klippes IKKE lenger (flettegrunnlag)', async () => {
  const stor = 'g'.repeat(9000);
  const svar = {
    'data/data-sources.json': JSON.stringify([{ id: 'ess', base_url: 'https://api.ess.sikt.no/v1/' }]),
    'data/sources/ess.md': stor,
  };
  const fetchImpl = async (url) => (url in svar
    ? { ok: true, text: async () => svar[url] } : { ok: false, status: 404, text: async () => '' });
  const ut = await KF.hentRefDocs({ sources: ['https://api.ess.sikt.no/v1/x'] }, { fetchImpl });
  assert.equal(ut[0].text.length, 9000);
  // …mens payloadbyggeren fortsatt klipper på vei ut:
  assert.equal(KF.byggForslagsPayload({ docs: [], ref_docs: ut }, deps).ref_docs[0].text.length, 8000);
});
```

- [ ] **Step 2:** kjør — feiler. **Step 3:** implementer (parseForslagSvar-
filteret bytter ny_tekst-kravet mot deler-validering med samme
FLETT-vokabular — dupliser vokabularsettet lokalt eller les
`global.SourceDoc`-vakten; velg lokal konstant `GYLDIGE_DELER = {prefix:1,
hode:1,kort:1,guide:1}` i kilde-forslag.js så parseren ikke avhenger av
SourceDoc i node). Fjern klippet i hentRefDocs.
- [ ] **Step 4:** full suite grønn. **Step 5:** commit
`feat: deler-kontrakt i parseren + uklippet refDocs som flettegrunnlag`

---

### Task 3: Rendering/Bruk/PR fletter — og 8k-guarden fjernes

**Files:** Modify js/kilde-forslag.js.

**Interfaces:** i renderForslag:
- Felles for begge grener: `original` = uklippet tekst (user: →
  `pr.text`; builtin → `state.refDocs[bid]`), `nyTekst =
  global.SourceDoc && SourceDoc.flettDeler ? SourceDoc.flettDeler(original,
  f.deler) : null` — mangler SourceDoc (utenkelig i browser, vakt likevel):
  hopp over kortet.
- Diff vises PER ENDRET DEL: for hver p i f.deler — overskriftslinje
  `el('div', 'ask-pop-hint', p.del)` + linjeDiff(splitKortGuide(original)[p.del],
  p.ny_tekst)-boks (mindre kort, mer lesbare).
- Bruk (user:): `Profiles.update(pid, { text: nyTekst })` + samme event/
  kvittering som før. PR (begge grener): `ny_tekst: nyTekst` i lagPrKnapp-
  bodyen (flettet fulltekst — endepunktet UENDRET).
- FJERN bKlippet-blokken (js/kilde-forslag.js ~543-560, kommentar + guard +
  hint-grenen): flettingen bevarer halen, guarden er overflødig.
  i18n-nøkkelen «Document too large…» blir foreldreløs — fjern den fra de
  12 ordbøkene + regenerer fasit (`node tools/list_i18n_keys.mjs`), hold
  i18n-dicts-testen grønn.

- [ ] **Step 1:** implementer (DOM-vei — ingen nye enhetstester per
konvensjon; modul-load i node må forbli ren). **Step 2:** full node-suite
+ i18n-fasit stabil over to regen-kjøringer. **Step 3:** commit
`feat: seksjonsvis diff/fletting i modalen — 8k-PR-guarden fjernet`

---

### Task 4: Server — promptomskriving + max_tokens

**Files:** Modify netlify/edge-functions/prompts/kilde-forslag.md +
kilde-forslag.ts.

**Interfaces:**
- SVARFORMAT-eksemplet i fasiten byttes til deler-formen:

```json
{"forslag": [{"id": "<kilde-id fra forespørselen>", "deler": [{"del": "kort" | "guide" | "hode" | "prefix", "ny_tekst": "<HELE den nye delen, inkl. overskrift>"}], "begrunnelse": "<1-3 setninger>"}], "melding": "<kort oppsummering, eller hvorfor ingen endring>", "kode_sak": {"tittel": "...", "kropp": "..."}}
```

- REGLER-punkt 3 («Returner FULL revidert tekst … aldri patch») ERSTATTES
  med (fasit-tekst, ordrett): «Returner KUN de delene som endres, som hele
  nye deler: "prefix" (maskinfeltene øverst — endres KUN når feilen
  beviselig sitter der), "hode" (tittel/innledning), "kort"
  (## Kort-blokken) eller "guide" (alle øvrige seksjoner). Deler du ikke
  nevner, står urørt. Endre færrest mulige deler — aldri send en uendret
  del på nytt.»
- OPPGAVEMODUS KORT-avsnittet: siste setning («"ny_tekst" er fortsatt hele
  dokumentet …») byttes til: «Svar med nøyaktig én del: {"del": "kort",
  "ny_tekst": "<hele den nye ## Kort-blokken>"}.»
- Lag-regelen (REGLER-punktet fra 2026-08-14-runden): setningen om at
  ny_tekst «skal alltid inneholde begge seksjoner» STRYKES (motstrid med
  deler-kontrakten); «generer manglende ## Kort» beholdes som egen del.
- TS-konstanten byte-kopieres (deno-eval-diff-verifikasjon i rapporten).
- kilde-forslag.ts: `const MAX_TOKENS = 6_000;` (kommentar: en DEL er
  sjelden >3k tegn — hele poenget med seksjonsrunden; 16k-enkeltstrøm
  fikk ikke plass i edge-vinduet, målt 2026-08-14).

- [ ] **Step 1:** feilende builder/fasit-sjekk er ikke aktuelt (ren
teksterstatning) — gjør endringene, verifiser byte-likhet + hele
deno-suiten + `deno check kilde-forslag.ts`. **Step 2:** commit
`feat: deler-kontrakt i prompten + max_tokens 6k — forslag får plass i edge-vinduet`

---

### Task 5: Full verifisering (kontrollersteg) + manuell smoke (Hans)

- [ ] Begge suiter + typecheck + i18n-fasit stabil; sluttreview av grenen;
  merge-meny.
- [ ] Hans: OECD-kopien (40k) → «Forbedre kildebeskrivelsen» → forslag på
  SEKUNDER uten timeout; diff per del; Bruk bevarer resten av dokumentet;
  builtin-PR på stort dokument bevarer halen (sjekk PR-diffen på GitHub);
  oppgave:'kort'-knappen gir kun kort-del.

## Selvreview-notater

- Parseren får EGEN GYLDIGE_DELER-konstant (ikke SourceDoc-avhengighet) —
  node-renhet; flettingen (som TRENGER SourceDoc) er DOM-veis og vaktes.
- Round-trip-testen sammenligner linje-SETT (splitKortGuide-joinens kjente
  tap); flettDeler normaliserer skjøtene som spec §2 krever.
- Den foreldreløse i18n-nøkkelen fjernes i Task 3 (fasit-regen fanger den).
