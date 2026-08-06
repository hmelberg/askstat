// js/context-pill.js — kontekstrunden fase 1 (spec 2026-08-06 §1): én pille
// forener kilde- og profilvelgeren. Denne fila eier åpne/lukke-logikken og
// samletiketten; seksjonsinnholdet rendres av PacksUi/ProfilesUi.renderInto
// ved åpning. Etikett: «<pakke> · <profil>» — tomme deler utelates, alt tomt
// gir «Context». Auto-valgt pakke merkes «(auto)» (aldri-usynlig-kravet fra
// spec 2026-08-05 §Fase 1b dekkes her).
(function (global) {
  'use strict';
  if (typeof document === 'undefined' || !document.getElementById) return;
  var T = function (k, p) { return global.t ? global.t(k, p) : k; };
  var init = function () {
    var Prof = global.Profiles;
    var P = global.Packs;
    var btn = document.getElementById('askContextBtn');
    var labelEl = document.getElementById('askContextLabel');
    var menu = document.getElementById('askContextMenu');
    var packSec = document.getElementById('askCtxPackSection');
    var profSec = document.getElementById('askCtxProfileSection');
    if (!Prof || !btn || !labelEl || !menu) return;

    function renderLabel() {
      var parts = [];
      if (P) {
        var st = Prof.packsState();
        var lbl = st.ids.length
          ? P.displayName(st.ids[0]) + (st.ids.length > 1 ? ' +' + (st.ids.length - 1) : '') + (st.auto ? T(' (auto)') : '')
          : null;
        if (lbl) parts.push(lbl);
      }
      var a = Prof.active();
      if (a) parts.push(a.name);
      labelEl.textContent = parts.length ? parts.join(' · ') : T('Context');
    }
    function close() { menu.hidden = true; }
    function renderSections() {
      if (global.PacksUi && packSec) global.PacksUi.renderInto(packSec, close);
      if (global.ProfilesUi && profSec) global.ProfilesUi.renderInto(profSec, close);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) renderSections();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
    });
    Prof.onChange(function () {
      renderLabel();
      if (!menu.hidden) renderSections();
    });
    global.ContextPill = { refresh: renderLabel };
    renderLabel();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
