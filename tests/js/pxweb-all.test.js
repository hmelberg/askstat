// tests/js/pxweb-all.test.js — PxWeb.expandAllUrl + PXWEB_ALL_MAX_CELLS
// (Task 2 av "all()-direktiv for pxweb"): ren ekspansjons-/vakthjelper,
// ingen nett/DOM-avhengighet. Task 3 kaller denne fra det asynkrone
// lastelaget etter å ha hentet metadata.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const PxWeb = require('../../js/pxweb.js');

const META = {                 // json-stat2-formet, som SSB /metadata
  id: ['Alder', 'Kjonn', 'ContentsCode', 'Tid'],
  size: [120, 3, 1, 164],
  dimension: {}                 // expandAllUrl trenger bare id+size for tellingen
};
const BASE = 'https://data.ssb.no/api/pxwebapi/v2/tables/05839';

test('expandAllUrl: bar URL → alle dims wildcardes, under grensen', () => {
  const r = PxWeb.expandAllUrl(BASE, META, 800000);
  assert.ok(!r.error, r.error);
  ['Alder', 'Kjonn', 'ContentsCode', 'Tid'].forEach(function (d) {
    assert.ok(r.url.indexOf('valueCodes[' + d + ']=*') >= 0, d + ' mangler: ' + r.url);
  });
});

test('expandAllUrl: eksplisitt dim beholdes, kun uspesifiserte fylles', () => {
  const r = PxWeb.expandAllUrl(BASE + '?valueCodes[Tid]=2000,2001&valueCodes[ContentsCode]=Personer', META, 800000);
  assert.ok(r.url.indexOf('valueCodes[Tid]=2000,2001') >= 0);      // uendret
  assert.ok(r.url.indexOf('valueCodes[Tid]=*') < 0);               // IKKE overstyrt
  assert.ok(r.url.indexOf('valueCodes[Alder]=*') >= 0);            // fylt
  assert.ok(r.url.indexOf('valueCodes[Kjonn]=*') >= 0);
});

test('expandAllUrl: celletelling teller eksplisitt komma-liste, ikke fullt', () => {
  // Tid=2 år (liste) × Alder 120 × Kjonn 3 × ContentsCode 1 = 720 celler
  const r = PxWeb.expandAllUrl(BASE + '?valueCodes[Tid]=2000,2001', META, 800000);
  assert.ok(!r.error, r.error);
});

test('expandAllUrl: over grensen → error (aldri stille)', () => {
  // full 05839 = 120×3×1×164 = 59 040; sett kunstig lav grense
  const r = PxWeb.expandAllUrl(BASE, META, 50000);
  assert.ok(r.error && /celler/.test(r.error), JSON.stringify(r));
});

test('expandAllUrl: PXWEB_ALL_MAX_CELLS = 800000 (verifisert SSB-grense)', () => {
  assert.equal(PxWeb.PXWEB_ALL_MAX_CELLS, 800000);
});

test('expandAllUrl: eksisterende ikke-valueCodes-parametre bevares (f.eks. lang)', () => {
  const r = PxWeb.expandAllUrl(BASE + '?lang=en', META, 800000);
  assert.ok(!r.error, r.error);
  assert.ok(r.url.indexOf('lang=en') >= 0, r.url);
});

test('expandAllUrl: over grensen leverer tallene til Task 3 sin lokaliserte melding', () => {
  const r = PxWeb.expandAllUrl(BASE, META, 50000);
  assert.ok(r.tooManyCells, JSON.stringify(r));
  assert.equal(r.tooManyCells.n, 120 * 3 * 1 * 164);
  assert.equal(r.tooManyCells.max, 50000);
});

test('expandAllUrl: uttrykk (from/top/range/*) telles som fullt antall, ikke stille som 1', () => {
  // Alder=from(0) er et uttrykk, ikke en komma-liste → skal telles som fullt (120),
  // ikke som 1 verdi. 120×3×1×164 = 59 040 > 50000 → error.
  const r = PxWeb.expandAllUrl(BASE + '?valueCodes[Alder]=from(0)', META, 50000);
  assert.ok(r.error && /celler/.test(r.error), JSON.stringify(r));
});
