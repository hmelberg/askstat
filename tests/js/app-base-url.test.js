// tests/js/app-base-url.test.js — appens base-URL for lokale filer
// (openstat.py, notebook_prose.py, examples/…) skal komme fra pathname, ikke
// location.href: en delt lenke «#output=https://host/a/b.txt» har skråstreker
// i fragmentet, og href.replace(/[^/]+$/, '') ga da en base INNI fragmentet —
// fetch(base + 'openstat.py') hentet index.html (fragmentet droppes) og
// registreringen feilet med SyntaxError (smoke 2026-10-10).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('index.html avleder ikke base-URL fra location.href', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf-8');
  const bad = html.split('\n').filter((l) => l.includes("location.href.replace(/[^/]+$/, '')"));
  assert.deepStrictEqual(bad, []);
});
