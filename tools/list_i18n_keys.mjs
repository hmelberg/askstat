// Ekstraherer ask-visningens i18n-nøkler (spec 2026-08-05-sprak-pakker-deling
// §4) til tools/ask_i18n_keys.json — fasit for ordbøkene og drift-testen
// tests/js/i18n-dicts.test.js. Kjør: node tools/list_i18n_keys.mjs
// Nøkkelkilder: (1) data-i18n*-attributter i index.html, (2) t('…')/T('…')-
// literaler i ask-filene. Editor-nøkler (norske) filtreres bort ved
// medlemskap i en.js — en.js mapper nettopp alle norske kildenøkler.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const fullHtml = readFileSync('index.html', 'utf-8');

// KUN ask-scope (spec §4: editor senere): askView-blokka + ask-modalene.
// Editorens data-i18n-markup (norske nøkler, delvis utenfor en.js) skal
// IKKE inn i ask-fasiten.
function region(startMarker, endMarker) {
  const a = fullHtml.indexOf(startMarker);
  const b = fullHtml.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error(`fant ikke region ${startMarker}`);
  return fullHtml.slice(a, b);
}
const html = [
  region('<div id="askView"', '<div class="container layout-columns">'),
  region('id="loginBackdrop"', 'id="kekBackdrop"'),
  region('id="kekBackdrop"', 'id="askAboutBackdrop"'),
  region('id="askAboutBackdrop"', 'id="profilesBackdrop"'),
  region('id="profilesBackdrop"', 'id="aiSettingsBackdrop"'),
  region('id="aiSettingsBackdrop"', 'id="keyPromptBackdrop"'),
].join('\n');

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function normKey(s) {
  return decodeEntities(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().normalize('NFC');
}

const keys = new Set();

// (1a) Elementinnhold: data-i18n / data-i18n-html som fullt attributt-token
// (data-i18n-title/-q/-aria teller IKKE — de er attributt-nøkler i 1b).
// \s etter tagnavnet: hindrer at void-elementer (<input …>) backtrackes til
// kortere tagnavn (<i…) som jakter en fjern </i> og svelger halve dokumentet.
// Rekursiv: et guard-avvist ytterelement (kun -title o.l.) kan romme merkede
// barn (askMenuBtn > span[data-i18n]Examples) — skann innholdet videre.
function scanContent(chunk) {
  for (const m of chunk.matchAll(/<(\w+)(\s[^>]*data-i18n[^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (/\bdata-i18n(-html)?(=|\s|$)/.test(m[2].trim() + ' ')) {
      const key = normKey(m[3]);
      if (key) keys.add(key);
    } else {
      scanContent(m[3]);
    }
  }
}
scanContent(html);
// (1b) Attributt-nøkler
const attrPairs = [
  ['data-i18n-title', 'title'],
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-aria', 'aria-label'],
  ['data-i18n-q', 'data-q'],
];
for (const tag of html.match(/<[^>]+>/g) || []) {
  for (const [marker, attr] of attrPairs) {
    if (!tag.includes(marker)) continue;
    const m = tag.match(new RegExp(attr + '="([^"]*)"'));
    if (m) {
      const key = normKey(m[1]);
      if (key) keys.add(key);
    }
  }
}
// (2) Dynamiske nøkler i ask-filene — RÅ nøkler (t() normaliserer ikke).
for (const file of ['js/ask-view.js', 'js/profiles.js', 'js/packs.js', 'js/sources-modal.js', 'js/kilde-forslag.js']) {
  const src = readFileSync(file, 'utf-8');
  for (const m of src.matchAll(/\b[tT]\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\'/g, "'");
    if (key) keys.add(key);
  }
}

// (3) Filtrer bort editorens norske nøkler = medlemmer i en.js-ordboka.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync('js/i18n/en.js', 'utf-8'), sandbox);
const enDict = sandbox.window.M2PY_I18N?.en || {};
const out = [...keys].filter((k) => !(k in enDict)).sort();

writeFileSync('tools/ask_i18n_keys.json', JSON.stringify(out, null, 2) + '\n');
console.log(`${out.length} ask-nøkler skrevet til tools/ask_i18n_keys.json`);
