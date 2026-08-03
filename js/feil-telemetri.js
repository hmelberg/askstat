// js/feil-telemetri.js — feilrapportering fra ask-flyten til Anvil
// (spec docs/superpowers/specs/2026-08-03-datasok-og-nedlasting-v1-design.md
// §1a). KUN feil sendes; fire-and-forget: egne feil svelges, ask-flyten
// bremses aldri. Endepunktet er dumt (lagrer rå JSON) — all analyse offline.
(function (global) {
  'use strict';

  var FEIL_URL = 'https://mdataapi.anvil.app/_/api/feil';
  var MAX_ERROR_CHARS = 4000;      // per run og for flow_error
  var MAX_SCRIPT_CHARS = 20000;    // per run
  var MAX_PAYLOAD_BYTES = 200000;  // matcher Anvil-sidens MAX_BYTES

  function klipp(s, n) { return String(s == null ? '' : s).slice(0, n); }

  // Ren og node-testbar. deps.scrub injiseres i test; produksjon bruker
  // DataDirectives.scrubKeys (aldri nøkler i telemetri — husregel).
  function byggFeilrapport(inn, deps) {
    inn = inn || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) ||
      function (s) { return s; };
    var rapport = {
      app: 'askstat',
      ts: new Date().toISOString(),
      version: inn.version || '',
      ui_lang: inn.ui_lang || '',
      mode: inn.mode || '',
      route: inn.route || '',
      depth: inn.depth || '',
      question: klipp(inn.question, 4000),
      tolkning: klipp(inn.tolkning, 2000),
      runs: (inn.runs || []).map(function (r) {
        return { script: klipp(scrub(r.script), MAX_SCRIPT_CHARS),
                 error: klipp(r.error, MAX_ERROR_CHARS) };
      }),
      flow_error: klipp(inn.flow_error, MAX_ERROR_CHARS) || undefined,
      final_ok: !!inn.final_ok,
      probed_sources: (inn.probed_sources || []).slice(0, 60),
      provider_type: inn.provider_type || 'anthropic',
    };
    // Størrelsestak: dropp ELDSTE runs til payloaden er under taket —
    // metadata + nyeste feil er mer verdt enn komplett scripthistorikk.
    while (JSON.stringify(rapport).length > MAX_PAYLOAD_BYTES && rapport.runs.length) {
      rapport.runs.shift();
    }
    return rapport;
  }

  function sendFeilrapport(inn) {
    try {
      var rapport = byggFeilrapport(inn);
      fetch(FEIL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rapport),
        keepalive: true,
      }).catch(function () { /* telemetri feiler stille */ });
    } catch (e) { /* aldri knekk flyten */ }
  }

  var api = { byggFeilrapport: byggFeilrapport, sendFeilrapport: sendFeilrapport };
  global.FeilTelemetri = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
