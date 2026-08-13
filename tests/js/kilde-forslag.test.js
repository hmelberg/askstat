const test = require('node:test');
const assert = require('node:assert');
const KF = require('../../js/kilde-forslag.js');

const deps = { scrub: (s) => String(s).replace(/x/g, 'y'), masker: (s) => String(s).replace(/hemmelig/g, '***') };

test('byggForslagsPayload klipper felter og kjører scrub/masker', () => {
  const p = KF.byggForslagsPayload({
    docs: [{ id: 'user:a', name: 'n'.repeat(500), text: 't'.repeat(50000) }],
    question: 'q'.repeat(9000), tolkning: 'i'.repeat(9000), mode: 'python', depth: 'fast',
    runs: [{ script: 'x'.repeat(30000), error: 'hemmelig ' + 'e'.repeat(9000) }],
    ok_script: 'xx', trace: ['a', 'hemmelig b'], sources: Array.from({ length: 100 }, (_, i) => 'u' + i),
    history: [{ forslag_raatekst: 'f'.repeat(60000), tilbakemelding: 'hemmelig tips' }],
    ui_lang: 'no',
  }, deps);
  assert.equal(p.docs[0].text.length, 40000);
  assert.equal(p.docs[0].name.length, 200);
  assert.equal(p.question.length, 4000);
  assert.equal(p.tolkning.length, 2000);
  assert.equal(p.runs[0].script.length, 20000);
  assert.ok(p.runs[0].script.startsWith('yyyy'));          // scrub FØR klipp
  assert.equal(p.runs[0].error.length, 4000);
  assert.ok(p.runs[0].error.startsWith('***'));            // masker FØR klipp
  assert.equal(p.ok_script, 'yy');
  assert.equal(p.trace, 'a\n*** b');                       // join + masker
  assert.equal(p.sources.length, 60);
  assert.equal(p.history[0].forslag_raatekst.length, 45000);
  assert.equal(p.history[0].tilbakemelding, '*** tips');
  assert.equal(p.ui_lang, 'no');
});

test('byggForslagsPayload dropper ELDSTE runs under 200k-BYTE-budsjettet, docs urørt', () => {
  const runs = Array.from({ length: 20 }, (_, i) => ({ script: i + '|' + 'a'.repeat(15000), error: 'e' }));
  const p = KF.byggForslagsPayload({ docs: [{ id: 'user:a', name: 'A', text: 'd'.repeat(39000) }], runs }, deps);
  assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf-8') <= 200000);
  assert.ok(p.runs.length < 20);
  assert.ok(p.runs[p.runs.length - 1].script.startsWith('19|'));   // nyeste beholdes
  assert.equal(p.docs[0].text.length, 39000);                       // aldri klippet av budsjettet
});

test('byggForslagsPayload teller UTF-8-BYTES, ikke UTF-16-lengde', () => {
  const runs = Array.from({ length: 30 }, () => ({ script: 'æøå'.repeat(4000), error: 'e' }));
  const p = KF.byggForslagsPayload({ docs: [], runs }, deps);
  assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf-8') <= 200000);
});

// Drift-test (spec §7, KEYS-regex-lærdommen): DEFAULT-depsene skal være
// koblet til de EKTE scrub-funksjonene — feiler hvis noen senere «rydder
// bort» koblingen. require av feil-telemetri setter globalThis.FeilTelemetri,
// som byggForslagsPayload leser ved kall uten deps.
test('drift: default masker er FeilTelemetri.maskerNokler (scrubben kan ikke ryddes bort)', () => {
  require('../../js/feil-telemetri.js');
  const p = KF.byggForslagsPayload({ runs: [{ script: 's', error: 'GET https://x?api_key=hemmelig123' }] });
  assert.equal(p.runs[0].error, 'GET https://x?api_key=***');
});

test('skalViseKnapp: egne kilder + friksjon', () => {
  const doc = [{ id: 'user:a', name: 'A', text: 't' }];
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [{}], kastedeTurer: 0 }), true);
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [], kastedeTurer: 1 }), true);
  assert.equal(KF.skalViseKnapp({ docs: doc, runs: [], kastedeTurer: 0 }), false);  // ingen friksjon
  assert.equal(KF.skalViseKnapp({ docs: [], runs: [{}], kastedeTurer: 3 }), false); // ingen egne kilder
  assert.equal(KF.skalViseKnapp(null), false);
});

test('parseForslagSvar: fenced json-blokk', () => {
  const r = KF.parseForslagSvar('Litt prat.\n```json\n{"forslag":[{"id":"user:a","ny_tekst":"NY","begrunnelse":"fordi"}],"melding":"ok"}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 1);
  assert.deepEqual(r.forslag[0], { id: 'user:a', ny_tekst: 'NY', begrunnelse: 'fordi' });
  assert.equal(r.melding, 'ok');
});

test('parseForslagSvar: naken JSON uten fence (klammespenn)', () => {
  const r = KF.parseForslagSvar('{"forslag":[],"melding":"ingen endring nødvendig"}');
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 0);
  assert.equal(r.melding, 'ingen endring nødvendig');
});

test('parseForslagSvar: søppel gir ok:false med raatekst', () => {
  const r = KF.parseForslagSvar('bare prosa uten json');
  assert.equal(r.ok, false);
  assert.deepEqual(r.forslag, []);
  assert.equal(r.raatekst, 'bare prosa uten json');
});

test('parseForslagSvar: forslag uten id/ny_tekst filtreres, tom ny_tekst filtreres', () => {
  const r = KF.parseForslagSvar(JSON.stringify({
    forslag: [{ id: 'user:a', ny_tekst: 'X' }, { id: 'user:b' }, { ny_tekst: 'Y' }, { id: 'user:c', ny_tekst: '   ' }],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.forslag.length, 1);
  assert.equal(r.forslag[0].begrunnelse, '');
});

test('linjeDiff: identisk gir kun lik', () => {
  assert.deepEqual(KF.linjeDiff('a\nb', 'a\nb'),
    [{ type: 'lik', tekst: 'a' }, { type: 'lik', tekst: 'b' }]);
});

test('linjeDiff: innsetting, sletting, erstatning', () => {
  assert.deepEqual(KF.linjeDiff('a\nc', 'a\nb\nc'),
    [{ type: 'lik', tekst: 'a' }, { type: 'ny', tekst: 'b' }, { type: 'lik', tekst: 'c' }]);
  assert.deepEqual(KF.linjeDiff('a\nb\nc', 'a\nc'),
    [{ type: 'lik', tekst: 'a' }, { type: 'slettet', tekst: 'b' }, { type: 'lik', tekst: 'c' }]);
  const er = KF.linjeDiff('a\nGAMMEL\nc', 'a\nNY\nc');
  assert.deepEqual(er.map((d) => d.type), ['lik', 'slettet', 'ny', 'lik']);
});

test('linjeDiff: tomme dokumenter', () => {
  assert.deepEqual(KF.linjeDiff('', ''), [{ type: 'lik', tekst: '' }]);
  assert.deepEqual(KF.linjeDiff('', 'x').filter((d) => d.type === 'ny'),
    [{ type: 'ny', tekst: 'x' }]);
});
