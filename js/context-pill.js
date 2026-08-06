// js/context-pill.js — ren kildepille (spec 2026-08-06-menyopprydding §3,
// tar over fra kontekstrunden fase 1 sin forente kilde+profil-pille).
// Profildelen flyttet til sidemenyen i Task 2 (js/profiles.js sin
// askProfileBtn) — denne fila eier kun kilde-popoveren: åpne/lukke-logikken
// og samletiketten; seksjonsinnholdet rendres av PacksUi.renderInto ved
// åpning. Etikett: «<pakke1> +N» — ingen valg gir «Sources».
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
    if (!Prof || !btn || !labelEl || !menu) return;

    function renderLabel() {
      var lbl = null;
      if (P) {
        var st = Prof.packsState();
        if (st.ids.length) {
          lbl = P.displayName(st.ids[0]) + (st.ids.length > 1 ? ' +' + (st.ids.length - 1) : '');
        }
      }
      labelEl.textContent = lbl || T('Sources');
    }
    function close() { menu.hidden = true; }
    function renderSections() {
      if (global.PacksUi && packSec) global.PacksUi.renderInto(packSec, close);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) renderSections();
      menu.hidden = !menu.hidden;
      // Smoke-funn (menyopprydding, Task 7 §1): pillen sitter høyt nok på
      // startskjermen at et stort bibliotek (max-height 55vh) kan la menyens
      // topp havne over viewport når den åpner OPPOVER (bottom-anchoring).
      // Layout er synkron rett etter unhide, så mål-så-flipp fungerer i
      // samme handler. getBoundingClientRect mangler i node-DOM-stubben —
      // guard'en holder testen fra å kaste.
      // Sluttreview-funn: klassen må nullstilles FØR måling, ikke etter —
      // ellers rendres åpning nr. 2 nedover (klassen sto igjen fra forrige
      // åpning), r.top blir ≥ 8, klassen fjernes, og åpning nr. 3 klipper
      // viewport-toppen igjen. Alternerer for alltid. Fjern først, mål
      // deretter, legg tilbake KUN hvis fortsatt nødvendig.
      if (!menu.hidden && menu.getBoundingClientRect) {
        menu.classList.remove('ask-pop-down');
        var r = menu.getBoundingClientRect();
        if (r.top < 8) menu.classList.add('ask-pop-down');
      }
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
      if (!menu.hidden) renderSections();
    });
    global.ContextPill = { refresh: renderLabel };
    renderLabel();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
