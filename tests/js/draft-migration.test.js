// M2PY_APP ble endret fra 'openstat' til 'askstat' (2026-10). Autosave-
// utkastene er namespacet med app-navnet, så index.html kopierer gamle
// md_draft_openstat_*-nøkler til den nye prefiksen når den mangler.
// Testen trekker ut migrasjons-IIFE-en fra index.html og kjører den mot en
// falsk localStorage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf-8');

function fakeStorage(init) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    _map: m,
  };
}

function extractMigration() {
  const a = html.indexOf('(function migrateLegacyDrafts()');
  assert.ok(a > 0, 'migrateLegacyDrafts finnes i index.html');
  const b = html.indexOf('})();', a);
  return html.slice(a, b + 5);
}

function run(storage) {
  const src = "const DRAFT_PREFIX = 'md_draft_' + (window.M2PY_APP || 'app') + '_';\n" + extractMigration();
  vm.runInNewContext(src, { window: { M2PY_APP: 'askstat' }, localStorage: storage });
}

test('M2PY_APP er askstat', () => {
  assert.match(html, /window\.M2PY_APP = 'askstat';/);
});

test('gamle openstat-utkast kopieres til askstat-nøkkelen', () => {
  const ls = fakeStorage({
    md_draft_openstat_python: 'print(1)',
    md_draft_openstat_r__untrusted: '1',
    md_draft_openstat_r: 'x <- 1',
    annet: 'urørt',
  });
  run(ls);
  assert.strictEqual(ls.getItem('md_draft_askstat_python'), 'print(1)');
  assert.strictEqual(ls.getItem('md_draft_askstat_r'), 'x <- 1');
  assert.strictEqual(ls.getItem('md_draft_askstat_r__untrusted'), '1');
  // gamle nøkler beholdes (kan tilhøre openstat på samme origin)
  assert.strictEqual(ls.getItem('md_draft_openstat_python'), 'print(1)');
  assert.strictEqual(ls.getItem('annet'), 'urørt');
});

test('eksisterende askstat-utkast overskrives ikke', () => {
  const ls = fakeStorage({
    md_draft_openstat_python: 'gammel',
    md_draft_askstat_python: 'ny',
  });
  run(ls);
  assert.strictEqual(ls.getItem('md_draft_askstat_python'), 'ny');
});

test('utilgjengelig localStorage kaster ikke', () => {
  const bad = { get length() { throw new Error('blokkert'); } };
  assert.doesNotThrow(() => run(bad));
});
