// Ordbok-drift (spec 2026-08-05-sprak-pakker-deling §4): hvert språk i
// SUPPORTED (≠ en) skal ha ordbok som dekker ALLE ask-nøklene i
// tools/ask_i18n_keys.json, med samme {plassholder}-sett per nøkkel.
// Regenerer fasiten med `node tools/list_i18n_keys.mjs` når ask-UI endres.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'ask_i18n_keys.json'), 'utf-8'));
const LANGS = ['no', 'da', 'sv', 'fi', 'is', 'de', 'fr', 'es', 'pt', 'zh', 'ja', 'hi'];

function loadDict(lang) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n', lang + '.js'), 'utf-8'), sandbox);
  return sandbox.window.M2PY_I18N && sandbox.window.M2PY_I18N[lang];
}

function placeholders(s) {
  return (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
}

for (const lang of LANGS) {
  test(`ordbok ${lang}: finnes, dekker alle ask-nøkler, bevarer plassholdere`, () => {
    const dict = loadDict(lang);
    assert.ok(dict, `js/i18n/${lang}.js mangler eller registrerer ikke M2PY_I18N.${lang}`);
    const missing = KEYS.filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `mangler ${missing.length} nøkler`);
    for (const k of KEYS) {
      assert.equal(placeholders(dict[k]), placeholders(k),
        `plassholder-avvik for nøkkel: ${k}`);
      assert.ok(String(dict[k]).trim().length > 0, `tom oversettelse: ${k}`);
    }
  });
}

test('SUPPORTED i js/i18n.js dekker alle ordbok-språk + no/en', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf-8');
  for (const lang of LANGS.concat(['en'])) {
    assert.ok(src.includes(`'${lang}'`), `SUPPORTED mangler '${lang}'`);
  }
});
