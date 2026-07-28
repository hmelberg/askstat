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

  // Unit for en kolonne, uten gjetting: (a) direkte nøkkel for kolonnenavnet
  // vinner; (b) «value»-kolonnen (columns_from_jsonstat sitt hardkodede navn
  // for tallkolonnen — units er keyet på metric-KODE, aldri «value») får
  // unit KUN når units har nøyaktig ÉN oppføring. Flertydig -> ingenting.
  function unitFor(tm, name) {
    var units = (tm || {}).units || {};
    if (units[name] && units[name].base) return units[name].base;
    if (name === 'value') {
      var keys = Object.keys(units);
      if (keys.length === 1 && units[keys[0]] && units[keys[0]].base) return units[keys[0]].base;
    }
    return null;
  }

  // Én kolonnerad: «navn — etikett · dtype», med ▸-toggle når nivåer finnes.
  // Unit hektes på når units bærer en oppføring for kolonnen (se unitFor).
  function varRow(name, dtype, tm) {
    var d = dimFor(tm, name);
    var label = d && d.label ? ' — ' + esc(d.label) : '';
    var unit = unitFor(tm, name);
    var unitHtml = unit ? ' · ' + esc(unit) : '';
    var toggle = hasLevels(tm, name)
      ? '<span class="sidebar-var-toggle" data-tm-toggle="' + esc(name) + '">▸</span>' : '';
    return '<span class="sidebar-var-name">' + esc(name) + label + '</span>' +
           '<span class="sidebar-var-dtype">' + esc(dtype || '') + unitHtml + '</span>' + toggle;
  }

  // Nivåliste: kildens orden fra categories-ARRAYEN (det er hele poenget med
  // den i kontrakten — Object.keys(labels) reordrer heltallslignende
  // strengnøkler, målt live: «1103» foran «0301»), etikett slås opp i labels
  // per kode (kode uten label vises som kode alene). Fallback til
  // Object.keys(labels) KUN når categories mangler/er tom. Første MAX_LEVELS
  // + «+N flere».
  function levelList(tm, name) {
    var d = dimFor(tm, name);
    if (!d || !d.labels) return '';
    var codes = (d.categories && d.categories.length) ? d.categories : Object.keys(d.labels);
    var shown = codes.slice(0, MAX_LEVELS);
    var rest = codes.length - shown.length;
    var rows = shown.map(function (c) {
      var lbl = d.labels[c];
      return '<div class="sidebar-level-row"><code>' + esc(c) + '</code>' +
             (lbl != null ? ' ' + esc(lbl) : '') + '</div>';
    }).join('');
    if (rest > 0) rows += '<div class="sidebar-level-more">+' + rest + ' flere</div>';
    return '<div class="sidebar-level-list" data-tm-levels="' + esc(name) + '">' + rows + '</div>';
  }

  global.SidebarTypemeta = { varRow: varRow, levelList: levelList, _esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
