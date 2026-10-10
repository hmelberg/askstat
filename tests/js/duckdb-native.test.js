// tests/js/duckdb-native.test.js — port av tests/test_duckdb_bridge.py for
// JS-utgaven (js/duckdb-native.js). Parquet-/referenced-tables-casene er
// utelatt: de hører til pandas-registreringen som kun finnes i Python-veien.
const test = require('node:test');
const assert = require('node:assert');
const DN = require('../../js/duckdb-native.js');

test('split: basic', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT 1; SELECT 2'), ['SELECT 1', 'SELECT 2']);
});

test('split: trailing semicolon and blanks', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT 1;\n\n SELECT 2;\n'), ['SELECT 1', 'SELECT 2']);
});

test('split: ignores semicolon in string', () => {
  assert.deepEqual(DN.splitSqlStatements("SELECT ';' AS x; SELECT 2"), ["SELECT ';' AS x", 'SELECT 2']);
});

test('split: ignores semicolon in line comment', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT 1 -- ; not a split\n; SELECT 2'),
    ['SELECT 1 -- ; not a split', 'SELECT 2']);
});

test('split: ignores semicolon in block comment', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT 1 /* a ; b */ ; SELECT 2'),
    ['SELECT 1 /* a ; b */', 'SELECT 2']);
});

test('split: handles escaped single quote', () => {
  assert.deepEqual(DN.splitSqlStatements("SELECT 'it''s; here' AS x; SELECT 2"),
    ["SELECT 'it''s; here' AS x", 'SELECT 2']);
});

test('created: plain', () => {
  assert.deepEqual(DN.extractCreatedTables(['CREATE TABLE foo AS SELECT 1']), ['foo']);
});

test('created: or replace / temp / if not exists / quoted', () => {
  const stmts = [
    'CREATE OR REPLACE TABLE bar AS SELECT 1',
    'CREATE TEMP TABLE IF NOT EXISTS "baz" AS SELECT 2',
    'create temporary table Qux as select 3',
  ];
  assert.deepEqual(DN.extractCreatedTables(stmts), ['bar', 'baz', 'Qux']);
});

test('created: norwegian table names survive (unicode continuation)', () => {
  assert.deepEqual(DN.extractCreatedTables(['CREATE TABLE lønn AS SELECT 1']), ['lønn']);
  assert.deepEqual(DN.extractCreatedTables(['CREATE TABLE hoytlønnede2 AS SELECT 1']), ['hoytlønnede2']);
});

test('created: dedup preserves order', () => {
  const stmts = ['CREATE TABLE a AS SELECT 1', 'CREATE OR REPLACE TABLE a AS SELECT 2'];
  assert.deepEqual(DN.extractCreatedTables(stmts), ['a']);
});

test('created: ignores CREATE inside strings and comments', () => {
  const stmts = ["SELECT 'CREATE TABLE nope AS x' AS lbl /* CREATE TABLE heller_ikke AS y */"];
  assert.deepEqual(DN.extractCreatedTables(stmts), []);
});

test('preview: plain select', () => {
  assert.equal(DN.buildPreviewSelect(['CREATE TABLE a AS SELECT 1', 'SELECT * FROM a']), 'SELECT * FROM a');
});

test('preview: with cte', () => {
  const stmts = ['WITH t AS (SELECT 1 AS n) SELECT n FROM t'];
  assert.equal(DN.buildPreviewSelect(stmts), stmts[0]);
});

test('preview: none when last is ddl', () => {
  assert.equal(DN.buildPreviewSelect(['SELECT 1', 'CREATE TABLE a AS SELECT 1']), null);
});

test('preview: none when empty', () => {
  assert.equal(DN.buildPreviewSelect([]), null);
});

test('preview: leading comment before select still previews', () => {
  const stmt = '-- kommentar\nSELECT 1 AS x';
  assert.equal(DN.buildPreviewSelect([stmt]), stmt);
});

test('scrub: comment-only script becomes blank', () => {
  assert.equal(DN.scrub('-- bare en kommentar\n/* og en til */').trim(), '');
});

test('format: aligns columns and renders null as NaN', () => {
  const txt = DN.formatColumnsText({ navn: ['a', null, 'ccc'], n: [1, 22, 3] });
  assert.deepEqual(txt.split('\n'), [
    'navn   n',
    '   a   1',
    ' NaN  22',
    ' ccc   3',
  ]);
});

test('format: empty result gives empty string', () => {
  assert.equal(DN.formatColumnsText({}), '');
});

test('splitSqlStatements: rene kommentarbiter etter siste ; droppes', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT * FROM iris;\n-- ferdig'), ['SELECT * FROM iris']);
});

test('extractCreatedTables: kvalifisert og kvotert navn', () => {
  assert.deepEqual(DN.extractCreatedTables(['CREATE TABLE main.res AS SELECT 1']), ['res']);
  assert.deepEqual(DN.extractCreatedTables(['CREATE TABLE "my-t" AS SELECT 1']), ['my-t']);
});

test('split: ignores semicolon in dollar-quoted string', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT $$a;b$$; SELECT 2'), ['SELECT $$a;b$$', 'SELECT 2']);
});

test('split: ignores semicolon in tagged dollar quote', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT $fn$ x; $$ y $fn$ AS t; SELECT 2'),
    ['SELECT $fn$ x; $$ y $fn$ AS t', 'SELECT 2']);
});

test('split: positional params are not dollar quotes', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT $1; SELECT a$b$c; SELECT 3'),
    ['SELECT $1', 'SELECT a$b$c', 'SELECT 3']);
});

test('split: ignores semicolon in E-string with backslash escape', () => {
  assert.deepEqual(DN.splitSqlStatements("SELECT E'it\\'s; here' AS x; SELECT 2"),
    ["SELECT E'it\\'s; here' AS x", 'SELECT 2']);
});

test('split: plain string is not an E-string (no backslash escaping)', () => {
  assert.deepEqual(DN.splitSqlStatements("SELECT 'a\\'; SELECT 2"), ["SELECT 'a\\'", 'SELECT 2']);
});

test('scrub: blanks dollar-quoted and E-string contents', () => {
  assert.strictEqual(DN.scrub("SELECT E'x\\'y', $$ foo $$, $t$bar$t$ FROM t"), 'SELECT  ,  ,   FROM t');
});

test('split: dollar-quote inside comment-only tail is dropped', () => {
  assert.deepEqual(DN.splitSqlStatements('SELECT 1; -- $$ ; $$'), ['SELECT 1']);
});

// B11a/B11d (review 2026-10): tvilling av plan_preview_run/quote_ident i
// duckdb_bridge.py — samme oppførsel på begge sider.
test('quoteIdent: dobler anførselstegn', () => {
  assert.equal(DN.quoteIdent('a'), '"a"');
  assert.equal(DN.quoteIdent('my"t'), '"my""t"');
});

test('planPreviewRun: preview-SELECT kjøres én gang inn i temp-tabell', () => {
  const stmts = DN.splitSqlStatements('CREATE TABLE a AS SELECT 1 AS x; SELECT * FROM a');
  const plan = DN.planPreviewRun(stmts);
  assert.equal(plan.body, 'CREATE TABLE a AS SELECT 1 AS x');
  assert.ok(plan.preview.startsWith('CREATE OR REPLACE TEMP TABLE ' + DN.quoteIdent(DN.PREVIEW_TABLE) + ' AS '));
  assert.equal(plan.preview.split('SELECT * FROM a').length - 1, 1);
  assert.ok(plan.body.indexOf('SELECT * FROM a') < 0);
  assert.equal(plan.table, DN.PREVIEW_TABLE);
});

test('planPreviewRun: avsluttende linjekommentar får linjeskift', () => {
  const plan = DN.planPreviewRun(DN.splitSqlStatements('SELECT * FROM iris -- kommentar'));
  assert.equal(plan.body, '');
  assert.ok(plan.preview.endsWith('-- kommentar\n'));
});

test('planPreviewRun: ingen preview når siste er DDL', () => {
  const plan = DN.planPreviewRun(DN.splitSqlStatements('SELECT 1; CREATE TABLE a AS SELECT 1'));
  assert.equal(plan.preview, null);
  assert.equal(plan.body, 'SELECT 1\n;\nCREATE TABLE a AS SELECT 1');
});

test('planPreviewRun: body-skille overlever -- kommentar', () => {
  const stmts = DN.splitSqlStatements('CREATE TABLE a AS SELECT 1 -- c\n; CREATE TABLE b AS SELECT 2; SELECT 3');
  const plan = DN.planPreviewRun(stmts);
  assert.equal(plan.body, 'CREATE TABLE a AS SELECT 1 -- c\n;\nCREATE TABLE b AS SELECT 2');
  assert.deepEqual(DN.splitSqlStatements(plan.body), stmts.slice(0, 2));
});
