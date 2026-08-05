// Felles klient-side nøkkellager (spec 2026-07-23-user-keys-and-source-registry).
// Én localStorage-post (md_keys, JSON-objekt type→verdi). Bevisst uten
// kryptering LOKALT: trusselvurderingen (akseptert risiko, klient-only) står i
// spec-ens Decision log — nøkler holdes utenfor genererte script og prompter,
// men er lesbare for kode som kjører i siden, som før.
// Konto-runden fase 2 (spec 2026-08-05): onChange/getAll/replaceAll/updatedAt
// for synk — konto-sync.js krypterer HELE dokumentet (keys-crypto.js) før
// opplasting; replaceAll er pull-veien og fyrer IKKE onChange (push-løkke).
(function (global) {
  'use strict';
  var LS = 'md_keys';
  var LS_UPDATED = 'md_keys_updated';
  var listeners = [];

  function fire() {
    listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
  }
  function readAll() {
    try { return JSON.parse(global.localStorage.getItem(LS) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeAll(all) {
    global.localStorage.setItem(LS, JSON.stringify(all));
    try { global.localStorage.setItem(LS_UPDATED, new Date().toISOString()); } catch (e) {}
  }

  function get(type) { return readAll()[type] || ''; }
  function set(type, value) {
    var all = readAll();
    if (value) all[type] = value; else delete all[type];
    writeAll(all);
    fire();
  }
  function remove(type) { set(type, ''); }
  function registered() {
    var all = readAll();
    return Object.keys(all).filter(function (k) { return !!all[k]; });
  }
  function getAll() { return readAll(); }
  function replaceAll(obj, updatedIso) {
    global.localStorage.setItem(LS, JSON.stringify(obj || {}));
    try {
      if (updatedIso) global.localStorage.setItem(LS_UPDATED, updatedIso);
    } catch (e) {}
  }
  function updatedAt() {
    try { return global.localStorage.getItem(LS_UPDATED) || ''; } catch (e) { return ''; }
  }
  function onChange(cb) { listeners.push(cb); }

  // Engangsmigrering fra md_anthropic_key (før 2026-07-23).
  var legacy = global.localStorage.getItem('md_anthropic_key');
  if (legacy) {
    if (!get('anthropic')) set('anthropic', legacy);
    global.localStorage.removeItem('md_anthropic_key');
  }

  global.Keys = {
    get: get, set: set, remove: remove, registered: registered,
    getAll: getAll, replaceAll: replaceAll, updatedAt: updatedAt,
    onChange: onChange,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Keys;
})(typeof window !== 'undefined' ? window : globalThis);
