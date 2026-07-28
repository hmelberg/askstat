// tests/js/ost-r.test.js — R-typing-kilden (r-factor-runden §3).
// Kildetekst-asserter (pyPatchSource-presedensen): R kjøres ikke i CI —
// kontraktsbærende uttrykk sjekkes tekstlig, semantikken bevises i smoke.
const test = require('node:test');
const assert = require('node:assert');
require('../../js/ost-r.js');
const src = globalThis.OstR.rSource();

test('rSource: definerer begge funksjonene med riktige signaturer', () => {
  assert.match(src, /ost_read_csv <- function\(url, convert = TRUE, \.\.\.\)/);
  assert.match(src, /ost_convert_dtypes <- function\(df, meta\)/);
});

test('rSource: best-effort-paritet — koder-vakt, intlike-time, kildens orden, ordered', () => {
  assert.match(src, /all\(vals %in% cats\)/);                       // kun KODER typles
  assert.match(src, /grepl\("\^-\?\[0-9\]\+\$", cats\)/);           // intlike-regelen
  assert.match(src, /factor\(as\.character\(df\[\[did\]\]\), levels = cats, ordered = isTRUE\(e\$time\)\)/);
  assert.match(src, /as\.integer/);
});

test('rSource: aldri-kast for metadata + hoylytt melding + colClasses-vern', () => {
  assert.match(src, /tryCatch/);
  assert.match(src, /laster utypet/);
  assert.match(src, /colClasses/);
  assert.match(src, /'ost_convert_dtypes krever meta='|"ost_convert_dtypes krever meta="/);
});

test('rSource: attr settes for gjenkjent kilde uansett convert', () => {
  assert.match(src, /attr\(df, "ost_url"\) <- url/);
});
