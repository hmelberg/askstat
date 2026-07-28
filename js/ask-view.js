/* ===================================================================
   Ask-visning (default i askstat; ?view=editor gir full editor-visning)
   — spørsmål → kode → svar
   Rene funksjoner her; DOM-oppkobling nederst (plan Task 5).
   =================================================================== */
(function askViewModule() {
  var T = window.t || function (s, p) { return p ? s.replace(/\{(\w+)\}/g, function (m, k) { return k in p ? p[k] : m; }) : s; };

  var ASK_ROUTES = ['beregning', 'data', 'oppslag', 'språk'];

  // Tolerant uthenting av ruter-JSON: modellen skal svare med rent JSON, men
  // vi godtar tekst/kodeblokker rundt. Alt ugyldig → rute 'data' (= dagens
  // data-svar-oppførsel, spec §Feilhåndtering).
  function parseAskRoute(text) {
    var fallback = { rute: 'data', tolkning: '', begrunnelse: '', svar: '' };
    if (!text) return fallback;
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return fallback;
    var obj;
    try { obj = JSON.parse(text.slice(start, end + 1)); } catch (_) { return fallback; }
    var rute = (obj && typeof obj.rute === 'string') ? obj.rute.toLowerCase().trim() : '';
    return {
      rute: ASK_ROUTES.indexOf(rute) >= 0 ? rute : 'data',
      tolkning: (obj && typeof obj.tolkning === 'string') ? obj.tolkning : '',
      begrunnelse: (obj && typeof obj.begrunnelse === 'string') ? obj.begrunnelse : '',
      svar: (obj && typeof obj.svar === 'string') ? obj.svar : '',
    };
  }

  // Proveniens-blokk som settes ØVERST i det genererte scriptet (spec §4):
  // spørsmål, operasjonell tolkning og rute som kommentarer, i modusens
  // kommentarsyntaks. Én linje per felt (linjeskift i feltene flates ut).
  var COMMENT_PREFIX = { python: '#', r: '#', duckdb: '--' };
  function buildAskProvenance(meta, mode) {
    var p = COMMENT_PREFIX[mode] || '#';
    var one = function (s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); };
    var lines = [
      p + ' ══ ask ══ generert av askstat',
      p + ' Spørsmål: ' + one(meta.question),
      p + ' Tolkning: ' + one(meta.tolkning),
      p + ' Rute: ' + one(meta.rute),
    ];
    return lines.join('\n') + '\n\n';
  }

  /* ── DOM-oppkobling (kjører kun i nettleser når ask-visningen er aktiv) ── */
  function sseAccumulate(resp, onText, signal) {
    // Minimal SSE-leser for tolk-/ruter-endepunktene ({type:'text'|'error'}).
    return new Promise(function (resolve, reject) {
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '', accumulated = '';
      function pump() {
        reader.read().then(function (r) {
          if (signal && signal.aborted) { try { reader.cancel(); } catch (_) {} return reject(Object.assign(new Error('Avbrutt'), { name: 'AbortError' })); }
          if (r.done) return resolve(accumulated);
          buffer += decoder.decode(r.value, { stream: true });
          var nl;
          while ((nl = buffer.indexOf('\n\n')) >= 0) {
            var event = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            var dataLine = event.split('\n').find(function (l) { return l.indexOf('data:') === 0; });
            if (!dataLine) continue;
            var obj;
            try { obj = JSON.parse(dataLine.slice(5).trim()); } catch (_) { continue; }
            if (obj.type === 'text') { accumulated += obj.text; if (onText) onText(accumulated); }
            else if (obj.type === 'error') { try { reader.cancel(); } catch (_) {} return reject(new Error(obj.message || 'Ukjent feil fra server')); }
          }
          pump();
        }, reject);
      }
      pump();
    });
  }

  function initAskView() {
    if (!document.documentElement.classList.contains('ask-view')) return;
    var view = document.getElementById('askView');
    if (!view) return;
    view.hidden = false;

    var md = window.markdownit ? window.markdownit({ breaks: true, linkify: true }) : null;
    var input = document.getElementById('askInput');
    var sendBtn = document.getElementById('askSendBtn');
    var abortBtn = document.getElementById('askAbortBtn');
    var processBox = document.getElementById('askProcess');
    var answerCard = document.getElementById('askAnswerCard');
    var answerBox = document.getElementById('askAnswer');
    var uiLang = (window.M2PY_LANG === 'en') ? 'en' : 'no';
    var running = false;

    // Ask krever en data-svar-kompatibel modus (fence-språk + MODE-prompt).
    // NB: bare identifier m/typeof-guard, IKKE window.activeEditorMode — samme
    // mønster som ai-chat.js (globalen kan være let/const-deklarert).
    function currentAskMode() {
      return (typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python';
    }
    if (['python', 'r', 'duckdb'].indexOf(currentAskMode()) < 0 &&
        typeof switchEditorMode === 'function') {
      switchEditorMode('python');
    }

    document.getElementById('askSettingsBtn').addEventListener('click', function () {
      if (window.mdOpenAiSettings) window.mdOpenAiSettings();
    });
    document.getElementById('askOpenEditorBtn').addEventListener('click', function () {
      // Full editor-visning med koden i editoren og output i panelet — INGEN
      // reload (reload ville kastet outputen). Chrome-synligheten er ren CSS
      // nøklet på html.ask-view, så det holder å fjerne klassen og skjule
      // ask-UI-et. URL-en oppdateres til ?view=editor så en refresh/deling
      // lander i samme visning.
      document.documentElement.classList.remove('ask-view');
      view.hidden = true;
      var url = new URL(location.href);
      url.searchParams.set('view', 'editor');
      history.replaceState(null, '', url.toString());
      window.dispatchEvent(new Event('resize'));   // la editor/plott re-layoute
    });
    document.getElementById('askNewBtn').addEventListener('click', function () {
      answerCard.hidden = true;
      processBox.innerHTML = '';
      input.value = '';
      input.focus();
    });

    function renderMd(node, text) {
      if (md) { try { node.innerHTML = md.render(text || ''); return; } catch (_) {} }
      node.textContent = text || '';
    }
    function showAnswer(markdown, badgeText, badgeWarn) {
      answerCard.hidden = false;
      renderMd(answerBox, markdown);
      if (badgeText) {
        var b = document.createElement('div');
        b.className = 'ask-badge' + (badgeWarn ? ' ask-badge-warn' : '');
        b.textContent = badgeText;
        answerBox.insertBefore(b, answerBox.firstChild);
      }
      // Kildelisten fra runWebAnswer flyttes fra prosess-seksjonen inn i svaret.
      var src = processBox.querySelector('.ai-sources');
      if (src) answerBox.appendChild(src);
      answerCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function progressLine(text) {
      var d = document.createElement('div');
      d.className = 'ai-progress-line';
      d.textContent = '⏳ ' + text;
      processBox.appendChild(d);
    }
    // S2-bekreftelse (samme sikkerhetsposisjon som AI-panelet — data-svar gjør
    // websøk, så første kjøring per svar må være brukerinitiert; opt-out
    // localStorage.md_ai_autorun håndteres inne i mdAskRun).
    function askConfirm() {
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.className = 'ask-confirm';
        var q = document.createElement('span');
        q.textContent = T('Kjør den genererte koden?') + ' ';
        var yes = document.createElement('button');
        yes.type = 'button'; yes.className = 'ai-response-insert-btn'; yes.textContent = T('Kjør');
        var no = document.createElement('button');
        no.type = 'button'; no.className = 'ai-codeblock-btn'; no.textContent = T('Avbryt');
        wrap.appendChild(q); wrap.appendChild(yes); wrap.appendChild(no);
        processBox.appendChild(wrap);
        function settle(v) { wrap.remove(); resolve(v); }
        yes.addEventListener('click', function () { settle(true); });
        no.addEventListener('click', function () { settle(false); });
      });
    }

    async function runAskFlow() {
      var question = input.value.trim();
      if (!question || running) return;
      if (!window.mdAiHasKey || !window.mdAiHasKey()) {
        showAnswer(T('Ask krever at du legger inn din egen API-nøkkel (den lagres kun i denne nettleseren, og forbruk går på din egen konto).'), T('Mangler API-nøkkel'), true);
        if (window.mdOpenAiSettings) window.mdOpenAiSettings();
        return;
      }
      running = true;
      sendBtn.disabled = true;
      abortBtn.style.display = '';
      answerCard.hidden = true;
      processBox.innerHTML = '';
      var ctrl = new AbortController();
      var onAbort = function () { ctrl.abort(); };
      abortBtn.addEventListener('click', onAbort);
      try {
        // 1) Ruter
        progressLine(T('Tolker spørsmålet …'));
        var route = { rute: 'data', tolkning: '', begrunnelse: '', svar: '' };
        try {
          var resp = await fetch('/api/ask-ruter', {
            method: 'POST',
            headers: window.mdAiAuthHeaders(),
            signal: ctrl.signal,
            body: JSON.stringify({ question: question, ui_lang: uiLang, provider: window.mdAiProviderConfig() || undefined }),
          });
          if (resp.ok && resp.body) route = parseAskRoute(await sseAccumulate(resp, null, ctrl.signal));
        } catch (e) { if (e && e.name === 'AbortError') throw e; /* ruterfeil → data-ruten */ }
        progressLine(T('Rute: {rute}. Tolkning: {t}', { rute: route.rute, t: route.tolkning || '—' }));

        // 2) Språk-ruten: direkte svar med merking, ingen kode.
        if (route.rute === 'språk') {
          showAnswer(route.svar || T('Dette spørsmålet lot seg ikke formalisere, og ruteren ga ikke noe direkte svar.'),
            T('⚠ Ikke verifisert med kode eller data — vanlig modellsvar'), true);
          return;
        }

        // 3) Data-svar-løkka (beregning/data/oppslag). Instrukser legges
        //    KLIENT-SIDE i spørsmålsteksten — data-svar-promptene røres ikke.
        var instr = route.rute === 'beregning'
          ? T('[Instruks: Ren beregningsoppgave — ingen eksterne datakilder trengs. Skriv ett komplett script som beregner svaret, med kommentarer som forklarer valgene dine.]')
          : T('[Instruks: Kommenter valgene dine i koden — hvorfor denne kilden/tabellen, avgrensningen og beregningen.]');
        var fullQuestion = question +
          (route.tolkning ? '\n\n' + T('Operasjonell tolkning (fra ruteren): ') + route.tolkning : '') +
          '\n\n' + instr;
        var prefix = buildAskProvenance({ question: question, tolkning: route.tolkning, rute: route.rute },
          currentAskMode());
        // Output-panelet må være SYNLIG før kjøringen starter — plotly som
        // rendres i et display:none-element får null-bredde (spec-ens
        // verifiseringspunkt om skjult output).
        document.documentElement.classList.add('ask-has-run');
        var res = await window.mdAskRun(fullQuestion, {
          processNode: processBox, signal: ctrl.signal, scriptPrefix: prefix, confirm: askConfirm,
        });

        if (res.error === 'avbrutt') { progressLine(T('Avbrutt.')); return; }
        if (!res.ok && res.error === null) {
          // Prosa-svar uten kode (typisk oppslag/web eller ærlig «fant ikke»).
          showAnswer(res.markdown, T('⚠ Kildebasert svar (websøk) — ikke verifisert med kode'), true);
          return;
        }
        if (!res.ok) {
          showAnswer(T('Klarte ikke å beregne dette (3 reparasjonsrunder feilet). Siste feil:') +
            '\n\n```\n' + String(res.error).slice(0, 800) + '\n```\n\n' +
            T('Koden står i editoren — «Åpne i Python-modus» for å se og justere.'),
            T('⚠ Beregningen feilet'), true);
          return;
        }

        // 4) Kjøringen lyktes → tolk-ask komponerer svaret fra output.
        progressLine(T('Oppsummerer resultatet …'));
        var outEl = document.getElementById('outputArea');
        var outText = (outEl ? (outEl.innerText || '') : '').trim().slice(0, 30000);
        var si = document.getElementById('scriptInput');
        var tolkResp = await fetch('/api/tolk-ask', {
          method: 'POST',
          headers: window.mdAiAuthHeaders(),
          signal: ctrl.signal,
          body: JSON.stringify({
            question: question,
            interpretation: route.tolkning,
            script: ((si && si.value) || '').slice(0, 30000),
            output: outText,
            ui_lang: uiLang,
            provider: window.mdAiProviderConfig() || undefined,
          }),
        });
        if (!tolkResp.ok || !tolkResp.body) throw new Error('HTTP ' + tolkResp.status + ' ' + (await tolkResp.text()));
        answerCard.hidden = false;
        var finalMd = await sseAccumulate(tolkResp, function (acc) { renderMd(answerBox, acc); }, ctrl.signal);
        showAnswer(finalMd, null, false);
      } catch (e) {
        if (e && e.name === 'AbortError') progressLine(T('Avbrutt.'));
        else showAnswer('✗ ' + ((e && e.message) ? e.message : String(e)), T('Feil'), true);
      } finally {
        abortBtn.removeEventListener('click', onAbort);
        abortBtn.style.display = 'none';
        sendBtn.disabled = false;
        running = false;
      }
    }

    sendBtn.addEventListener('click', runAskFlow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAskFlow(); }
    });
    input.focus();
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAskView);
    else initAskView();
  }

  // Node-testbar seam (samme mønster som js/ai-chat.js nederst).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseAskRoute: parseAskRoute,
      buildAskProvenance: buildAskProvenance,
    };
  }
})();
