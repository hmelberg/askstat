// Adapter-batteriet, JS-siden (spec 2026-08-15 §3): bygg URL-ene via samme
// oversettelse som direktivveien bruker, hent LIVE, assert ikke-tomt
// (assertHarDatarader-kontrakten). Kjøres KUN med ASKSTAT_LIVE=1:
//   ASKSTAT_LIVE=1 node --test tests/js/adapter-battery.test.js
// Scope-notat: translateCanonical løser eurostat/pxweb helt selv (ren
// funksjon), men for sdmx returnerer den kun needsSdmxKey — selve
// nøkkelbyggingen (CSV-header-probe + sdmxKeyDims/sdmxKeyPath) skjer i
// js/data-loader.js/js/api-kinds.js, som er DOM/fetch-orkestrering, ikke
// en ren oversettelsesfunksjon. Interfaces-kontrakten for denne taska
// (task-3-brief.md) lister kun translateCanonical + PX.dataUrl/
// PX.eurostatDataUrl — batteriet holder seg derfor til pxweb/eurostat her;
// sdmx/oecd/norgesbank-casene dekkes av Python-batteriet (samme kilder,
// samme fasit — spec §4 paritetsprinsippet gjelder mellom kind-grenene,
// ikke nødvendigvis identisk case-dekning per fil).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../../js/data-directives.js');
const PX = require('../../js/pxweb.js');
const DD = globalThis.DataDirectives;
const LIVE = !!process.env.ASKSTAT_LIVE;

test('eurostat flerland via translateCanonical gir data live', { skip: !LIVE && 'sett ASKSTAT_LIVE=1' }, async () => {
  const tr = DD.translateCanonical('eurostat', 'ei_lmhr_m', {
    filters: { geo: ['DK', 'FI', 'IS', 'NO', 'SE'], s_adj: 'SA' },
    years: { from: '2024', to: '2026' },
  });
  assert.ok(!tr.error, tr.error);
  const base = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ei_lmhr_m';
  const url = PX.eurostatDataUrl(base + '?' + tr.params.join('&'));
  const res = await fetch(url);
  assert.equal(res.ok, true);
  const ds = await res.json();
  const cols = PX.columnsFromJsonStat(ds);
  assert.ok((cols.value || []).some((v) => v !== null), 'stille tomt — kommaform-regresjonen?');
});

test('ssb kommuneserie via translateCanonical gir data live', { skip: !LIVE && 'sett ASKSTAT_LIVE=1' }, async () => {
  const tr = DD.translateCanonical('pxweb', '07459', {
    regions: ['0301'], indicators: ['Personer1'],
    years: { from: '2015', to: '2024' },
  });
  assert.ok(!tr.error, tr.error);
  const url = PX.dataUrl('https://data.ssb.no/api/pxwebapi/v2/tables/07459?' + tr.params.join('&'));
  const res = await fetch(url);
  assert.equal(res.ok, true);
  const ds = await res.json();
  const cols = PX.columnsFromJsonStat(ds);
  assert.ok((cols.value || []).some((v) => v !== null));
});
