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
    // Fiks runde 2 (fase 2-runden, re-review-funn): et sjekkboks-/toggle-
    // klikk inni menyen (Task 3/6) trigger Prof.togglePack → Profiles.
    // onChange SYNKRONT → renderSections() → container.innerHTML = '' — FØR
    // klikk-eventet har rukket å boble hit til document. Runde 1 sjekket
    // e.target.isConnected, men den invarianten («et ekte utenfor-klikk har
    // alltid et tilkoblet mål») holder IKKE i denne kodebasen — elementer
    // UTENFOR menyen som detacher SEG SELV synkront i eget klikk-handler
    // (askConfirm() sine Run/Cancel-knapper i js/ask-view.js, lukk-knappen i
    // js/names.js sin showNameError) ga samme frakoblede-target-symptom og
    // ble feilaktig ignorert av runde 1 — menyen ble stående åpen.
    // Riktig mekanisme: DOM-spec'en fikser eventets propagasjonssti FØR
    // dispatch starter — en klikk-lytter på menu-elementet SELV fyres
    // fortsatt for rader som detaches midt i dispatchen (den var en forelder
    // DA klikket startet), mens et element utenfor menyen ALDRI fyrer meny-
    // lytteren, uansett om det detacher seg selv eller ikke. `menuSawClick`
    // fanger nettopp dette: samme Event-objekt ender opp der hvis og bare
    // hvis klikket startet inni menyen.
    var menuSawClick = null;
    menu.addEventListener('click', function (e) { menuSawClick = e; });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && e !== menuSawClick && !menu.contains(e.target)) menu.hidden = true;
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
