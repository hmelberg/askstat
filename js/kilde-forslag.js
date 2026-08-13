// js/kilde-forslag.js — forslagsbasert forbedring av egendefinerte
// kildebeskrivelser (spec docs/superpowers/specs/2026-08-13-kildeforbedring-
// egne-kilder-design.md). Ren kjerne først (node-testet): payloadbygger
// m/obligatorisk scrub (§2), svarparser, linjediff, knappevilkår.
// DOM-delen (modal, knapp) nederst — refererer document/fetch kun INNI
// funksjoner, så module-load i node er trygt uten bail-sjekk.
(function (global) {
  'use strict';

  // Caps fra spec §2 — speiler telemetri-tallene i js/feil-telemetri.js.
  var CAPS = {
    DOC: 40000, NAVN: 200, SPORSMAL: 4000, TOLKNING: 2000,
    SCRIPT: 20000, ERROR: 4000, TRACE: 4000, SOURCES: 60,
    HIST_FORSLAG: 45000, HIST_TILBAKE: 4000, PAYLOAD_BYTES: 200000,
  };

  function klipp(s, n) { return String(s == null ? '' : s).slice(0, n); }
  // UTF-8-byte-lengde — norsk tekst (æøå) gjør .length-basert taking
  // løgnaktig trygg (samme lærdom som js/feil-telemetri.js).
  function byteLengde(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }

  // Involverte innebygde kilder (spec 2026-08-14 §1): registeroppføringer
  // hvis base_url treffer kjøringens kilde-URL-er — direkte prefiks ELLER
  // URL-kodet bak /api/hent?url=… (ESS-klassen). Maks 3, første-treff-orden.
  var REF_DOC_MAKS = 3;
  var REF_ID_RE = /^[a-z0-9_-]{1,32}$/;
  function involverteInnebygde(sources, registry) {
    var ut = [];
    var kilder = Array.isArray(sources) ? sources : [];
    var reg = Array.isArray(registry) ? registry : [];
    reg.forEach(function (r) {
      if (ut.length >= REF_DOC_MAKS) return;
      if (!r || !r.base_url || !REF_ID_RE.test(String(r.id || ''))) return;
      var enc = encodeURIComponent(r.base_url);
      var treff = kilder.some(function (u) {
        var s = String(u || '');
        return s.indexOf(r.base_url) === 0 || s.indexOf(enc) >= 0 ||
          s.indexOf(r.base_url) > 0;   // proxy-form med rå indre URL
      });
      if (treff && ut.indexOf(r.id) < 0) ut.push(r.id);
    });
    return ut;
  }

  // Registercache (spec 2026-08-14 §2): KUN modul-cachet på PRODUKSJONS-
  // veien (ingen injisert fetchImpl) — testbar kode skal alltid se ren
  // tilstand, så en injisert deps.fetchImpl slår cachen helt av og henter
  // ferskt hver gang (samme avveining som _registryCache i js/data-loader.js,
  // men uten behov for en egen _resetCacheForTests-eksport her).
  var _refRegistryCache = null;

  // hentRefDocs (spec 2026-08-14 §2): register → involverte innebygde kilder
  // → dokumentene deres (data/sources/<id>.md). 404/nettfeil per dokument
  // utelates STILLE (samme «bedre enn ingenting, aldri kast»-linje som
  // lagBuiltinKopi i js/packs.js) — en hallusinert eller nylig fjernet
  // kilde skal ikke velte hele forslags-runden. Klippes til 8000 tegn
  // (speiler REF_DOC_MAKS-grensen i byggForslagsPayload).
  async function hentRefDocs(ctx, deps) {
    deps = deps || {};
    var injisert = !!deps.fetchImpl;
    var fetchImpl = deps.fetchImpl || function (url, opts) { return fetch(url, opts); };
    var opts = deps.signal ? { signal: deps.signal } : undefined;
    var registry;
    if (!injisert && _refRegistryCache) {
      registry = _refRegistryCache;
    } else {
      registry = [];
      try {
        var reg = await fetchImpl('data/data-sources.json', opts);
        if (reg && reg.ok) registry = JSON.parse(await reg.text());
      } catch (e) { registry = []; }
      // Cache KUN ved suksess (sluttreview-funn): et abortert/feilet første
      // kall (f.eks. «Ny runde»/«Close» som aborterer state.ctrl mens
      // hentRefDocs pågår) skal ikke fryse en tom registry-cache for RESTEN
      // av økten — neste runde skal få en ny sjanse til å hente registeret.
      if (!injisert && registry.length) _refRegistryCache = registry;
    }
    var ids = involverteInnebygde((ctx && ctx.sources) || [], registry);
    var ut = [];
    for (var i = 0; i < ids.length; i++) {
      try {
        var res = await fetchImpl('data/sources/' + ids[i] + '.md', opts);
        if (res && res.ok) ut.push({ id: ids[i], text: klipp(await res.text(), 8000) });
      } catch (e) { /* 404/nettfeil → utelates stille */ }
    }
    return ut;
  }

  function byggForslagsPayload(inn, deps) {
    inn = inn || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) ||
      function (s) { return s; };
    var masker = (deps && deps.masker) ||
      (global.FeilTelemetri && global.FeilTelemetri.maskerNokler) ||
      function (s) { return s; };
    var p = {
      docs: (inn.docs || []).map(function (d) {
        return { id: String(d.id || ''), name: klipp(d.name, CAPS.NAVN), text: klipp(d.text, CAPS.DOC) };
      }),
      question: klipp(inn.question, CAPS.SPORSMAL),
      tolkning: klipp(inn.tolkning, CAPS.TOLKNING),
      mode: inn.mode || '',
      depth: inn.depth || '',
      runs: (inn.runs || []).map(function (r) {
        return { script: klipp(scrub(r.script), CAPS.SCRIPT), error: klipp(masker(r.error), CAPS.ERROR) };
      }),
      ok_script: inn.ok_script ? klipp(scrub(inn.ok_script), CAPS.SCRIPT) : undefined,
      trace: klipp(masker((inn.trace || []).join('\n')), CAPS.TRACE) || undefined,
      sources: (inn.sources || []).slice(0, CAPS.SOURCES),
      history: (inn.history || []).map(function (h) {
        return { forslag_raatekst: klipp(h.forslag_raatekst, CAPS.HIST_FORSLAG),
                 tilbakemelding: klipp(masker(h.tilbakemelding), CAPS.HIST_TILBAKE) };
      }),
      ui_lang: inn.ui_lang || 'en',
    };
    if (inn.oppgave === 'kort') p.oppgave = 'kort';
    if (inn.admin === true) p.admin = true;
    if (Array.isArray(inn.ref_docs) && inn.ref_docs.length) {
      var rd = inn.ref_docs.filter(function (d) {
        return d && REF_ID_RE.test(String(d.id || '')) && typeof d.text === 'string' && d.text;
      }).slice(0, REF_DOC_MAKS).map(function (d) {
        return { id: d.id, text: klipp(d.text, 8000) };
      });
      if (rd.length) p.ref_docs = rd;
    }
    // Budsjett (spec §2): dropp ELDSTE runs først, så trace — docs ALDRI.
    while (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.runs.length) p.runs.shift();
    if (byteLengde(JSON.stringify(p)) > CAPS.PAYLOAD_BYTES && p.trace) delete p.trace;
    return p;
  }

  // Vilkår for forbedringsknappen (spec §1): egne kilder aktive OG friksjon
  // (minst én feilet kjøring ELLER minst ett forkastet resonneringstrinn).
  function skalViseKnapp(ctx) {
    if (!ctx) return false;
    var harKilder = (ctx.docs || []).length >= 1;
    var friksjon = (ctx.runs || []).length >= 1 || (ctx.kastedeTurer | 0) >= 1;
    return !!(harKilder && friksjon);
  }

  // Svarparser (spec §3): fenced ```json-blokk foretrekkes; ellers
  // klammespenn (samme naive strategi som parseAskRoute i js/ask-view.js —
  // prompten krever JSON-objektet SIST i svaret). Parsefeil → ok:false og
  // raatekst til fallback-visning; aldri kast.
  function koderSak(obj) {
    var k = obj && obj.kode_sak;
    if (!k || typeof k.tittel !== 'string' || !k.tittel.trim() ||
        typeof k.kropp !== 'string' || !k.kropp.trim()) return null;
    return { tittel: klipp(k.tittel, 200), kropp: klipp(k.kropp, 20000) };
  }

  function parseForslagSvar(text) {
    var raa = String(text == null ? '' : text);
    var obj = null;
    var m = raa.match(/```json\s*([\s\S]*?)```/);
    if (m) { try { obj = JSON.parse(m[1]); } catch (e) {} }
    if (!obj) {
      var start = raa.indexOf('{');
      var end = raa.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { obj = JSON.parse(raa.slice(start, end + 1)); } catch (e) {}
      }
    }
    if (!obj || typeof obj !== 'object') {
      return { ok: false, forslag: [], melding: '', raatekst: raa, kode_sak: null };
    }
    var liste = Array.isArray(obj.forslag) ? obj.forslag : [];
    return {
      ok: true,
      forslag: liste.filter(function (f) {
        return f && typeof f.id === 'string' && typeof f.ny_tekst === 'string' && f.ny_tekst.trim();
      }).map(function (f) {
        return { id: f.id, ny_tekst: f.ny_tekst,
                 begrunnelse: typeof f.begrunnelse === 'string' ? f.begrunnelse : '' };
      }),
      melding: typeof obj.melding === 'string' ? obj.melding : '',
      raatekst: raa,
      kode_sak: koderSak(obj),
    };
  }

  // Linjediff via LCS (spec §4) — dokumentene er ≤40k tegn (~1–2k linjer),
  // så O(n·m)-tabellen er ufarlig (Int32Array holder minnet nede).
  function linjeDiff(gammel, ny) {
    var a = String(gammel == null ? '' : gammel).split('\n');
    var b = String(ny == null ? '' : ny).split('\n');
    var n = a.length, m = b.length, i, j;
    var L = new Array(n + 1);
    for (i = 0; i <= n; i++) L[i] = new Int32Array(m + 1);
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    var ut = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ut.push({ type: 'lik', tekst: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ut.push({ type: 'slettet', tekst: a[i] }); i++; }
      else { ut.push({ type: 'ny', tekst: b[j] }); j++; }
    }
    while (i < n) { ut.push({ type: 'slettet', tekst: a[i] }); i++; }
    while (j < m) { ut.push({ type: 'ny', tekst: b[j] }); j++; }
    return ut;
  }

  // Docs re-leses fra Profiles ved HVER runde (spec §4) — etter en delvis
  // aksept skal modellen se den OPPDATERTE teksten. Kilder slettet underveis
  // faller stille ut.
  function ferskeDocs(ctx, profiles) {
    var P = profiles || global.Profiles;
    var ut = [];
    ((ctx && ctx.docs) || []).forEach(function (d) {
      var pr = P && P.get ? P.get(String(d.id).slice(5)) : null;
      if (pr) ut.push({ id: d.id, name: pr.name, text: pr.text || '' });
    });
    return ut;
  }

  // erGyldigRefDocId (sluttreview-funn): `in`-sjekk mot state.refDocs er
  // sann for NEDARVEDE egenskaper (__proto__, constructor, toString …) —
  // en hallusinert builtin:__proto__ ville da rendret et kort og kunnet
  // åpne en PR som skriver data/sources/__proto__.md. hasOwnProperty låser
  // treffet til dokumenter modellen FAKTISK fikk (refDocs bygges fra en
  // fetch-liste, aldri fra brukerinput — men vakten koster ingenting og
  // gjør intensjonen eksplisitt).
  function erGyldigRefDocId(bid, refDocs) {
    return !!(refDocs && Object.prototype.hasOwnProperty.call(refDocs, String(bid)));
  }

  // §9: klientsynligheten er kosmetikk — servergaten (adminGate) er den
  // reelle sperren. auth injiseres i test; produksjon leser window.mdAuth.
  function erAdmin(auth) {
    var a = auth !== undefined ? auth : global.mdAuth;
    return !!(a && a.user && a.user.is_admin === true);
  }

  // Evidens til PR-kroppen (spec §9): hva feilet, hva virket — SCRUBBET.
  function byggEvidens(ctx, deps) {
    ctx = ctx || {};
    var scrub = (deps && deps.scrub) ||
      (global.DataDirectives && global.DataDirectives.scrubKeys) || function (s) { return s; };
    var masker = (deps && deps.masker) ||
      (global.FeilTelemetri && global.FeilTelemetri.maskerNokler) || function (s) { return s; };
    var runs = ctx.runs || [];
    var deler = [
      'Spørsmål: ' + klipp(ctx.question, 500),
      ctx.tolkning ? 'Tolkning: ' + klipp(ctx.tolkning, 300) : '',
      'Feilede kjøringer: ' + runs.length +
        ((ctx.kastedeTurer | 0) ? ', forkastede turer: ' + ctx.kastedeTurer : ''),
    ];
    runs.slice(-2).forEach(function (r, i) {
      deler.push('Siste feil ' + (i + 1) + ': ' + klipp(masker(r.error), 600));
    });
    if (ctx.ok_script) deler.push('Virket til slutt:\n' + klipp(scrub(ctx.ok_script), 1500));
    return deler.filter(Boolean).join('\n');
  }

  // ── DOM-del (kun nettleser) ──────────────────────────────────────────
  var T = function (k, p) { return global.t ? global.t(k, p) : k; };
  var ctxSiste = null;

  // byggKortCtx (Task 8, kort/lang-splitt): ren funksjon — samme ctx-form
  // som registerRun setter, men med oppgave:'kort' og TOM friksjon (denne
  // knappen trigges av redigeringsvinduet, ikke av en feilet kjøring).
  // profiles injiseres i test; produksjon leser global.Profiles.
  function byggKortCtx(profileId, profiles) {
    var P = profiles || global.Profiles;
    var pr = P && P.get ? P.get(profileId) : null;
    if (!pr) return null;
    return {
      docs: [{ id: 'user:' + profileId, name: pr.name, text: pr.text }],
      question: '', tolkning: '', mode: '', depth: '',
      runs: [], ok_script: null, trace: [], sources: [],
      kastedeTurer: 0, oppgave: 'kort',
    };
  }

  // openKortForslag (Task 8): setter ctxSiste fra byggKortCtx og gjenbruker
  // HELE kjorRunde/renderForslag-maskineriet — null-vakt når profilen er borte
  // (f.eks. slettet mellom åpning av editoren og klikk).
  function openKortForslag(profileId) {
    var ctx = byggKortCtx(profileId);
    if (!ctx) return;
    ctxSiste = ctx;
    openModal();
  }

  function registerRun(ctx) {
    ctxSiste = ctx;
    // Node-trygghet: modulen lastes av node-testene uten DOM (document
    // finnes ikke der) — ctx-oppdateringen over er nok for testene som
    // bryr seg (skalViseKnapp(null) er allerede dekket); knappen finnes
    // kun i nettleseren.
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('askImproveBtn');
    if (!btn) return;
    btn.hidden = !skalViseKnapp(ctx);
    if (!btn.__kfWired) {
      btn.__kfWired = true;
      btn.addEventListener('click', function () { openModal(); });
    }
  }

  function el(tag, cls, tekst) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (tekst != null) n.textContent = tekst;
    return n;
  }

  function openModal() {
    if (!ctxSiste) return;
    var gammel = document.getElementById('kfBackdrop');
    if (gammel) gammel.remove();

    var state = { history: [], runde: 1, ctrl: null };

    var backdrop = el('div', 'ai-modal-backdrop open');
    backdrop.id = 'kfBackdrop';
    var modal = el('div', 'ai-modal kf-modal');
    backdrop.appendChild(modal);
    var tittel = el('h3', null, T('Improve source description'));
    modal.appendChild(tittel);
    // Rundeteller i EGEN node (data-i18n-fella: oversettelse ville
    // overskrevet dynamiske barn).
    var rundeEl = el('div', 'ask-pop-hint');
    modal.appendChild(rundeEl);
    var innhold = el('div', 'kf-innhold');
    modal.appendChild(innhold);
    var bunn = el('div', 'kf-bunn');
    modal.appendChild(bunn);
    var lukk = el('button', 'ai-modal-btn', T('Close'));
    lukk.type = 'button';
    lukk.addEventListener('click', function () {
      if (state.ctrl) { try { state.ctrl.abort(); } catch (e) {} }
      backdrop.remove();
    });
    var tilbake = document.createElement('textarea');
    tilbake.className = 'kf-tilbake';
    tilbake.rows = 2;
    tilbake.placeholder = T('Feedback — what should change in the next round?');
    var nyRunde = el('button', 'ai-modal-btn primary', T('New round'));
    nyRunde.type = 'button';
    nyRunde.addEventListener('click', function () {
      // Hver runde er et nytt KI-kall på brukerens nøkkel (spec §4) —
      // historikken bærer forrige RÅSVAR + tilbakemeldingen.
      state.history.push({
        forslag_raatekst: state.sisteRaatekst || '',
        tilbakemelding: tilbake.value || '',
      });
      state.runde++;
      tilbake.value = '';
      kjorRunde(state, innhold, rundeEl, bunn);
    });
    bunn.appendChild(tilbake);
    bunn.appendChild(nyRunde);
    bunn.appendChild(lukk);
    document.body.appendChild(backdrop);

    kjorRunde(state, innhold, rundeEl, bunn);
  }

  function kjorRunde(state, innhold, rundeEl, bunn) {
    rundeEl.textContent = T('Round {n}', { n: state.runde });
    innhold.innerHTML = '';
    innhold.appendChild(el('div', 'ai-progress-line', T('Getting suggestions …')));

    // Re-entrancy (sluttreview-funn): én aktiv runde om gangen — et
    // dobbeltklikk på «Ny runde» før forrige runde er ferdig skal ikke la
    // to kjeder skrive over hverandres state.refDocs/renderForslag. Ny
    // runde aborterer forrige (samme lukk-mekanisme som før), og BEGGE
    // kontinueringene under sjekker `state.ctrl !== ctrl` — den lokale
    // `ctrl` er DENNE invokeringens, `state.ctrl` er den NYESTE. hentRefDocs
    // kaster aldri (stille utelatelse per dokument, også ved abort), så en
    // abortert runde kan resolve normalt og må derfor stoppes eksplisitt
    // her — AbortError-sjekken i catch-en alene er ikke nok (den fanger
    // bare kjeder som FAKTISK kaster).
    if (state.ctrl) { try { state.ctrl.abort(); } catch (_) {} }
    var ctrl = new AbortController();
    state.ctrl = ctrl;

    // ref_docs hentes FØR payloadbygging (spec 2026-08-14 §2) — state.refDocs
    // er BÅDE diffgrunnlaget for builtin-kortene i renderForslag OG valider-
    // ingssettet (en builtin:<id> uten treff her er en hallusinasjon og
    // filtreres bort der).
    hentRefDocs(ctxSiste, { signal: ctrl.signal }).then(function (refDocs) {
      if (state.ctrl !== ctrl) return;   // en nyere runde har overtatt
      // Object.create(null) — defensivt: ingen Object.prototype å arve fra,
      // så selv uten erGyldigRefDocId-vakten under ville __proto__/
      // constructor aldri se ut som et gyldig treff her.
      state.refDocs = Object.create(null);
      refDocs.forEach(function (d) { state.refDocs[d.id] = d.text; });

      var payload = byggForslagsPayload({
        docs: ferskeDocs(ctxSiste),
        question: ctxSiste.question, tolkning: ctxSiste.tolkning,
        mode: ctxSiste.mode, depth: ctxSiste.depth,
        runs: ctxSiste.runs, ok_script: ctxSiste.ok_script,
        trace: ctxSiste.trace, sources: ctxSiste.sources,
        history: state.history,
        ui_lang: global.M2PY_LANG || 'en',
        oppgave: ctxSiste.oppgave,
        ref_docs: refDocs,
        admin: erAdmin() || undefined,
      });
      payload.provider = (global.mdAiProviderConfig && global.mdAiProviderConfig()) || undefined;

      fetch('/api/kilde-forslag', {
        method: 'POST',
        headers: global.mdAiAuthHeaders(),
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).then(function (resp) {
        if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);
        return global.mdSseAccumulate(resp, null, ctrl.signal);
      }).then(function (tekst) {
        if (state.ctrl !== ctrl) return;   // en nyere runde har overtatt
        state.sisteRaatekst = tekst;
        renderForslag(parseForslagSvar(tekst), state, innhold, rundeEl, bunn);
      }).catch(function (e) {
        // Stale-vakt (sluttreview-funn, folded minor): en overtatt runde
        // sitt REJECT skal ikke få lov til å tømme/overskrive en NYERE
        // rundes fremdriftslinje — samme mønster som .then-grenene over.
        if (state.ctrl !== ctrl) return;
        if (e && e.name === 'AbortError') return;
        innhold.innerHTML = '';
        innhold.appendChild(el('div', 'ai-error', '✗ ' + ((e && e.message) || String(e))));
      });
    });
  }

  // lagPrKnapp (spec 2026-08-14 §2, utrekk): felles PR-knapp for BÅDE
  // user:-grenens forslag OG builtin:-diff-kortene under — samme fetch/
  // headers/lenke/feilhåndtering uansett hvilken gren som bygde `body`.
  // `body` er de saks-spesifikke feltene (id, name, of, ny_tekst); evidens
  // legges PÅ her (ikke av kalleren) siden begge grener ellers ville
  // duplisert byggEvidens(ctxSiste)-kallet. `rad` er raden knappen skal
  // stå i — PR-lenken ved suksess appendes dit, IKKE til selve knappen
  // (som fjernes med .remove()).
  function lagPrKnapp(body, rad) {
    var prBtn = el('button', 'ai-codeblock-btn', T('Send as PR'));
    prBtn.type = 'button';
    prBtn.addEventListener('click', function () {
      prBtn.disabled = true;
      prBtn.textContent = T('Sending …');
      fetch('/api/kilde-pr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Login-tokenet, IKKE mdAiAuthHeaders — adminGate validerer
          // brukeren mot Anvil (is_admin); BYOK slipper med vilje ikke inn.
          'Authorization': 'Bearer ' + ((global.mdAuth && global.mdAuth.token) || ''),
        },
        body: JSON.stringify({
          id: body.id,
          name: body.name,
          of: body.of,
          ny_tekst: body.ny_tekst,
          evidens: byggEvidens(ctxSiste),
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        prBtn.remove();
        var lenke = document.createElement('a');
        lenke.href = d.url;
        lenke.target = '_blank';
        lenke.rel = 'noopener';
        lenke.textContent = T('PR created:') + ' ' + d.url;
        rad.appendChild(lenke);
      }).catch(function (e) {
        // Ellers usynlig feil (spec-restpunkt sluttreview): logg slik at
        // en mislykket admin-PR er diagnostiserbar fra konsollen.
        try { console.error('kilde-pr:', e); } catch (_) {}
        prBtn.disabled = false;
        prBtn.textContent = T('PR failed — try again');
      });
    });
    return prBtn;
  }

  function renderForslag(svar, state, innhold, rundeEl, bunn) {
    innhold.innerHTML = '';
    if (!svar.ok) {
      // Ærlig degradering (spec §3): rå-tekst i stedet for krasj.
      innhold.appendChild(el('div', 'ai-error', T('The suggestion could not be parsed — raw answer below')));
      var pre = el('pre', 'kf-raa');
      pre.textContent = svar.raatekst.slice(0, 8000);
      innhold.appendChild(pre);
      return;
    }
    if (svar.melding) innhold.appendChild(el('div', 'ask-pop-hint', svar.melding));
    if (!svar.forslag.length) {
      innhold.appendChild(el('div', 'ai-progress-line', T('No changes suggested')));
    }
    svar.forslag.forEach(function (f) {
      if (String(f.id).indexOf('builtin:') === 0) {
        var bid = String(f.id).slice(8);
        // Kun admin, og kun dokumenter modellen faktisk FIKK (hallusinerte
        // builtin-id-er filtreres — hasOwnProperty hindrer i tillegg
        // nedarvede egenskaper som __proto__/constructor fra å se ut som
        // treff) — spec 2026-08-14 §2 + sluttreview-funn.
        if (!erAdmin() || !erGyldigRefDocId(bid, state.refDocs)) return;
        var bKort = el('div', 'kf-kort');
        bKort.appendChild(el('h4', null, bid + ' (' + T('built-in') + ')'));
        var bDiff = el('div', 'kf-diff');
        linjeDiff(state.refDocs[bid], f.ny_tekst).forEach(function (d) {
          bDiff.appendChild(el('div', 'kf-diff-' + d.type,
            (d.type === 'ny' ? '+ ' : d.type === 'slettet' ? '− ' : '  ') + d.tekst));
        });
        bKort.appendChild(bDiff);
        if (f.begrunnelse) bKort.appendChild(el('div', 'ask-pop-hint', f.begrunnelse));
        var bRad = el('div', 'sources-info-actions');
        // 8k-klipp-vakt (sluttreview-funn): hentRefDocs klipper innebygde
        // dokumenter til 8000 tegn FØR modellen ser dem, men builtin
        // ny_tekst erstatter HELE data/sources/<id>.md via PR. For et
        // dokument som traff klippet (≥8000 tegn her) har modellen ALDRI
        // sett halen — en PR ville stille slette den. Tilby diff + Forkast
        // uten PR-knapp i så fall (lengste dokument i dag er 6913 tegn,
        // så dette er foreløpig latent, men ikke usannsynlig).
        var bKlippet = state.refDocs[bid].length >= 8000;
        if (bKlippet) {
          bKort.appendChild(el('div', 'ask-pop-hint',
            T('Document too large for a safe PR — edit it in the repo')));
        } else {
          // Ingen lokal skrivevei for innebygde dokumenter (bevisst):
          // kun PR (adminGate server-side er sperren) eller Forkast.
          bRad.appendChild(lagPrKnapp({ id: f.id, name: bid, of: bid, ny_tekst: f.ny_tekst }, bRad));
        }
        var bForkast = el('button', 'ai-codeblock-btn', T('Discard'));
        bForkast.type = 'button';
        bForkast.addEventListener('click', function () { bKort.remove(); });
        bRad.appendChild(bForkast);
        bKort.appendChild(bRad);
        innhold.appendChild(bKort);
        return;
      }
      var pr = global.Profiles && global.Profiles.get ? global.Profiles.get(String(f.id).slice(5)) : null;
      var kort = el('div', 'kf-kort');
      kort.appendChild(el('h4', null, pr ? pr.name : f.id));
      var diffBoks = el('div', 'kf-diff');
      linjeDiff(pr ? pr.text : '', f.ny_tekst).forEach(function (d) {
        var linje = el('div', 'kf-diff-' + d.type, (d.type === 'ny' ? '+ ' : d.type === 'slettet' ? '− ' : '  ') + d.tekst);
        diffBoks.appendChild(linje);
      });
      kort.appendChild(diffBoks);
      if (f.begrunnelse) kort.appendChild(el('div', 'ask-pop-hint', f.begrunnelse));
      var rad = el('div', 'sources-info-actions');
      var bruk = el('button', 'ai-response-insert-btn', T('Apply'));
      bruk.type = 'button';
      var forkast = el('button', 'ai-codeblock-btn', T('Discard'));
      forkast.type = 'button';
      bruk.addEventListener('click', function () {
        if (!pr) return;
        global.Profiles.update(String(f.id).slice(5), { text: f.ny_tekst });
        // Editoren kan stå åpen bak modalen med stale tekstfelt (sluttreview-
        // funn): varsle så den kan lese inn den aksepterte teksten.
        try {
          global.dispatchEvent(new CustomEvent('kildeforslag:brukt', {
            detail: { profileId: String(f.id).slice(5) } }));
        } catch (e) {}
        bruk.disabled = true; forkast.disabled = true;
        rad.appendChild(el('span', 'ask-pop-hint', ' ' + T('Applied — takes effect on your next question')));
      });
      forkast.addEventListener('click', function () { kort.remove(); });
      rad.appendChild(bruk);
      rad.appendChild(forkast);
      if (erAdmin()) {
        rad.appendChild(lagPrKnapp({
          id: f.id,
          name: pr ? pr.name : f.id,
          of: (pr && pr.origin && pr.origin.source === 'builtin-copy' && pr.origin.of) || undefined,
          ny_tekst: f.ny_tekst,
        }, rad));
      }
      kort.appendChild(rad);
      innhold.appendChild(kort);
    });

    // Kode-sporet (§4c): rotårsaken ligger i appen — admin får en
    // agent-klar bestilling som GitHub-issue. Ikke-admin ser bare melding.
    if (svar.kode_sak && erAdmin()) {
      var ks = svar.kode_sak;
      var ksKort = el('div', 'kf-kort');
      ksKort.appendChild(el('h4', null, '🔧 ' + ks.tittel));
      var ksPre = el('pre', 'kf-raa');
      ksPre.textContent = ks.kropp.slice(0, 2000);
      ksKort.appendChild(ksPre);
      var ksRad = el('div', 'sources-info-actions');
      var ksBtn = el('button', 'ai-codeblock-btn', T('Create GitHub issue'));
      ksBtn.type = 'button';
      ksBtn.addEventListener('click', function () {
        ksBtn.disabled = true;
        ksBtn.textContent = T('Sending …');
        fetch('/api/kilde-pr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ((global.mdAuth && global.mdAuth.token) || '') },
          body: JSON.stringify({ issue: { tittel: ks.tittel, kropp: ks.kropp } }),
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
            ksBtn.remove();
            var lenke = document.createElement('a');
            lenke.href = d.url; lenke.target = '_blank'; lenke.rel = 'noopener';
            lenke.textContent = T('Issue created:') + ' ' + d.url;
            ksRad.appendChild(lenke);
          }).catch(function (e) {
            try { console.error('kilde-issue:', e); } catch (_) {}
            ksBtn.disabled = false;
            ksBtn.textContent = T('Issue failed — try again');
          });
      });
      ksRad.appendChild(ksBtn);
      ksKort.appendChild(ksRad);
      innhold.appendChild(ksKort);
    }
  }

  var api = {
    byggForslagsPayload: byggForslagsPayload,
    involverteInnebygde: involverteInnebygde,
    hentRefDocs: hentRefDocs,
    skalViseKnapp: skalViseKnapp,
    parseForslagSvar: parseForslagSvar,
    linjeDiff: linjeDiff,
    ferskeDocs: ferskeDocs,
    erGyldigRefDocId: erGyldigRefDocId,
    erAdmin: erAdmin,
    byggEvidens: byggEvidens,
    registerRun: registerRun,
    openModal: openModal,
    byggKortCtx: byggKortCtx,
    openKortForslag: openKortForslag,
    _CAPS: CAPS,
  };
  global.KildeForslag = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
