// js/keys-crypto.js — krypto for nøkkelsynk (konto-runden fase 2, spec
// 2026-08-05 §Fase 2c). KEK = PBKDF2-600k(login-koden, salt=email) → AES-GCM
// over hele md_keys-dokumentet; serveren lagrer kun blobben. normalizeCode
// SPEILER serverens auth_hash.normalize_code (microdata-api) byte for byte —
// endres reglene der, endres de her. kekId = første 8 hex av SHA-256(koden)
// (serveren har allerede full kodehash — avslører ingenting nytt).
(function (global) {
  'use strict';
  var ITERATIONS = 600000;

  function makeKeysCrypto(cryptoObj) {
    var subtle = cryptoObj.subtle;
    var enc = new TextEncoder();

    function normalizeCode(raw) {
      return String(raw == null ? '' : raw).toLowerCase().trim()
        .replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function bufToHex(buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    function hexToBuf(hex) {
      var a = new Uint8Array(hex.length / 2);
      for (var i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
      return a;
    }
    function bufToB64(buf) {
      var bytes = new Uint8Array(buf);
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    }
    function b64ToBuf(b64) {
      var s = atob(b64);
      var a = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      return a;
    }

    function kekId(code) {
      return subtle.digest('SHA-256', enc.encode(normalizeCode(code)))
        .then(function (d) { return bufToHex(d).slice(0, 8); });
    }
    function deriveKekHex(code, email) {
      return subtle.importKey('raw', enc.encode(normalizeCode(code)), 'PBKDF2',
        false, ['deriveBits'])
        .then(function (material) {
          return subtle.deriveBits({
            name: 'PBKDF2',
            salt: enc.encode(String(email || '').toLowerCase().trim()),
            iterations: ITERATIONS,
            hash: 'SHA-256',
          }, material, 256);
        })
        .then(bufToHex);
    }
    function importAesKey(kekHex, usages) {
      return subtle.importKey('raw', hexToBuf(kekHex), 'AES-GCM', false, usages);
    }
    function encryptDoc(obj, kekHex, kekIdStr, nowIso) {
      var iv = cryptoObj.getRandomValues(new Uint8Array(12));
      return importAesKey(kekHex, ['encrypt'])
        .then(function (key) {
          return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key,
            enc.encode(JSON.stringify(obj)));
        })
        .then(function (ct) {
          return {
            v: 'ask1',
            ct: bufToB64(ct),
            iv: bufToB64(iv.buffer),
            kekId: kekIdStr,
            updated: nowIso || new Date().toISOString(),
          };
        });
    }
    function decryptDoc(blob, kekHex) {
      return importAesKey(kekHex, ['decrypt'])
        .then(function (key) {
          return subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(blob.iv) }, key,
            b64ToBuf(blob.ct));
        })
        .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); })
        .catch(function () { return null; });
    }

    return {
      normalizeCode: normalizeCode,
      kekId: kekId,
      deriveKekHex: deriveKekHex,
      encryptDoc: encryptDoc,
      decryptDoc: decryptDoc,
    };
  }

  if (global.crypto && global.crypto.subtle) {
    global.KeysCrypto = makeKeysCrypto(global.crypto);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeKeysCrypto: makeKeysCrypto };
  }
})(typeof window !== 'undefined' ? window : globalThis);
