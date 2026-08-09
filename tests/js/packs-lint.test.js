// Pakke-lint (spec 2026-08-05-sprak-pakker-deling §5): kjøres i node-suiten
// og er dermed PR-porten for community-pakker — format, størrelse, lenker,
// hemmeligheter. Validerer de EKTE assets i data/packs/.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PACKS = path.join(ROOT, 'data', 'packs');
const index = JSON.parse(fs.readFileSync(path.join(PACKS, 'index.json'), 'utf-8'));
const countries = JSON.parse(fs.readFileSync(path.join(PACKS, 'countries.json'), 'utf-8'));
const dataSources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'data-sources.json'), 'utf-8'));
const SourceDoc = require('../../js/source-doc.js');

// Samme mønster som js/feil-telemetri.js sin NOKKEL_RE — pakker skal aldri
// bære nøkler (README: referer som key(name)).
const NOKKEL_RE = /\b(api_?key|apikey|token|key|access_token)=([^&\s"']+)/gi;

test('index.json: v1, gyldige unike id-er, community har author+updated', () => {
  assert.equal(index.v, 1);
  const ids = new Set();
  for (const p of index.packs) {
    assert.match(p.id, /^[a-z0-9-]+$/, `ugyldig id: ${p.id}`);
    assert.ok(!ids.has(p.id), `duplisert id: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.description && p.file, `mangler felt: ${p.id}`);
    if (p.community) {
      assert.ok(p.author, `community-pakke uten author: ${p.id}`);
      assert.ok(p.updated, `community-pakke uten updated: ${p.id}`);
      // kontekstrunden fase 6 (spec §4): summary SKAL finnes og være ≤L1_CAP
      // (1500 tegn) — L1-nivået i packs.js faller ellers tilbake til første
      // avsnitt, som ikke er garantert å liste kildene pakken dekker.
      assert.ok(p.summary, `community-pakke uten summary: ${p.id}`);
      assert.ok(p.summary.length <= 1500, `${p.id}: summary er ${p.summary.length} tegn (> 1500)`);
      // Pakkesplitting (spec 2026-08-07 §1): kind skiller tema-oversikter
      // fra enkeltkildepakker — Explore grupperer på den og drift-linten
      // skanner oversikter for (id: …)-referanser.
      assert.ok(p.kind === 'overview' || p.kind === 'source',
        `community-pakke uten gyldig kind: ${p.id} (fikk: ${p.kind})`);
    } else {
      assert.ok(p.country, `builtin-pakke uten country: ${p.id}`);
    }
  }
});

// PACK_TEXT_MAX (server, svar-prompt.ts) og L3_CAP (klient, packs.js) er
// begge 40000 — kontekstrunden fase 4/5 hevet taket fra det opprinnelige
// 8000-hjemmelagde (spec 2026-08-06 §5: "Dagens 8k-tak kutter alle reelle
// temapakker (3–4× for trangt)"). Denne linten speiler den samme grensen.
const PACK_TEXT_MAX = 40000;

test(`pakkefiler: finnes, ≤${PACK_TEXT_MAX} tegn, ingen nøkkelmønstre, kun https-lenker`, () => {
  for (const p of index.packs) {
    const file = path.join(PACKS, p.file);
    assert.ok(fs.existsSync(file), `mangler fil: ${p.file}`);
    const text = fs.readFileSync(file, 'utf-8');
    assert.ok(text.length <= PACK_TEXT_MAX, `${p.file} er ${text.length} tegn (> ${PACK_TEXT_MAX})`);
    assert.equal((text.match(NOKKEL_RE) || []).length, 0, `${p.file} ser ut til å inneholde en nøkkel`);
    for (const m of text.matchAll(/\bhttps?:\/\/\S+/g)) {
      assert.ok(m[0].startsWith('https://'), `${p.file}: ikke-https-lenke ${m[0].slice(0, 40)}`);
    }
  }
});

// Drift-vern (spec 2026-08-07 §4): hver (id: x)-referanse i en pakkefil MÅ
// finnes i index.json — oversikter og enkeltkildepakker skal ikke kunne
// drive fra hverandre (samme mønster som source-guides-drift-testen på
// serversiden). Skannes i ALLE community-pakkefiler: src-filers prosa
// siterer også naboer med (id: …) (f.eks. src-fars → src-crss), ikke bare
// oversiktene. YAML-blokker i enkeltkildepakker bruker `id:` uten parentes
// og treffes ikke.
test('community-pakker: alle (id: …)-referanser finnes i index.json', () => {
  const ids = new Set(index.packs.map((p) => p.id));
  for (const p of index.packs) {
    if (!p.community) continue;
    const text = fs.readFileSync(path.join(PACKS, p.file), 'utf-8');
    for (const m of text.matchAll(/\(id:\s*([a-z0-9-]+)\)/g)) {
      assert.ok(ids.has(m[1]), `${p.file}: (id: ${m[1]}) finnes ikke i index.json`);
    }
  }
});

test('countries.json: v1, alle oppføringer har name+agency+note, gyldige koder', () => {
  assert.equal(countries.v, 1);
  for (const [cc, e] of Object.entries(countries.countries)) {
    assert.match(cc, /^[A-Z]{2}$/, `ugyldig landkode: ${cc}`);
    assert.ok(e.name && e.agency && e.note, `ufullstendig oppføring: ${cc}`);
  }
});

// Kilder-profil-output (2026-08-08 Task 3): tags-kontrakten fra Task 1
// (js/profiles.js sin TAG_RE/TAG_MAX) og Task 2 (samme regex speilet server-
// side i svar-prompt.ts) — SAMME regex/tak, håndhevet her på begge datafiler
// siden serverens registerblokk ikke saneres (review-funn Task 2: datafilene
// er eneste vern for lowercase/unikt/≤8/regex-gyldig).
const TAG_RE = /^[a-zæøåa-z0-9_-]{1,24}$/;
const TAG_MAX = 8;

function assertValidTags(tags, label) {
  assert.ok(Array.isArray(tags), `${label}: tags er ikke et array`);
  assert.ok(tags.length > 0, `${label}: tags er tomt array (skal utelates i stedet)`);
  assert.ok(tags.length <= TAG_MAX, `${label}: ${tags.length} tagger (> ${TAG_MAX})`);
  const seen = new Set();
  for (const t of tags) {
    assert.equal(typeof t, 'string', `${label}: ikke-streng tag ${JSON.stringify(t)}`);
    assert.equal(t, t.toLowerCase(), `${label}: tag ikke lowercase: ${t}`);
    assert.match(t, TAG_RE, `${label}: ugyldig tag: ${t}`);
    assert.ok(!seen.has(t), `${label}: duplisert tag: ${t}`);
    seen.add(t);
  }
}

test('data-sources.json: tags (der de finnes) følger kontrakten — regex/lowercase/unikt/tak 8', () => {
  assert.ok(Array.isArray(dataSources) && dataSources.length > 0);
  for (const s of dataSources) {
    if ('tags' in s) assertValidTags(s.tags, `data-sources.json:${s.id}`);
  }
});

test('packs/index.json: tags (der de finnes) følger kontrakten — regex/lowercase/unikt/tak 8', () => {
  for (const p of index.packs) {
    if ('tags' in p) assertValidTags(p.tags, `packs/index.json:${p.id}`);
  }
});

// Front matter-krav for community-pakker (spec 2026-08-09-kildedokumenter-v1a
// Task 4): den gamle fenced ```yaml-blokk-formen skal være borte fra
// data/packs/community/*.md etter `node tools/source_docs.mjs
// convert-packs` — pakketeksten som modellen ser bytter innpakning (front
// matter i stedet av ```yaml), feltene/prosaen er uendret. Skopet er ALLE
// .md-filer i data/packs/community/ UNNTATT README.md, som er
// bidragsdokumentasjon, ikke en pakke (bekreftet: fraværende fra
// index.json sin packs-liste — hver reell community-pakke der har en fil
// her, se testen over).
//
// hasLeadingYamlFence speiler EKSAKT samme scoping som js/source-doc.js sin
// egen extractFields()/leadingText(): en fenced yaml-blokk teller kun som
// gammel feltform når den ligger i dokumentets LEDENDE område (før første
// '## '-overskrift) — en blokk inni en senere seksjon er eksempelinnhold,
// ikke en feltkilde, og skal IKKE avvises. To reelle filer i korpuset har
// nettopp en slik senere-seksjon-blokk (crime-transport-energy-politics.md
// linje 77, data-catalogs.md linje 24 — begge etter sin første '## ') og må
// fortsatt bestå denne testen. Ikke importert fra source-doc.js — Task 1s
// låste grensesnitt eksporterer kun parse/serialize/normalize/sectionKey/
// TAG_ALIASES/SECTION_ALIASES (se fila) — duplisert her med samme mønster
// som NOKKEL_RE over (speiler kilden, kommentert som sådan).
const YAML_FENCE_RE = /```ya?ml[ \t]*\r?\n[\s\S]*?\r?\n```/;
const H2_ANCHOR_RE = /(^|\r?\n)## /;
function hasLeadingYamlFence(text) {
  if (text.split(/\r?\n/)[0] === '---') return false; // allerede front matter
  const m = H2_ANCHOR_RE.exec(text);
  const leading = m ? text.slice(0, m.index + m[1].length) : text;
  return YAML_FENCE_RE.test(leading);
}

test('community-pakker: front matter (ikke gammel fenced yaml) i ledende område; id der pakken har feltdata', () => {
  const dir = path.join(PACKS, 'community');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.ok(files.length > 0, 'fant ingen community-pakkefiler å sjekke');
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf-8');
    assert.ok(
      !hasLeadingYamlFence(text),
      `${f}: har fortsatt en fenced \`\`\`yaml-blokk i dokumentets ledende område ` +
      `(gammel feltform) — kjør node tools/source_docs.mjs convert-packs`,
    );
    // Feltkrav er BETINGET: filer uten noen feltblokk i det hele tatt (ren
    // prosa — 7 src-*-pakker og alle 12 oversiktspakker i dagens korpus,
    // samme mønster som data/packs/norway.md/finland.md) er utenfor
    // convert-packs sitt mandat («Filer uten yaml-blokk → urørt», Task 4
    // brief) og skal IKKE tvinges til å ha en id. Men EN pakke som faktisk
    // bærer feltdata (front matter etter konvertering) skal alltid ha 'id'
    // — samme sjekk som generateInMemory() i tools/source_docs.mjs gjør for
    // data/sources/.
    const doc = SourceDoc.parse(text);
    if (Object.keys(doc.fields).length > 0) {
      assert.ok(doc.fields.id, `${f}: har feltdata (front matter) men mangler 'id'-felt`);
    }
  }
});
