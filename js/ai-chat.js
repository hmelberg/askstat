    /* ===================================================================
       AI assistant — sidebar wiring + API calls
       =================================================================== */
    (function aiModule() {
      var T = window.t || function (s, p) { return p ? s.replace(/\{(\w+)\}/g, function (m, k) { return k in p ? p[k] : m; }) : s; };
      // BYOK-nøkkelen bor i det felles nøkkellageret (js/keys.js, type 'anthropic').

      // key(<literal>) i scriptet er en hemmelighet — maskeres før scriptet
      // sendes til AI-endepunkter (spec 2026-07-05 §5). key(ask) beholdes.
      function scrubScript(s) {
        return (window.DataDirectives && window.DataDirectives.scrubKeys)
          ? window.DataDirectives.scrubKeys(s || '') : (s || '');
      }

      const state = {
        sending: false,
        history: [],   // {role, html|text, raw}
        get anthropicKey() { return (window.Keys && window.Keys.get('anthropic')) || ''; },
      };

      // Web mode requires a user-supplied Anthropic key (BYOK — the agentic
      // search then runs on the user's own account), and only makes sense in
      // python/r/duckdb editor modes (no `# connect`/`# load` story for
      // microdata). Surfaced only via its own send button
      // (syncWebBtnVisibility() shows/hides #aiSendWebBtn).
      function webModeEligible() {
        const hasByok = !!state.anthropicKey || customProviderReady();
        const mode = (typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python';
        return hasByok && (mode === 'python' || mode === 'r' || mode === 'duckdb');
      }

      const md = (window.markdownit ? window.markdownit({ breaks: true, linkify: true }) : null);

      const $ = (id) => document.getElementById(id);
      const dom = {};
      function cacheDom() {
        ['aiToggleBtn','aiSidebar','aiCloseBtn','aiSettingsBtn','aiClearBtn',
         'aiThread','aiInput','aiSendFastBtn','aiSendV2Btn','aiSendWebBtn','aiAbortBtn',
         'aiIncludeScript',
         'aiSettingsBackdrop','aiCfgAnthropicKey','aiCfgSave','aiCfgCancel',
         'aiCfgAnthropicSection','aiCfgByokStored','aiCfgByokRemove','aiCfgSourceKeys',
         'aiCfgProviderType','aiCfgProviderFields','aiCfgProviderUrl','aiCfgProviderModel','aiCfgLlmKey',
         'aiCfgUserKeys','aiCfgUserKeyList','aiCfgUserKeyAdd','aiCfgUserKeyForm',
         'userKeyName','userKeyValue','userKeyNote','userKeySave',
         'aiCfgTelemetry',
         'sidebarRight','sidebarOpenTab','scriptInput'
        ].forEach(id => { dom[id] = $(id); });
        dom.containers = document.querySelectorAll('.container');
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
          '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
      }

      function setOpen(open) {
        if (open) {
          // Mutually exclusive with Datasett sidebar
          if (dom.sidebarRight && !dom.sidebarRight.classList.contains('collapsed')) {
            dom.sidebarRight.classList.add('collapsed');
            dom.containers.forEach(c => c.classList.remove('sidebar-open'));
          }
          // Always make sure the Datasett open-tab is reachable; the original
          // code uses a `.hidden` class to hide it while Datasett is open.
          if (dom.sidebarOpenTab) dom.sidebarOpenTab.classList.remove('hidden');
          dom.aiSidebar.classList.add('open');
          dom.aiSidebar.setAttribute('aria-hidden', 'false');
          dom.containers.forEach(c => c.classList.add('ai-open'));
          dom.aiToggleBtn.classList.add('active');
          if (state.history.length === 0) renderEmpty();
          setTimeout(() => dom.aiInput.focus(), 60);
        } else {
          dom.aiSidebar.classList.remove('open');
          dom.aiSidebar.setAttribute('aria-hidden', 'true');
          dom.containers.forEach(c => c.classList.remove('ai-open'));
          dom.aiToggleBtn.classList.remove('active');
          // Make sure the Datasett tab is reachable after the AI panel goes away.
          if (dom.sidebarOpenTab && dom.sidebarRight && dom.sidebarRight.classList.contains('collapsed')) {
            dom.sidebarOpenTab.classList.remove('hidden');
          }
        }
      }
      function toggleOpen() { setOpen(!dom.aiSidebar.classList.contains('open')); }

      function renderEmpty() {
        dom.aiThread.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'ai-empty';
        wrap.innerHTML = '<div class="ai-empty-title">' + T('Hei! Hva kan jeg hjelpe med?') + '</div>' +
          '<div>' + T('Spør om en analyse, et skript, eller hva en kommando gjør.') + '</div>' +
          '<div class="ai-empty-examples">' +
            '<button type="button" class="ai-empty-example" data-q="' + T('Vis sammendragsstatistikk for inntekt og kjønn') + '">' + T('Vis sammendragsstatistikk for inntekt og kjønn') + '</button>' +
            '<button type="button" class="ai-empty-example" data-q="What does reshape long do?">What does reshape long do?</button>' +
            '<button type="button" class="ai-empty-example" data-q="' + T('Hvilke variabler finnes for utdanning?') + '">' + T('Hvilke variabler finnes for utdanning?') + '</button>' +
          '</div>';
        dom.aiThread.appendChild(wrap);
        wrap.querySelectorAll('.ai-empty-example').forEach(btn => {
          btn.addEventListener('click', () => {
            dom.aiInput.value = btn.dataset.q;
            autoresize();
            sendWebMessage();
          });
        });
      }

      function appendUserMessage(text) {
        const wrap = document.createElement('div');
        wrap.className = 'ai-msg ai-msg-user';
        wrap.innerHTML = '<div class="ai-bubble"></div>';
        wrap.querySelector('.ai-bubble').textContent = text;
        dom.aiThread.appendChild(wrap);
        scrollToBottom();
      }

      function appendThinking() {
        const wrap = document.createElement('div');
        wrap.className = 'ai-msg ai-msg-assistant';
        wrap.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span style="margin-left:4px">' + T('Tenker…') + '</span></div>';
        dom.aiThread.appendChild(wrap);
        scrollToBottom();
        return wrap;
      }

      function appendError(node, msg) {
        node.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'ai-error';
        err.textContent = msg;
        node.appendChild(err);
        scrollToBottom();
      }

      // Avbrudd er ikke en feil: behold delvis strømmet innhold i noden
      // (appendError wiper den) og legg på en nøytral notis.
      function appendCancelNote(node) {
        const dots = node.querySelector('.ai-thinking');
        if (dots) dots.remove();
        const note = document.createElement('div');
        note.className = 'ai-repair-note';
        note.textContent = T('Avbrutt.');
        node.appendChild(note);
        scrollToBottom();
      }

      function appendAssistantText(node, text, meta) {
        node.innerHTML = '';
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        bubble.innerHTML = md ? md.render(text || '') : escapeHtml(text || '').replace(/\n/g, '<br>');
        bubble._rawMd = text || '';
        node.appendChild(bubble);
        if (meta) appendMeta(node, meta);
        attachCodeBlockActions(bubble);
        attachResponseInsertBar(node, text || '');
        scrollToBottom();
      }

      function appendAssistantScript(node, script, rationale, meta) {
        node.innerHTML = '';
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        if (rationale) {
          const rationaleHtml = md ? md.render(rationale) : '<p>' + escapeHtml(rationale) + '</p>';
          bubble.innerHTML += rationaleHtml;
        }
        // Custom code-block markup with action buttons
        const cbWrap = document.createElement('div');
        cbWrap.className = 'ai-codeblock-wrap';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = script;
        pre.appendChild(code);
        cbWrap.appendChild(pre);
        const actions = document.createElement('div');
        actions.className = 'ai-codeblock-actions';
        actions.innerHTML =
          '<button type="button" class="ai-codeblock-btn" data-act="copy">📋 ' + T('Kopier') + '</button>';
        cbWrap.appendChild(actions);
        bubble.appendChild(cbWrap);
        actions.addEventListener('click', (e) => {
          const btn = e.target.closest('.ai-codeblock-btn');
          if (!btn) return;
          handleCodeAction(btn.dataset.act, script, btn);
        });
        // Validation warnings (unknown variables / commands / parse errors)
        const warning = renderValidationWarnings(meta && meta.validation);
        if (warning) bubble.appendChild(warning);
        node.appendChild(bubble);
        if (meta) appendMeta(node, meta);
        // Response-level "Sett inn" bar (synthesize markdown from rationale + code)
        const rawMd = (rationale ? rationale + '\n\n' : '') + '```microdata\n' + script + '\n```';
        bubble._rawMd = rawMd;
        attachResponseInsertBar(node, rawMd);
        scrollToBottom();
      }

      function renderValidationWarnings(validation) {
        if (!validation || validation.passed || !validation.errors || !validation.errors.length) {
          return null;
        }
        const wrap = document.createElement('div');
        wrap.className = 'ai-validation-warning';
        const title = document.createElement('div');
        title.className = 'ai-validation-warning-title';
        title.textContent = T('⚠ Valideringsadvarsler');
        wrap.appendChild(title);

        const groups = { unknown_variable: [], unknown_command: [], parse: [], runtime: [], other: [] };
        for (const e of validation.errors) {
          const k = e.kind in groups ? e.kind : 'other';
          groups[k].push(e);
        }

        const renderChips = (label, errs, suggestionTemplate) => {
          if (!errs.length) return;
          const sec = document.createElement('div');
          sec.className = 'ai-validation-section';
          const lab = document.createElement('div');
          lab.className = 'ai-validation-section-label';
          lab.textContent = label;
          sec.appendChild(lab);
          const chips = document.createElement('div');
          chips.className = 'ai-validation-chips';
          errs.forEach(e => {
            const chip = document.createElement('span');
            chip.className = 'ai-chip';
            chip.textContent = e.token || e.message || '?';
            chip.title = T('{msg} — klikk for å foreslå alternativ', { msg: e.message || '' });
            chip.addEventListener('click', () => {
              if (!dom.aiInput) return;
              dom.aiInput.value = suggestionTemplate.replace('{token}', e.token || '');
              autoresize();
              dom.aiInput.focus();
            });
            chips.appendChild(chip);
          });
          sec.appendChild(chips);
          wrap.appendChild(sec);
        };

        renderChips(T('Ukjente variabler'), groups.unknown_variable, T('Bruk en annen variabel for {token}'));
        renderChips(T('Ukjente kommandoer'), groups.unknown_command, T('Skriv om uten å bruke {token}'));

        const others = [...groups.parse, ...groups.runtime, ...groups.other];
        if (others.length) {
          const sec = document.createElement('div');
          sec.className = 'ai-validation-section';
          const lab = document.createElement('div');
          lab.className = 'ai-validation-section-label';
          lab.textContent = T('Andre advarsler');
          sec.appendChild(lab);
          const ul = document.createElement('ul');
          ul.className = 'ai-validation-bullets';
          others.forEach(e => {
            const li = document.createElement('li');
            const lineHint = e.line_no ? T('linje {n}: ', { n: e.line_no }) : '';
            li.textContent = lineHint + (e.message || e.kind);
            ul.appendChild(li);
          });
          sec.appendChild(ul);
          wrap.appendChild(sec);
        }

        return wrap;
      }

      function appendAssistantVariableList(node, variables, meta) {
        node.innerHTML = '';
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        if (!variables || !variables.length) {
          bubble.textContent = T('Ingen variabler funnet.');
        } else {
          const intro = document.createElement('p');
          intro.textContent = T('Fant {n} variabler:', { n: variables.length });
          bubble.appendChild(intro);
          const list = document.createElement('ul');
          list.style.margin = '0'; list.style.paddingLeft = '18px';
          variables.forEach(v => {
            const li = document.createElement('li');
            li.style.marginBottom = '4px';
            li.innerHTML = '<code>' + escapeHtml(v.name) + '</code> — ' + escapeHtml(v.short_title || '');
            list.appendChild(li);
          });
          bubble.appendChild(list);
        }
        node.appendChild(bubble);
        if (meta) appendMeta(node, meta);
        scrollToBottom();
      }

      function appendMeta(node, meta) {
        // Meta-linja (intent · modell · tid · tokens · cache) er støy for brukeren — vises ikke.
      }

      function commentize(text) {
        return String(text).split('\n').map(l => '// ' + l).join('\n');
      }

      // Build editor content from a full markdown response, preserving document
      // order ("legg de etter hverandre"). includeComments=false → only the code
      // blocks; true → prose rendered as // comments interleaved with the code.
      function buildInsertContent(rawMd, includeComments) {
        if (!rawMd) return '';
        const re = /```[^\n]*\r?\n([\s\S]*?)```/g;
        const parts = [];
        let last = 0, m;
        while ((m = re.exec(rawMd)) !== null) {
          if (includeComments) {
            const prose = rawMd.slice(last, m.index).trim();
            if (prose) parts.push(commentize(prose));
          }
          const code = (m[1] || '').replace(/\s+$/, '');
          if (code.trim()) parts.push(code);
          last = re.lastIndex;
        }
        if (includeComments) {
          const tail = rawMd.slice(last).trim();
          if (tail) parts.push(commentize(tail));
        }
        // No fenced code at all: comment the whole thing when asked, else nothing.
        if (parts.length === 0 && includeComments) {
          const all = rawMd.trim();
          if (all) parts.push(commentize(all));
        }
        return parts.join('\n\n');
      }

      function hasCodeBlock(rawMd) {
        return !!rawMd && /```[\s\S]*?```/.test(rawMd);
      }

      // Response-level action bar shown under the whole answer: an "include
      // explanation as comment" checkbox and a single "Sett inn" button that
      // replaces the editor content.
      function attachResponseInsertBar(node, rawMd) {
        if (!dom.scriptInput || !hasCodeBlock(rawMd)) return;
        const bar = document.createElement('div');
        bar.className = 'ai-response-actions';

        const lbl = document.createElement('label');
        lbl.className = 'ai-include-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + T('Inkluder forklaring som kommentar')));

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-response-insert-btn';
        btn.textContent = T('Sett inn');
        btn.title = T('Sett svaret inn i editoren (erstatter innholdet)');
        btn.addEventListener('click', () => {
          const content = buildInsertContent(rawMd, cb.checked);
          if (!content) return;
          dom.scriptInput.value = content;
          dom.scriptInput.dispatchEvent(new Event('input', { bubbles: true }));
          flash(btn, T('✓ Satt inn'));
        });

        // Knapp før checkbox (horisontalt).
        bar.appendChild(btn);
        bar.appendChild(lbl);
        node.appendChild(bar);
      }

      function handleCodeAction(act, script, btn) {
        if (act === 'copy') {
          navigator.clipboard.writeText(script).then(() => flash(btn, T('✓ Kopiert')));
        }
      }

      function flash(btn, label) {
        const original = btn.textContent;
        btn.textContent = label;
        btn.classList.add('flash');
        setTimeout(() => { btn.textContent = original; btn.classList.remove('flash'); }, 1200);
      }

      function attachCodeBlockActions(bubble) {
        // For markdown-rendered code blocks, attach a small copy button
        bubble.querySelectorAll('pre').forEach(pre => {
          if (pre.parentElement.classList.contains('ai-codeblock-wrap')) return;
          const codeEl = pre.querySelector('code') || pre;
          const text = codeEl.textContent;
          if (!text || text.length < 12) return;
          const wrap = document.createElement('div');
          wrap.className = 'ai-codeblock-wrap';
          pre.parentElement.insertBefore(wrap, pre);
          wrap.appendChild(pre);
          const actions = document.createElement('div');
          actions.className = 'ai-codeblock-actions';
          actions.innerHTML =
            '<button type="button" class="ai-codeblock-btn" data-act="copy">📋 ' + T('Kopier') + '</button>';
          wrap.appendChild(actions);
          actions.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-codeblock-btn');
            if (!btn) return;
            handleCodeAction(btn.dataset.act, text, btn);
          });
        });
      }

      function scrollToBottom() {
        dom.aiThread.scrollTop = dom.aiThread.scrollHeight;
      }

      // Headers for edge-funksjonene (/api/*): kun BYOK Anthropic-nøkkel.
      function edgeAuthHeaders() {
        if (state.anthropicKey) return { 'X-Anthropic-Key': state.anthropicKey, 'Content-Type': 'application/json' };
        return { 'Content-Type': 'application/json' };
      }

      function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

      function detectLang(text) {
        // Crude: if it has Norwegian chars or common NO words, treat as 'no', else 'en'.
        if (/[æøåÆØÅ]/.test(text)) return 'no';
        const noWords = /\b(hva|hvordan|kjør|skript|gjør|finnes|vis|inntekt|kjønn|kommune|alder)\b/i;
        if (noWords.test(text)) return 'no';
        const enWords = /\b(what|how|show|run|script|does|find|income|gender|age)\b/i;
        if (enWords.test(text)) return 'en';
        return (window.M2PY_LANG === 'en') ? 'en' : 'no';
      }


      // ── Fast path: stream from the /api/kode-svar edge function (single-shot,
      //    no repair), render markdown live, then validate the emitted script
      //    locally in Pyodide+m2py and show a pass/⚠ badge. Returns meta.
      // Render markdown inn i boblen under streaming (faller tilbake til ren
      // tekst hvis markdown-it mangler eller parsing feiler på ufullstendig md).
      function streamRenderMd(bubble, textMd) {
        if (md) {
          try { bubble.innerHTML = md.render(textMd || ''); return; }
          catch (_) { /* fall through */ }
        }
        bubble.textContent = textMd || '';
      }


      // One streaming request to /api/kode-svar-v2. Renders markdown live into
      // `bubble`. Returns { accumulated, tokens }. Mirrors runFastQuery's stream
      // parsing; factored out so the repair round can call it again.

      // Concatenate all fenced code-block bodies (any language) so name-grounding
      // can scan the #micro import inside a python/r answer without prose noise.
      function extractAllCode(md) {
        if (!md) return '';
        const re = /```\w*\s*\n([\s\S]*?)```/g;
        let m, out = [];
        while ((m = re.exec(md)) !== null) out.push(m[1]);
        return out.join('\n');
      }

      // Generalizes extractFirstMicrodataBlock's fence-scanning for a single,
      // explicitly-tagged language (used by the python/r nivå 1-validatorer,
      // see docs/ROADMAP.md §AI-assistenten). Unlike extractFirstMicrodataBlock
      // (which sniffs untagged fences for microdata-looking syntax),
      // kode-svar-v2's python/r svarformat ALWAYS tags its one code fence with
      // the language (see netlify/edge-functions/kode-svar.ts OUTPUT_PY/OUTPUT_R)
      // — so a plain tag match is enough, no sniffing needed.
      const CODE_FENCE_LANGS = { python: ['python', 'py'], r: ['r'] };
      function extractFirstCodeBlock(textMd, lang) {
        if (!textMd) return '';
        const wanted = CODE_FENCE_LANGS[lang] || [lang];
        const re = /```(\w*)\s*\n([\s\S]*?)```/g;
        let m;
        while ((m = re.exec(textMd)) !== null) {
          const l = (m[1] || '').toLowerCase();
          if (wanted.indexOf(l) < 0) continue;
          const body = (m[2] || '').trim();
          if (body) return body;
        }
        return '';
      }

      // Collect db/NAME (or alias/NAME) tokens whose NAME is not in the loaded
      // catalog — the cheapest, most damaging failure (invented variable names).
      function findUnknownVarNames(script) {
        if (!script || typeof microdataVariableNames === 'undefined' || !microdataVariableNames.length) return [];
        const known = new Set(microdataVariableNames);
        const re = /\b[a-zA-Z_]\w*\/([A-Z][A-Z0-9_]+)\b/g;
        const bad = new Set();
        let m;
        while ((m = re.exec(script)) !== null) {
          if (!known.has(m[1])) bad.add(m[1]);
        }
        return Array.from(bad);
      }

      // Turn a validation result + unknown-name list into a compact error string
      // for the repair prompt. Returns '' when there is nothing to fix.
      function buildRepairErrors(vr, unknownNames) {
        const parts = [];
        if (unknownNames && unknownNames.length) {
          parts.push('Ukjente variabelnavn (finnes ikke i katalogen): ' + unknownNames.join(', '));
        }
        if (vr && !vr.skipped && !vr.passed && Array.isArray(vr.errors)) {
          for (const e of vr.errors) {
            const tok = e.token ? (e.token + ': ') : '';
            parts.push('- ' + tok + (e.message || e.kind || 'feil'));
          }
        }
        return parts.join('\n');
      }

      // Nivå 1 auto-retting (docs/ROADMAP.md §AI-assistenten): modus-dispatch
      // for kode-svar-v2-reparasjonssløyfen i runFastQueryV2. Hver oppføring
      // gir (a) extract(mdText) → kandidatscript eller '' (ingen kodeblokk
      // funnet — sløyfen kjører da ikke), (b) validate(script) → Promise som
      // løser til {passed,errors[]} eller {skipped:true}, (c)
      // unknownNames(mdText, script) → liste over ukjente katalog-variabelnavn.
      // (microdata-oppføringen er fjernet med kode-svar-flyten 2026-07-24;
      // python/r-oppføringene står klare til den planlagte klientvalidatoren,
      // se docs/ROADMAP.md §AI-assistenten.)
      const _v2Validators = {
        // Syntaks-sjekk kjører KUN mot en allerede lastet/lastende Pyodide-økt
        // (validatePythonSyntax under) — den booter aldri en ny 30s-runtime
        // bare for å validere ett AI-svar. Kolonnenavn-sjekk (df["kol"]) er
        // BEVISST utelatt her — se rapporten for begrunnelsen (lastDatasetInfo
        // reflekterer forrige kjørings tilstand, ikke aliasene DENNE
        // kandidatscripten selv definerer i sin egen #micro-blokk, så en sjekk
        // mot den ville gitt falske "ukjent kolonne"-feil på gyldige script).
        // unknownNames scans ONLY the #micro header segment of the candidate
        // script (via extractLangSegment(script, 'microdata') — a plain reuse
        // of the same parseHybridScript segmenter the syntax-checks below use,
        // just asking for the 'microdata' kind instead of 'pyodide'/'r').
        // import/require statements only legally occur there; scanning the
        // whole markdown answer (as extractAllCode(mdText) did before) let
        // ordinary analysis-code tokens like `total/N_OBS` divisions or
        // `"data/GDP.csv"` path strings false-positive as "unknown variables".
        python: {
          extract: function (mdText) { return extractFirstCodeBlock(mdText, 'python'); },
          validate: validatePythonSyntax,
          unknownNames: function (_mdText, script) { return findUnknownVarNames(extractLangSegment(script, 'microdata')); },
        },
        r: {
          extract: function (mdText) { return extractFirstCodeBlock(mdText, 'r'); },
          validate: validateRSyntax,
          unknownNames: function (_mdText, script) { return findUnknownVarNames(extractLangSegment(script, 'microdata')); },
        },
      };


      // Tolk resultater: strøm en tolkning av output (kommandoer + resultater)
      // inn i en assistent-boble. Speiler runFastQuery, men mot /api/tolk-resultat.
      async function runInterpretQuery(payload, thinkingNode, signal) {
        const headers = providerAuthHeaders();
        const resp = await fetch('/api/tolk-resultat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            script: payload.script || '',
            output: payload.output || '',
            outputs: payload.outputs || '',
            språk: payload.lang || 'auto',
            ui_lang: window.M2PY_LANG || 'en',
            provider: providerConfig() || undefined,
          }),
          signal,
        });
        if (resp.status === 401) {
          throw new Error(customProviderReady()
            ? T('AI-leverandøren avviste nøkkelen (401) — sjekk i AI-innstillingene.')
            : T('Ugyldig Anthropic-nøkkel. Sjekk nøkkelen i AI-innstillingene.'));
        }
        if (!resp.ok || !resp.body) {
          throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()));
        }
        thinkingNode.innerHTML = '';
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        thinkingNode.appendChild(bubble);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', accumulated = '', _lastRender = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            const dataLine = event.split('\n').find(l => l.startsWith('data:'));
            if (!dataLine) continue;
            let obj;
            try { obj = JSON.parse(dataLine.slice(5).trim()); } catch (_) { continue; }
            if (obj.type === 'text') {
              accumulated += obj.text;
              const _now = Date.now();
              if (_now - _lastRender > 70) {
                _lastRender = _now;
                streamRenderMd(bubble, accumulated);
                scrollToBottom();
              }
            } else if (obj.type === 'error') {
              throw new Error(obj.message || T('Ukjent feil fra server'));
            }
          }
        }
        if (md) {
          try { bubble.innerHTML = md.render(accumulated || ''); }
          catch (_) { bubble.textContent = accumulated; }
        } else {
          bubble.textContent = accumulated;
        }
        bubble._rawMd = accumulated;
        // Kopier-knapp for tolkningen.
        const actions = document.createElement('div');
        actions.className = 'ai-codeblock-actions';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'ai-codeblock-btn';
        copyBtn.textContent = '📋 ' + T('Kopier tolkning');
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(accumulated).then(() => flash(copyBtn, T('✓ Kopiert'))).catch(() => {});
        });
        actions.appendChild(copyBtn);
        thinkingNode.appendChild(actions);
        state.history.push({ role: 'assistant', meta: { intent: 'tolkning' } });
      }

      // ── Ask mode: /api/svar (agentic pipeline — see runSvarLoop below for the
      // full SSE contract) ──
      // Consume one SSE response, dispatching parsed events to onEvent. Mirrors the
      // inline reader loops in runFastQuery/streamKodeSvarV2/runInterpretQuery above
      // (not factored out into a shared helper there, to avoid touching working code);
      // this is the equivalent for the /api/svar path.
      async function consumeSse(resp, onEvent) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf('\n\n')) >= 0) {
              const event = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 2);
              const dataLine = event.split('\n').find(l => l.startsWith('data:'));
              if (!dataLine) continue;
              let obj;
              try { obj = JSON.parse(dataLine.slice(5).trim()); }
              catch (_) { continue; }   // ignore non-JSON keep-alive lines
              onEvent(obj);
            }
          }
        } finally {
          // onEvent kan kaste (error-event) — ikke la strømmen bli hengende åpen.
          try { reader.cancel(); } catch (_) { /* allerede lukket */ }
        }
      }

      // One full /api/svar run (samlet ask-pipeline). SSE contract
      // (netlify/edge-functions/svar.ts):
      //   progress {text, replace?} — process lines (heartbeats replace in place)
      //   delta {text}              — token delta of the CURRENT assistant turn
      //   turn_discard {}           — deltas so far were an intermediate
      //                               (tool-calling) turn; archive them
      //   run_code {script}         — run client-side, re-POST resume + run_result
      //   get_pack {id}             — resolve client-side via Packs.fullTextFor(id),
      //                               re-POST resume + get_pack_result (mirrors
      //                               run_code — see svar.ts/anthropic.ts)
      //   continue {state, probed, run_ok_calls} — server turn budget spent;
      //                               re-POST resume (run_ok_calls: run-disiplin
      //                               sidekanal-teller, see svar.ts)
      //   sources {sources: [...]}  — deterministic probe manifest
      //   text {text}               — whole-answer chunk (custom-provider path)
      //   done {usage} / error {message}
      // handlers: onRunCode(script)->Promise<string> is required; onDelta(full),
      // onTurnDiscard(full), onProgress(ev) are optional.
      async function runSvarLoop(params) {
        var handlers = params.handlers || {};
        var mode = params.mode ||
          ((typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python');
        var buffer = '', sources = null, resume = null, runResult = null, getPackResult = null;
        for (var hop = 0; ; hop++) {
          if (hop > 60) throw new Error('Aborted: the answer was not finished after 60 continuation rounds.');
          var headers = providerAuthHeaders();
          if (resume) headers['X-Svar-Resume'] = '1';
          var resp = await fetch('/api/svar', {
            method: 'POST',
            headers: headers,
            signal: params.signal,
            body: JSON.stringify({
              question: params.question,
              route: params.route,
              mode: mode,
              depth: params.depth || 'deep',
              // available_keys: KUN datakilde-/leverandør-nøkkel-ider fra
              // registeret (renderRegistryBlock sin userKeys-parameter i
              // svar-prompt.ts sjekker s.id-medlemskap mot registerkilder —
              // en 'usr-<slug>'-id ville aldri matche der uansett, men
              // filtreres bevisst bort her for å holde de to nøkkellistene
              // begrepsmessig adskilt: egne nøkler går KUN via user_keys
              // under (innstillinger-runden, Task 11).
              available_keys: (window.Keys ? window.Keys.registered().filter(function (k) {
                return k.indexOf('usr-') !== 0;
              }) : []),
              // Konto-runden fase 1: preferences = aktiv PROFILS tekst
              // (js/profiles.js erstatter md_ask_prefs; seedes ved oppstart).
              preferences: (window.Profiles && window.Profiles.activeText && window.Profiles.activeText()) || undefined,
              // Kildepakker (kontekstrunden fase 2 §2): resolvet [{name,text}]
              // fra js/packs.js-cachen — synkron; ensureSelected preloader
              // ved valg/boot.
              packs: (window.Packs && window.Packs.payload && window.Packs.payload()) || undefined,
              // Av-skrudde standardkilder (kildevelger-runde 2, Task 3): kun
              // sendt når noe faktisk er skrudd av — svar.ts sin
              // coerceSourcesOff tåler undefined (tom liste) uansett, men
              // et tomt array her ville uansett vært en no-op i
              // filtrerAvslatte (tom off → samme registry-referanse).
              sources_off: window.Profiles && Profiles.sourcesOff && Profiles.sourcesOff().length
                ? Profiles.sourcesOff() : undefined,
              // Kort/lang-splitt §2: aktive builtin-kopiers GUIDE-tekst
              // leveres LAT via serverens guide-attacher — Kort-delen
              // flyter ivrig i packs-feltet over. Erstatter guides_off.
              guides_override: (function () {
                var o = window.Packs && Packs.builtinOverstyringer ? Packs.builtinOverstyringer() : {};
                return Object.keys(o).length ? o : undefined;
              })(),
              // Egne nøkler v1 (innstillinger-runden, Task 11): kun
              // {navn, notat} — ALDRI selve verdien (den blir aldri lest ut
              // av window.Keys her). Serveren (svar-prompt.ts sin
              // renderUserKeysBlock) forteller AI-en at verdien finnes i
              // generert Python-kode som KEYS['<navn>'] via mdAskExecuteScript.
              // navn = userKeyCanonicalName(k) (SLUGEN, id.slice(4)) — IKKE
              // k.navn (fri visningstekst) — fikserunde 1, funn #2: må være
              // BYTE-LIK det KEYS-injeksjonen faktisk setter som dict-nøkkel
              // (samme funksjon brukt begge steder), ellers kan modellen bli
              // fortalt et navn som ikke finnes i kjøretidsdicten (KeyError)
              // eller motsatt.
              user_keys: (mdUserKeysMeta().length ? mdUserKeysMeta().map(function (k) { return { navn: userKeyCanonicalName(k), notat: k.notat }; }) : undefined),
              // Utvidet søk (kontekstrunden fase 2 §5): true|undefined —
              // svar.ts coercer med === true (aldri stol på en tilfeldig
              // truthy verdi over nettet).
              discover: getDiscoverPref() || undefined,
              script: params.scriptContext || undefined,
              resume: resume || undefined,
              run_result: runResult == null ? undefined : runResult,
              get_pack_result: getPackResult == null ? undefined : getPackResult,
              provider: providerConfig() || undefined,
            }),
          });
          runResult = null;
          getPackResult = null;
          if (resp.status === 401) {
            throw new Error(customProviderReady()
              ? T('AI-leverandøren avviste nøkkelen (401) — sjekk i AI-innstillingene.')
              : T('Ugyldig Anthropic-nøkkel. Sjekk nøkkelen i AI-innstillingene.'));
          }
          if (resp.status === 429) throw new Error('Rate limited — wait a bit and ask again.');
          if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status + ' ' + (await resp.text()));

          var cont = null, pendingRun = null, pendingGetPack = null;
          await consumeSse(resp, function (ev) {
            if (ev.type === 'continue') { cont = { state: ev.state, probed: ev.probed, run_ok_calls: ev.run_ok_calls }; return; }
            if (ev.type === 'run_code') { pendingRun = ev.script || ''; return; }
            if (ev.type === 'get_pack') { pendingGetPack = ev.id || ''; return; }
            if (ev.type === 'delta' || ev.type === 'text') {
              buffer += ev.text;
              if (handlers.onDelta) handlers.onDelta(buffer);
              return;
            }
            if (ev.type === 'turn_discard') {
              if (handlers.onTurnDiscard) handlers.onTurnDiscard(buffer);
              buffer = '';
              if (handlers.onDelta) handlers.onDelta('');
              return;
            }
            if (ev.type === 'sources') { sources = ev.sources; return; }
            if (ev.type === 'progress') { if (handlers.onProgress) handlers.onProgress(ev); return; }
            if (ev.type === 'error') {
              var msg = ev.message || 'unknown server error';
              if (state.anthropicKey && msg.indexOf('Anthropic API error 401') !== -1) {
                msg = T('Ugyldig Anthropic-nøkkel. Sjekk nøkkelen i AI-innstillingene.');
              }
              throw new Error(msg);
            }
          });
          if (pendingRun != null) {
            if (params.signal && params.signal.aborted) {
              throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
            }
            runResult = await handlers.onRunCode(pendingRun);
            // FEIL-linja i prosessloggen (spec 2026-08-15 §1, målt: tre
            // blinddiagnose-runder fordi run_result-FEIL aldri var synlig
            // for mennesker). Sentralt her — begge kallere (ask-view og
            // AI-panelet) får den via sin egen onProgress. Teksten er
            // alt nøkkel-maskert av mdAskExecuteScript.
            if (runResult && runResult.ok === false && handlers.onProgress) {
              var feilLinje = String(runResult.result || '')
                .replace(/^FEIL:\n/, '').split('\n')[0].slice(0, 160);
              if (feilLinje) handlers.onProgress({ text: '⚠️ Kjøring feilet: ' + feilLinje });
            }
            resume = cont;   // run_code ender alltid invokasjonen med en continue
            continue;
          }
          if (pendingGetPack != null) {
            if (params.signal && params.signal.aborted) {
              throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
            }
            // get_pack er generisk (ingen kjøremiljø involvert) — løses direkte
            // her i stedet for via en handlers.onGetPack-krok per kaller.
            var packText = '';
            try {
              if (window.Packs && window.Packs.fullTextFor) packText = await window.Packs.fullTextFor(pendingGetPack);
            } catch (e) { packText = ''; }
            // Tom tekst (ukjent/fjernet id) ville gitt en tom tool_result-
            // content-blokk, som Messages-API-et avviser med 400 — dødelig
            // for HELE svaret (review-funn 2026-08-06 #2). En markørstreng
            // holder svaret i live; svar.ts/anthropic.ts har samme vern.
            if (!packText) packText = '(fant ikke pakken — svar med det du har)';
            getPackResult = { id: pendingGetPack, text: packText };
            resume = cont;   // get_pack ender alltid invokasjonen med en continue
            continue;
          }
          if (!cont) break;
          resume = cont;
        }
        return { markdown: buffer, sources: sources };
      }

      // Root cause (E2E gap, task-9-report.md): ParamForms.decorate — the
      // #@param/#@title/#@markdown DOM renderer — is wired ONLY into the
      // notebook per-cell render path (js/cells.js docCellNode), which only
      // runs once window.Cells.active() is true (i.e. #scriptInput has a
      // '#%%' cell marker AND notebook mode has been entered). An
      // ask/AI-panel-generated script is inserted as PLAIN code — no
      // marker — so a live #@param slider in its source was NEVER rendered
      // in ANY view (browser-verified in ?view=editor too, not an
      // ask-view-only CSS/mounting bug: #modeGuiBar is an unrelated mode
      // toolbar, not a ParamForms host).
      //
      // A second, independent gap compounds this: insertScriptIntoEditor
      // sets #scriptInput.value and dispatches a genuine 'input' event (to
      // drive the existing autosave/highlight listeners) — js/cells.js's
      // tick() treats any value change accompanied by a same-window 'input'
      // event as "the user is actively typing" and deliberately refuses to
      // auto-enter notebook mode for it (only a dormant hint chip appears,
      // see tick()'s "Per-tikk-attribusjon" comment). So even a
      // marker-bearing ask script would sit inert until a human clicked
      // that chip. window.Cells.enter(...) must be called explicitly to
      // bypass that heuristic for a programmatic run.
      //
      // Fix (general — not ask-view-specific, shared by both callers of
      // this function): when the script about to be inserted actually
      // contains a #@param/#@title/#@markdown line, prefix it with a
      // '#%% <mode>' marker and force notebook entry. Scripts without any
      // such line (the common case) are left byte-for-byte unwrapped and
      // window.Cells is left/kept inactive — editor-view's plain-script
      // path is therefore untouched for everything except the exact gap
      // this closes. Once active, docCellNode/ParamForms build the
      // '.param-form' strip INSIDE '.nb-output', itself inside
      // #outputArea — so ask-view.js's mountLiveOutput() (which moves
      // #outputArea as one unit into the answer card) carries the live
      // slider along for free, and a slider drag's run:auto re-run
      // (ParamForms -> Cells.runCell -> window.mdRunNotebookCell) is a
      // purely local Pyodide re-execution — no network/LLM call, no
      // billing.
      //
      // Pure core (exported below for node tests): takes Cells/ParamForms
      // as explicit arguments rather than reading window.* itself, so it
      // is testable without a DOM stub.
      function computeParamFormsWrap(script, mode, Cells, ParamForms) {
        if (!Cells || !ParamForms) return null;
        if (typeof Cells.hasMarkers === 'function' && Cells.hasMarkers(script)) return null; // already a notebook doc
        if (typeof Cells.supportedMode === 'function' && !Cells.supportedMode(mode)) return null;
        var lang = typeof Cells.paramLangForType === 'function' ? Cells.paramLangForType(mode) : null;
        if (!lang) return null; // e.g. duckdb — #@param is out of scope by design (js/cells.js PARAM_LANG_FOR_TYPE)
        var entries = typeof ParamForms.parse === 'function' ? ParamForms.parse(script, lang) : [];
        if (!entries || !entries.length) return null; // no #@param/#@title/#@markdown — nothing to render
        return '#%% ' + mode + '\n' + script;
      }

      // Mirrors js/cells.js's internal appLayout() (not itself exported) so
      // a forced Cells.enter() picks the SAME layout the tick()/chip-click
      // auto-entry path would have chosen.
      function askNotebookLayout() {
        if (window.mdIsInputHidden && window.mdIsInputHidden()) return 'output';
        if (window.mdIsStackedLayout && window.mdIsStackedLayout()) return 'stacked';
        return 'columns';
      }

      // Replace the editor content with the generated script (mirrors the
      // existing "Sett inn" response-action button in attachResponseInsertBar).
      function insertScriptIntoEditor(script) {
        if (!dom.scriptInput) return;
        var mode = (typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python';
        var wrapped = computeParamFormsWrap(script, mode, window.Cells, window.ParamForms);
        // Always leave notebook mode before inserting: a PRIOR ask/panel run
        // may have entered it (this run's script had #@param), and this
        // run's script may not need it — without this, a plain follow-up
        // question would inherit stale notebook state (spec requirement:
        // new-question/unmount must clean up). window.Cells.enter() below
        // re-enters fresh when this run needs it.
        if (window.Cells && typeof window.Cells.active === 'function' && window.Cells.active()) {
          window.Cells.exit();
        }
        dom.scriptInput.value = wrapped || script;
        dom.scriptInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (wrapped && window.Cells && typeof window.Cells.enter === 'function') {
          window.Cells.enter(askNotebookLayout());
        }
      }

      // Run the script currently in the editor via the SAME path the Kjør
      // button uses (index.html's btnRun click handler — it dispatches on
      // activeEditorMode, handles local/remote execution, and renders
      // output/errors into #outputArea). That handler has no return value or
      // promise of its own, so this is a v1 compromise: click the button, wait
      // for the run to settle via window.mdIsScriptRunning() (a one-line getter
      // exposed by index.html for exactly this purpose), then read the error
      // back out of #outputArea's `pre.error` node (also index.html's existing
      // error-rendering convention — see the catch-block in btnRun's handler).
      // Returns null on success, or the error text on failure.
      //
      // Staleness note (checked against index.html's btnRun handler): every
      // run path — the python/duckdb try/catch (renderOutput on success,
      // `pre.error` in the catch block) and R's runSelf -> runHybridR ->
      // renderROutputParts — rewrites #outputArea for THIS run before its own
      // `finally` flips scriptRunInProgress back to false. So whenever the
      // poll loop below observes mdIsScriptRunning() === false, #outputArea
      // already reflects this run's outcome, never a stale previous round's —
      // no pre-run snapshot of the error text is needed. That guarantee only
      // covers the "settled" case, though: if we hit the 180s ceiling while
      // mdIsScriptRunning() is still true, the run handler hasn't written
      // anything for this run yet, so #outputArea may still hold the previous
      // round's error. In that case we return a distinct, honest timeout
      // message instead of reading `.error` — this ends the repair loop as a
      // failure and leaves the script in the editor, rather than reporting a
      // false success or feeding a stale error into the next repair round.
      async function runScriptAndCaptureError(signal) {
        const btn = document.getElementById('btnRun');
        const outputArea = document.getElementById('outputArea');
        if (!btn) return T('Fant ikke Kjør-knappen.');
        if (typeof window.mdIsScriptRunning !== 'function') {
          return T('Kan ikke sjekke kjørestatus (mdIsScriptRunning mangler).');
        }
        let waited = 0;
        // B7 (docs/REVIEW_2026-07-07.md §3): waiting on btn.disabled alone is
        // not enough — during an active run the button stays ENABLED but
        // relabeled "Avbryt", so a click would call performRunInterrupt() on
        // the user's own run instead of starting ours, and the repair loop
        // would then misread the aborted run's error as our script's error.
        // Wait for BOTH pyodide-ready (btn no longer disabled-for-loading)
        // AND no run already in progress; give up loudly (return an error
        // string, never click) if that doesn't happen within the timeout.
        while ((btn.disabled || window.mdIsScriptRunning()) && waited < 20000) {
          if (signal && signal.aborted) return T('Avbrutt.');
          await sleep(200); waited += 200;
        }
        if (signal && signal.aborted) return T('Avbrutt.');
        if (btn.disabled) return T('Kjør-knappen er ikke klar (miljøet laster fortsatt).');
        if (window.mdIsScriptRunning()) {
          return T('Kan ikke starte automatisk kjøring — en annen kjøring pågår allerede.');
        }
        btn.click();
        await sleep(50);   // let the click handler's async body flip the running flag
        const start = Date.now();
        while (window.mdIsScriptRunning() && Date.now() - start < 180000) {
          // Abort avslutter bare OVERVÅKINGEN (selve kjøringen stoppes med
          // Kjør-knappens egen Avbryt); panelSvarAnswer sjekker signalet
          // rett etterpå og stopper reparasjonsløkka uten å bruke returverdien.
          if (signal && signal.aborted) return T('Avbrutt.');
          await sleep(150);
        }
        if (window.mdIsScriptRunning()) {
          return T('Kjøringen var ikke ferdig etter 180 sekunder — overvåking avbrutt.');
        }
        const errEl = outputArea && outputArea.querySelector('pre.error');
        return errEl ? errEl.textContent : null;
      }

      // S2 (docs/REVIEW_2026-07-07.md §3): Web-mode answers can contain a
      // prompt-injected script (the /api/svar backend does agentic web
      // search — a poisoned page can inject arbitrary instructions), and the
      // app runs it in main-thread Pyodide alongside localStorage secrets
      // (GitHub PAT, API keys). The script is still auto-inserted into the
      // editor, but the FIRST run of an answer must be user-initiated. This
      // renders a small inline confirmation bubble styled like the existing
      // chat action buttons (attachResponseInsertBar's ai-response-actions /
      // ai-response-insert-btn, and ai-codeblock-btn for the secondary
      // action) and resolves true/false on Kjør/Avbryt.
      //
      // Power-user opt-out (no settings UI by design — set directly):
      //   localStorage.setItem('md_ai_autorun', '1')
      // skips this confirmation entirely and auto-runs immediately, same as
      // before S2. Anyone flipping this on has explicitly opted into the risk.
      function getAutorunPref() {
        try { return localStorage.getItem('md_ai_autorun') === '1'; } catch (e) { return false; }
      }
      // Utvidet søk (kontekstrunden fase 2 §5): sticky PER ENHET, ALDRI
      // synket — bryteren bor i js/packs.js sin kildeseksjon (nederst,
      // egen sjekkboks-rad) og skriver/leser NØYAKTIG denne nøkkelen.
      function getDiscoverPref() {
        try { return localStorage.getItem('md_ask_discover') === '1'; } catch (e) { return false; }
      }
      function confirmAutoRun(signal) {
        if (getAutorunPref()) return Promise.resolve(true);
        return new Promise(function (resolve) {
          const wrap = document.createElement('div');
          wrap.className = 'ai-msg ai-msg-assistant';
          wrap.innerHTML = '<div class="ai-bubble"></div>';
          const bubble = wrap.querySelector('.ai-bubble');
          const question = document.createElement('div');
          question.textContent = T('Kjør det genererte scriptet?');
          bubble.appendChild(question);
          const bar = document.createElement('div');
          bar.className = 'ai-response-actions';
          const runBtn = document.createElement('button');
          runBtn.type = 'button';
          runBtn.className = 'ai-response-insert-btn';
          runBtn.textContent = T('Kjør');
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'ai-codeblock-btn';
          cancelBtn.textContent = T('Avbryt');
          bar.appendChild(runBtn);
          bar.appendChild(cancelBtn);
          bubble.appendChild(bar);
          dom.aiThread.appendChild(wrap);
          scrollToBottom();
          let done = false;
          function settle(ok) {
            if (done) return;
            done = true;
            runBtn.disabled = true;
            cancelBtn.disabled = true;
            bar.remove();
            const status = document.createElement('div');
            status.className = 'ai-repair-note';
            status.textContent = ok ? T('✓ Kjører …') : T('Avbrutt — scriptet står i editoren.');
            bubble.appendChild(status);
            resolve(ok);
          }
          runBtn.addEventListener('click', function () { settle(true); });
          cancelBtn.addEventListener('click', function () { settle(false); });
          // Avbryt-knappen i AI-panelet skal også avbryte mens vi venter på svar her.
          if (signal) signal.addEventListener('abort', function () { settle(false); }, { once: true });
        });
      }

      // AI-sidepanelets svar-flyt: samme /api/svar-løp som ask-visningen, men
      // rendret i chat-bobler. Panelet har ingen ruter — full verktøykasse
      // (route 'data') og deep dybde.
      async function panelSvarAnswer(question, thinkingNode, signal) {
        thinkingNode.innerHTML = '';
        const progressBox = document.createElement('div');
        progressBox.className = 'ai-progress';
        thinkingNode.appendChild(progressBox);
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        thinkingNode.appendChild(bubble);
        if (!state.anthropicKey && !customProviderReady()) {
          throw new Error(T('Web-modus krever egen Anthropic-nøkkel eller en konfigurert AI-leverandør.'));
        }
        let confirmed = false;
        let _lastRender = 0;
        // Editor context only rides along when the user ticked "Inkluder
        // skript fra editor" — matches safestat's sendMessage() (ai-chat.js
        // ~535). svar.ts's questionTurn() only reads this on round 0 anyway,
        // so gating it here can't break the run_code/repair loop.
        const includeScript = dom.aiIncludeScript.checked && dom.scriptInput && dom.scriptInput.value.trim();
        const res = await runSvarLoop({
          question: question,
          route: 'data',
          depth: 'deep',
          scriptContext: includeScript ? scrubScript(dom.scriptInput.value) : undefined,
          signal: signal,
          handlers: {
            onProgress: function (ev) {
              const last = progressBox.lastElementChild;
              if (ev.replace && last && last.dataset.replace === '1') {
                last.textContent = '⏳ ' + ev.text;
              } else {
                const line = document.createElement('div');
                line.className = 'ai-progress-line';
                if (ev.replace) line.dataset.replace = '1';
                line.textContent = '⏳ ' + ev.text;
                progressBox.appendChild(line);
              }
              scrollToBottom();
            },
            onDelta: function (full) {
              const now = Date.now();
              if (now - _lastRender > 70) {
                _lastRender = now;
                streamRenderMd(bubble, full);
                scrollToBottom();
              }
            },
            onTurnDiscard: function (full) {
              if (full && full.trim()) {
                const line = document.createElement('div');
                line.className = 'ai-progress-line';
                line.textContent = '📝 ' + full.trim().slice(0, 160);
                progressBox.appendChild(line);
              }
              streamRenderMd(bubble, '');
            },
            onRunCode: async function (script) {
              insertScriptIntoEditor(script);
              if (!confirmed) {
                const ok = await confirmAutoRun(signal);
                if (!ok) return 'Brukeren avbrøt kjøringen — skriv sluttsvaret uten kjøring, og si at koden ikke er kjørt.';
                confirmed = true;
              }
              const r = await window.mdAskExecuteScript(script, signal);
              return r.result;
            },
          },
        });
        // Panelet har ingen ref-resolver (ask-visningens #askAnswer-slots
        // finnes ikke her) — strip {{fig:1}}-plassholdere til klammetekst
        // før visning, samme fallback som ask-visningens feilede kjøringer.
        const finalMd = window.mdAskStripRefs ? window.mdAskStripRefs(res.markdown) : res.markdown;
        streamRenderMd(bubble, finalMd);
        attachCodeBlockActions(bubble);
        bubble._rawMd = finalMd;
        if (res.sources && res.sources.length) {
          const list = document.createElement('div');
          list.className = 'ai-sources';
          list.innerHTML = '<b>' + T('Kilder:') + '</b> ' + res.sources.map(s =>
            (s.ok ? '✅ ' : '⚠️ ') +
            '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' +
            escapeHtml(s.url.replace(/^https?:\/\//, '').slice(0, 60)) + '</a>' +
            (s.viaProxy ? ' (via proxy)' : '')
          ).join(' · ');
          thinkingNode.appendChild(list);
        }
      }

      // Full send flow for Web mode: auth gate, user bubble, thinking node,
      // then the answer flow. Mirrors sendMessage()'s boilerplate (see above)
      // but dispatches to panelSvarAnswer instead of the fast API path.
      async function sendWebMessage() {
        if (state.sending) return;
        const text = dom.aiInput.value.trim();
        if (!text) return;
        if (!state.anthropicKey && !customProviderReady()) {
          openSettings();
          return;
        }
        state.sending = true;
        if (dom.aiSendFastBtn) dom.aiSendFastBtn.disabled = true;
        if (dom.aiSendWebBtn) dom.aiSendWebBtn.disabled = true;
        if (state.history.length === 0) dom.aiThread.innerHTML = '';
        appendUserMessage(text);
        state.history.push({ role: 'user', text });
        dom.aiInput.value = '';
        autoresize();
        const thinkingNode = appendThinking();
        // Samme avbrytbarhets-mønster som sendMessage()/mdInterpretResults:
        // én controller per sending; Avbryt-knappen (init, aiAbortBtn) kaller
        // state.abortCtrl.abort(). Signalet følger hele web-løpet: fetch/SSE i
        // runSvarLoop, bekreftelses-boblen og overvåkingen av lokal kjøring.
        const ctrl = new AbortController();
        state.abortCtrl = ctrl;
        if (dom.aiAbortBtn) dom.aiAbortBtn.style.display = '';
        try {
          await panelSvarAnswer(text, thinkingNode, ctrl.signal);
          state.history.push({ role: 'assistant', meta: { intent: 'web' } });
        } catch (e) {
          if (e && e.name === 'AbortError') appendCancelNote(thinkingNode);
          else appendError(thinkingNode, '✗ ' + ((e && e.message) ? e.message : String(e)));
        } finally {
          state.abortCtrl = null;
          if (dom.aiAbortBtn) dom.aiAbortBtn.style.display = 'none';
          state.sending = false;
          if (dom.aiSendFastBtn) dom.aiSendFastBtn.disabled = false;
          if (dom.aiSendWebBtn) dom.aiSendWebBtn.disabled = false;
          dom.aiInput.focus();
        }
      }

      // Pull the first ```microdata / ``` code block that looks like a
      // microdata script out of streamed markdown.

      // Run the script through a throwaway m2py interpreter on synthetic data
      // (disclosure control off, so only structural/runtime errors surface).
      // Returns {passed, errors:[{kind,message}]} or {skipped:true}.


      // Isolate the #python/#r code segment out of a python/r kode-svar-v2
      // candidate script (which is ALWAYS a single hybrid blob: a `#micro`
      // directive header followed by a `#r`/`#python` marker + the actual
      // analysis code — see kode-svar.ts MICRO_IMPORT_BRIDGE). Reuses
      // index.html's own parseHybridScript segmenter (bare global — same
      // cross-file convention as activeEditorMode/microdataCatalog elsewhere
      // in this file) so the split matches EXACTLY how the app itself would
      // interpret the hybrid script. Falls back to the whole script when
      // parseHybridScript is unavailable (e.g. the node test harness) or no
      // segment of the wanted kind was found — better to syntax-check a little
      // too much (the #micro lines would then fail compile()/parse(), which
      // just degrades to a reported {passed:false} error, not "skipped" —
      // compile()/parse() DOES run, it just fails) than to silently skip
      // validation.
      const LANG_SEGMENT_KIND = { python: 'pyodide', r: 'r' };
      function extractLangSegment(script, lang) {
        if (!script) return '';
        const wantKind = LANG_SEGMENT_KIND[lang] || lang;
        if (typeof parseHybridScript !== 'function') return script;
        let segments;
        try { segments = parseHybridScript(script, wantKind); } catch (_) { return script; }
        const parts = (segments || [])
          .filter(function (s) { return s.kind === wantKind; })
          .map(function (s) { return s.text; });
        return parts.length ? parts.join('\n\n') : script;
      }

      // Nivå 1 python-syntaks-sjekk (docs/ROADMAP.md §AI-assistenten):
      // compile(...,'exec') via en ALLEREDE lastet/lastende Pyodide-økt.
      // __pyodidePromise (index.html sin loadPyodideAndM2py-memoisering) er
      // en bare global, samme mønster som activeEditorMode/microdataCatalog
      // ellers i denne fila. VIKTIG: vi kaller ALDRI loadPyodideAndM2py() selv
      // — det ville boot-et en ny ~30s-runtime bare for å validere ett
      // AI-svar. Vi hekter oss KUN på en økt andre deler av appen allerede har
      // startet (varmlasting ved modusbytte til python, eller en tidligere
      // Kjør) — hvis ingen finnes, hopper vi over (skipped:true), aldri boot.
      // Merk: når en økt ER i ferd med å starte (booting, ikke ferdig), AWAITER
      // vi den (linjen under) i stedet for å hoppe over — badgen kan derfor
      // dukke opp et lite øyeblikk etter selve svarteksten, uten at vi noen
      // gang selv trigget boot-en.
      async function validatePythonSyntax(script) {
        if (typeof __pyodidePromise === 'undefined' || !__pyodidePromise) return { skipped: true };
        let py;
        try { py = await __pyodidePromise; } catch (_) { return { skipped: true }; }
        if (!py) return { skipped: true };
        const pyCode = extractLangSegment(script, 'python');
        if (!pyCode) return { skipped: true };
        // Linjenumre er relative til DEN UTTRUKNE python-delen (#micro-linjene
        // foran er kuttet bort) — det holder fint for reparasjonsrundens
        // feilmelding, som uansett sender hele kandidatscriptet tilbake til AI-en.
        const checkCode =
          'import json\n' +
          '_src = ' + JSON.stringify(pyCode) + '\n' +
          'try:\n' +
          '    compile(_src, "<ai-script>", "exec")\n' +
          '    _out = json.dumps({"passed": True, "errors": []})\n' +
          'except SyntaxError as _ex:\n' +
          '    _out = json.dumps({"passed": False, "errors": [{"kind": "parse", "message": str(_ex.msg) if _ex.msg else str(_ex), "line_no": _ex.lineno}]})\n' +
          'except Exception as _ex2:\n' +
          '    _out = json.dumps({"passed": False, "errors": [{"kind": "parse", "message": f"{type(_ex2).__name__}: {_ex2}"}]})\n' +
          '_out\n';
        let raw;
        try { raw = await py.runPythonAsync(checkCode); } catch (_) { return { skipped: true }; }
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { return { skipped: true }; }
        // _ex.lineno (line_no over) was captured but never surfaced: buildRepairErrors
        // only reads e.message/e.kind, so a bare line_no field silently vanished before
        // ever reaching the repair-round prompt. Fold it into the message itself — R's
        // parse() error text already embeds "<text>:LINJE:KOLONNE:" on its own, so this
        // brings python's repair-error string to parity with R's.
        if (parsed && Array.isArray(parsed.errors)) {
          parsed.errors = parsed.errors.map(function (e) {
            if (e && e.line_no != null && e.message) {
              return Object.assign({}, e, { message: 'linje ' + e.line_no + ': ' + e.message });
            }
            return e;
          });
        }
        return parsed;
      }

      // Nivå 1 R-syntaks-sjekk: parse(text=...) via en ALLEREDE lastet/
      // lastende webR-økt (webRPromise — samme bare-global-mønster og samme
      // "aldri boot"-regel som validatePythonSyntax over). Bruker KUN base R
      // (ingen jsonlite — jsonlite krever en defensiv webr::install() først,
      // se andre webR-kallsteder i index.html, og det ville også være en
      // uønsket bivirkning bare for å validere). Feilteksten fra parse()
      // inneholder selv linje/kolonne på formen "<text>:LINJE:KOLONNE:" —
      // trekkes ut med et enkelt regex i stedet.
      async function validateRSyntax(script) {
        if (typeof webRPromise === 'undefined' || !webRPromise) return { skipped: true };
        try { await webRPromise; } catch (_) { return { skipped: true }; }
        if (typeof webRReady === 'undefined' || !webRReady || typeof webR === 'undefined' || !webR) return { skipped: true };
        const rCode = extractLangSegment(script, 'r');
        if (!rCode) return { skipped: true };
        const checkExpr =
          'tryCatch({ parse(text = ' + JSON.stringify(rCode) + '); "OK" }, ' +
          'error = function(e) paste0("ERR:", conditionMessage(e)))';
        let robj;
        try { robj = await webR.evalR(checkExpr); } catch (_) { return { skipped: true }; }
        try {
          const js = await robj.toJs();
          const result = (js.values || [])[0];
          if (result === 'OK') return { passed: true, errors: [] };
          const msg = String(result || '').replace(/^ERR:/, '');
          const lm = /<text>:(\d+):\d+:/.exec(msg);
          return { passed: false, errors: [{ kind: 'parse', message: msg, line_no: lm ? parseInt(lm[1], 10) : null }] };
        } catch (_) {
          return { skipped: true };
        } finally {
          try { await webR.destroy(robj); } catch (_) {}
        }
      }

      function autoresize() {
        const ta = dom.aiInput;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';  // ~5 linjer maks, så scroller den
      }

      function refreshUserPanel() {
        if (dom.aiCfgByokStored) dom.aiCfgByokStored.style.display = state.anthropicKey ? '' : 'none';
        if (window.mdSyncWebBtnVisibility) window.mdSyncWebBtnVisibility();
      }

      // Datakilde-nøkler (spec 2026-07-23): radene genereres fra registeret —
      // én rad per kilde med auth.user. Ny nøkkelkrevende kilde = ny register-
      // oppføring, ingen UI-kode. Verdier vises aldri igjen etter lagring
      // (passordfelt + placeholder), men kan erstattes eller fjernes.
      var _srcKeyRegistry = null;
      async function userKeySources() {
        if (!_srcKeyRegistry) {
          try {
            var r = await fetch('data/data-sources.json');
            _srcKeyRegistry = r.ok ? await r.json() : [];
          } catch (e) { _srcKeyRegistry = []; }
        }
        return _srcKeyRegistry.filter(function (s) { return s.auth && s.auth.user; });
      }

      async function renderSourceKeys() {
        var box = dom.aiCfgSourceKeys;
        if (!box) return;
        var sources = await userKeySources();
        box.innerHTML = '';
        if (!sources.length) return;
        var head = document.createElement('label');
        head.textContent = T('Datakilde-nøkler');
        box.appendChild(head);
        sources.forEach(function (s) {
          var has = !!(window.Keys && window.Keys.get(s.id));
          var wrap = document.createElement('div');
          wrap.style.margin = '6px 0 10px';
          var lab = document.createElement('div');
          lab.className = 'ai-modal-help';
          lab.textContent = s.navn + (has ? ' — ' + T('nøkkel registrert') : '');
          wrap.appendChild(lab);
          var inp = document.createElement('input');
          inp.type = 'password';
          inp.autocomplete = 'off';
          inp.dataset.sourceKeyId = s.id;
          inp.placeholder = has ? '••••••••' : (s.nokkel_hint || T('lim inn nøkkel'));
          wrap.appendChild(inp);
          if (has) {
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'ai-modal-btn';
            rm.style.marginTop = '4px';
            rm.textContent = T('Fjern nøkkel');
            rm.addEventListener('click', function () {
              window.Keys.remove(s.id);
              renderSourceKeys();
            });
            wrap.appendChild(rm);
          }
          box.appendChild(wrap);
        });
      }

      // Egne nøkler v1 (innstillinger-runden, Task 11; fikserunde 1 —
      // sikkerhetsfokusert review): brukeren registrerer vilkårlige
      // tjenester (f.eks. kaggle) selv — ingen registeroppføring nødvendig
      // (kontrast til renderSourceKeys over, som er registerstyrt).
      // Metadata (id/navn/notat — ALDRI verdien) i md_user_keys; selve
      // verdien i det felles nøkkellageret (window.Keys, id 'usr-<slug>').
      // mdUserKeysMeta() er den eneste leseveien — payloaden til /api/svar
      // (runSvarLoop under) og KEYS-injeksjonen (mdAskExecuteScript) bruker
      // begge denne, så et format-avvik kan aldri oppstå mellom dem.
      var LS_USER_KEYS = 'md_user_keys';
      // Fikserunde 1, funn #5: md_user_keys synkes IKKE på tvers av enheter
      // (kun window.Keys-VERDIENE gjør, via konto-synkens krypterte
      // md_keys-dokument) — en usr-<slug>-id kan derfor dukke opp i
      // window.Keys på enhet 2 UTEN tilhørende metadata fra enhet 1. Uten
      // dette ble nøkkelen usynlig og ufjernbar i denne UI-en, selv om
      // verdien fortsatt fantes og ble brukt (KEYS-injeksjonen under bryr
      // seg ikke om metadata finnes). Selvhelbreder ved hvert kall: enhver
      // usr-*-id i Keys.registered() UTEN en md_user_keys-oppføring får en
      // minimal {id, navn: id.slice(4), notat:''} rekonstruert og
      // PERSISTERT tilbake — idempotent (neste kall finner intet nytt å
      // rekonstruere, ingen ny skriving). Denne bruken av registered() er
      // UAVHENGIG av available_keys-filteret i runSvarLoop under (det
      // filteret gjelder KUN hvilke ider som sendes i payload-feltet
      // available_keys — det skjuler ingenting for Keys.registered() selv).
      function mdUserKeysMeta() {
        var list;
        try {
          list = JSON.parse(localStorage.getItem(LS_USER_KEYS) || '[]');
          if (!Array.isArray(list)) list = [];
        } catch (e) { list = []; }
        var known = {};
        list.forEach(function (k) { if (k && k.id) known[k.id] = true; });
        var ids = (window.Keys ? window.Keys.registered() : []);
        var healed = false;
        ids.forEach(function (id) {
          if (id.indexOf('usr-') === 0 && !known[id]) {
            list.push({ id: id, navn: id.slice(4), notat: '' });
            healed = true;
          }
        });
        if (healed) saveUserKeysMeta(list);
        return list;
      }
      function saveUserKeysMeta(list) {
        try { localStorage.setItem(LS_USER_KEYS, JSON.stringify(list)); } catch (e) {}
      }
      // Kappet til 28 tegn: server (coerceUserKeys, USER_KEY_NAME_RE) tillater
      // maks 32 — resten av rommet er reservert til uniqueUserKeyId sin
      // «-N»-kollisjonssuffiks, slik at det slugifiserte navnet ALDRI kan bli
      // for langt til å passere server-regexen (fikserunde 1, funn #2 —
      // samme sprik-klasse som store/små bokstaver, se under).
      function slugifyUserKeyName(navn) {
        return String(navn || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 28);
      }
      // Kollisjon (to nøkler som slugifiserer likt) → -2, -3, … til ledig id.
      function uniqueUserKeyId(slug, existingIds) {
        var id = 'usr-' + slug;
        if (existingIds.indexOf(id) === -1) return id;
        var n = 2;
        while (existingIds.indexOf('usr-' + slug + '-' + n) !== -1) n++;
        return 'usr-' + slug + '-' + n;
      }
      // Fikserunde 1, funn #2: `navn` i md_user_keys er FRI TEKST (som
      // brukeren skrev den, f.eks. «Kaggle API» — kun til VISNING i lista
      // under). Prompten (renderUserKeysBlock) og KEYS-injeksjonen
      // (mdAskExecuteScript) må derfor ALDRI bruke k.navn direkte — kun
      // slugen (id uten 'usr-'-prefikset, alltid [a-z0-9_-] og ≤32 tegn,
      // se slugifyUserKeyName) er kanonisk og GARANTERT identisk på begge
      // sider av kontrakten (server-regexen USER_KEY_NAME_RE matcher den
      // alltid). Uten dette kunne serveren fortelle AI-en å bruke
      // KEYS['kaggle'] mens runtime-dicten faktisk het {"Kaggle": …}
      // (KeyError), eller (navn med mellomrom) droppe oppføringen fra
      // prompten stille mens runtime fortsatt hadde den.
      function userKeyCanonicalName(k) { return String(k.id || '').slice(4); } // 'usr-'.length === 4
      function renderUserKeys() {
        var box = dom.aiCfgUserKeyList;
        if (!box) return;
        var list = mdUserKeysMeta();
        box.innerHTML = '';
        list.forEach(function (k) {
          var wrap = document.createElement('div');
          wrap.style.margin = '6px 0 10px';
          var lab = document.createElement('div');
          lab.className = 'ai-modal-help';
          lab.textContent = (k.navn || userKeyCanonicalName(k)) + ' — ' + T('nøkkel registrert') +
            (k.notat ? ' (' + k.notat + ')' : '');
          wrap.appendChild(lab);
          var rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'ai-modal-btn';
          rm.textContent = T('Fjern nøkkel');
          rm.addEventListener('click', function () {
            if (window.Keys) window.Keys.remove(k.id);
            saveUserKeysMeta(mdUserKeysMeta().filter(function (x) { return x.id !== k.id; }));
            renderUserKeys();
          });
          wrap.appendChild(rm);
          box.appendChild(wrap);
        });
      }
      function addUserKeyFromForm() {
        var navn = dom.userKeyName ? dom.userKeyName.value.trim() : '';
        var value = dom.userKeyValue ? dom.userKeyValue.value.trim() : '';
        var notat = dom.userKeyNote ? dom.userKeyNote.value.trim() : '';
        var slug = slugifyUserKeyName(navn);
        if (!slug || !value) return; // navn (etter slugifisering) og verdi er påkrevd
        var list = mdUserKeysMeta();
        var id = uniqueUserKeyId(slug, list.map(function (x) { return x.id; }));
        if (window.Keys) window.Keys.set(id, value);
        list.push({ id: id, navn: navn, notat: notat }); // navn: rå visningstekst — se userKeyCanonicalName
        saveUserKeysMeta(list);
        if (dom.userKeyName) dom.userKeyName.value = '';
        if (dom.userKeyValue) dom.userKeyValue.value = '';
        if (dom.userKeyNote) dom.userKeyNote.value = '';
        if (dom.aiCfgUserKeyForm) dom.aiCfgUserKeyForm.hidden = true;
        renderUserKeys();
      }

      // Global AI-leverandør (spec 2026-07-23-llm-provider-tiers A1): type +
      // base-URL + modell i md_llm_provider (ikke hemmelig); nøkkelen i det
      // felles nøkkellageret (js/keys.js, type 'llm').
      var LS_PROVIDER = 'md_llm_provider';
      function providerConfig() {
        var p = null;
        try { p = JSON.parse(localStorage.getItem(LS_PROVIDER) || 'null'); } catch (e) { /* korrupt → ignorer */ }
        if (!p || !p.type || p.type === 'anthropic') return null;
        if (!p.base_url || !p.model) return null;
        return { type: p.type, base_url: p.base_url, model: p.model };
      }
      function customProviderReady() {
        return !!(providerConfig() && window.Keys && window.Keys.get('llm'));
      }
      function providerAuthHeaders() {
        if (customProviderReady()) {
          return { 'X-Llm-Key': window.Keys.get('llm'), 'Content-Type': 'application/json' };
        }
        return edgeAuthHeaders();
      }
      function syncProviderFields() {
        if (!dom.aiCfgProviderType) return;
        var custom = dom.aiCfgProviderType.value !== 'anthropic';
        // Innstillinger-rekkefølgen (Task 11): leverandørvalget styrer BEGGE
        // veier — Anthropic-seksjonen (BYOK-status + nøkkelfelt) speilvendt
        // av de custom-leverandør-feltene (URL/modell/nøkkel).
        if (dom.aiCfgProviderFields) dom.aiCfgProviderFields.style.display = custom ? '' : 'none';
        if (dom.aiCfgAnthropicSection) dom.aiCfgAnthropicSection.style.display = custom ? 'none' : '';
        if (dom.aiCfgLlmKey) {
          dom.aiCfgLlmKey.placeholder = (window.Keys && window.Keys.get('llm'))
            ? '••••••••' : T('lim inn nøkkel');
        }
      }
      function openSettings() {
        if (dom.aiCfgAnthropicKey) dom.aiCfgAnthropicKey.value = state.anthropicKey;
        refreshUserPanel();
        renderSourceKeys();
        renderUserKeys();
        if (dom.aiCfgUserKeyForm) dom.aiCfgUserKeyForm.hidden = true;
        var provRaw = null;
        try { provRaw = JSON.parse(localStorage.getItem(LS_PROVIDER) || 'null'); } catch (e) {}
        if (dom.aiCfgProviderType) dom.aiCfgProviderType.value = (provRaw && provRaw.type) || 'anthropic';
        if (dom.aiCfgProviderUrl) dom.aiCfgProviderUrl.value = (provRaw && provRaw.base_url) || '';
        if (dom.aiCfgProviderModel) dom.aiCfgProviderModel.value = (provRaw && provRaw.model) || '';
        if (dom.aiCfgLlmKey) dom.aiCfgLlmKey.value = '';
        syncProviderFields();
        // Telemetri-opt-out (spec §10): md_telemetri_av='1' = avslått; alt
        // annet (fravær inkludert) = tillatt, så boksen er i utgangspunktet
        // avkrysset. try/catch som naboene (localStorage kan kaste).
        if (dom.aiCfgTelemetry) {
          try { dom.aiCfgTelemetry.checked = localStorage.getItem('md_telemetri_av') !== '1'; }
          catch (e) { dom.aiCfgTelemetry.checked = true; }
        }
        dom.aiSettingsBackdrop.classList.add('open');
      }
      function closeSettings() { dom.aiSettingsBackdrop.classList.remove('open'); }
      function saveSettings() {
        const akey = dom.aiCfgAnthropicKey ? dom.aiCfgAnthropicKey.value.trim() : '';
        if (akey) window.Keys.set('anthropic', akey);
        else window.Keys.remove('anthropic');
        // BYOK-nøkkelen påvirker Web-knappens synlighet (webModeEligible).
        if (window.mdSyncWebBtnVisibility) window.mdSyncWebBtnVisibility();
        if (dom.aiCfgSourceKeys && window.Keys) {
          dom.aiCfgSourceKeys.querySelectorAll('input[data-source-key-id]').forEach(function (inp) {
            var v = inp.value.trim();
            if (v) window.Keys.set(inp.dataset.sourceKeyId, v);
          });
        }
        if (dom.aiCfgProviderType) {
          var ptype = dom.aiCfgProviderType.value;
          if (ptype === 'anthropic') {
            localStorage.removeItem(LS_PROVIDER);
          } else {
            localStorage.setItem(LS_PROVIDER, JSON.stringify({
              type: ptype,
              base_url: (dom.aiCfgProviderUrl ? dom.aiCfgProviderUrl.value.trim() : ''),
              model: (dom.aiCfgProviderModel ? dom.aiCfgProviderModel.value.trim() : ''),
            }));
            var lk = dom.aiCfgLlmKey ? dom.aiCfgLlmKey.value.trim() : '';
            if (lk && window.Keys) window.Keys.set('llm', lk);
          }
        }
        // Telemetri-opt-out: kun feilmeldinger sendes, aldri spørsmål/data/
        // nøkler (js/feil-telemetri.js sin vakt leser dette flagget FØRST i
        // sendFeilrapport). Avkrysset (tillatt) → fjern flagget i stedet for
        // å skrive '0' — fravær ER "tillatt"-tilstanden.
        if (dom.aiCfgTelemetry) {
          try {
            if (dom.aiCfgTelemetry.checked) localStorage.removeItem('md_telemetri_av');
            else localStorage.setItem('md_telemetri_av', '1');
          } catch (e) {}
        }
        closeSettings();
      }

      function clearChat() {
        state.history = [];
        renderEmpty();
      }

      function init() {
        cacheDom();
        if (!dom.aiSidebar) return;

        dom.aiToggleBtn.addEventListener('click', toggleOpen);
        dom.aiCloseBtn.addEventListener('click', () => setOpen(false));
        dom.aiSettingsBtn.addEventListener('click', openSettings);
        dom.aiClearBtn.addEventListener('click', clearChat);
        dom.aiCfgSave.addEventListener('click', saveSettings);
        dom.aiCfgCancel.addEventListener('click', closeSettings);
        dom.aiSettingsBackdrop.addEventListener('click', (e) => {
          if (e.target === dom.aiSettingsBackdrop) closeSettings();
        });

        if (dom.aiCfgProviderType) dom.aiCfgProviderType.addEventListener('change', syncProviderFields);

        if (dom.aiCfgByokRemove) {
          dom.aiCfgByokRemove.addEventListener('click', () => {
            window.Keys.remove('anthropic');
            if (dom.aiCfgAnthropicKey) dom.aiCfgAnthropicKey.value = '';
            if (dom.aiCfgByokStored) dom.aiCfgByokStored.style.display = 'none';
            if (window.mdSyncWebBtnVisibility) window.mdSyncWebBtnVisibility();
          });
        }

        // Egne nøkler v1 (Task 11): «Add your own key» åpner skjemaet;
        // «Save key» lagrer umiddelbart (samme mønster som Datakilde-nøklenes
        // Fjern-knapp over — ingen ekstra «Lagre innstillinger»-steg).
        if (dom.aiCfgUserKeyAdd) {
          dom.aiCfgUserKeyAdd.addEventListener('click', () => {
            if (dom.userKeyName) dom.userKeyName.value = '';
            if (dom.userKeyValue) dom.userKeyValue.value = '';
            if (dom.userKeyNote) dom.userKeyNote.value = '';
            if (dom.aiCfgUserKeyForm) dom.aiCfgUserKeyForm.hidden = false;
          });
        }
        if (dom.userKeySave) dom.userKeySave.addEventListener('click', addUserKeyFromForm);

        // Send is routed by the active mode: microdata-modus → microdata AI
        // (kode-svar); otherwise the agentic svar flow (search data → script
        // in the active mode's language → run → revise).
        function sendCurrent() {
          // Microdata-modusen (kode-svar/v2-flyten) er fjernet fra openstat
          // (2026-07-24) — alle moduser går svar-veien.
          sendWebMessage();
        }
        if (dom.aiSendFastBtn) dom.aiSendFastBtn.addEventListener('click', sendCurrent);
        if (dom.aiSendV2Btn) dom.aiSendV2Btn.style.display = 'none';
        // The old Web button is subsumed by the URL-routed Send; keep it hidden.
        if (dom.aiSendWebBtn) { dom.aiSendWebBtn.style.display = 'none'; dom.aiSendWebBtn.addEventListener('click', () => { sendWebMessage(); }); }
        if (dom.aiAbortBtn) dom.aiAbortBtn.addEventListener('click', () => { if (state.abortCtrl) state.abortCtrl.abort(); });
        dom.aiInput.addEventListener('input', autoresize);
        dom.aiInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCurrent();   // Enter = send (modus fra menyen); Shift+Enter = ny linje
          }
        });

        // Shows/hides the dedicated Web send button: admin + python/r/duckdb only.
        // Called after login/user fetch (refreshUserPanel), on editor-mode changes
        // (see switchEditorMode() in index.html), and once here at init.
        function syncWebBtnVisibility() {
          // The Web button is subsumed by the URL-routed Send; keep it hidden.
          if (dom.aiSendWebBtn) dom.aiSendWebBtn.style.display = 'none';
        }
        window.mdSyncWebBtnVisibility = syncWebBtnVisibility;
        syncWebBtnVisibility();

        // Keyboard shortcut Ctrl+I
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
            e.preventDefault();
            toggleOpen();
          } else if (e.key === 'Escape') {
            if (dom.aiSettingsBackdrop.classList.contains('open')) closeSettings();
          }
        });

        // If Datasett sidebar opens later, close AI to keep mutual exclusion.
        if (dom.sidebarRight) {
          const observer = new MutationObserver(() => {
            const datasettOpen = !dom.sidebarRight.classList.contains('collapsed');
            const aiOpen = dom.aiSidebar.classList.contains('open');
            if (datasettOpen && aiOpen) setOpen(false);
          });
          observer.observe(dom.sidebarRight, { attributes: true, attributeFilter: ['class'] });
        }

        // Auth gate is in sendMessage; no auto-open of settings on first AI-panel
        // toggle. Users see the panel and the empty state; only Send triggers
        // the Settings dialog to collect a BYOK key.

        // Offentlig: åpne AI-panelet og send et spørsmål (brukes av hurtigspør-boksen i toppen).
        window.mdAskAi = function(question) {
          if (!question || !question.trim()) return;
          setOpen(true);
          dom.aiInput.value = question;
          autoresize();
          sendWebMessage();
        };

        // Offentlig: åpne AI-panelet og tolk resultatene (output) fra forrige kjøring.
        window.mdInterpretResults = function(payload) {
          payload = payload || {};
          if (!payload.output || !payload.output.trim()) return;
          if (state.sending) return;
          if (!state.anthropicKey && !customProviderReady()) { openSettings(); return; }
          setOpen(true);
          if (state.history.length === 0) dom.aiThread.innerHTML = '';
          appendUserMessage(T('Tolk resultatene fra forrige kjøring.'));
          state.history.push({ role: 'user', text: 'Tolk resultatene' });
          const thinkingNode = appendThinking();
          state.sending = true;
          if (dom.aiSendFastBtn) dom.aiSendFastBtn.disabled = true;
          if (dom.aiSendWebBtn) dom.aiSendWebBtn.disabled = true;
          const ctrl = new AbortController();
          state.abortCtrl = ctrl;
          if (dom.aiAbortBtn) dom.aiAbortBtn.style.display = '';
          runInterpretQuery(payload, thinkingNode, ctrl.signal)
            .catch(e => { if (e.name !== 'AbortError') appendError(thinkingNode, '✗ ' + e.message); })
            .finally(() => {
              state.abortCtrl = null;
              if (dom.aiAbortBtn) dom.aiAbortBtn.style.display = 'none';
              state.sending = false;
              if (dom.aiSendFastBtn) dom.aiSendFastBtn.disabled = false;
              if (dom.aiSendWebBtn) dom.aiSendWebBtn.disabled = false;
              if (dom.aiInput) dom.aiInput.focus();
            });
        };

        // ── Ask-visningen (js/ask-view.js) ─────────────────────────────
        // Små, stabile seams så ask-visningen slipper å duplisere BYOK-,
        // provider- og innstillingslogikken i denne modulen.
        window.mdAiHasKey = function () {
          return !!state.anthropicKey || customProviderReady();
        };
        window.mdOpenAiSettings = openSettings;
        window.mdAiAuthHeaders = providerAuthHeaders;
        window.mdAiProviderConfig = providerConfig;
        // Sluttreview-fiksebølge #1: samme innsettingsvei som en fersk
        // kjøring bruker (mdAskExecuteScript under), eksponert alene slik at
        // ask-view.js sin restoreEntry() kan sette et GJENOPPRETTET svars
        // script inn i editoren uten å kjøre det på nytt — «Se kode og data»
        // viste tidligere det som tilfeldigvis sto i editoren fra før.
        window.mdAskInsertScript = insertScriptIntoEditor;

        // Sluttreview-fiksebølge #2: egne nøkkel-VERDIER kan lekke til
        // LLM-leverandøren via kjøre-output — generert kode kan f.eks.
        // printe KEYS['x'], eller en exception kan ekko verdien i
        // feilmeldingen. Maskerer enhver forekomst av en kjent, REGISTRERT
        // egen nøkkelverdi med '•••' — split/join, ALDRI regex på selve
        // verdien (den kan inneholde regex-metategn og ville da enten
        // kaste eller ikke matche). Brukt her (run_result under) OG av
        // index.html sin triggerTolkResultat («Tolk resultat»-knappen),
        // som begge kan sende kjøre-output videre til en LLM.
        function maskKnownKeyValues(text) {
          var out = String(text == null ? '' : text);
          mdUserKeysMeta().forEach(function (k) {
            var v = window.Keys && window.Keys.get(k.id);
            // Minstelengde-guard (re-review-restpunkt #2): en 1-2-tegns
            // nøkkelverdi ville truffet nesten hvilken som helst output
            // (split/join på f.eks. "a" makulerer teksten) — reell risiko
            // er lengre hemmeligheter, ikke korte tilfeldige tegn.
            if (v && v.length >= 6) out = out.split(v).join('•••');
          });
          return out;
        }
        window.mdMaskKeyValues = maskKnownKeyValues;

        // Kjør et script via Kjør-knappens vei og formater run_code-
        // verktøyresultatet. Innsetting + kjøring + output-lesing i ett —
        // både ask-visningen og AI-panelet bruker denne.
        window.mdAskExecuteScript = async function (script, signal) {
          // Egne nøkler v1 (innstillinger-runden, Task 11): KUN python-modus
          // (samme mode-oppslag som runSvarLoop over) — prepend en KEYS-dict
          // med {navn: verdi} for hver registrert egen nøkkel som faktisk har
          // en verdi i window.Keys. AI-en ser aldri verdien (kun navn+notat i
          // prompten via user_keys/renderUserKeysBlock) — den blir bare
          // tilgjengelig for koden NÅR den kjøres her, klientsidig.
          var mode = (typeof activeEditorMode !== 'undefined' && activeEditorMode) ? activeEditorMode : 'python';
          var userKeys = {};
          mdUserKeysMeta().forEach(function (k) {
            var v = window.Keys && window.Keys.get(k.id);
            // userKeyCanonicalName(k) (SLUGEN) — IKKE k.navn — fikserunde 1,
            // funn #2: må matche EKSAKT det serveren fikk i user_keys-
            // payloaden over, ellers peker KEYS['<navn>'] i prompten på en
            // annen dict-nøkkel enn den som faktisk finnes her.
            if (v) userKeys[userKeyCanonicalName(k)] = v;
          });
          if (Object.keys(userKeys).length && mode === 'python') {
            script = 'KEYS = ' + JSON.stringify(userKeys) + '\n' + script;
          }
          // Styrt-skinne, hook (c) (målt Oslo-runde 8+9): håndskrevet
          // XHR/fetch mot en styrt host avvises FØR kjøring — se
          // styrtKildeIScript i js/data-loader.js. Fail-open ved
          // registerfeil (skinnen skal aldri knekke run_code-veien selv).
          try {
            var DLx = window.DataLoader;
            if (DLx && DLx.styrtKildeIScript) {
              // loadRegistry KREVER fetchImpl — uten den kaster try-blokka
              // og cacher [] PERMANENT (truthy modul-cache; funnet i Task 2,
              // samme felle som alias-bindingen traff): første run_code
              // ville forgiftet registeret for hele sesjonen.
              var styrtHitS = DLx.styrtKildeIScript(script, await DLx.loadRegistry(fetch.bind(window)));
              if (styrtHitS) {
                return { ok: false, result: 'FEIL:\n' + DLx.styrtMelding(styrtHitS.id) +
                  ' (rå HTTP mot ' + styrtHitS.host + ' i scriptet — avvist før kjøring)' };
              }
            }
          } catch (eStyrt) { /* fail-open */ }
          // Kodesak A (eval-r12): seq leses FØR kjøringen — bare en bump
          // mellom før/etter beviser at DENNE kjøringen skrev motor-stdouten
          // (en stående lastOutput fra en tidligere kjøring gir uendret seq).
          var seqFoer = window.mdSisteKjoringStdout ? window.mdSisteKjoringStdout().seq : -1;
          insertScriptIntoEditor(script);
          var err = await runScriptAndCaptureError(signal);
          var out = document.getElementById('outputArea');
          // Kodesak A (eval-r12, docs/eval/2026-08-18-harness.md §5): foretrekk
          // motorens stdout — DOM-innerText er synlighetsavhengig (målt: tom
          // ved checkVisibility()=false i svarvisningen, selv print()
          // forsvant, og figurdata-blokken nådde aldri modellen). Fallback til
          // innerText når seq ikke rykket (R/andre kjøreveier uten bump) eller
          // accessoren mangler — da er adferden byte-lik den gamle.
          var fangst = window.mdSisteKjoringStdout ? window.mdSisteKjoringStdout() : null;
          var motorTekst = (fangst && fangst.seq !== seqFoer)
            ? motorOutputTilModelltekst(fangst.raw) : '';
          // Maskert FØR noe annet leser den — se maskKnownKeyValues over.
          var outText = maskKnownKeyValues((motorTekst || ((out && out.innerText) || '')).trim());
          // OUTPUTS-manifest (spec 2026-07-31-ask-svar-referanser §2):
          // forteller modellen HVA den kan referere med {{fig:1}} osv. —
          // samme klassifiseringsfunksjon som resolveren bruker, så
          // nummereringen kan aldri sprike.
          var manifest = '';
          if (!err && out && window.mdClassifyAskOutput && window.mdAskManifest) {
            try { manifest = window.mdAskManifest(window.mdClassifyAskOutput(out)); }
            catch (e) { manifest = ''; }
          }
          return {
            ok: !err,
            result: err
              ? 'FEIL:\n' + maskKnownKeyValues(String(err)).slice(0, 20000)
              // «(truncated)» sto her UBETINGET (målt Oslo-runde 9: modellen
              // trodde komplett output var avkuttet og re-hentet/byttet
              // strategi) — etiketten skal være sann, og si hvor mye.
              : 'OK. OUTPUT' + (outText.length > 20000
                  ? ' (avkuttet etter 20000 av ' + outText.length + ' tegn)' : '') +
                ':\n' + outText.slice(0, 20000) +
                (manifest ? '\n' + manifest : ''),
          };
        };
        window.mdSvarRun = runSvarLoop;
      }

      // Kodesak A (eval-r12, docs/eval/2026-08-18-harness.md §5): motorens rå
      // stdout inneholder embed-payloads på flere hundre KB (r12 målte 636 KB
      // figur-JSON) — modellen skal ha tekstdelene ordrett og aldri payloaden.
      // Samme markørkonvensjon som parseOutput i index.html; markdown-embeds
      // ER lesbar tekst og beholdes, alt annet blir en kompakt markør
      // (OUTPUTS-manifestet navngir allerede figurene for modellen).
      var EMBED_START_MRK = '__micro_transform_start_';
      var EMBED_END_MRK = '__micro_transform_end__';
      function motorOutputTilModelltekst(raw) {
        var s = String(raw == null ? '' : raw);
        var ut = '';
        while (s.length) {
          var i = s.indexOf(EMBED_START_MRK);
          if (i === -1) { ut += s; break; }
          ut += s.slice(0, i);
          var typeEnd = s.indexOf('__', i + EMBED_START_MRK.length);
          var type = typeEnd > i ? s.slice(i + EMBED_START_MRK.length, typeEnd) : 'ukjent';
          var payloadStart = s.indexOf('\n', typeEnd) + 1;
          var slutt = s.indexOf(EMBED_END_MRK, payloadStart);
          if (slutt === -1) { ut += '[' + type + '-embed avkuttet]'; break; }
          ut += type === 'markdown'
            ? s.slice(payloadStart, slutt).trim()
            : '[' + type + '-embed vist i output]';
          s = s.slice(slutt + EMBED_END_MRK.length);
        }
        return ut;
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }

      // Node-testbar seam (samme mønster som js/ui.js, js/cells.js, js/names.js
      // m.fl.): eksporter et lite, stabilt sett av rene funksjoner + nivå
      // 1-dispatch-tabellen for tests/js/*.test.js. Resten av modulen (init(),
      // sendMessage() m.fl.) krever en ekte nettleser-DOM og eksporteres ikke —
      // se tests/js/ui-dom.test.js for mønsteret dersom det trengs senere.
      if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
          extractFirstCodeBlock: extractFirstCodeBlock,
          extractLangSegment: extractLangSegment,
          extractAllCode: extractAllCode,
          findUnknownVarNames: findUnknownVarNames,
          buildRepairErrors: buildRepairErrors,
          validatePythonSyntax: validatePythonSyntax,
          validateRSyntax: validateRSyntax,
          _v2Validators: _v2Validators,
          computeParamFormsWrap: computeParamFormsWrap,
          motorOutputTilModelltekst: motorOutputTilModelltekst,
        };
      }
    })();
