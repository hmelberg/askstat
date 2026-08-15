// js/sources-modal.js — HELE kilde-dialogen (spec 2026-08-08-kilder-profil-
// output §2, Task 5). Erstatter tre eldre flater i én: kilde-popoveren
// (js/context-pill.js + packs.js sin PacksUi.renderInto), biblioteksmanageren
// (packs.js sin SourcesUi.renderLibrary i profil-modalen) og landmodalen
// (#countryBackdrop). Markupen (#sourcesBackdrop) eies av index.html (Task 4);
// denne fila eier all logikk: faner, søk, tag-chips, liste, infopanel,
// lag ny/rediger, land-dropdown, discover-valget og Import-utforskeren.
//
// Datalaget bor fortsatt i js/packs.js (katalog/registry/payload) og
// js/profiles.js (lagring/valgtilstand) — herfra kalles de kun.
(function (global) {
  'use strict';

  // ---- Ren del: dialogens ENESTE listelogikk (node-testes direkte).
  // filterByTags: OG-semantikk (ALLE valgte tags må finnes), ingen sortering —
  // delt av kilde-dialogens filterEntries og Import-utforskerens filterrad
  // (spec §2: «samme filterrad gjenbrukes»), der katalogens egen rekkefølge og
  // filterCatalog sitt navn+beskrivelse-søk beholdes.
  function filterByTags(entries, tags) {
    var want = tags || [];
    if (!want.length) return entries.slice();
    return entries.filter(function (e) {
      var et = e.tags || [];
      for (var i = 0; i < want.length; i++) {
        if (et.indexOf(want[i]) < 0) return false;
      }
      return true;
    });
  }

  // entries: [{id,name,kind,tags}] — kind mangler på legacy-oppføringer og
  // teller da som 'source' (spec §3, samme default som Packs.list()).
  // state: {tab:'overview'|'source', q, tags:[…]} — tags har OG-semantikk.
  // checkedIds: ider som er PÅ akkurat nå → sorteres først (så et valg aldri
  // ruller ut av syne i et langt register), ellers navnesortering.
  function filterEntries(entries, state, checkedIds) {
    var st = state || {};
    var tab = st.tab === 'overview' ? 'overview' : 'source';
    var q = String(st.q == null ? '' : st.q).trim().toLowerCase();
    var tags = st.tags || [];
    // Object.create(null), ikke {}: id-er er brukerdata (se cleanTags-
    // lærdommen i js/profiles.js) — ingen arvede Object.prototype-treff.
    var checked = Object.create(null);
    (checkedIds || []).forEach(function (id) { checked[String(id)] = true; });
    var out = filterByTags(entries, tags).filter(function (e) {
      var kind = e.kind === 'overview' ? 'overview' : 'source';
      if (kind !== tab) return false;
      if (q && String(e.name || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    // .filter ga en NY liste — sorteringen muterer aldri kallerens entries.
    out.sort(function (a, b) {
      var ca = checked[String(a.id)] ? 0 : 1;
      var cb = checked[String(b.id)] ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return out;
  }

  // Tag-chips (§Interfaces): unike tags i fanens entries, HYPPIGST først,
  // maks 12. Ren funksjon — samme grunn som filterEntries.
  function topTags(entries, max) {
    var counts = Object.create(null);
    var order = [];
    entries.forEach(function (e) {
      (e.tags || []).forEach(function (t) {
        if (!counts[t]) { counts[t] = 0; order.push(t); }
        counts[t]++;
      });
    });
    order.sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return a.localeCompare(b);
    });
    return order.slice(0, max || 12);
  }

  // ---- DOM: dialogen selv (bak document-guard, som packs.js/profiles.js).
  if (typeof document !== 'undefined' && document.getElementById) {
    var T = function (k, p) { return global.t ? global.t(k, p) : k; };
    var initSourcesModal = function () {
      var P = global.Packs;
      var Prof = global.Profiles;
      var backdrop = document.getElementById('sourcesBackdrop');
      if (!P || !Prof || !backdrop) return;

      var countrySel = document.getElementById('sourcesCountrySelect');
      var discoverCb = document.getElementById('sourcesDiscoverCb');
      var tabOverviewBtn = document.getElementById('sourcesTabOverview');
      var tabSourceBtn = document.getElementById('sourcesTabSource');
      var tabOverviewCount = document.getElementById('sourcesTabOverviewCount');
      var tabSourceCount = document.getElementById('sourcesTabSourceCount');
      var tabsEl = tabOverviewBtn ? tabOverviewBtn.parentNode : null;
      var searchEl = document.getElementById('sourcesSearch');
      var chipsEl = document.getElementById('sourcesTagChips');
      var listEl = document.getElementById('sourcesList');
      var infoEl = document.getElementById('sourcesInfo');
      var editEl = document.getElementById('sourcesEdit');
      var kindChoiceEl = document.getElementById('sourcesKindChoice');
      var nameEl = document.getElementById('sourceName');
      var textEl = document.getElementById('sourceText');
      var tagsEl = document.getElementById('sourceTags');
      var quickEl = document.getElementById('sourcesTagQuick');
      var prevWrap = document.getElementById('sourcePreviewWrap');
      var prevEl = document.getElementById('sourcePreview');
      var importBtn = document.getElementById('sourcesImportBtn');
      var newBtn = document.getElementById('sourcesNewBtn');
      var delBtn = document.getElementById('sourceDeleteBtn');
      var saveBtn = document.getElementById('sourceSaveBtn');
      var closeBtn = document.getElementById('sourcesCloseBtn');

      // Dialogtilstand. q leses direkte fra searchEl (fast node — samme
      // markørfiks som Explore-søket: kun listen rebygges per tastetrykk).
      var tab = 'overview';
      var activeTags = [];
      var selectedInfoId = null;
      var editingId = null; // null | 'NY' | profilId

      // Utvidet søk (kontekstrunden fase 2 §5): sticky PER ENHET — bor i
      // localStorage ALENE (ALDRI i doc.packs/synk). js/ai-chat.js sin
      // payload leser NØYAKTIG denne nøkkelen direkte (se run-kontrakt.test.js)
      // — ingen felles konstant på tvers av filer i dette ES5-oppsettet, så
      // navnet er literal begge steder med VILJE.
      var DISCOVER_KEY = 'md_ask_discover';
      function readDiscover() {
        try { return global.localStorage.getItem(DISCOVER_KEY) === '1'; } catch (e) { return false; }
      }
      function writeDiscover(on) {
        try {
          if (on) global.localStorage.setItem(DISCOVER_KEY, '1');
          else global.localStorage.removeItem(DISCOVER_KEY);
        } catch (e) {}
      }

      // ---- Datagrunnlag for lista
      // Egne kilder (Packs.list) + de innebygde registerkildene. Registeret
      // er ALLTID kind:'source' — fanen «Temaer» viser derfor kun oversikter,
      // og filterEntries trenger ingen egen registervakt.
      function allEntries() {
        var out = [];
        P.list().forEach(function (e) {
          out.push({ id: e.id, name: e.name, kind: e.kind, tags: e.tags || [],
            imported: e.imported, own: true });
        });
        P.listRegistry().forEach(function (r) {
          out.push({ id: 'reg:' + r.id, regId: r.id, name: r.name, kind: 'source',
            tags: r.tags || [], builtin: true, off: r.off });
        });
        return out;
      }
      // Hva som er PÅ nå: manuelt valgte pakker + registerkilder som IKKE er
      // skrudd av (registeret er på som standard — fravær i sources_off = på).
      function checkedIds(entries) {
        var out = Prof.packsState().ids.slice();
        entries.forEach(function (e) { if (e.builtin && !e.off) out.push(e.id); });
        return out;
      }
      // Default-fane (§Interfaces): den fanen brukeren har flest VALGTE
      // kilder i. Kun det MANUELLE valget teller — de innebygde registerkildene
      // er på som standard og ville ellers alltid vunnet 'source'-fanen.
      function defaultTab() {
        var counts = { overview: 0, source: 0 };
        var picked = Prof.packsState().ids;
        P.list().forEach(function (e) {
          if (picked.indexOf(e.id) < 0) return;
          counts[e.kind === 'overview' ? 'overview' : 'source']++;
        });
        return counts.source > counts.overview ? 'source' : 'overview';
      }

      // ---- Rendring
      function renderCountry() {
        if (!countrySel) return;
        var opts = P.countryOptions();
        // Funksjonsuttrykk, IKKE en funksjonsDEKLARASJON inni if-blokka under
        // (blokk-deklarasjon er ulovlig i ES5 strict — fila kjører 'use strict').
        var addOpt = function (value, label) {
          var o = document.createElement('option');
          o.value = value;
          o.textContent = label;
          countrySel.appendChild(o);
        };
        // Optionene bygges KUN når settet faktisk endret seg (katalogen lastes
        // asynkront): change-handleren under fyrer Profiles.onChange → hit,
        // og en ubetinget gjenoppbygging ville rykket selecten mens den har
        // fokus. Verdien settes derimot alltid — den speiler tilstanden.
        if (countrySel.__builtCount !== opts.length) {
          countrySel.__builtCount = opts.length;
          countrySel.innerHTML = '';
          addOpt('auto', T('Automatic (from your language)'));
          addOpt('none', T('None (international)'));
          opts.forEach(function (o) { addOpt('cc:' + o.cc, o.name); });
        }
        var st = Prof.countryState();
        countrySel.value = st.mode === 'cc' ? 'cc:' + st.cc : st.mode;
      }
      function renderDiscover() {
        if (discoverCb) discoverCb.checked = readDiscover();
      }
      // Faneetikettenes antall (spec §2) bor i egne spann inni knappene —
      // tallet er TOTALEN i fanen, uavhengig av søk/chip-filter, så brukeren
      // ser at det finnes noe i den andre fanen selv midt i et søk.
      function renderTabs(entries) {
        if (tabOverviewBtn) tabOverviewBtn.className = 'sources-tab' + (tab === 'overview' ? ' active' : '');
        if (tabSourceBtn) tabSourceBtn.className = 'sources-tab' + (tab === 'source' ? ' active' : '');
        if (tabOverviewCount) tabOverviewCount.textContent = ' (' + filterEntries(entries, { tab: 'overview' }, []).length + ')';
        if (tabSourceCount) tabSourceCount.textContent = ' (' + filterEntries(entries, { tab: 'source' }, []).length + ')';
      }
      // Delt chip-rad (spec §2: «samme filterrad gjenbrukes i import-
      // utforskeren»). pool = settet chipsene UTLEDES fra (før søk/tag-filter
      // — ellers ville en aktiv chip fjerne sine egne søsken og låse filteret);
      // active = tilstandslista som muteres på plass; onChange = re-rendring.
      function renderChipRow(container, pool, active, onChange) {
        if (!container) return;
        container.innerHTML = '';
        var tags = topTags(pool, 12);
        // En aktiv tag som ikke lenger finnes i settet skal fortsatt kunne
        // slås AV — legg den til bakerst.
        active.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
        tags.forEach(function (t) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'sources-chip' + (active.indexOf(t) >= 0 ? ' active' : '');
          b.textContent = t;
          b.addEventListener('click', function () {
            var i = active.indexOf(t);
            if (i >= 0) active.splice(i, 1);
            else active.push(t);
            onChange();
          });
          container.appendChild(b);
        });
      }
      function renderChips(entries) {
        renderChipRow(chipsEl, filterEntries(entries, { tab: tab }, []), activeTags, renderAll);
      }
      function badge(text, cls) {
        var s = document.createElement('span');
        s.className = 'sources-badge' + (cls ? ' ' + cls : '');
        s.textContent = text;
        return s;
      }
      function renderList(entries, checked) {
        if (!listEl) return;
        listEl.innerHTML = '';
        var rows = filterEntries(entries, { tab: tab, q: searchEl ? searchEl.value : '', tags: activeTags }, checked);
        rows.forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'sources-row' + (selectedInfoId === e.id ? ' active' : '');
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = checked.indexOf(e.id) >= 0;
          cb.addEventListener('change', function () {
            // Begge veier fyrer Profiles.onChange → renderAll (etablert
            // mønster fra den gamle manageren: raden bygges på nytt, ikke
            // muteres på plass).
            if (e.builtin) Prof.toggleSourceOff(e.regId);
            else {
              Prof.togglePack(e.id);
              // Pakka drar kildene sine på (se kilderForPakke i js/packs.js):
              // KUN når pakka nettopp ble slått PÅ — av-skruing av en kilde
              // ETTER pakkevalg er brukerens rett og røres aldri.
              if (Prof.packsState().ids.indexOf(e.id) >= 0 && P.kilderForPakke) {
                var offNaa = Prof.sourcesOff();
                P.kilderForPakke(e).forEach(function (sid) {
                  if (offNaa.indexOf(sid) >= 0) Prof.toggleSourceOff(sid);
                });
              }
              P.ensureSelected();
            }
          });
          var nm = document.createElement('button');
          nm.type = 'button';
          nm.className = 'sources-name';
          nm.textContent = e.name;
          nm.addEventListener('click', function () {
            selectedInfoId = selectedInfoId === e.id ? null : e.id;
            renderAll();
          });
          row.appendChild(cb);
          row.appendChild(nm);
          // Kind-badge er overflødig (fanen ER kinden); tags får farge kun
          // for mikro/makro (spec §2), resten nøytralt.
          (e.tags || []).forEach(function (t) {
            row.appendChild(badge(t, t === 'mikro' ? 'sources-badge-mikro' : (t === 'makro' ? 'sources-badge-makro' : '')));
          });
          if (e.builtin) row.appendChild(badge(T('built-in')));
          else if (!e.imported) row.appendChild(badge(T('mine')));
          listEl.appendChild(row);
        });
        if (!rows.length) {
          var hint = document.createElement('div');
          hint.className = 'ask-pop-hint';
          hint.textContent = T('Nothing here — clear the search or import new sources.');
          listEl.appendChild(hint);
        }
      }
      function renderInfo() {
        if (!infoEl) return;
        infoEl.hidden = !selectedInfoId;
        infoEl.innerHTML = '';
        if (!selectedInfoId) return;
        var txt = document.createElement('div');
        txt.textContent = P.describe(selectedInfoId) || '';
        infoEl.appendChild(txt);
        // §8 (spec 2026-08-13): innebygde kilder får «Lag egen kopi» —
        // kopien blir en ordinær egen kilde som forbedringssløyfa virker på.
        if (selectedInfoId.indexOf('reg:') === 0) {
          var regId = selectedInfoId.slice(4);
          var regActions = document.createElement('div');
          regActions.className = 'sources-info-actions';
          var kopier = document.createElement('button');
          kopier.type = 'button';
          kopier.className = 'ai-codeblock-btn';
          kopier.textContent = T('Make my own copy');
          kopier.addEventListener('click', function () {
            kopier.disabled = true;
            P.lagBuiltinKopi(regId).then(function (nyId) {
              if (nyId) { Prof.togglePack(nyId); selectedInfoId = nyId; }
              renderAll();   // Profiles.onChange fyrer også — idempotent
            });
          });
          regActions.appendChild(kopier);
          infoEl.appendChild(regActions);
          return;
        }
        // Rediger/Slett gjelder KUN brukerens egne kilder — aldri de
        // innebygde registerkildene (reg:).
        if (selectedInfoId.indexOf('user:') !== 0) return;
        var pid = selectedInfoId.slice(5);
        var actions = document.createElement('div');
        actions.className = 'sources-info-actions';
        var edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'ai-codeblock-btn';
        edit.textContent = T('Edit');
        edit.addEventListener('click', function () { openEdit(pid); });
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'ai-codeblock-btn';
        del.textContent = T('Delete');
        del.addEventListener('click', function () {
          selectedInfoId = null;
          Prof.remove(pid); // fyrer onChange → renderAll
        });
        actions.appendChild(edit);
        actions.appendChild(del);
        // Kopier har en vei tilbake til originalen (spec §8: billigste
        // drift-mottiltak). To-klikks-bekreftelse — overskriver kopien.
        var prInfo = Prof.get ? Prof.get(pid) : null;
        if (prInfo && prInfo.origin && prInfo.origin.source === 'builtin-copy' && prInfo.origin.of) {
          var oppd = document.createElement('button');
          oppd.type = 'button';
          oppd.className = 'ai-codeblock-btn';
          oppd.textContent = T('Update from original');
          oppd.addEventListener('click', function () {
            if (!oppd.__armert) {
              oppd.__armert = true;
              oppd.textContent = T('Sure? This overwrites the copy');
              return;
            }
            P.oppdaterKopiFraOriginal(pid).then(function () { renderAll(); });
          });
          actions.appendChild(oppd);
        }
        infoEl.appendChild(actions);
      }
      // Rediger-visningen tar over dialogen: lista/fanene/søket/chipsene
      // skjules mens skjemaet står åpent (modalen ville ellers bli dobbelt så
      // høy som skjermen). Close lukker HELE dialogen, som i profil-modalen.
      function syncEditVisibility() {
        var editing = !!editingId;
        if (editEl) editEl.hidden = !editing;
        if (tabsEl) tabsEl.hidden = editing;
        if (searchEl) searchEl.hidden = editing;
        if (chipsEl) chipsEl.hidden = editing;
        if (listEl) listEl.hidden = editing;
        if (infoEl) infoEl.hidden = editing || !selectedInfoId;
        if (importBtn) importBtn.hidden = editing;
        if (newBtn) newBtn.hidden = editing;
        if (saveBtn) saveBtn.hidden = !editing;
        if (delBtn) delBtn.hidden = !editing || editingId === 'NY';
      }
      function renderAll() {
        var entries = allEntries();
        var checked = checkedIds(entries);
        // Infopanelet skal aldri henge igjen på en kilde som er borte (slettet
        // her, eller av konto-synken mens dialogen sto åpen).
        if (selectedInfoId) {
          var alive = false;
          entries.forEach(function (e) { if (e.id === selectedInfoId) alive = true; });
          if (!alive) selectedInfoId = null;
        }
        renderCountry();
        renderDiscover();
        renderTabs(entries);
        renderChips(entries);
        renderList(entries, checked);
        renderInfo();
        renderQuickTags();
        syncEditVisibility();
      }

      // ---- Lag ny / rediger
      function kindRadios() {
        return kindChoiceEl ? kindChoiceEl.querySelectorAll('input[name="sourceKind"]') : [];
      }
      function selectedKind() {
        var rs = kindRadios();
        for (var i = 0; i < rs.length; i++) if (rs[i].checked) return rs[i].value === 'overview' ? 'overview' : 'source';
        return 'source';
      }
      function setKind(kind) {
        var rs = kindRadios();
        for (var i = 0; i < rs.length; i++) rs[i].checked = (rs[i].value === kind);
      }
      // Hurtigchips (§Interfaces): mikro/makro + landets navn som tag-token.
      // Landnavn med mellomrom ville blitt forkastet av cleanTags — derfor
      // bindestrek-normalisering, og cleanTags selv brukes som fasit på om
      // kandidaten i det hele tatt er en lovlig tag.
      function countryTag() {
        var st = Prof.countryState();
        var name = '';
        if (st.mode === 'cc') {
          P.countryOptions().forEach(function (o) { if (o.cc === st.cc) name = o.name; });
        } else if (st.mode === 'auto') {
          var id = P.countryPackId();
          if (id) name = P.displayName(id);
        }
        if (!name) return '';
        var clean = Prof.cleanTags([String(name).toLowerCase().replace(/\s+/g, '-')]);
        return clean.length ? clean[0] : '';
      }
      function renderQuickTags() {
        if (!quickEl) return;
        quickEl.innerHTML = '';
        var cands = ['mikro', 'makro'];
        var cc = countryTag();
        if (cc && cands.indexOf(cc) < 0) cands.push(cc);
        cands.forEach(function (t) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'sources-chip';
          b.textContent = '+ ' + t;
          b.addEventListener('click', function () {
            if (!tagsEl) return;
            var cur = Prof.cleanTags(tagsEl.value);
            if (cur.indexOf(t) < 0) cur.push(t);
            tagsEl.value = Prof.cleanTags(cur).join(', ');
          });
          quickEl.appendChild(b);
        });
      }
      // Kort-KI-knappen bor i .ai-modal-actions (samme rad som Save/Delete),
      // IKKE inni #sourcesEdit — syncEditVisibility styrer derfor ikke dens
      // hidden-tilstand. Fjernes derfor EKSPLISITT ved enhver overgang bort
      // fra «rediger eksisterende kilde» (ny redigering, lukk-editor, lukk-
      // dialog) — ellers henger en knapp igjen som viser feil etikett og
      // hvis klikk-handler er bundet til en editingId som allerede er endret
      // (editingId er delt/muterbar, fanget by reference i klikk-lukket).
      function fjernKortBtn() {
        var gammel = document.getElementById('sourcesEditKortBtn');
        if (gammel) gammel.remove();
      }
      function openEdit(id) {
        editingId = id;
        var pr = id === 'NY' ? null : Prof.get(id);
        if (nameEl) nameEl.value = pr ? pr.name : '';
        if (textEl) textEl.value = pr ? pr.text : '';
        if (tagsEl) tagsEl.value = pr && pr.tags ? pr.tags.join(', ') : '';
        // Kinden er REDIGERBAR (§Interfaces) — eksisterende kilder speiler
        // origin.kind (default 'source', samme regel som Packs.list()).
        setKind(pr && pr.origin && pr.origin.kind === 'overview' ? 'overview' : 'source');
        renderPreview();
        renderAll();
        if (nameEl) nameEl.focus();
        // Kort-KI-knappen (kort/lang-splitt §4b): destiller når Kort
        // mangler, revider når den finnes. Lagrer utkastet FØRST — ellers
        // ville forslaget diffe mot en gammel versjon og «Bruk» overskrive
        // uskrevne endringer. Gjenskapes per åpning (fersk etikett) — og
        // KUN for eksisterende kilder: en ulagret ny kilde ('NY') har ingen
        // profil-id å foreslå mot.
        fjernKortBtn();
        if (editingId !== 'NY') {
          var kortBtn = document.createElement('button');
          kortBtn.type = 'button';
          kortBtn.id = 'sourcesEditKortBtn';
          kortBtn.className = 'ai-codeblock-btn';
          var harKort = !!(global.SourceDoc && global.SourceDoc.splitKortGuide &&
            global.SourceDoc.splitKortGuide(textEl.value).kort.trim());
          kortBtn.textContent = harKort ? T('Improve short section (AI)') : T('Suggest short section (AI)');
          kortBtn.addEventListener('click', function () {
            Prof.update(editingId, { name: nameEl.value, text: textEl.value });
            if (global.KildeForslag && global.KildeForslag.openKortForslag) {
              global.KildeForslag.openKortForslag(editingId);
            }
          });
          saveBtn.parentNode.insertBefore(kortBtn, saveBtn);
        }
      }
      function closeEdit() {
        editingId = null;
        fjernKortBtn();
        syncEditVisibility();
      }
      function renderPreview() {
        if (!prevWrap || !prevEl || !prevWrap.open) return;
        prevEl.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(textEl ? textEl.value : '') : '';
      }
      function saveEdit() {
        var kind = selectedKind();
        var tags = Prof.cleanTags(tagsEl ? tagsEl.value : '');
        if (editingId === 'NY') {
          var id = Prof.create(nameEl ? nameEl.value : '', textEl ? textEl.value : '',
            'source', { source: 'own', kind: kind }, tags);
          Prof.togglePack('user:' + id); // fersk id — «toggle» velger den
          tab = kind;                    // vis den nye kilden i fanen den havnet i
        } else if (editingId) {
          // originKind (Task 5): Profiles.update skriver origin.kind, slik at
          // en kilde kan flyttes mellom fanene uten å slettes og lages på nytt.
          Prof.update(editingId, { name: nameEl ? nameEl.value : '', text: textEl ? textEl.value : '',
            tags: tags, originKind: kind });
          tab = kind;
        }
        closeEdit();
        renderAll();
      }

      // ---- Åpne/lukke
      function isOpen() { return backdrop.classList.contains('open'); }
      function open() {
        editingId = null;
        fjernKortBtn();
        selectedInfoId = null;
        activeTags = [];
        if (searchEl) searchEl.value = '';
        tab = defaultTab();
        renderAll();
        backdrop.classList.add('open');
      }
      function close() {
        editingId = null;
        fjernKortBtn();
        backdrop.classList.remove('open');
        syncEditVisibility();
      }
      // openWithPrefill (Task 7 sin «lagre som kilde»-flyt) — åpner rett i
      // skjemaet med gitte verdier i stedet for lista.
      function openWithPrefill(opts) {
        opts = opts || {};
        open();
        openEdit('NY');
        if (nameEl) nameEl.value = opts.name || '';
        if (textEl) textEl.value = opts.text || '';
        renderPreview();
      }

      if (countrySel) countrySel.addEventListener('change', function () {
        var v = countrySel.value;
        if (v === 'auto') {
          Prof.setCountry('auto');
          // Samme kandidatliste som ved boot — eid av packs.js sin DOM-del.
          P.onLangChange(P.localeCandidates ? P.localeCandidates() : []);
        } else if (v === 'none') {
          Prof.setCountry('none');
        } else if (v.indexOf('cc:') === 0) {
          Prof.setCountry('cc', v.slice(3));
          P.ensureSelected();
        }
      });
      if (discoverCb) discoverCb.addEventListener('change', function () {
        writeDiscover(!!discoverCb.checked);
      });
      // Fanebytte nullstiller infopanelet — det hører til en rad i den forrige
      // fanens liste og ville ellers blitt stående uten synlig opphav.
      function selectTab(next) { tab = next; selectedInfoId = null; renderAll(); }
      if (tabOverviewBtn) tabOverviewBtn.addEventListener('click', function () { selectTab('overview'); });
      if (tabSourceBtn) tabSourceBtn.addEventListener('click', function () { selectTab('source'); });
      if (searchEl) searchEl.addEventListener('input', function () { renderAll(); });
      if (newBtn) newBtn.addEventListener('click', function () { openEdit('NY'); });
      if (saveBtn) saveBtn.addEventListener('click', saveEdit);
      if (delBtn) delBtn.addEventListener('click', function () {
        if (editingId && editingId !== 'NY') {
          if (selectedInfoId === 'user:' + editingId) selectedInfoId = null;
          Prof.remove(editingId);
        }
        closeEdit();
        renderAll();
      });
      if (textEl) textEl.addEventListener('input', renderPreview);
      if (prevWrap) prevWrap.addEventListener('toggle', renderPreview);
      if (closeBtn) closeBtn.addEventListener('click', close);
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
      // Inngangene: kildepillen i input-kortet og sidemeny-knappen (Task 6 —
      // finnes ikke ennå, derfor null-guard).
      var pillBtn = document.getElementById('askContextBtn');
      if (pillBtn) pillBtn.addEventListener('click', open);
      var sideBtn = document.getElementById('askSourcesBtn');
      if (sideBtn) sideBtn.addEventListener('click', open);

      // ---- Import-utforskeren (deling v1, spec §5) — FLYTTET hit fra
      // packs.js (Task 5 §Files: all kilde-UI i én fil). Les-før-aktiver:
      // beskrivelse + rendret preview FØR import; import = kopi som aktiveres.
      var expBackdrop = document.getElementById('packsExploreBackdrop');
      var expList = document.getElementById('packsExploreList');
      var expPrevWrap = document.getElementById('packsExplorePreviewWrap');
      var expPrev = document.getElementById('packsExplorePreview');
      var expMeta = document.getElementById('packsExploreMeta');
      var expImport = document.getElementById('packsImportBtn');
      var expClose = document.getElementById('packsExploreCloseBtn');
      var expSearch = document.getElementById('packsExploreSearch');
      var expTagChips = document.getElementById('packsExploreTagChips');
      var expBack = document.getElementById('packsExploreBackBtn');
      var expSelected = null; // {entry, text}
      var expTags = [];       // Explore har sin EGEN chip-tilstand (nullstilles ved åpning)
      // Generasjonsteller (review-funn Task 6, kildevelger-runde 2): P.resolve()
      // er nett-bakket og kan komme sent — uten denne kan en gammel .then()
      // overstyre en modal som alt er lukket/gjenåpnet/har fått et nytt valg.
      // Bumpes ved åpning OG ved alle lukk-veier; expSelectEntry sjekker
      // generasjonen sin før den rører DOM-en.
      var expGen = 0;
      function renderExploreList() {
        expList.innerHTML = '';
        var catalog = P.listCommunity();
        // Samme filterrad som kilde-dialogen (spec §2): fritekstsøket er
        // fortsatt filterCatalog (navn OG beskrivelse — katalogposter selges
        // på beskrivelsen sin), tag-chipsene legger OG-filteret oppå.
        // Chipsene utledes fra HELE katalogen, ikke det søkte utvalget.
        renderChipRow(expTagChips, catalog, expTags, renderExploreList);
        var entries = filterByTags(
          P.filterCatalog(catalog, expSearch ? expSearch.value : ''), expTags);
        // Pakkesplitting (spec 2026-08-07 §3): to grupper — oversikter
        // først, enkeltkilder under. Tomme grupper får ingen overskrift.
        [['overview', T('Topic overviews')], ['source', T('Individual sources')]]
          .forEach(function (grp) {
            var rows = entries.filter(function (e) { return e.kind === grp[0]; });
            if (!rows.length) return;
            var head = document.createElement('div');
            head.className = 'ask-explore-group';
            head.textContent = grp[1];
            expList.appendChild(head);
            rows.forEach(function (e) {
              var row = document.createElement('button');
              row.type = 'button';
              row.className = 'ask-explore-row';
              var nm = document.createElement('strong');
              nm.textContent = e.name;
              var desc = document.createElement('div');
              desc.textContent = e.description;
              row.appendChild(nm);
              row.appendChild(desc);
              row.addEventListener('click', function () { expSelectEntry(e); });
              expList.appendChild(row);
            });
          });
      }
      function showExploreStep(detail) {
        if (expSearch) expSearch.hidden = detail;
        if (expTagChips) expTagChips.hidden = detail;
        expList.hidden = detail;
        expPrevWrap.hidden = !detail;
        expImport.hidden = !detail;
        if (expBack) expBack.hidden = !detail;
      }
      function expSelectEntry(e) {
        expGen++; // eget valg = egen generasjon — ugyldiggjør ethvert tidligere
        // ventende resolve (også et annet rad-klikk i samme åpne modal, ikke
        // bare lukk/gjenåpne-tilfellet)
        var gen = expGen; // fanges FØR resolve — stale svar sjekkes mot dette
        P.resolve(e.id).then(function (got) {
          if (gen !== expGen) return; // modal lukket/gjenåpnet/nytt valg i mellomtiden
          if (!got) return;
          expSelected = { entry: e, text: got.text };
          expMeta.textContent = T('by {author}, updated {updated}', { author: e.author || '?', updated: e.updated || '?' });
          expPrev.innerHTML = global.mdAskMarkdown ? global.mdAskMarkdown(got.text) : '';
          showExploreStep(true);
        });
      }
      function openExplore() {
        if (!expBackdrop) return;
        expGen++;
        expSelected = null;
        if (expSearch) expSearch.value = '';
        expTags = []; // fersk filterrad hver gang utforskeren åpnes
        showExploreStep(false);
        renderExploreList();
        expBackdrop.classList.add('open');
      }
      if (expSearch) expSearch.addEventListener('input', renderExploreList);
      if (expBack) expBack.addEventListener('click', function () {
        expGen++;
        expSelected = null;
        showExploreStep(false);
      });
      if (expImport) expImport.addEventListener('click', function () {
        if (!expSelected) return;
        expGen++;
        var entry = expSelected.entry;
        var newId = P.importPack(entry, expSelected.text);
        if (newId) Prof.togglePack(newId); // fersk id — «toggle» velger den
        P.ensureSelected();
        expBackdrop.classList.remove('open');
        // Vis den ferske importen der den faktisk havnet (kind-fanen) —
        // ellers importerer man et tema og ser ingenting skje i dialogen bak.
        tab = entry.kind === 'source' ? 'source' : 'overview';
        if (isOpen()) renderAll();
      });
      if (expClose) expClose.addEventListener('click', function () { expGen++; expBackdrop.classList.remove('open'); });
      if (expBackdrop) expBackdrop.addEventListener('click', function (e) {
        if (e.target === expBackdrop) { expGen++; expBackdrop.classList.remove('open'); }
      });
      if (importBtn) importBtn.addEventListener('click', function () { openExplore(); });

      // Re-render på ENHVER lagerendring mens dialogen står åpen (valg,
      // sletting, konto-synk) — samme kontrakt som den gamle popoveren hadde.
      Prof.onChange(function () { if (isOpen()) renderAll(); });

      // Bruk i forslags-modalen (js/kilde-forslag.js) skriver til lageret
      // mens editoren kan stå åpen bak — les inn den aksepterte teksten så
      // Lagre ikke reverserer den (sluttreview-funn 2).
      global.addEventListener('kildeforslag:brukt', function (ev) {
        var pid = ev && ev.detail && ev.detail.profileId;
        if (!pid || pid !== editingId) return;
        var pr = Prof.get ? Prof.get(pid) : null;
        if (!pr) return;
        if (nameEl) nameEl.value = pr.name || '';
        if (textEl) textEl.value = pr.text || '';
      });

      global.SourcesModal = {
        open: open,
        openWithPrefill: openWithPrefill,
        refresh: function () { if (isOpen()) renderAll(); },
      };
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSourcesModal);
    else initSourcesModal();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { filterEntries: filterEntries, topTags: topTags, filterByTags: filterByTags };
  }
})(typeof window !== 'undefined' ? window : globalThis);
