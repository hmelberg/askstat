// js/kilde-forslag.js — forslagsbasert forbedring av egendefinerte
// kildebeskrivelser (spec docs/superpowers/specs/2026-08-13-kildeforbedring-
// egne-kilder-design.md). Ren kjerne først (node-testet): payloadbygger
// m/obligatorisk scrub (§2), svarparser, linjediff, knappevilkår.
// DOM-delen (modal, knapp) nederst — bailer i node.
(function (global) {
  'use strict';

  // Caps fra spec §2 — speiler telemetri-tallene i js/feil-telemetri.js.
  var CAPS = {
    DOC: 40000, NAVN: 200, SPORSMAL: 4000, TOLKNING: 2000,
    SCRIPT: 20000, ERROR: 4000, TRACE: 4000, SOURCES: 60,
    HIST_FORSLAG: 45000, HIST_TILBAKE: 4000, PAYLOAD_BYTES: 200000,
  };

  function klipp(s, n) { return String(s == null ? '' : s).slice(0, n); }
  // UTF-8-byte-lengde — norsk tekst (æøå) gjør .length-basert taking
  // løgnaktig trygg (samme lærdom som js/feil-telemetri.js).
  function byteLengde(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }

  function byggForslagsPayload(inn, deps) {
    inn = inn || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) ||
      function (s) { return s; };
    var masker = (deps && deps.masker) ||
      (global.FeilTelemetri && global.FeilTelemetri.maskerNokler) ||
      function (s) { return s; };
    var p = {
      docs: (inn.docs || []).map(function (d) {
        return { id: String(d.id || ''), name: klipp(d.name, CAPS.NAVN), text: klipp(d.text, CAPS.DOC) };
      }),
      question: klipp(inn.question, CAPS.SPORSMAL),
      tolkning: klipp(inn.tolkning, CAPS.TOLKNING),
      mode: inn.mode || '',
      depth: inn.depth || '',
      runs: (inn.runs || []).map(function (r) {
        return { script: klipp(scrub(r.script), CAPS.SCRIPT), error: klipp(masker(r.error), CAPS.ERROR) };
      }),
      ok_script: inn.ok_script ? klipp(scrub(inn.ok_script), CAPS.SCRIPT) : undefined,
      trace: klipp(masker((inn.trace || []).join('\n')), CAPS.TRACE) || undefined,
      sources: (inn.sources || []).slice(0, CAPS.SOURCES),
      history: (inn.history || []).map(function (h) {
        return { forslag_raatekst: klipp(h.forslag_raatekst, CAPS.HIST_FORSLAG),
                 tilbakemelding: klipp(masker(h.tilbakemelding), CAPS.HIST_TILBAKE) };
      }),
      ui_lang: inn.ui_lang || 'en',
    };
    // Budsjett (spec §2): dropp ELDSTE runs først, så trace — docs ALDRI.
    while (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.runs.length) p.runs.shift();
    if (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.trace) delete p.trace;
    return p;
  }

  // Vilkår for forbedringsknappen (spec §1): egne kilder aktive OG friksjon
  // (minst én feilet kjøring ELLER minst ett forkastet resonneringstrinn).
  function skalViseKnapp(ctx) {
    if (!ctx) return false;
    var harKilder = (ctx.docs || []).length >= 1;
    var friksjon = (ctx.runs || []).length >= 1 || (ctx.kastedeTurer | 0) >= 1;
    return !!(harKilder && friksjon);
  }

  var api = {
    byggForslagsPayload: byggForslagsPayload,
    skalViseKnapp: skalViseKnapp,
    _CAPS: CAPS,
  };
  global.KildeForslag = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof global.document === 'undefined') return; // node: kun ren kjerne
  // DOM-delen kommer i senere tasks (registerRun/openModal).
})(typeof window !== 'undefined' ? window : globalThis);
