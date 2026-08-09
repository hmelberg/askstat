// tests/js/source-docs-drift.test.js — drift-vern: data/sources/*.md (den
// kanoniske kildedokument-fasiten) og de GENERERTE artefaktene
// (data/data-sources.json, data/source-guides/*.md) kan ALDRI gli fra
// hverandre (spec 2026-08-09-kildedokumenter-v1a §Task 3). Fanger BEGGE
// driftsretninger: et kildedokument redigert uten `node tools/source_docs.mjs
// generate` etterpå, ELLER et av de genererte artefaktene redigert direkte.
//
// Erstatter IKKE netlify/edge-functions/_lib/source-guides-drift.test.ts
// (deno) — den består og vokter guide↔quirks-INNHOLDET (8000-tegns-tak,
// fase 2-guidelisten); DENNE testen vokter dokument↔artefakt (regenerert
// data/sources/*.md === committet data-sources.json/source-guides/*.md).
//
// Kjør EKSPLISITT (katalogform feiler på Node 26 — se task-3-brief):
//   node --test tests/js/source-docs-drift.test.js
//
// "## Om kilden"-literalsjekken under er en binding tilleggskrav fra
// ledgeren (kontrollør-beslutning etter Task 2 sin re-review): et dokument
// som MANGLER en egen literal '## Om kilden'-seksjon kan få en nøstet
// alias-underoverskrift inni Guide stille bli sin beskrivelse (samme flate
// '## '-splitt-begrensning som validateSectionShape i tools/source_docs.mjs
// vokter mot, se der for full forklaring). Sjekken her stanser dette
// FORUTSETNING (mangler-egen-Om-kilden) fra å i det hele tatt lande i
// repoet ubemerket.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SourceDoc = require('../../js/source-doc.js');

const ROOT = path.join(__dirname, '..', '..');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const DATA_SOURCES_JSON = path.join(ROOT, 'data', 'data-sources.json');
const GUIDES_DIR = path.join(ROOT, 'data', 'source-guides');

// Dynamisk import() (samme idiom som tests/js/source-docs-tools.test.js fra
// Task 2): tools/source_docs.mjs er ESM, import() virker fra en CommonJS-
// testfil på alle Node-versjoner CI kjører (app-tests.yml pinner Node 22),
// i motsetning til synkron require(esm) som er nyere/mindre sikkert
// tilgjengelig overalt.
async function loadTools() {
  return import('../../tools/source_docs.mjs');
}

const SOURCE_FILES = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.md')).sort();

// Vaktbikkje mot vakuum-pass (reviewer-funn, Important): testene 3/4/6 under
// bygger avviksarrayer som DEFAULTER til [] og itererer SOURCE_FILES — en
// fremtidig endring som (utilsiktet) fikk filteret over til å plukke opp 0
// filer ville latt dem alle "bestå" uten å sjekke ett eneste dokument, og
// dermed stille oppheve nøyaktig den korpus-nivå-innesperringen testen for
// '## Om kilden' finnes for å garantere. Sjekk et EKSAKT tall (ikke bare
// > 0) slik at et krympet korpus (en fil forsvunnet) også fanges, ikke bare
// et tomt.
assert.strictEqual(
  SOURCE_FILES.length,
  30,
  `Fant ${SOURCE_FILES.length} .md-filer i data/sources/, forventet 30 — hvis du nettopp la til ` +
    'eller fjernet en kilde, bump dette tallet i tests/js/source-docs-drift.test.js (linja over); ' +
    'hvis ikke, har filteret over sluttet å plukke opp korpuset og testene 3/4/6 ville stille sjekket 0 filer.',
);

test('regenerering fra data/sources/*.md er deep-equal med committet data-sources.json (verdier OG entry-rekkefølge)', async () => {
  const { generateInMemory } = await loadTools();
  const { entries } = generateInMemory(SOURCES_DIR);
  const committed = JSON.parse(fs.readFileSync(DATA_SOURCES_JSON, 'utf8'));
  assert.deepStrictEqual(
    entries,
    committed,
    'data-sources.json er ikke lenger identisk med det data/sources/*.md genererer — enten ble ' +
      'et kildedokument endret uten regenerering, eller artefaktet ble redigert direkte. Kjør ' +
      '`node tools/source_docs.mjs generate` og commit resultatet.',
  );
});

test('regenererte guider er byte-like med hver committet data/source-guides/<id>.md', async () => {
  const { generateInMemory } = await loadTools();
  const { guides } = generateInMemory(SOURCES_DIR);
  const missingFiles = [];
  const notByteEqual = [];
  Object.keys(guides).sort().forEach((id) => {
    const guidePath = path.join(GUIDES_DIR, `${id}.md`);
    if (!fs.existsSync(guidePath)) {
      missingFiles.push(id);
      return;
    }
    const committed = fs.readFileSync(guidePath, 'utf8');
    if (guides[id] !== committed) notByteEqual.push(id);
  });
  assert.deepStrictEqual(
    missingFiles,
    [],
    `Disse guide-filene mangler, selv om det tilsvarende dokumentet i data/sources/ har en ` +
      `'## Guide'-seksjon: ${missingFiles.join(', ')} — kjør \`node tools/source_docs.mjs generate\`.`,
  );
  assert.deepStrictEqual(
    notByteEqual,
    [],
    `Disse guide-filene er IKKE byte-like det tilsvarende dokumentet i data/sources/ genererer: ` +
      `${notByteEqual.join(', ')} — enten ble kildedokumentet endret uten regenerering, eller ` +
      'guidefila ble redigert direkte. Kjør `node tools/source_docs.mjs generate` og commit resultatet.',
  );
});

test('round-trip-idempotens: SourceDoc.normalize(text) === text for hvert committet data/sources/*.md (kanonisk form)', () => {
  const nonIdempotent = [];
  SOURCE_FILES.forEach((f) => {
    const text = fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8');
    if (SourceDoc.normalize(text) !== text) nonIdempotent.push(f);
  });
  assert.deepStrictEqual(
    nonIdempotent,
    [],
    `Disse dokumentene er IKKE i kanonisk form (SourceDoc.normalize(text) !== text): ` +
      `${nonIdempotent.join(', ')} — kjør normalize() på dem og commit resultatet i kanonisk form.`,
  );
});

test('id-er unike, order-verdier unike, fields.id === filnavn-stammen for hvert data/sources/*.md', () => {
  const idMismatches = [];
  const filesById = new Map(); // id -> [filnavn]
  const filesByOrder = new Map(); // order -> [filnavn]

  SOURCE_FILES.forEach((f) => {
    const stem = f.slice(0, -3);
    const text = fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8');
    const doc = SourceDoc.parse(text);
    const id = doc.fields.id;
    if (id !== stem) {
      idMismatches.push(`${f}: fields.id='${id}' !== filnavn-stammen '${stem}'`);
    }
    if (!filesById.has(id)) filesById.set(id, []);
    filesById.get(id).push(f);

    const order = doc.fields.order;
    if (!filesByOrder.has(order)) filesByOrder.set(order, []);
    filesByOrder.get(order).push(f);
  });

  const dupIds = [...filesById.entries()].filter(([, files]) => files.length > 1);
  const dupOrders = [...filesByOrder.entries()].filter(([, files]) => files.length > 1);

  assert.deepStrictEqual(idMismatches, [], idMismatches.join('; '));
  assert.deepStrictEqual(
    dupIds,
    [],
    `Duplikat id blant kildedokumentene: ` +
      dupIds.map(([id, files]) => `'${id}' i ${files.join(' og ')}`).join('; '),
  );
  assert.deepStrictEqual(
    dupOrders,
    [],
    `Duplikat order-verdi blant kildedokumentene: ` +
      dupOrders.map(([order, files]) => `${order} i ${files.join(' og ')}`).join('; '),
  );
});

test('Guide-seksjon i kildedokumentet ⇔ generert guide-fil finnes (data/source-guides/<id>.md)', () => {
  const guideFileIds = new Set(
    fs.readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)),
  );
  const docGuideIds = new Set();
  SOURCE_FILES.forEach((f) => {
    const text = fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8');
    const doc = SourceDoc.parse(text);
    const hasGuideSection = doc.sections.some((s) => s.key === 'guide');
    if (hasGuideSection) docGuideIds.add(doc.fields.id);
  });

  const missingFiles = [...docGuideIds].filter((id) => !guideFileIds.has(id)).sort();
  const orphanFiles = [...guideFileIds].filter((id) => !docGuideIds.has(id)).sort();

  assert.deepStrictEqual(
    missingFiles,
    [],
    `Disse dokumentene har en '## Guide'-seksjon men mangler data/source-guides/<id>.md: ` +
      `${missingFiles.join(', ')} — kjør \`node tools/source_docs.mjs generate\`.`,
  );
  assert.deepStrictEqual(
    orphanFiles,
    [],
    `Disse guide-filene finnes uten en tilsvarende '## Guide'-seksjon i kildedokumentet ` +
      `(foreldreløse): ${orphanFiles.join(', ')} — rett kildedokumentet, eller fjern guidefila.`,
  );
});

test('hvert data/sources/*.md har en LITERAL "## Om kilden"-linje (binding tilleggskrav, ledger 2026-08-10)', () => {
  const missing = [];
  SOURCE_FILES.forEach((f) => {
    const text = fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8');
    const hasLiteral = text.split(/\r?\n/).some((line) => line === '## Om kilden');
    if (!hasLiteral) missing.push(f);
  });
  assert.deepStrictEqual(
    missing,
    [],
    `Disse dokumentene mangler en literal '## Om kilden'-linje: ${missing.join(', ')} — uten den ` +
      `kan en alias-underoverskrift inni Guide (f.eks. '## About') stille bli tolket som ` +
      `beskrivelsen. Legg til en egen '## Om kilden'-seksjon.`,
  );
});
