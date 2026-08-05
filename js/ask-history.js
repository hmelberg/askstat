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
    var listeners = [];
    function fire() {
      listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
    }
    function isLive(e) { return e && !e.deleted; }
    function liveIdsNewestFirst(doc) {
      return Object.keys(doc.entries).filter(function (id) { return isLive(doc.entries[id]); })
        .sort(function (a, b) {
          return doc.entries[a].ts < doc.entries[b].ts ? 1 : -1;
        });
    }
    function evict(doc) {
      var order = liveIdsNewestFirst(doc);
      while (order.length > MAX_ENTRIES ||
             (order.length && JSON.stringify(doc).length > MAX_BYTES)) {
        delete doc.entries[order.pop()]; // pop = eldste levende
      }
    }
    // Tombstones (fase 2-synk): sletting vinner på tvers av enheter; prunes
    // etter 90 dager.
    function pruneTombstones(doc) {
      var cutoff;
      try { cutoff = new Date(new Date(now()).getTime() - 90 * 86400000).toISOString(); }
      catch (e) { return; } // prune er husarbeid — aldri i veien for lagring
      Object.keys(doc.entries).forEach(function (id) {
        var e = doc.entries[id];
        if (e && e.deleted && String(e.updated || '') < cutoff) delete doc.entries[id];
      });
    }
    function writeDoc(doc, opts) {
      pruneTombstones(doc);
      evict(doc);
      try {
        storage.setItem(LS, JSON.stringify(doc));
      } catch (e) { // kvote: kast eldste, prøv ÉN gang til, deretter stille
        var order = liveIdsNewestFirst(doc);
        if (!order.length) return;
        delete doc.entries[order.pop()];
        try { storage.setItem(LS, JSON.stringify(doc)); } catch (e2) {}
      }
      if (!opts || !opts.silent) fire();
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
        return liveIdsNewestFirst(doc).map(function (i) { return doc.entries[i]; });
      },
      get: function (id) {
        var e = readDoc().entries[id];
        return isLive(e) ? e : null;
      },
      remove: function (id) {
        var doc = readDoc();
        if (!doc.entries[id]) return;
        doc.entries[id] = { id: id, ts: doc.entries[id].ts || now(), deleted: true, updated: now() };
        writeDoc(doc);
      },
      clear: function () {
        var doc = readDoc();
        var ts = now();
        Object.keys(doc.entries).forEach(function (id) {
          if (isLive(doc.entries[id])) {
            doc.entries[id] = { id: id, ts: doc.entries[id].ts, deleted: true, updated: ts };
          }
        });
        writeDoc(doc);
      },
      onChange: function (cb) { listeners.push(cb); },
      // Fase 2-synk (konto-sync.js): serveren får ALDRI markdown-feltet
      // (spec: question+kode+metadata; svarteksten er lokal cache). Merge =
      // union per id, nyeste `updated` vinner, LIKHET → lokal (bevarer lokal
      // markdown). Skriver stille — synken pusher selv.
      exportDoc: function (opts) {
        var doc = readDoc();
        if (!opts || !opts.stripMarkdown) return doc;
        var out = { v: 1, entries: {} };
        Object.keys(doc.entries).forEach(function (id) {
          var e = Object.assign({}, doc.entries[id]);
          delete e.markdown;
          out.entries[id] = e;
        });
        return out;
      },
      mergeRemote: function (remoteDoc) {
        if (!remoteDoc || remoteDoc.v !== 1 || typeof remoteDoc.entries !== 'object') return false;
        var doc = readDoc();
        var changed = false;
        Object.keys(remoteDoc.entries || {}).forEach(function (id) {
          var r = remoteDoc.entries[id];
          var l = doc.entries[id];
          if (!r) return;
          if (!l || String(r.updated || '') > String(l.updated || '')) {
            doc.entries[id] = r;
            changed = true;
          }
        });
        if (changed) writeDoc(doc, { silent: true });
        return changed;
      },
    };
  }

  if (global.localStorage) global.AskHistory = makeStore(global.localStorage);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeStore: makeStore, MAX_ENTRIES: MAX_ENTRIES, MAX_BYTES: MAX_BYTES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
