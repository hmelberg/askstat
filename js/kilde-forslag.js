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
      return { ok: false, forslag: [], melding: '', raatekst: raa };
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

  // ── DOM-del (kun nettleser) ──────────────────────────────────────────
  var T = function (k, p) { return global.t ? global.t(k, p) : k; };
  var ctxSiste = null;

  function registerRun(ctx) {
    ctxSiste = ctx;
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
    bunn.appendChild(lukk);
    document.body.appendChild(backdrop);

    kjorRunde(state, innhold, rundeEl, bunn);
  }

  function kjorRunde(state, innhold, rundeEl, bunn) {
    rundeEl.textContent = T('Round {n}', { n: state.runde });
    innhold.innerHTML = '';
    innhold.appendChild(el('div', 'ai-progress-line', T('Getting suggestions …')));
    state.ctrl = new AbortController();

    var payload = byggForslagsPayload({
      docs: ferskeDocs(ctxSiste),
      question: ctxSiste.question, tolkning: ctxSiste.tolkning,
      mode: ctxSiste.mode, depth: ctxSiste.depth,
      runs: ctxSiste.runs, ok_script: ctxSiste.ok_script,
      trace: ctxSiste.trace, sources: ctxSiste.sources,
      history: state.history,
      ui_lang: global.M2PY_LANG || 'en',
    });
    payload.provider = (global.mdAiProviderConfig && global.mdAiProviderConfig()) || undefined;

    fetch('/api/kilde-forslag', {
      method: 'POST',
      headers: global.mdAiAuthHeaders(),
      body: JSON.stringify(payload),
      signal: state.ctrl.signal,
    }).then(function (resp) {
      if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);
      return global.mdSseAccumulate(resp, null, state.ctrl.signal);
    }).then(function (tekst) {
      state.sisteRaatekst = tekst;
      renderForslag(parseForslagSvar(tekst), state, innhold, rundeEl, bunn);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      innhold.innerHTML = '';
      innhold.appendChild(el('div', 'ai-error', '✗ ' + ((e && e.message) || String(e))));
    });
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
        bruk.disabled = true; forkast.disabled = true;
        rad.appendChild(el('span', 'ask-pop-hint', ' ' + T('Applied — takes effect on your next question')));
      });
      forkast.addEventListener('click', function () { kort.remove(); });
      rad.appendChild(bruk);
      rad.appendChild(forkast);
      kort.appendChild(rad);
      innhold.appendChild(kort);
    });
  }

  var api = {
    byggForslagsPayload: byggForslagsPayload,
    skalViseKnapp: skalViseKnapp,
    parseForslagSvar: parseForslagSvar,
    linjeDiff: linjeDiff,
    ferskeDocs: ferskeDocs,
    registerRun: registerRun,
    openModal: openModal,
    _CAPS: CAPS,
  };
  global.KildeForslag = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
