// tests/js/notebook-links.test.js
const test = require('node:test');
const assert = require('node:assert');
const NL = require('../../js/notebook-links.js');

test('hostnameMode: subdomene-kartet (2026-07-24)', () => {
  assert.equal(NL.hostnameMode('py.openstat.app'), 'python');
  assert.equal(NL.hostnameMode('pyodide.openstat.app'), 'python');
  assert.equal(NL.hostnameMode('r.openstat.app'), 'r');
  assert.equal(NL.hostnameMode('duck.openstat.app'), 'duckdb');
  assert.equal(NL.hostnameMode('sql.openstat.app'), 'duckdb');
  assert.equal(NL.hostnameMode('micro.openstat.app'), 'micropython');
  assert.equal(NL.hostnameMode('m.openstat.app'), 'micropython');
  assert.equal(NL.hostnameMode('micropython.openstat.app'), 'micropython');
  assert.equal(NL.hostnameMode('b.openstat.app'), 'brython');
  assert.equal(NL.hostnameMode('brython.openstat.app'), 'brython');
  assert.equal(NL.hostnameMode('jamovi.openstat.app'), 'jamovi');
  assert.equal(NL.hostnameMode('j.openstat.app'), 'jamovi');
  assert.equal(NL.hostnameMode('gui.openstat.app'), 'jamovi');
});
test('hostnameMode: bare/dev hosts default to brython (rask start, 2026-07-24)', () => {
  assert.equal(NL.hostnameMode('openstat.app'), 'brython');
  assert.equal(NL.hostnameMode('localhost'), 'brython');
  assert.equal(NL.hostnameMode('hmelberg.github.io'), 'brython');
  assert.equal(NL.hostnameMode('deploy-preview-1--openstat.netlify.app'), 'brython');
});
test('hostnameMode: no false prefix hit (spy != py)', () => {
  assert.equal(NL.hostnameMode('spy.openstat.app'), 'brython'); // ukjent label -> bare-domene-default
  assert.equal(NL.hostnameMode('rstudio.example.com'), 'brython'); // 'rstudio' != 'r'
});

test('classifyHash: dotted open → main+master candidates', () => {
  const r = NL.classifyHash('#hans.demo.analyses.income.py');
  assert.equal(r.action, 'open');
  assert.equal(r.kind, 'dotted');
  assert.deepEqual(r.urls, [
    'https://raw.githubusercontent.com/hans/demo/main/analyses/income.py',
    'https://raw.githubusercontent.com/hans/demo/master/analyses/income.py',
  ]);
});
test('classifyHash: dotted output prefix', () => {
  const r = NL.classifyHash('#output.hans.demo.income.py');
  assert.equal(r.action, 'output');
  assert.deepEqual(r.urls, [
    'https://raw.githubusercontent.com/hans/demo/main/income.py',
    'https://raw.githubusercontent.com/hans/demo/master/income.py',
  ]);
});
test('classifyHash: raw url fallback', () => {
  const r = NL.classifyHash('#url=https://gist.githubusercontent.com/u/abc/raw/x.py');
  assert.equal(r.action, 'open');
  assert.equal(r.kind, 'raw');
  assert.equal(r.raw, 'https://gist.githubusercontent.com/u/abc/raw/x.py');
});
test('classifyHash: output raw url', () => {
  const r = NL.classifyHash('#output=https://raw.githubusercontent.com/u/rr/main/a.r');
  assert.equal(r.action, 'output');
  assert.equal(r.kind, 'raw');
});
test('classifyHash: legacy share defers', () => {
  assert.deepEqual(NL.classifyHash('#s=H4sIAAA'), { action: 'open', kind: 'share' });
});
test('classifyHash: non-matching returns null', () => {
  assert.equal(NL.classifyHash(''), null);
  assert.equal(NL.classifyHash('#'), null);
  // '#section-heading' er nå et registernavn (dashboard-spec §4) — appen
  // (index.html) har ingen egne side-ankre, så tokenet var ledig.
  assert.equal(NL.classifyHash('#section-heading').action, 'name');
  assert.equal(NL.classifyHash('#only.two'), null);         // needs user.repo.path.ext
});

test('rProsePrep: contiguous #\' block becomes one markdown cat', () => {
  const src = "#' # Title\n#' body text\nx <- 1\nprint(x)";
  const out = NL.rProsePrep(src);
  assert.match(out, /cat\(/);
  assert.match(out, /__micro_transform_start_markdown__/);
  assert.match(out, /# Title\\nbody text/);       // joined, prefix stripped
  assert.match(out, /x <- 1\nprint\(x\)/);          // code untouched
});
test('rProsePrep: ordinary # comments untouched', () => {
  const src = "# not prose\ny <- 2";
  assert.equal(NL.rProsePrep(src), src);
});
test('rProsePrep: END marker in content is neutralized', () => {
  const src = "#' hi __micro_transform_end__ there\nz<-3";
  const out = NL.rProsePrep(src);
  assert.doesNotMatch(out.replace(/__micro_transform_end__\\n"\)/,''), /__micro_transform_end__ there/);
});

// Review 2026-10-10 (S2): en delt lenke er kode fra noen andre som kjører i
// app-originen — bekreftelse kreves ALLTID, ikke bare når hemmeligheter finnes.
test('autorunNeedsGate: alltid bekreftelse for lenker utenfra', () => {
  assert.equal(NL.autorunNeedsGate('openstat', false), true);
  assert.equal(NL.autorunNeedsGate('openstat', true), true);
  assert.equal(NL.autorunNeedsGate('safestat', false), true);
});

function fakeStorage(obj) {
  const keys = Object.keys(obj);
  return {
    get length() { return keys.length; },
    key(i) { return keys[i] == null ? null : keys[i]; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null; },
  };
}
test('hasStoredSecret: tom / harmløs lagring → false', () => {
  assert.equal(NL.hasStoredSecret(fakeStorage({})), false);
  assert.equal(NL.hasStoredSecret(fakeStorage({ md_keys: '{}', md_llm_provider: '{"type":"openai-compat"}' })), false);
  assert.equal(NL.hasStoredSecret(fakeStorage({ md_keys: '{"anthropic":""}' })), false);
});
test('hasStoredSecret: hver hemmelighetsnøkkel gater (inkl. login-nøkler)', () => {
  for (const k of ['md_anthropic_key', 'mdapi_token', 'md_login_code', 'md_kek', 'm2py_github_pat']) {
    assert.equal(NL.hasStoredSecret(fakeStorage({ [k]: 'x' })), true, k);
  }
  assert.equal(NL.hasStoredSecret(fakeStorage({ md_keys: '{"anthropic":"sk-ant-x"}' })), true);
});
test('hasStoredSecret: GitHub-profiler med PAT gater, uten gjør ikke', () => {
  assert.equal(NL.hasStoredSecret(fakeStorage({ m2py_github_profiles: '[{"name":"a","pat":"ghp_x"}]' })), true);
  assert.equal(NL.hasStoredSecret(fakeStorage({ m2py_github_profiles: '[{"name":"a","pat":""}]' })), false);
});
test('hasStoredSecret: kastende eller manglende lagring → false', () => {
  const bad = { get length() { throw new Error('denied'); }, key() { throw new Error('denied'); }, getItem() { throw new Error('denied'); } };
  assert.equal(NL.hasStoredSecret(bad), false);
  assert.equal(NL.hasStoredSecret(null), false);
});

// urlHasMicro er fjernet: microdata-UI-et er modus-styrt, ikke URL-styrt.
test('urlHasMicro: removed from the API', () => {
  assert.equal(NL.urlHasMicro, undefined);
});

test('classifyHash: single lowercase token → name lookup', () => {
  assert.deepEqual(NL.classifyHash('#dodsarsaker'), { action: 'name', kind: 'name', name: 'dodsarsaker' });
  assert.deepEqual(NL.classifyHash('#kommune-helse'), { action: 'name', kind: 'name', name: 'kommune-helse' });
  assert.equal(NL.classifyHash('#Hans.demo.analyser.dod.py').action, 'open');  // dotted urørt
  assert.equal(NL.classifyHash('#s=abc').kind, 'share');                       // share urørt
  assert.equal(NL.classifyHash('#UPPER'), null);                               // ikke navn, ikke dotted
});

test('classifyNameValue: url and dotted values', () => {
  const r1 = NL.classifyNameValue('https://x.example/a.py');
  assert.deepEqual(r1, { action: 'output', kind: 'raw', raw: 'https://x.example/a.py' });
  const r2 = NL.classifyNameValue('hans.demo.analyser.dod.py');
  assert.equal(r2.action, 'output');
  assert.equal(r2.kind, 'dotted');
  assert.ok(r2.urls[0].includes('raw.githubusercontent.com/hans/demo/main/analyser/dod.py'));
  assert.equal(NL.classifyNameValue('ugyldig'), null);
  assert.equal(NL.classifyNameValue(''), null);
});
