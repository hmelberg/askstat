// tests/js/ai-chat-validators.test.js — nivå 1 auto-retting for python/R i
// v2-flyten (docs/ROADMAP.md §AI-assistenten). js/ai-chat.js er en
// nettleser-IIFE som kjører init() ved require-tid (side-wiring), så en
// minimal document-stubb installeres FØR require — samme mønster som
// tests/js/ui-dom.test.js/cells-dom.test.js bruker for js/ui.js og
// js/cells.js. init() bailer tidlig når document.getElementById('aiSidebar')
// gir null (se js/ai-chat.js sin `if (!dom.aiSidebar) return;`), så resten av
// DOM-oppkoblingen (event-lyttere osv.) kjører aldri i denne test-konteksten
// — kun de rene funksjonene modulen selv eksporterer (module.exports-seamen
// nederst i fila) testes her.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const AI_CHAT_PATH = path.join(__dirname, '..', '..', 'js', 'ai-chat.js');
const CELLS_PATH = path.join(__dirname, '..', '..', 'js', 'cells.js');
const PARAM_FORMS_PATH = path.join(__dirname, '..', '..', 'js', 'param-forms.js');

global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelectorAll: function () { return []; },
};

const aiChat = require(AI_CHAT_PATH);
// Ren-halvdel-eksportene (js/cells.js/js/param-forms.js sine egne
// module.exports, satt FØR deres respektive DOM-halvdel-IIFE) — akkurat de
// samme hasMarkers/supportedMode/paramLangForType/parse-funksjonene
// computeParamFormsWrap kalles med i nettleseren (window.Cells/
// window.ParamForms, satt av script-tag-lastingen i index.html).
const CellsPure = require(CELLS_PATH);
const ParamFormsPure = require(PARAM_FORMS_PATH);

// ---- extractFirstCodeBlock -------------------------------------------------

test('extractFirstCodeBlock: henter riktig språk-tagget blokk, hopper over andre', () => {
  const md = 'Her er svaret:\n\n```r\nx <- 1\n```\n\n```python\ny = 2\n```\n';
  assert.equal(aiChat.extractFirstCodeBlock(md, 'python').trim(), 'y = 2');
  assert.equal(aiChat.extractFirstCodeBlock(md, 'r').trim(), 'x <- 1');
});

test('extractFirstCodeBlock: aksepterer py-alias for python', () => {
  const md = '```py\nprint(1)\n```';
  assert.equal(aiChat.extractFirstCodeBlock(md, 'python').trim(), 'print(1)');
});

test('extractFirstCodeBlock: ingen treff gir tom streng', () => {
  assert.equal(aiChat.extractFirstCodeBlock('bare prosetekst, ingen kodeblokk', 'python'), '');
  assert.equal(aiChat.extractFirstCodeBlock('', 'r'), '');
});

test('extractFirstCodeBlock: microdata-blokker telles ikke som python/r', () => {
  const md = '```microdata\nrequire no.ssb.fdb:53 as fd\n```';
  assert.equal(aiChat.extractFirstCodeBlock(md, 'python'), '');
  assert.equal(aiChat.extractFirstCodeBlock(md, 'r'), '');
});

// ---- extractLangSegment ----------------------------------------------------
// parseHybridScript selv er definert i index.html (bare global, delt
// script-scope — samme cross-fil-mønster som activeEditorMode/
// microdataCatalog ellers i js/ai-chat.js). Stubbes her for testens formål.

test('extractLangSegment: splitter #micro-header fra #python-koden via parseHybridScript', () => {
  global.parseHybridScript = function (text) {
    // Enkel stand-in: alt før "#python" er microdata, resten er pyodide.
    const idx = text.indexOf('#python');
    if (idx < 0) return [{ kind: 'microdata', text: text }];
    return [
      { kind: 'microdata', text: text.slice(0, idx) },
      { kind: 'pyodide', text: text.slice(idx + '#python'.length) },
    ];
  };
  const script = '#micro\nrequire no.ssb.fdb:53 as fd\n\n#python\nfolk["kjonn"].value_counts()';
  const seg = aiChat.extractLangSegment(script, 'python');
  assert.equal(seg.includes('require'), false);
  assert.equal(seg.includes('value_counts'), true);
  delete global.parseHybridScript;
});

test('extractLangSegment: faller tilbake til hele scriptet uten parseHybridScript', () => {
  delete global.parseHybridScript;
  const script = '#micro\nimport fd/X as y\n\n#r\nsummary(y)';
  assert.equal(aiChat.extractLangSegment(script, 'r'), script);
});

// ---- findUnknownVarNames / buildRepairErrors (uendret — regresjonssikring) --

test('findUnknownVarNames + buildRepairErrors: uendret format', () => {
  global.microdataVariableNames = ['BEFOLKNING_KJOENN'];
  const unknown = aiChat.findUnknownVarNames('import fd/OPPDIKTET_VARIABEL as x');
  assert.deepEqual(unknown, ['OPPDIKTET_VARIABEL']);
  const errStr = aiChat.buildRepairErrors({ skipped: true }, unknown);
  assert.equal(errStr, 'Ukjente variabelnavn (finnes ikke i katalogen): OPPDIKTET_VARIABEL');
  delete global.microdataVariableNames;
});

// ---- _v2Validators: nivå 1-dispatch-tabellens form -------------------------

test('_v2Validators: har python/r med extract+validate+unknownNames (microdata fjernet 2026-07-24)', () => {
  assert.equal(aiChat._v2Validators.microdata, undefined, 'microdata-oppføringen skal være fjernet');
  ['python', 'r'].forEach((k) => {
    const entry = aiChat._v2Validators[k];
    assert.ok(entry, 'mangler oppføring for ' + k);
    assert.equal(typeof entry.extract, 'function');
    assert.equal(typeof entry.validate, 'function');
    assert.equal(typeof entry.unknownNames, 'function');
  });
});

test('_v2Validators.python/r.validate: skipped:true når ingen runtime er lastet (aldri boot)', async () => {
  // __pyodidePromise/webRPromise er ikke definert i dette testmiljøet — nivå
  // 1-kravet er at validatorene ALDRI booter en ny runtime for å validere;
  // dette beviser at fraværet av en allerede-lastet økt gir skipped, ikke et
  // forsøk på å laste en.
  const pyResult = await aiChat._v2Validators.python.validate('print(1)');
  assert.deepEqual(pyResult, { skipped: true });
  const rResult = await aiChat._v2Validators.r.validate('print(1)');
  assert.deepEqual(rResult, { skipped: true });
});

test('_v2Validators.python.validate: skipped:true selv med en pending pyodide-økt uten kode', async () => {
  global.__pyodidePromise = Promise.resolve(null);
  const res = await aiChat._v2Validators.python.validate('#micro\nimport fd/X as y\n');
  assert.deepEqual(res, { skipped: true });
  delete global.__pyodidePromise;
});

// ---- validatePythonSyntax: linjenummer foldes inn i feilmeldingen ----------
// _ex.lineno (Python-sidens "line_no" i det rå JSON-svaret) ble tidligere
// beregnet men aldri lest av buildRepairErrors (som kun ser på e.message/
// e.kind) — reparasjonsrunden fikk dermed ALDRI vite hvilken linje feilen var
// på, selv om Pyodide-siden faktisk hadde regnet den ut. R sin parse()-
// feiltekst inneholder linjenummeret naturlig ("<text>:LINJE:KOLONNE:"), så
// dette bringer python opp på samme nivå.

test('validatePythonSyntax: fletter line_no inn i message når det finnes', async () => {
  global.__pyodidePromise = Promise.resolve({
    runPythonAsync: async function () {
      return JSON.stringify({
        passed: false,
        errors: [{ kind: 'parse', message: 'invalid syntax', line_no: 3 }],
      });
    },
  });
  const res = await aiChat.validatePythonSyntax('#micro\nimport fd/X as y\n\n#python\nx = (');
  assert.equal(res.passed, false);
  assert.equal(res.errors[0].message, 'linje 3: invalid syntax');
  delete global.__pyodidePromise;
});

test('validatePythonSyntax: lar message stå uendret når line_no mangler', async () => {
  global.__pyodidePromise = Promise.resolve({
    runPythonAsync: async function () {
      return JSON.stringify({
        passed: false,
        errors: [{ kind: 'parse', message: 'NameError: x is not defined' }],
      });
    },
  });
  const res = await aiChat.validatePythonSyntax('#micro\nimport fd/X as y\n\n#python\nprint(x)');
  assert.equal(res.errors[0].message, 'NameError: x is not defined');
  delete global.__pyodidePromise;
});

// ---- _v2Validators.python/r.unknownNames: grunnet i microdata-segmentet ----
// Før: extractAllCode(mdText) skannet ALLE kodeblokker i hele svaret, så
// analysekode-tokens som "total/N_OBS" (divisjon) eller "data/GDP.csv"
// (filstier) kunne se ut som "alias/VARIABELNAVN"-mønsteret og false-positive
// som ukjente katalogvariabler. Nå: unknownNames skanner KUN #micro-segmentet
// av selve kandidatscriptet (samme parseHybridScript-segmenterer som
// extractLangSegment/syntaks-sjekkene bruker) — import/require skjer
// uansett bare der.

test('_v2Validators.python.unknownNames: grunnet i microdata-segmentet, ikke i analysekoden', () => {
  global.parseHybridScript = function (text) {
    const idx = text.indexOf('#python');
    if (idx < 0) return [{ kind: 'microdata', text: text }];
    return [
      { kind: 'microdata', text: text.slice(0, idx) },
      { kind: 'pyodide', text: text.slice(idx + '#python'.length) },
    ];
  };
  global.microdataVariableNames = ['BEFOLKNING_KJOENN'];
  const script = '#micro\nimport fd/OPPDIKTET_VARIABEL as x\n\n#python\ntotal = folk / N_OBS\n';
  const unknown = aiChat._v2Validators.python.unknownNames('irrelevant-mdtext', script);
  assert.deepEqual(unknown, ['OPPDIKTET_VARIABEL']);
  delete global.parseHybridScript;
  delete global.microdataVariableNames;
});

test('_v2Validators.r.unknownNames: grunnet i microdata-segmentet, ikke i analysekoden', () => {
  global.parseHybridScript = function (text) {
    const idx = text.indexOf('#r');
    if (idx < 0) return [{ kind: 'microdata', text: text }];
    return [
      { kind: 'microdata', text: text.slice(0, idx) },
      { kind: 'r', text: text.slice(idx + '#r'.length) },
    ];
  };
  global.microdataVariableNames = ['BEFOLKNING_KJOENN'];
  const script = '#micro\nimport fd/OPPDIKTET_VARIABEL as y\n\n#r\nread.csv("data/GDP.csv")\n';
  const unknown = aiChat._v2Validators.r.unknownNames('irrelevant-mdtext', script);
  assert.deepEqual(unknown, ['OPPDIKTET_VARIABEL']);
  delete global.parseHybridScript;
  delete global.microdataVariableNames;
});

// ---- computeParamFormsWrap --------------------------------------------------
// task-9-report.md root cause: ParamForms.decorate only runs inside notebook
// mode (js/cells.js docCellNode), which requires a '#%%' marker AND an
// explicit Cells.enter() (tick()'s "was this typed" heuristic refuses to
// auto-enter for a script inserted via a dispatched 'input' event — see
// insertScriptIntoEditor's comment). computeParamFormsWrap decides whether an
// about-to-run script needs that '#%%' wrapper: only when it actually
// contains a #@param/#@title/#@markdown line the given mode supports.

test('computeParamFormsWrap: wraps a python script containing #@param with a #%% header', () => {
  const script = 'annual_rate = 0.05  #@param {type:"slider", min:0.0, max:0.2, step:0.005}\nprint(annual_rate)\n';
  const wrapped = aiChat.computeParamFormsWrap(script, 'python', CellsPure, ParamFormsPure);
  assert.equal(wrapped, '#%% python\n' + script);
});

test('computeParamFormsWrap: r script with #@param wraps with the r mode token', () => {
  const script = 'n <- 10  #@param {type:"integer"}\nprint(n)\n';
  const wrapped = aiChat.computeParamFormsWrap(script, 'r', CellsPure, ParamFormsPure);
  assert.equal(wrapped, '#%% r\n' + script);
});

test('computeParamFormsWrap: plain script without #@param/#@title/#@markdown is left untouched (returns null)', () => {
  const script = 'x = 1\nprint(x)\n';
  assert.equal(aiChat.computeParamFormsWrap(script, 'python', CellsPure, ParamFormsPure), null);
});

test('computeParamFormsWrap: duckdb has no #@param support by design (paramLangForType is null) — returns null even with a matching line', () => {
  const script = 'x = 1  #@param {type:"integer"}\nselect * from t;\n';
  assert.equal(aiChat.computeParamFormsWrap(script, 'duckdb', CellsPure, ParamFormsPure), null);
});

test('computeParamFormsWrap: a script that already has a #%% marker is left untouched (already a notebook doc)', () => {
  const script = '#%% python\nannual_rate = 0.05  #@param {type:"slider"}\n';
  assert.equal(aiChat.computeParamFormsWrap(script, 'python', CellsPure, ParamFormsPure), null);
});

test('computeParamFormsWrap: #@title alone (no #@param line) still counts as something ParamForms would render', () => {
  const script = '#@title Interest rate\nprint(1)\n';
  const wrapped = aiChat.computeParamFormsWrap(script, 'python', CellsPure, ParamFormsPure);
  assert.equal(wrapped, '#%% python\n' + script);
});

test('computeParamFormsWrap: unsupported mode returns null', () => {
  const script = 'x = 1  #@param {type:"integer"}\n';
  assert.equal(aiChat.computeParamFormsWrap(script, 'not-a-real-mode', CellsPure, ParamFormsPure), null);
});

test('computeParamFormsWrap: missing Cells/ParamForms returns null (defensive — never throws)', () => {
  const script = 'x = 1  #@param {type:"integer"}\n';
  assert.equal(aiChat.computeParamFormsWrap(script, 'python', null, ParamFormsPure), null);
  assert.equal(aiChat.computeParamFormsWrap(script, 'python', CellsPure, null), null);
});
