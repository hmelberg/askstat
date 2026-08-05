// i18n.js — UI-språkmekanisme. To nøkkelspråk lever side om side (spec
// 2026-08-05-sprak-pakker-deling §4): editorens historiske NORSKE nøkler og
// ask-visningens ENGELSKE nøkler. t()/applyTranslations bryr seg ikke om
// nøkkelspråket — de slår opp i M2PY_I18N[lang] med fallbackkjede
// lang → en → nøkkel. Unntak: lang='no' faller ALDRI til en (norsk er
// kildespråk for editoren; en-fallback ville gjort norsk UI engelsk).
// Nytt språk = legg til i SUPPORTED + egen ordbok js/i18n/<kode>.js.
(function (global) {
  'use strict';

  var SUPPORTED = ['no', 'en', 'da', 'sv', 'fi', 'is', 'de', 'fr', 'es', 'pt', 'zh', 'ja', 'hi'];

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  // Ren kjerne (node-testet): locale-default. Lagret valg → språkdelen av
  // navigator-locale → 'en'. Reverserer engelsk-først-valget fra 2026-07-29:
  // nettleserspråket STYRER nå defaulten når vi har oversettelsen.
  function detectLang(opts) {
    var supported = (opts && opts.supported) || SUPPORTED;
    var stored = opts && opts.stored;
    if (supported.indexOf(stored) !== -1) return stored;
    var nav = String((opts && opts.nav) || '');
    var lang = nav.split(/[-_]/)[0].toLowerCase();
    if (supported.indexOf(lang) !== -1) return lang;
    return 'en';
  }

  // Ren kjerne (node-testet): oppslag m/fallbackkjede + {param}-interpolasjon.
  function translate(key, opts) {
    var dicts = (opts && opts.dicts) || {};
    var lang = opts && opts.lang;
    var s = key;
    var d = dicts[lang];
    if (d && hasOwn(d, key)) s = d[key];
    else if (lang !== 'no' && lang !== 'en' && dicts.en && hasOwn(dicts.en, key)) s = dicts.en[key];
    else if (lang === 'en' && dicts.en && hasOwn(dicts.en, key)) s = dicts.en[key];
    var params = opts && opts.params;
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return hasOwn(params, k) ? params[k] : m;
      });
    }
    return s;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectLang: detectLang, translate: translate };
  }

  if (typeof global.document === 'undefined') return; // node: kun ren kjerne

  var window = global;
  var LANG_KEY = 'microdata_ui_lang';
  var STASH_KEY = 'm2py_lang_stash';

  window.M2PY_LANGS = SUPPORTED;

  var stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch (e) {}
  var LANG = detectLang({
    stored: stored,
    nav: (typeof navigator !== 'undefined' && navigator.language) || '',
    supported: SUPPORTED,
  });
  window.M2PY_LANG = LANG;
  try { document.documentElement.lang = LANG; } catch (e) {}

  // Ordbok-lasting: en.js lastes alltid statisk (fallback-ordboka for
  // editor-nøklene); aktivt språk ≠ no/en får ordboka si injisert her.
  // Kjører den etter DOMContentLoaded re-appliseres oversettelsene (idempotent).
  if (LANG !== 'en' && LANG !== 'no') loadDict(LANG);
  if (LANG === 'no') loadDict('no'); // norsk ordbok dekker ask-visningens engelske nøkler
  function loadDict(lang) {
    try {
      var s = document.createElement('script');
      s.src = 'js/i18n/' + lang + '.js';
      s.onload = function () {
        if (window.applyTranslations) window.applyTranslations(document);
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  function normKey(s) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.normalize ? s.normalize('NFC') : s;
  }

  function debugOn() {
    try { return localStorage.getItem('m2py_i18n_debug') === '1'; } catch (e) { return false; }
  }
  window.__i18nMissing = window.__i18nMissing || new Set();

  function lookupChain(key) {
    var dicts = window.M2PY_I18N || {};
    var d = dicts[LANG];
    if (d && hasOwn(d, key)) return d[key];
    if (LANG !== 'no' && LANG !== 'en' && dicts.en && hasOwn(dicts.en, key)) return dicts.en[key];
    return null;
  }

  // t('Kunne ikke åpne: {msg}', { msg: e.message }) — {navn}-plassholdere
  // erstattes også i fallbacken, så kildeteksten fungerer uten oversettelse.
  window.t = function (key, params) {
    var val = lookupChain(key);
    var s = val !== null ? val : key;
    if (val === null && LANG !== 'no' && debugOn()) window.__i18nMissing.add(key);
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return hasOwn(params, k) ? params[k] : m;
      });
    }
    return s;
  };

  // Oversetter statisk markup merket med data-i18n-attributter. Nøkkelen leses
  // fra DOM-en (entiteter er allerede dekodet). Idempotent: etter oversettelse
  // finnes ikke kildeteksten som nøkkel lenger, så nye kjøringer er no-op.
  // Norsk er IKKE lenger ren no-op: ask-visningens engelske nøkler skal
  // oversettes også til norsk (editor-nøklene finnes ikke i no-ordboka og
  // står urørt på norsk).
  window.applyTranslations = function (root) {
    root = root || document;
    var i, el, key, val;

    var textEls = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < textEls.length; i++) {
      el = textEls[i];
      key = normKey(el.textContent);
      val = lookupChain(key);
      if (val !== null) el.textContent = val;
      else if (key && LANG !== 'no' && debugOn()) window.__i18nMissing.add(key);
    }

    var htmlEls = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < htmlEls.length; i++) {
      el = htmlEls[i];
      key = normKey(el.textContent);
      val = lookupChain(key);
      if (val !== null) el.innerHTML = val; // verdier forfattes i repoet (js/i18n/*.js)
      else if (key && LANG !== 'no' && debugOn()) window.__i18nMissing.add(key);
    }

    // data-i18n-q: eksempelspørsmålenes data-q-payload (selve spørsmålet som
    // sendes) oversettes også — svarspråket følger spørsmålet, med vilje.
    var attrs = [['data-i18n-title', 'title'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria', 'aria-label'], ['data-i18n-q', 'data-q']];
    for (var a = 0; a < attrs.length; a++) {
      var marked = root.querySelectorAll('[' + attrs[a][0] + ']');
      for (i = 0; i < marked.length; i++) {
        el = marked[i];
        key = normKey(el.getAttribute(attrs[a][1]) || '');
        if (!key) continue;
        val = lookupChain(key);
        if (val !== null) el.setAttribute(attrs[a][1], val);
        else if (LANG !== 'no' && debugOn()) window.__i18nMissing.add(key);
      }
    }
  };

  // Hjelper for objekter med parallelle feltoversettelser, f.eks.
  // i18nField(help, 'description') → help.description_en på engelsk (om satt).
  window.i18nField = function (obj, field) {
    if (!obj) return undefined;
    if (LANG !== 'no' && obj[field + '_' + LANG]) return obj[field + '_' + LANG];
    return obj[field];
  };

  // Språkbytte: lagre valget, ta vare på editorinnholdet (ingen autosave i
  // appen!) og last siden på nytt. Reload gir konsistent UI via vanlig boot —
  // også pakke-auto-forslaget (js/packs.js boot leser lagret språk + locale).
  window.m2pySetLang = function (lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    if (lang === LANG) return;
    try {
      var si = document.getElementById('scriptInput');
      var sn = document.getElementById('scriptName');
      sessionStorage.setItem(STASH_KEY, JSON.stringify({
        script: si ? si.value : '',
        name: sn ? sn.value : ''
      }));
    } catch (e) {}
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    location.reload();
  };

  function restoreStash() {
    var raw = null;
    try {
      raw = sessionStorage.getItem(STASH_KEY);
      if (raw !== null) sessionStorage.removeItem(STASH_KEY);
    } catch (e) {}
    if (raw === null) return;
    try {
      var data = JSON.parse(raw);
      var si = document.getElementById('scriptInput');
      var sn = document.getElementById('scriptName');
      if (si && typeof data.script === 'string') {
        si.value = data.script;
        si.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (sn && typeof data.name === 'string') sn.value = data.name;
    } catch (e) {}
  }

  // Feilsøking: finn synlig norsk tekst som mangler oversettelse (kjør i konsollen
  // med engelsk UI): window.__i18nScan()
  window.__i18nScan = function () {
    var out = [];
    var no = /[æøåÆØÅ]/;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentElement;
      if (!p || p.closest('script, style, textarea, #outputArea')) continue;
      if (no.test(n.nodeValue) && p.offsetParent !== null) {
        out.push({ text: normKey(n.nodeValue), el: p });
      }
    }
    var attrEls = document.querySelectorAll('[title], [placeholder], [aria-label]');
    for (var i = 0; i < attrEls.length; i++) {
      var el = attrEls[i];
      ['title', 'placeholder', 'aria-label'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && no.test(v)) out.push({ attr: a, text: normKey(v), el: el });
      });
    }
    console.table(out.map(function (o) { return { where: o.attr || 'text', text: o.text.slice(0, 90) }; }));
    return out;
  };

  // Pass 1 kjøres umiddelbart (markupen over <script>-taggene er allerede
  // parset); pass 2 på DOMContentLoaded tar markupen etter (modaler nederst);
  // dict-onload gir et ev. pass 3 (idempotent).
  window.applyTranslations(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.applyTranslations(document); });
  }
  if (document.readyState === 'complete') setTimeout(restoreStash, 0);
  else window.addEventListener('load', function () { setTimeout(restoreStash, 0); });
})(typeof window !== 'undefined' ? window : globalThis);
