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

test('sjekk: rang-først-tabell (målt r5: «1 | Island | 6 %») gir par', () => {
  const svar = 'Rang\tLand\tRate\n1\t🇮🇸 Island\t6 %\n2\t🇩🇰 Danmark\t5 %\n3\t🇳🇴 Norge\t4 %';
  const par = RV.parFraSvar(svar);
  assert.equal(par.length, 3);
  assert.equal(par[0].etikett.indexOf('Island') >= 0, true);
  assert.equal(par[0].verdi, 6);
});

test('sjekk: ingen printede par → uverifisert (regel 10-miss, eget verdikt)', () => {
  const svar = 'Land\tRate\nFinland\t10\nDanmark\t6';
  assert.equal(RV.sjekk(svar, 'bare en figur her, ingen tall-linjer').verdikt, 'uverifisert');
});

test('sjekk: <2 kandidater → utestbar', () => {
  assert.equal(RV.sjekk('Finland\t10', OUTPUT_FASIT).verdikt, 'utestbar');
});

test('parITekst: desimalkomma i output matcher punktum-verdi', () => {
  assert.equal(RV.parITekst('Finland  10,3', 'Finland', 10.3), true);
  assert.equal(RV.parITekst('Finland  10,3', 'Finland', 8.9), false);
});

// ── Kolon-/prosa-par (småsak fra rundene 6–9, Hans' bestilling 2026-08-16):
// vernet ga WARN 0 i alle rundene 7–9 fordi svarene bar parene i
// kolon-lister («Finland: 21,7 %») og prosa — parFraSvar leste kun
// tab-tabellrader. Kolon-formen er traktabel og konservativ; fri prosa
// («India alene legger til +241 mill.») forblir bevisst uparset
// (falsk-positiv-risikoen er vernets levevilkår).
test('parFraSvar: kolon-liste gir par', () => {
  const svar = 'Ledighet i Norden nå:\nFinland: 21,7 %\nSverige: 8,4 %\nNorge: 4,1 %';
  const par = RV.parFraSvar(svar);
  assert.equal(par.length, 3);
  assert.equal(par[0].etikett, 'Finland');
  assert.equal(par[0].verdi, 21.7);
  assert.equal(par[2].verdi, 4.1);
});

test('parFraSvar: kolon-linjer med markdown-fet og bindestreksprefiks', () => {
  const svar = '- **Island**: 6,2 %\n- **Danmark**: 5,1 %';
  const par = RV.parFraSvar(svar);
  assert.equal(par.length, 2);
  assert.equal(par[0].etikett, 'Island');
  assert.equal(par[1].verdi, 5.1);
});

test('parFraSvar: kolon-linjer som IKKE er par ignoreres', () => {
  // URL-er, klokkeslett, setninger med kolon midt i og årstall-etiketter
  // skal ikke bli kandidater
  const svar = ['Kilde: https://ec.europa.eu/eurostat',
    'Merk: dataene er fra 2025',
    'Kl. 12:30 ble tallene publisert',
    'Oppsummert: det gikk bra'].join('\n');
  assert.equal(RV.parFraSvar(svar).length, 0);
});

test('sjekk: kolon-par verifiseres mot output som før', () => {
  const svar = 'Finland: 10,3 %\nSverige: 8,4 %';
  const output = 'geo  value\nFinland  10.3\nSverige  8.4';
  assert.equal(RV.sjekk(svar, output).verdikt, 'ok');
  const galt = 'geo  value\nFinland  10.3\nSverige  9.9';
  assert.equal(RV.sjekk(svar, galt).verdikt, 'avvik');
});
