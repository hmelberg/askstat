// tests/js/comments.test.js — Comments (js/comments.js): giscus-konfig
// (data-*-attributter) for kommentar-widgeten per mål (kilde/tabell[.variabel]).
// Spec: .superpowers/sdd/task-1-brief.md — Task 1.
// Kun attrs() er node-testbar (ren funksjon); open/close/isOpen krever DOM.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/comments.js');
const Comments = globalThis.Comments;

test('attrs: komplett giscus-konfig med term', () => {
  const a = Comments.attrs('ssb/05839.Region');
  assert.equal(a['data-repo'], 'hmelberg/openstat-metadata');
  assert.equal(a['data-repo-id'], 'R_kgDOTjfgng');
  assert.equal(a['data-category'], 'Announcements');
  assert.equal(a['data-category-id'], 'DIC_kwDOTjfgns4DB9mu');
  assert.equal(a['data-mapping'], 'specific');
  assert.equal(a['data-term'], 'ssb/05839.Region');
  assert.equal(a['data-strict'], '1');
  assert.equal(a['data-loading'], 'lazy');
  assert.equal(a['data-theme'], 'preferred_color_scheme');
  assert.equal(a['data-lang'], 'en');
});
test('attrs: theme/lang kan overstyres, tomt mål gir tom term', () => {
  const a = Comments.attrs('', { theme: 'dark', lang: 'en' });
  assert.equal(a['data-term'], '');
  assert.equal(a['data-theme'], 'dark');
});
test('attrs: theme dark og light overstyrer korrekt, uten opts.theme er default uendret', () => {
  assert.equal(Comments.attrs('x', { theme: 'dark' })['data-theme'], 'dark');
  assert.equal(Comments.attrs('x', { theme: 'light' })['data-theme'], 'light');
  assert.equal(Comments.attrs('x', {})['data-theme'], 'preferred_color_scheme');
  assert.equal(Comments.attrs('x')['data-theme'], 'preferred_color_scheme');
});
test('themeForApp er eksportert på Comments (DOM-avhengig — testes ellers manuelt/browser-smoke)', () => {
  assert.equal(typeof Comments.themeForApp, 'function');
});
