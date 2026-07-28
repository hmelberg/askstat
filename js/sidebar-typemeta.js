// js/sidebar-typemeta.js — typemeta -> panel-HTML (metadata-runden, spec
// 2026-07-28). Én oppgave: rad- og nivåliste-HTML fra ost_typemeta-formen.
// Ren strengbygging uten DOM-avhengighet, så node-testene ser den.
(function (global) {
  'use strict';

  var MAX_LEVELS = 20;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dimFor(tm, name) {
    return ((tm || {}).dims || {})[name] || null;
  }

  function hasLevels(tm, name) {
    var d = dimFor(tm, name);
    return !!(d && d.labels && Object.keys(d.labels).length);
  }

  // Én kolonnerad: «navn — etikett · dtype», med ▸-toggle når nivåer finnes.
  // Unit hektes på når units bærer en oppføring for kolonnen.
  function varRow(name, dtype, tm) {
    var d = dimFor(tm, name);
    var label = d && d.label ? ' — ' + esc(d.label) : '';
    var unit = (((tm || {}).units || {})[name] || {}).base;
    var unitHtml = unit ? ' · ' + esc(unit) : '';
    var toggle = hasLevels(tm, name)
      ? '<span class="sidebar-var-toggle" data-tm-toggle="' + esc(name) + '">▸</span>' : '';
    return '<span class="sidebar-var-name">' + esc(name) + label + '</span>' +
           '<span class="sidebar-var-dtype">' + esc(dtype || '') + unitHtml + '</span>' + toggle;
  }

  // Nivåliste: kildens orden (labels-objektets nøkkelorden er innsettings-
  // orden fra json-stat-index), første MAX_LEVELS + «+N flere».
  function levelList(tm, name) {
    var d = dimFor(tm, name);
    if (!d || !d.labels) return '';
    var codes = Object.keys(d.labels);
    var shown = codes.slice(0, MAX_LEVELS);
    var rest = codes.length - shown.length;
    var rows = shown.map(function (c) {
      return '<div class="sidebar-level-row"><code>' + esc(c) + '</code> ' +
             esc(d.labels[c]) + '</div>';
    }).join('');
    if (rest > 0) rows += '<div class="sidebar-level-more">+' + rest + ' flere</div>';
    return '<div class="sidebar-level-list" data-tm-levels="' + esc(name) + '">' + rows + '</div>';
  }

  global.SidebarTypemeta = { varRow: varRow, levelList: levelList, _esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
