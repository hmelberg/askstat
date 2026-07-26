// js/comments.js — Comments: giscus (GitHub Discussions) kommentar-widget,
// ett tråd-mål (kilde/tabell[.variabel], samme mål-konvensjon som
// MetaInfo.commentUrl) av gangen, globalt, per de tre UI-flatene i
// planen (Task 2/3/4 bruker denne — ikke denne modulen selv).
// Spec: .superpowers/sdd/task-1-brief.md — Task 1.
// Ren logikk: attrs() er node-testbar (ingen DOM). open/close/isOpen toucher
// DOM og injiserer https://giscus.app/client.js LAZY — kun ved open(), aldri
// ved sideinnlasting.
(function (global) {
  'use strict';

  var CFG = {
    repo: 'hmelberg/openstat-metadata', repoId: 'R_kgDOTjfgng',
    category: 'Announcements', categoryId: 'DIC_kwDOTjfgns4DB9mu',
    clientJs: 'https://giscus.app/client.js'
  };

  // attrs(target, opts) -> giscus data-*-attributter. opts = {theme, lang}.
  // data-lang: giscus' lokalliste (per 2026) har IKKE norsk bokmål («no»/«nb») —
  // 'en' er derfor standarden her (ikke bare fallback for ugyldig verdi; en
  // bevisst produktbeslutning). Endre kun etter å ha bekreftet i giscus'
  // egen locale-liste at støtte er lagt til.
  function attrs(target, opts) {
    opts = opts || {};
    return {
      'data-repo': CFG.repo, 'data-repo-id': CFG.repoId,
      'data-category': CFG.category, 'data-category-id': CFG.categoryId,
      'data-mapping': 'specific', 'data-term': String(target || ''),
      'data-strict': '1', 'data-reactions-enabled': '1',
      'data-emit-metadata': '0', 'data-input-position': 'top',
      'data-theme': opts.theme || 'preferred_color_scheme',
      'data-lang': opts.lang || 'en', 'data-loading': 'lazy'
    };
  }

  // themeForApp() -> 'light'|'dark': leser body[data-theme] (app.css:5-6)
  // slik at kallsteder (Task 2-4) kan sende appens faktiske tema inn i
  // Comments.open(...) i stedet for giscus' hardkodede 'preferred_color_scheme'.
  // DOM-avhengig — ikke node-testbar; se tests/js/comments.test.js for
  // begrunnelse (kun typeof-sjekk der) og Task 5 for browser-smoke.
  function themeForApp() {
    try {
      var t = (typeof document !== 'undefined' && document.body)
        ? document.body.getAttribute('data-theme') : null;
      return t === 'dark' ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }

  // Kun ÉN åpen tråd globalt — open() lukker en ev. tidligere åpen tråd
  // (i en annen container) før den åpner den nye.
  var _openContainer = null;

  function close() {
    if (_openContainer) { _openContainer.innerHTML = ''; _openContainer = null; }
  }

  // open(container, target, opts) -> true. Lukker ev. åpen widget, tømmer
  // container, injiserer giscus' client.js med attributtene i containeren.
  function open(container, target, opts) {
    close();
    container.innerHTML = '';
    var s = (container.ownerDocument || document).createElement('script');
    s.src = CFG.clientJs; s.async = true;
    s.setAttribute('crossorigin', 'anonymous');
    var a = attrs(target, opts);
    for (var k in a) s.setAttribute(k, a[k]);
    container.appendChild(s);   // giscus erstatter script-tagen med iframe-widgeten
    _openContainer = container;
    return true;
  }

  // isOpen(container) -> bool: holder DENNE containeren den globalt åpne
  // widgeten (så en 💬-knapp kan toggle open/close).
  function isOpen(container) { return _openContainer === container; }

  global.Comments = {
    attrs: attrs,
    open: open,
    close: close,
    isOpen: isOpen,
    themeForApp: themeForApp
  };
})(typeof window !== 'undefined' ? window : globalThis);
