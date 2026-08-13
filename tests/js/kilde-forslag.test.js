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

test('ferskeDocs re-leser tekst fra Profiles-lageret (spec §4: etter delvis aksept)', () => {
  const profiles = { get: (id) => (id === 'a' ? { name: 'A2', text: 'NY TEKST' } : null) };
  const ut = KF.ferskeDocs({ docs: [{ id: 'user:a', name: 'A', text: 'GAMMEL' }, { id: 'user:borte', name: 'B', text: 'x' }] }, profiles);
  assert.deepEqual(ut, [{ id: 'user:a', name: 'A2', text: 'NY TEKST' }]);
});

// finn.1 (sluttreview): ask-view.js kaller registerRun(null) ved flytstart
// og restore for å nullstille ctxSiste/knappen — modulen lastes uten DOM
// i node, så dette må ikke krasje der (document er undefined).
test('registerRun(null) er trygt uten DOM (node har ikke document)', () => {
  assert.doesNotThrow(() => KF.registerRun(null));
});

test('erAdmin: kun is_admin === true, med injisert auth', () => {
  assert.equal(KF.erAdmin({ user: { is_admin: true } }), true);
  assert.equal(KF.erAdmin({ user: { is_admin: 'ja' } }), false);
  assert.equal(KF.erAdmin({ user: {} }), false);
  assert.equal(KF.erAdmin(null), false);
});

test('byggEvidens: scrubbet, klippet, med feiltall og siste feil', () => {
  const ev = KF.byggEvidens({
    question: 'Hva er X?', tolkning: 'X per år',
    runs: [{ script: 's1', error: 'gammel feil' }, { script: 's2', error: 'api_key=hemmelig og mer' }],
    ok_script: 'x'.repeat(5000), kastedeTurer: 2,
  }, { scrub: deps.scrub, masker: (s) => require('../../js/feil-telemetri.js').maskerNokler(s) });
  assert.ok(ev.indexOf('Hva er X?') >= 0);
  assert.ok(ev.indexOf('Feilede kjøringer: 2') >= 0);
  assert.ok(ev.indexOf('forkastede turer: 2') >= 0);
  assert.ok(ev.indexOf('hemmelig og mer') === -1 || ev.indexOf('***') >= 0); // masker kjørte
  assert.ok(ev.length < 4000);
});

test('parseForslagSvar: kode_sak plukkes opp og valideres', () => {
  const r = KF.parseForslagSvar(JSON.stringify({ forslag: [], melding: 'kodesak', kode_sak: { tittel: 'SDMX-dialekt', kropp: 'Bestilling …' } }));
  assert.deepEqual(r.kode_sak, { tittel: 'SDMX-dialekt', kropp: 'Bestilling …' });
  assert.equal(KF.parseForslagSvar('{"forslag":[]}').kode_sak, null);
  assert.equal(KF.parseForslagSvar(JSON.stringify({ forslag: [], kode_sak: { tittel: '', kropp: 'x' } })).kode_sak, null);
});

test('byggForslagsPayload: oppgave sendes gjennom, utelates ellers', () => {
  assert.equal(KF.byggForslagsPayload({ docs: [], oppgave: 'kort' }, deps).oppgave, 'kort');
  assert.ok(!('oppgave' in KF.byggForslagsPayload({ docs: [] }, deps)) ||
    KF.byggForslagsPayload({ docs: [] }, deps).oppgave === undefined);
});

test('openKortForslag-ctx: bygges fra Profiles med oppgave kort', () => {
  const profiles = { get: (id) => (id === 'p1' ? { name: 'A', text: 'T' } : null) };
  const ctx = KF.byggKortCtx('p1', profiles);
  assert.deepEqual(ctx.docs, [{ id: 'user:p1', name: 'A', text: 'T' }]);
  assert.equal(ctx.oppgave, 'kort');
  assert.equal(ctx.runs.length, 0);
  assert.equal(KF.byggKortCtx('finnes-ikke', profiles), null);
});

test('involverteInnebygde: base_url-prefiks, kodet proxy-form, dedup, maks 3', () => {
  const reg = [
    { id: 'ess', base_url: 'https://api.ess.sikt.no/v1/' },
    { id: 'eurostat', base_url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/' },
    { id: 'ssb', base_url: 'https://data.ssb.no/api/pxwebapi/v2/' },
    { id: 'oecd', base_url: 'https://sdmx.oecd.org/public/rest/data/' },
    { id: 'fred', base_url: 'https://api.stlouisfed.org/fred/' },
  ];
  const sources = [
    '/api/hent?url=https%3A%2F%2Fapi.ess.sikt.no%2Fv1%2Fdata%2FdataFile%2Fx%3FfileFormat%3Dparquet',  // kodet proxy
    'https://api.ess.sikt.no/v1/data/annet',                    // dedup (ess igjen)
    'https://data.ssb.no/api/pxwebapi/v2/tables/x/data',        // direkte prefiks
    'https://sdmx.oecd.org/public/rest/data/OECD.SDD/x',        // nr 3
    'https://api.stlouisfed.org/fred/series',                   // nr 4 → kappes (maks 3)
  ];
  assert.deepEqual(KF.involverteInnebygde(sources, reg), ['ess', 'ssb', 'oecd']);
  assert.deepEqual(KF.involverteInnebygde([], reg), []);
  assert.deepEqual(KF.involverteInnebygde(['https://ukjent.example/x'], reg), []);
  assert.deepEqual(KF.involverteInnebygde(null, null), []);
});

test('hentRefDocs: register → matcher → dokumenter; 404 utelates stille', async () => {
  const svar = {
    'data/data-sources.json': JSON.stringify([
      { id: 'ess', base_url: 'https://api.ess.sikt.no/v1/' },
      { id: 'ssb', base_url: 'https://data.ssb.no/api/pxwebapi/v2/' },
    ]),
    'data/sources/ess.md': '## Guide\nparquet anbefales',
  };
  const fetchImpl = async (url) => (url in svar
    ? { ok: true, text: async () => svar[url] }
    : { ok: false, status: 404, text: async () => '' });
  const ut = await KF.hentRefDocs(
    { sources: ['https://api.ess.sikt.no/v1/data/x', 'https://data.ssb.no/api/pxwebapi/v2/t'] },
    { fetchImpl });
  // ess har dokument; ssb.md finnes ikke i stubben → utelatt stille
  assert.deepEqual(ut.map((d) => d.id), ['ess']);
  assert.ok(ut[0].text.indexOf('parquet anbefales') >= 0);
});

test('byggForslagsPayload: ref_docs klippes/takles og admin sendes kun ved true', () => {
  const p = KF.byggForslagsPayload({
    docs: [], admin: true,
    ref_docs: [
      { id: 'ess', text: 'g'.repeat(9000) },
      { id: 'UGYLDIG ID', text: 'x' },
      { id: 'a', text: 'x' }, { id: 'b', text: 'x' }, { id: 'c', text: 'x' },
    ],
  }, deps);
  assert.equal(p.admin, true);
  assert.deepEqual(p.ref_docs.map((d) => d.id), ['ess', 'a', 'b']);   // ugyldig filtrert, maks 3
  assert.equal(p.ref_docs[0].text.length, 8000);
  const uten = KF.byggForslagsPayload({ docs: [] }, deps);
  assert.ok(uten.admin === undefined);
  assert.ok(uten.ref_docs === undefined);
});
