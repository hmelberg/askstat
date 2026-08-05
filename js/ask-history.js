// js/ask-history.js — lokal spørrehistorikk for ask-visningen
// (spec 2026-08-05-konto-runden §Fase 1a). Ren lagringsmodul uten DOM —
// ask-view.js eier all rendering/gjenoppretting. Best-effort: feil her
// skal aldri nå svar-flyten. `updated` = ts i fase 1 (endres først ved
// tombstoning i fase 2-synken).
(function (global) {
  'use strict';
  var LS = 'md_ask_history';
  var MAX_ENTRIES = 50;
  var MAX_BYTES = 2 * 1024 * 1024;

  function makeStore(storage, opts) {
    var now = (opts && opts.now) || function () { return new Date().toISOString(); };
    var newId = (opts && opts.newId) || function () {
      return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'h' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };
    function readDoc() {
      try {
        var doc = JSON.parse(storage.getItem(LS) || 'null');
        if (doc && doc.v === 1 && doc.entries && typeof doc.entries === 'object') return doc;
      } catch (e) {}
      return { v: 1, entries: {} };
    }
    function idsNewestFirst(doc) {
      return Object.keys(doc.entries).sort(function (a, b) {
        return doc.entries[a].ts < doc.entries[b].ts ? 1 : -1;
      });
    }
    function evict(doc) {
      var order = idsNewestFirst(doc);
      while (order.length > MAX_ENTRIES ||
             (order.length && JSON.stringify(doc).length > MAX_BYTES)) {
        delete doc.entries[order.pop()]; // pop = eldste
      }
    }
    function writeDoc(doc) {
      evict(doc);
      try {
        storage.setItem(LS, JSON.stringify(doc));
      } catch (e) { // kvote: kast eldste, prøv ÉN gang til, deretter stille
        var order = idsNewestFirst(doc);
        if (!order.length) return;
        delete doc.entries[order.pop()];
        try { storage.setItem(LS, JSON.stringify(doc)); } catch (e2) {}
      }
    }
    return {
      save: function (fields) {
        var doc = readDoc();
        var id = newId();
        var ts = now();
        doc.entries[id] = Object.assign({}, fields, { id: id, ts: ts, updated: ts });
        writeDoc(doc);
        return id;
      },
      list: function () {
        var doc = readDoc();
        return idsNewestFirst(doc).map(function (i) { return doc.entries[i]; });
      },
      get: function (id) { return readDoc().entries[id] || null; },
      remove: function (id) {
        var doc = readDoc();
        delete doc.entries[id];
        writeDoc(doc);
      },
      clear: function () { try { storage.removeItem(LS); } catch (e) {} },
    };
  }

  if (global.localStorage) global.AskHistory = makeStore(global.localStorage);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeStore: makeStore, MAX_ENTRIES: MAX_ENTRIES, MAX_BYTES: MAX_BYTES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
