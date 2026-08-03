const test = require('node:test');
const assert = require('node:assert');
const FT = require('../../js/feil-telemetri.js');

test('byggFeilrapport skrubber, klipper og setter faste felter', () => {
  const r = FT.byggFeilrapport({
    question: 'q', route: 'data', final_ok: false,
    runs: [{ script: 'x'.repeat(30000), error: 'e'.repeat(9000) }],
  }, { scrub: (s) => s.replace(/x/g, 'y') });
  assert.equal(r.app, 'askstat');
  assert.equal(r.route, 'data');
  assert.equal(r.runs[0].script.length, 20000);
  assert.ok(r.runs[0].script.startsWith('yyyy'));       // scrub kjørte FØR klipp
  assert.equal(r.runs[0].error.length, 4000);
  assert.equal(r.final_ok, false);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(r.ts));
});

test('byggFeilrapport dropper ELDSTE runs over payload-taket', () => {
  const runs = Array.from({ length: 20 }, (_, i) =>
    ({ script: String(i) + '|' + 'a'.repeat(15000), error: 'e' }));
  const r = FT.byggFeilrapport({ runs }, { scrub: (s) => s });
  assert.ok(JSON.stringify(r).length <= 200000);
  assert.ok(r.runs.length < 20);
  assert.ok(r.runs[r.runs.length - 1].script.startsWith('19|'));  // nyeste beholdes
});

test('flow_error tas med, tom utelates', () => {
  const med = FT.byggFeilrapport({ flow_error: 'strømmen røk' }, { scrub: (s) => s });
  assert.equal(med.flow_error, 'strømmen røk');
  const uten = FT.byggFeilrapport({}, { scrub: (s) => s });
  assert.ok(!('flow_error' in uten) || uten.flow_error === undefined);
});

test('byggFeilrapport respekterer UTF-8-BYTE-taket, ikke UTF-16-lengden (norsk tekst)', () => {
  // 'æøå' er 3 UTF-16-tegn men 6 UTF-8-bytes hver — nok runs med slik tekst
  // holder seg under et .length-tak men sprenger et byte-tak.
  const runs = Array.from({ length: 40 }, (_, i) =>
    ({ script: String(i) + '|' + 'æøå'.repeat(5000), error: 'e' }));
  const r = FT.byggFeilrapport({ runs }, { scrub: (s) => s });
  const bytes = Buffer.byteLength(JSON.stringify(r), 'utf8');
  assert.ok(bytes <= 200000, 'payload skal være <= 200000 UTF-8-bytes, var ' + bytes);
});

test('byggFeilrapport maskerer nøkkelaktige query-parametre i run-error og flow_error', () => {
  const r = FT.byggFeilrapport({
    runs: [{ script: 'x', error: 'fetch failed: https://api.stlouisfed.org/fred?series=X&api_key=HEMMELIG&x=1' }],
    flow_error: 'oppslag feilet: https://example.com/?token=abc&other=2',
  }, { scrub: (s) => s });
  assert.match(r.runs[0].error, /api_key=\*\*\*/);
  assert.ok(!r.runs[0].error.includes('HEMMELIG'));
  assert.match(r.flow_error, /token=\*\*\*/);
  assert.ok(!r.flow_error.includes('token=abc'));
});
