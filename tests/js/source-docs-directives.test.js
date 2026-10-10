// tests/js/source-docs-directives.test.js — B9: hver direktivformet linje i
// kildedokumentene (data/sources/*.md) og de genererte oppskriftene
// (data/data-sources.json) må parse feilfritt med DAGENS grammatikk, og
// ingen gammel syntaks («# load … as x») får overleve — den parset enten
// stille som kommentar (df udefinert) eller ga migrasjonsfeil.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../../js/directive-parser.js');
const DP = globalThis.DirectiveParser;

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'data', 'sources');

// Gammel syntaks, også midt i en linje eller med hale (OLD_PATTERNS i
// parseren krever hel-linje-form og bommer på disse).
const OLD_RE = /(?:^|[\s"'`(])(?:#|--|\/\/)[ \t]*(?:load|require|import|create-dataset)[ \t]+\S.*?[ \t](?:as|into)[ \t]+[A-Za-z_]\w*/;
const OLD_CONNECT_RE = /(?:^|[\s"'`(])(?:#|--|\/\/)[ \t]*connect[ \t]+\S+[ \t]+as[ \t]+[A-Za-z_]\w*/;

function checkText(where, text, problems) {
  const res = DP.parseScript(text);
  res.errors.forEach((e) => problems.push(where + ': ' + e));
  text.split(/\r?\n/).forEach((l, i) => {
    if (OLD_RE.test(l) || OLD_CONNECT_RE.test(l)) problems.push(where + ':' + (i + 1) + ': gammel syntaks: ' + l.trim().slice(0, 120));
  });
}

test('kildedokumentene: ingen direktivfeil og ingen gammel syntaks', () => {
  const problems = [];
  fs.readdirSync(SRC).filter((f) => f.endsWith('.md')).forEach((f) => {
    checkText('data/sources/' + f, fs.readFileSync(path.join(SRC, f), 'utf-8'), problems);
  });
  assert.deepEqual(problems, []);
});

test('data-sources.json: oppskrifter og alle tekstfelt parser feilfritt', () => {
  const problems = [];
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'data-sources.json'), 'utf-8'));
  (function walk(o, where) {
    if (typeof o === 'string') {
      // oppskrift-feltene er «<direktiv>  →  <kode>»: hvert ledd sjekkes som linje.
      checkText(where, o.split(/[ \t]+→[ \t]+/).join('\n'), problems);
    } else if (o && typeof o === 'object') {
      Object.keys(o).forEach((k) => walk(o[k], where + '.' + k));
    }
  })(reg, 'data-sources.json');
  assert.deepEqual(problems, []);
});

test('generert guide-mappe (data/source-guides) er også ren', () => {
  const dir = path.join(ROOT, 'data', 'source-guides');
  if (!fs.existsSync(dir)) return;
  const problems = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.md')).forEach((f) => {
    checkText('data/source-guides/' + f, fs.readFileSync(path.join(dir, f), 'utf-8'), problems);
  });
  assert.deepEqual(problems, []);
});
