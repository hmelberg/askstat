// i18n-kjernen (spec 2026-08-05-sprak-pakker-deling §4): fallbackkjede
// lang → en → nøkkel (unntak: 'no' faller ALDRI til en — norsk er kildespråk
// for editoren og skal ikke bli engelsk), locale-basert default.
const test = require('node:test');
const assert = require('node:assert');
const { detectLang, translate } = require('../../js/i18n.js');

test('translate: fallbackkjede lang → en → nøkkel', () => {
  assert.equal(translate('X', { lang: 'fr', dicts: { fr: {}, en: { X: 'EN-X' } } }), 'EN-X');
  assert.equal(translate('X', { lang: 'fr', dicts: { fr: { X: 'FR-X' }, en: { X: 'EN-X' } } }), 'FR-X');
  assert.equal(translate('X', { lang: 'fr', dicts: {} }), 'X');
  assert.equal(translate('X', { lang: 'en', dicts: { en: { X: 'EN-X' } } }), 'EN-X');
});

test('translate: norsk faller ALDRI til en (editorens kildespråk)', () => {
  assert.equal(translate('Nytt script', { lang: 'no', dicts: { en: { 'Nytt script': 'New script' } } }),
    'Nytt script');
  assert.equal(translate('Ask key', { lang: 'no', dicts: { no: { 'Ask key': 'Spør-nøkkel' }, en: {} } }),
    'Spør-nøkkel');
});

test('translate: {param}-interpolasjon også i fallback', () => {
  assert.equal(translate('Hi {name}', { lang: 'fr', dicts: { fr: { 'Hi {name}': 'Salut {name}' } }, params: { name: 'H' } }),
    'Salut H');
  assert.equal(translate('Hi {name}', { lang: 'fr', dicts: {}, params: { name: 'H' } }), 'Hi H');
});

test('detectLang: lagret valg → navigator-språkdel → en', () => {
  const S = ['no', 'en', 'da', 'fr'];
  assert.equal(detectLang({ stored: 'no', nav: 'fr-FR', supported: S }), 'no');
  assert.equal(detectLang({ stored: null, nav: 'da-DK', supported: S }), 'da');
  assert.equal(detectLang({ stored: null, nav: 'fr', supported: S }), 'fr');
  assert.equal(detectLang({ stored: 'tlh', nav: 'tlh-QO', supported: S }), 'en');
  assert.equal(detectLang({ stored: null, nav: '', supported: S }), 'en');
});
