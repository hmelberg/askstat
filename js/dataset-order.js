// js/dataset-order.js — DatasetOrder: deler datasett-info i {active, stale}
// basert på hvert datasetts `runtime` mot aktiv editor-runtime. Konsumeres av
// updateSidebarDatasets (index.html) for å sortere stale datasett nederst og
// grå dem ut. Ren logikk — ingen DOM.
// Spec: .superpowers/sdd/task-5-brief.md — Task 5.
(function (global) {
  'use strict';

  // order(info, activeRuntime) -> {active: [navn…], stale: [navn…]}.
  // Udefinert entry.runtime regnes som 'python' (samme konvensjon som
  // nonPyRuntime/isPyRuntime i index.html). Begge lister beholder info-ens
  // opprinnelige Object.keys-rekkefølge.
  function order(info, activeRuntime) {
    var active = [];
    var stale = [];
    Object.keys(info || {}).forEach(function (name) {
      var rt = (info[name] && info[name].runtime) || 'python';
      (rt === activeRuntime ? active : stale).push(name);
    });
    return { active: active, stale: stale };
  }

  global.DatasetOrder = { order: order };
})(typeof window !== 'undefined' ? window : globalThis);
