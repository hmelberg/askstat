// tests/js/canonical-normalise.test.js — B13 (URL-enkoding/duplikat-
// dimensjoner i kanonisk oversettelse) og F2 (deterministiske
// normaliseringer: pxweb ALL → *, SDMX flowRef slash → komma).
const test = require('node:test');
const assert = require('node:assert');
require('../../js/directive-parser.js');
require('../../js/data-directives.js');
const DD = globalThis.DataDirectives;

const PX = '# ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")\n';
function one(script, registry) { return DD.resolve(DD.parse(script), registry || [])[0]; }

test('B13 pxweb: filters-verdier URL-enkodes per kode, komma beholdes som skille', () => {
  const tr = DD.translateCanonical('pxweb', '05839', { filters: { Region: ['0301', 'Å&b'], Kjonn: '1,2' } });
  // Nøkkelen (dimensjons-id-en) enkodes ikke: pxweb.js matcher den rått mot
  // metadataens id-er (expandAllUrl/missingMandatory).
  assert.deepEqual(tr.params, ['valueCodes[Region]=0301,%C3%85%26b', 'valueCodes[Kjonn]=1,2']);
});

test('B13 pxweb: wildcard, top() og from() overlever enkodingen', () => {
  const tr = DD.translateCanonical('pxweb', '05839', { filters: { Region: '*', Tid: 'top(5)', X: 'from(2020)' } });
  assert.deepEqual(tr.params, ['valueCodes[Region]=*', 'valueCodes[Tid]=top(5)', 'valueCodes[X]=from(2020)']);
});

test('B13 pxweb: regions= pluss filters={"Region": …} gir feil, ikke dobbel valueCodes', () => {
  const tr = DD.translateCanonical('pxweb', '05839', { regions: ['0301'], filters: { Region: ['1103'] } });
  assert.match(tr.error, /regions.*Region/);
  const t2 = DD.translateCanonical('pxweb', '05839', { indicators: ['P'], filters: { ContentsCode: 'Q' } });
  assert.match(t2.error, /indicators.*ContentsCode/);
  const t3 = DD.translateCanonical('pxweb', '05839', { years: { from: '2020' }, filters: { Tid: 'top(2)' } });
  assert.match(t3.error, /years.*Tid/);
});

test('B13 pxweb: gjennom resolve (filters fra direktivet)', () => {
  const r = one(PX + '# b = ssb.read("05839", filters={"Region": ["0301"], "Alder": "15 år"})');
  assert.match(r.url, /valueCodes\[Region\]=0301/);
  assert.match(r.url, /valueCodes\[Alder\]=15%20%C3%A5r/);
});

test('B13 eurostat: filters-verdier URL-enkodes', () => {
  const tr = DD.translateCanonical('eurostat', 'x', { filters: { unit: 'PC ACT', geo: ['NO', 'SE'] } });
  assert.deepEqual(tr.params, ['unit=PC%20ACT', 'geo=NO', 'geo=SE']);
});

test('F2 pxweb: «ALL» som verdi blir wildcard «*»', () => {
  const tr = DD.translateCanonical('pxweb', '05839', { filters: { Region: 'ALL', Kjonn: ['ALL'] } });
  assert.deepEqual(tr.params, ['valueCodes[Region]=*', 'valueCodes[Kjonn]=*']);
  const t2 = DD.translateCanonical('pxweb', '05839', { regions: ['ALL'] });
  assert.deepEqual(t2.params, ['valueCodes[Region]=*']);
});

test('F2 sdmx: OECD-flowRef på slash-form normaliseres til komma-form', () => {
  const reg = [{ id: 'oecd', base_url: 'https://sdmx.oecd.org/public/rest/data/', kind: 'sdmx' }];
  const r = one('# x = oecd.read("OECD.SDD.TPS/DSD_LFS@DF_IALFS_UNE_M")', reg);
  assert.equal(r.url, 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M');
});

test('F2 sdmx: flow/nøkkel-stier (ECB EXR/M.USD…) røres ikke', () => {
  const reg = [{ id: 'ecb', base_url: 'https://data-api.ecb.europa.eu/service/data/', kind: 'sdmx' }];
  const r = one('# x = ecb.read("EXR/M.USD.EUR.SP00.A")', reg);
  assert.equal(r.url, 'https://data-api.ecb.europa.eu/service/data/EXR/M.USD.EUR.SP00.A');
});
