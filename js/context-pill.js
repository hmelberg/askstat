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
    // fresh: sann kun ved nyåpning av popoveren — PacksUi bruker den til å
    // nullstille sin interne view-tilstand (main/countries, Task 3 §2).
    // onChange-re-render (sjekkboks-klikk osv.) sender fresh:false slik at
    // en åpen landvelger-drill-inn ikke hopper tilbake til hovedvisningen.
    function renderSections(fresh) {
      if (global.PacksUi && packSec) global.PacksUi.renderInto(packSec, close, { fresh: !!fresh });
      if (global.ProfilesUi && profSec) global.ProfilesUi.renderInto(profSec, close);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) renderSections(true);
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', function (e) {
      // Fiks (fase 2-runden, controller-funn): et sjekkboks-/toggle-klikk
      // inni menyen (Task 3/6) trigger Prof.togglePack → Profiles.onChange
      // SYNKRONT → renderSections() → container.innerHTML = '' — FØR
      // klikk-eventet har rukket å boble hit til document. e.target peker da
      // på en node som allerede er fjernet fra treet (isConnected=false),
      // og menu.contains(e.target) svarer (feilaktig) false siden noden ikke
      // er noe sted i DOM-treet lenger — menyen lukket seg selv ved hvert
      // valg. Et frakoblet mål er ALDRI et ekte utenfor-klikk (de har alltid
      // et tilkoblet mål) — ignorer det i stedet for å tolke det som utenfor.
      if (!menu.hidden && e.target && e.target.isConnected && !menu.contains(e.target)) menu.hidden = true;
    });
    Prof.onChange(function () {
      renderLabel();
      if (!menu.hidden) renderSections(false);
    });
    global.ContextPill = { refresh: renderLabel };
    renderLabel();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
