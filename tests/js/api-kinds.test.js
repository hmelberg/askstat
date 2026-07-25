// tests/js/api-kinds.test.js — protokoll-adaptere (js/api-kinds.js): alias,
// URL-bygging og flatenere, ingen nett-avhengighet.
// Spec: docs/superpowers/specs/2026-07-25-api-kinds-design.md §1.
// Fixtures (worldbank_response.json, dbnomics_response.json) er trimmede
// EKTE API-svar (probet 2026-07-25) og deles med tests/test_openstat.py —
// samme tall begge steder ER paritetskontrakten.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const AK = require('../../js/api-kinds.js');

test('kindAlias: kildenavn → protokoll, protokollnavn → seg selv, ukjent → null', () => {
  assert.equal(AK.kindAlias('oecd'), 'sdmx');
  assert.equal(AK.kindAlias('ecb'), 'sdmx');
  assert.equal(AK.kindAlias('norgesbank'), 'sdmx');
  assert.equal(AK.kindAlias('imf'), 'sdmx');
  assert.equal(AK.kindAlias('worldbank'), 'worldbank');
  assert.equal(AK.kindAlias('dbnomics'), 'dbnomics');
  assert.equal(AK.kindAlias('sdmx'), 'sdmx');
  assert.equal(AK.kindAlias('OECD'), 'sdmx');
  assert.equal(AK.kindAlias('pxweb'), null);
  assert.equal(AK.kindAlias('csv'), null);
  assert.equal(AK.kindAlias(''), null);
});

test('sdmxNeedsFallback: 406 eller ikke-CSV → fallback (ECB-veien); ekte feil → ikke', () => {
  assert.equal(AK.sdmxNeedsFallback(406, 'application/problem+json'), true);
  assert.equal(AK.sdmxNeedsFallback(200, 'application/xml;charset=UTF-8'), true);
  assert.equal(AK.sdmxNeedsFallback(200, 'application/vnd.sdmx.data+csv; charset=utf-8'), false);
  assert.equal(AK.sdmxNeedsFallback(200, 'text/csv;charset=UTF-8'), false);
  assert.equal(AK.sdmxNeedsFallback(404, 'text/plain'), false);
  assert.equal(AK.sdmxNeedsFallback(422, 'text/plain'), false);
});

test('sdmxFallbackUrl: format=csvdata legges på, eksisterende format strippes', () => {
  assert.equal(AK.sdmxFallbackUrl('https://x/data/EXR/D.USD?startPeriod=2026'),
    'https://x/data/EXR/D.USD?startPeriod=2026&format=csvdata');
  assert.equal(AK.sdmxFallbackUrl('https://x/data/EXR/all?format=csvfile'),
    'https://x/data/EXR/all?format=csvdata');
  assert.equal(AK.sdmxFallbackUrl('https://x/data/EXR/all'),
    'https://x/data/EXR/all?format=csvdata');
});
