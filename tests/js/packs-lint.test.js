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
    } else {
      assert.ok(p.country, `builtin-pakke uten country: ${p.id}`);
    }
  }
});

test('pakkefiler: finnes, ≤8000 tegn, ingen nøkkelmønstre, kun https-lenker', () => {
  for (const p of index.packs) {
    const file = path.join(PACKS, p.file);
    assert.ok(fs.existsSync(file), `mangler fil: ${p.file}`);
    const text = fs.readFileSync(file, 'utf-8');
    assert.ok(text.length <= 8000, `${p.file} er ${text.length} tegn (> 8000)`);
    assert.equal((text.match(NOKKEL_RE) || []).length, 0, `${p.file} ser ut til å inneholde en nøkkel`);
    for (const m of text.matchAll(/\bhttps?:\/\/\S+/g)) {
      assert.ok(m[0].startsWith('https://'), `${p.file}: ikke-https-lenke ${m[0].slice(0, 40)}`);
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
