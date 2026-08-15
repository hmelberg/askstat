// tests/js/rangeringsvern.test.js — miljøvernet mot etikett/verdi-stokking
// (forbedringsrunden 2026-08-15; fixture speiler den MÅLTE norden-feilen).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RV = require('../../js/rangeringsvern.js');

const SVAR_STOKKET = [
  'Rangering (høyest → lavest)',
  'Land\tLedighetsrate\tSiste periode',
  '🇩🇰 Danmark\t~10 %\tJuli 2026',
  '🇮🇸 Island\t~10 %\tJuli 2026',
  '🇫🇮 Finland\t~6 %\tJuli 2026',
  '🇳🇴 Norge\t~5 %\tJuli 2026',
].join('\n');

// Output-parene slik regel 10s print legger dem (fasit-koblingen):
const OUTPUT_FASIT = [
  '   land    måned  value',
  'Finland Jul 2026     10',
  'Danmark Jul 2026      6',
  ' Island Jul 2026      5',
  '  Norge Jul 2026      4',
].join('\n');

test('sjekk: stokket rangering (målt norden-klassen) gir avvik', () => {
  const r = RV.sjekk(SVAR_STOKKET, OUTPUT_FASIT);
  assert.equal(r.verdikt, 'avvik');
  // Danmark~10 og Finland~6 gjenfinnes IKKE som par; Island/Norge-parene
  // er tilfeldigvis nære men 10≠5: minst ett avvik + minst ett treff.
  assert.ok(r.avvik.length >= 1 && r.avvik.length < r.par.length);
});

test('sjekk: korrekt rangering gir ok', () => {
  const svar = 'Land\tRate\nFinland\t10\nDanmark\t6\nIsland\t5\nNorge\t4';
  assert.equal(RV.sjekk(svar, OUTPUT_FASIT).verdikt, 'ok');
});

test('sjekk: ingen printede par → utestbar (regel 10-miss, ikke stokkebevis)', () => {
  const svar = 'Land\tRate\nFinland\t10\nDanmark\t6';
  assert.equal(RV.sjekk(svar, 'bare en figur her, ingen tall-linjer').verdikt, 'utestbar');
});

test('sjekk: <2 kandidater → utestbar', () => {
  assert.equal(RV.sjekk('Finland\t10', OUTPUT_FASIT).verdikt, 'utestbar');
});

test('parITekst: desimalkomma i output matcher punktum-verdi', () => {
  assert.equal(RV.parITekst('Finland  10,3', 'Finland', 10.3), true);
  assert.equal(RV.parITekst('Finland  10,3', 'Finland', 8.9), false);
});
