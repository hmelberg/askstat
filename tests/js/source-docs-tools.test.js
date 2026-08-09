// tests/js/source-docs-tools.test.js — regresjonstest for tools/source_docs.mjs
// sin buildRegistryFromDocs-kjerne (delt av convert/generate/generateInMemory,
// spec 2026-08-09-kildedokumenter-v1a §Task 2).
//
// Reviewer-funn 2026-08-10 (Important, verifisert empirisk): js/source-doc.js
// sin extractTitleAndSections() splitter FLATT på hver linje som starter med
// '## ', uten fence-/dybdevakt. En underoverskrift INNI en ekte '## Guide'-
// seksjon som ved et uhell matcher et kjent seksjonsalias (f.eks.
// '## Summary' -> 'kort', se SourceDoc.SECTION_ALIASES) ble FØR fiksen stille
// feiltolket som en ekte '## Kort'-seksjon: kollisjonens tekst havnet i
// entry.quirks, og ALT i guiden ETTER kollisjonen forsvant sporløst fra
// generert guide-tekst — exit code 0, ingen advarsel. generate() (den varige
// forfatterveien) hadde ingen selvsjekk i det hele tatt; convert sin
// paritetsvakt er engangs og allerede brukt opp for de 30 leverte
// dokumentene. Testene under kjører direkte mot den eksporterte
// generateInMemory (samme delte kjerne som convert/generate bruker) med en
// midlertidig fixture-mappe — ingen av de 30 leverte dokumentene endres eller
// berøres.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeTempDocsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-docs-tools-test-'));
  Object.entries(files).forEach(([name, content]) => {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  });
  return dir;
}

// Dynamisk import() (ikke require) — .mjs er ESM; import() virker fra en
// CommonJS-testfil på alle Node-versjoner CI kjører (app-tests.yml pinner
// Node 22), i motsetning til synkron require(esm) som er nyere/mindre sikkert
// tilgjengelig overalt.
async function loadTools() {
  return import('../../tools/source_docs.mjs');
}

test('generateInMemory: happy path — Kort/Guide (med ekte underoverskrift)/Om kilden leses riktig', async () => {
  const { generateInMemory } = await loadTools();
  const dir = makeTempDocsDir({
    'ok.md': [
      '---',
      'id: ok',
      'navn: OK Kilde',
      'base_url: https://ok.example/',
      'order: 0',
      '---',
      '',
      '# OK Kilde',
      '',
      '## Kort',
      '',
      'En kort quirks-linje.',
      '',
      '## Guide',
      '',
      'Guide-intro.',
      '',
      '## Ekte underoverskrift uten alias-kollisjon',
      '',
      'Mer guide-innhold som skal bli værende i guiden.',
      '',
      '## Om kilden',
      '',
      'En beskrivelse.',
      '',
    ].join('\n'),
  });
  try {
    const { entries, guides } = generateInMemory(dir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'ok');
    assert.equal(entries[0].quirks, 'En kort quirks-linje.');
    assert.equal(entries[0].beskrivelse, 'En beskrivelse.');
    assert.equal(entries[0].guide, true);
    assert.ok(!('order' in entries[0])); // order strippes fra JSON-output
    assert.ok(guides.ok.includes('Guide-intro.'));
    assert.ok(guides.ok.includes('## Ekte underoverskrift uten alias-kollisjon'));
    assert.ok(guides.ok.includes('Mer guide-innhold som skal bli værende i guiden.'));
    assert.ok(guides.ok.endsWith('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generateInMemory: underoverskrift inni Guide som kolliderer med et seksjonsalias (## Summary -> kort) kaster HØYT i stedet for å korrumpere stille (reviewer-repro)', async () => {
  const { generateInMemory } = await loadTools();
  const dir = makeTempDocsDir({
    'bad.md': [
      '---',
      'id: bad',
      'navn: Bad Kilde',
      'base_url: https://bad.example/',
      'order: 0',
      '---',
      '',
      '# Bad Kilde',
      '',
      '## Guide',
      '',
      'Guide-intro FØR kollisjonen.',
      '',
      '## Summary',
      '',
      'Dette skulle blitt værende i guiden, ikke havnet i quirks eller forsvunnet.',
      '',
      '## Om kilden',
      '',
      'En beskrivelse.',
      '',
    ].join('\n'),
  });
  try {
    assert.throws(
      () => generateInMemory(dir),
      (err) => {
        assert.match(err.message, /kolliderer med seksjonsalias 'kort'/);
        assert.match(err.message, /Summary/);
        return true;
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generateInMemory: to ekte "## Kort"-overskrifter i samme dokument (feilplassert/duplisert, ikke bare en Guide-kollisjon) kaster også høyt', async () => {
  const { generateInMemory } = await loadTools();
  const dir = makeTempDocsDir({
    'dup.md': [
      '---',
      'id: dup',
      'navn: Dup Kilde',
      'base_url: https://dup.example/',
      'order: 0',
      '---',
      '',
      '# Dup Kilde',
      '',
      '## Kort',
      '',
      'Første kort.',
      '',
      '## Guide',
      '',
      'Guide-tekst.',
      '',
      '## Kort',
      '',
      'Andre kort, feilplassert etter Guide.',
      '',
      '## Om kilden',
      '',
      'En beskrivelse.',
      '',
    ].join('\n'),
  });
  try {
    assert.throws(() => generateInMemory(dir), /kolliderer med seksjonsalias 'kort'/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
