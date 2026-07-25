// tests/js/data-directives-apikinds.test.js — resolve() for api-kinds
// (spec docs/superpowers/specs/2026-07-25-api-kinds-design.md §1-2):
// protokoll-kinds i kind-grenen, kind fra registeroppføring, kildenavn-alias.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/api-kinds.js');       // alias-tabellen (global.ApiKinds)
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

function resolveOne(script, registry) {
  const r = DD.resolve(DD.parse(script), registry || []);
  assert.equal(r.length, 1);
  return r[0];
}

test('kind(oecd) med bar URL normaliseres til sdmx, sti + table settes', () => {
  const item = resolveOne(
    '# connect https://sdmx.oecd.org/public/rest/data as o, kind(oecd)\n' +
    '# read o/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all?startPeriod=2020 as le');
  assert.equal(item.kind, 'sdmx');
  assert.equal(item.url, 'https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all?startPeriod=2020');
  assert.equal(item.table, 'OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all');
  assert.equal(item.alias, 'le');
});

test('kind fra registeroppføring: connect worldbank uten kind()', () => {
  const registry = [{ id: 'worldbank', base_url: 'https://api.worldbank.org/v2/', kind: 'worldbank' }];
  const item = resolveOne(
    '# connect worldbank\n' +
    '# read worldbank/country/NOR/indicator/NY.GDP.MKTP.CD?date=2015:2024 as bnp', registry);
  assert.equal(item.kind, 'worldbank');
  assert.equal(item.url, 'https://api.worldbank.org/v2/country/NOR/indicator/NY.GDP.MKTP.CD?date=2015:2024');
  assert.equal(item.table, 'country/NOR/indicator/NY.GDP.MKTP.CD');
});

test('registerets kildenavn-kind normaliseres også (kind: "oecd" i registeret)', () => {
  const registry = [{ id: 'oecd', base_url: 'https://sdmx.oecd.org/public/rest/data/', kind: 'oecd' }];
  const item = resolveOne('# connect oecd\n# read oecd/EXR/all as x', registry);
  assert.equal(item.kind, 'sdmx');
});

test('read uten ressurssti → norsk feil med eksempel', () => {
  const item = resolveOne(
    '# connect https://api.db.nomics.world/v22/series as dbn, kind(dbnomics)\n' +
    '# read dbn as x');
  assert.ok(item.error);
  assert.ok(/ressurssti/.test(item.error));
  assert.ok(/WEO/.test(item.error));   // dbnomics-eksemplet
});

test('kind(sdmx) direkte virker likt som kildenavnet', () => {
  const item = resolveOne(
    '# connect https://data-api.ecb.europa.eu/service/data as ecb, kind(sdmx)\n' +
    '# read ecb/EXR/D.USD.EUR.SP00.A?startPeriod=2026-01-01 as kurs');
  assert.equal(item.kind, 'sdmx');
  assert.equal(item.url, 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-01-01');
});

test('pxweb/eurostat-grenen er uendret', () => {
  const item = resolveOne(
    '# connect https://data.ssb.no/api/pxwebapi/v2/tables as ssb, kind(pxweb)\n' +
    '# load ssb/05839 as bef');
  assert.equal(item.kind, 'pxweb');
  assert.equal(item.table, '05839');
});
