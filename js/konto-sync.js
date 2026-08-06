// js/konto-sync.js — kontosynk (konto-runden fase 2, spec 2026-08-05 §Fase 2c).
// Tre dokumenter mot /userdoc/:name i microdata-api:
//   profiles  — klartekst, union-by-id + tombstones (Profiles.mergeRemote)
//   history   — klartekst MEN markdown strippes før push (svartekst = lokal
//               cache; server får question+kode+metadata)
//   askkeys   — HELE md_keys kryptert (keys-crypto.js) under KEK avledet av
//               login-koden; whole-doc newest-wins på blob.updated
// Alt er best-effort: feil logges stille og blokkerer ALDRI ask-flyten.
// Push-on-change er debounced; full merge skjer ved login/boot (syncNow).
// POST-kappløp mellom enheter repareres av union-merge ved neste pull.
(function (global) {
  'use strict';

  var _debounceMs = 1500;
  var _timers = {};
  var _last = {};
  var _deps = null;

  function deps() {
    return _deps || {
      auth: global.mdAuth,
      keys: global.Keys,
      profiles: global.Profiles,
      history: global.AskHistory,
      crypto: global.KeysCrypto,
      kekPrompt: global.mdKekPrompt,
      fetchImpl: global.fetch ? global.fetch.bind(global) : null,
      storage: (function () { try { return global.localStorage; } catch (e) { return null; } })(),
      onUnauthorized: function () {
        if (global.mdAuth && global.mdAuth.logoutLocal) global.mdAuth.logoutLocal();
      },
    };
  }
  function active(d) {
    return !!(d.auth && d.auth.isLoggedIn && d.auth.user && d.auth.user.email &&
      d.fetchImpl && d.profiles && d.history && d.keys);
  }
  function base(d) { return String(d.auth.apiBase()).replace(/\/+$/, ''); }
  function hdrs(d) { return { 'Authorization': 'Bearer ' + d.auth.token }; }

  // Kanonisk sammenligning (nøkkelrekkefølge-uavhengig) for push-beslutningen.
  function stableStringify(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(x).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(x[k]);
    }).join(',') + '}';
  }

  async function getDoc(d, name) {
    var res = await d.fetchImpl(base(d) + '/_/api/userdoc/' + name, { headers: hdrs(d) });
    if (res.status === 401) { d.onUnauthorized(); throw new Error('401'); }
    if (!res.ok) throw new Error('userdoc GET ' + name + ' -> ' + res.status);
    return res.json();
  }
  async function postDoc(d, name, docObj) {
    var res = await d.fetchImpl(base(d) + '/_/api/userdoc/' + name, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs(d)),
      body: JSON.stringify({ doc: JSON.stringify(docObj) }),
    });
    if (res.status === 401) { d.onUnauthorized(); throw new Error('401'); }
    if (!res.ok) throw new Error('userdoc POST ' + name + ' -> ' + res.status);
  }

  function entryMap(doc) { return (doc && (doc.entries || doc.profiles)) || {}; }

  async function syncMerged(d, name, store, exportOpts) {
    var remote = await getDoc(d, name);
    var remoteDoc = null;
    if (remote.doc) { try { remoteDoc = JSON.parse(remote.doc); } catch (e) {} }
    if (remoteDoc) store.mergeRemote(remoteDoc);
    var out = store.exportDoc(exportOpts);
    // out.packs: manuelt kildepakke-valg skal synkes også uten profiler
    if (!remoteDoc && !Object.keys(entryMap(out)).length && !out.packs) return 'uptodate';
    if (remoteDoc && stableStringify(out) === stableStringify(remoteDoc)) return 'uptodate';
    await postDoc(d, name, out);
    return 'pushed';
  }

  async function pushKeys(d, kekHex, kekIdStr) {
    var blob = await d.crypto.encryptDoc(d.keys.getAll(), kekHex, kekIdStr,
      d.keys.updatedAt() || new Date().toISOString());
    await postDoc(d, 'askkeys', blob);
  }

  async function syncKeys(d) {
    if (!d.crypto) return 'no-crypto';
    var kek = d.storage ? d.storage.getItem('md_kek') : null;
    var kekIdLocal = d.storage ? d.storage.getItem('md_kek_id') : null;
    var remote = await getDoc(d, 'askkeys');
    var blob = null;
    if (remote.doc) { try { blob = JSON.parse(remote.doc); } catch (e) {} }
    var localUpdated = d.keys.updatedAt() || '';

    if (blob && blob.v === 'ask1' && String(blob.updated || '') > localUpdated) {
      // Pull: prøv cached KEK; kekId-mismatch/feil → rotasjonsprompt (spec:
      // «enter the login code these keys were saved with» m/skip-fallback).
      var obj = null;
      if (kek && (!blob.kekId || !kekIdLocal || blob.kekId === kekIdLocal)) {
        obj = await d.crypto.decryptDoc(blob, kek);
      }
      if (obj == null && d.kekPrompt) {
        var prompted = await d.kekPrompt(blob.kekId || '');
        if (prompted) obj = await d.crypto.decryptDoc(blob, prompted);
      }
      if (obj == null) return 'kek-mismatch';
      d.keys.replaceAll(obj, blob.updated);
      // Blob lå under en ANNEN kode: re-krypter under gjeldende kode så
      // rotasjonen leger seg selv (spec §Fase 2c).
      if (kek && kekIdLocal && blob.kekId && blob.kekId !== kekIdLocal) {
        await pushKeys(d, kek, kekIdLocal);
      }
      return 'pulled';
    }
    if (localUpdated && (!blob || localUpdated > String(blob.updated || ''))) {
      if (!kek || !kekIdLocal) return 'no-kek';
      await pushKeys(d, kek, kekIdLocal);
      return 'pushed';
    }
    return 'uptodate';
  }

  async function syncNow() {
    var d = deps();
    if (!active(d)) { _last = { off: true }; return 'off'; }
    var jobs = [
      ['profiles', function () { return syncMerged(d, 'profiles', d.profiles); }],
      ['history', function () { return syncMerged(d, 'history', d.history, { stripMarkdown: true }); }],
      ['askkeys', function () { return syncKeys(d); }],
    ];
    for (var i = 0; i < jobs.length; i++) {
      try {
        _last[jobs[i][0]] = await jobs[i][1]();
      } catch (e) {
        _last[jobs[i][0]] = 'error';
        try { console.warn('[konto-sync]', jobs[i][0], e && e.message); } catch (e2) {}
      }
    }
    delete _last.off;
    return _last;
  }

  async function pushOne(name) {
    var d = deps();
    if (!active(d)) return;
    try {
      if (name === 'askkeys') {
        var kek = d.storage ? d.storage.getItem('md_kek') : null;
        var kekIdStr = d.storage ? d.storage.getItem('md_kek_id') : null;
        if (kek && kekIdStr && d.crypto) await pushKeys(d, kek, kekIdStr);
      } else if (name === 'profiles') {
        await postDoc(d, 'profiles', d.profiles.exportDoc());
      } else {
        await postDoc(d, 'history', d.history.exportDoc({ stripMarkdown: true }));
      }
      _last[name] = 'pushed';
    } catch (e) {
      _last[name] = 'error';
      try { console.warn('[konto-sync]', name, e && e.message); } catch (e2) {}
    }
  }
  function schedulePush(name) {
    var d = deps();
    if (!active(d)) return;
    if (_timers[name]) clearTimeout(_timers[name]);
    _timers[name] = setTimeout(function () {
      _timers[name] = null;
      pushOne(name);
    }, _debounceMs);
  }

  function onLogin(code) {
    var d = deps();
    var p = Promise.resolve();
    if (code && d.crypto && d.storage && d.auth && d.auth.user && d.auth.user.email) {
      p = Promise.all([
        d.crypto.deriveKekHex(code, d.auth.user.email),
        d.crypto.kekId(code),
      ]).then(function (r) {
        try {
          d.storage.setItem('md_kek', r[0]);
          d.storage.setItem('md_kek_id', r[1]);
        } catch (e) {}
      }).catch(function () {});
    }
    return p.then(syncNow);
  }

  function onLogout() {
    Object.keys(_timers).forEach(function (k) {
      if (_timers[k]) { clearTimeout(_timers[k]); _timers[k] = null; }
    });
    var d = deps();
    // KEK slettes ved logout (strammere; ny login gir ny avledning).
    // Lagrene røres IKKE — logout beholder lokale data (spec §Fase 2a).
    try {
      if (d.storage) { d.storage.removeItem('md_kek'); d.storage.removeItem('md_kek_id'); }
    } catch (e) {}
  }

  function status() { return Object.assign({}, _last); }
  function _configure(overrides, debounceMs) {
    _deps = overrides || null;
    if (debounceMs != null) _debounceMs = debounceMs;
  }

  // Push-on-change (kun i browser; testene bruker _configure + pushOne).
  if (typeof document !== 'undefined') {
    var wire = function () {
      if (global.Keys && global.Keys.onChange) global.Keys.onChange(function () { schedulePush('askkeys'); });
      if (global.Profiles && global.Profiles.onChange) global.Profiles.onChange(function () { schedulePush('profiles'); });
      if (global.AskHistory && global.AskHistory.onChange) global.AskHistory.onChange(function () { schedulePush('history'); });
      syncNow(); // token ligger alt i localStorage (login.js) → hent nyeste
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else setTimeout(wire, 0);
  }

  global.KontoSync = {
    onLogin: onLogin, onLogout: onLogout, syncNow: syncNow, status: status,
    pushOne: pushOne, _configure: _configure,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.KontoSync;
})(typeof window !== 'undefined' ? window : globalThis);
