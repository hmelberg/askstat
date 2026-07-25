// Portabel eksport (spec 2026-07-23-portable-export-design): transpilerer
// # connect/# load-direktiver til frittstående lastekode. Nøkkelinnsikt:
// utenfor nettleseren finnes ikke CORS, så /api/hent-innpakkede URL-er
// pakkes UT til direkte kilde-URL-er. Direktivlinjene erstattes på stedet
// (original beholdt som kommentar over); alt annet passerer uendret.
// Testes i deno via eval (portable-export.test.ts).
(function (global) {
  'use strict';

  var HEADER = [
    '# ── Portabel eksport fra OpenStat ──',
    '# «# load»-direktivene er oversatt til frittstående lastekode.',
    '# Generert av appen — rediger fritt.',
  ];

  // key(<literal>)-maskering SKOPET til direktivlinjer (connect/load/require):
  // en helskript-scrub ødela legitim kode med key(...)-formede kall — f.eks.
  // ble «dt <- data.table::key(dt)» til «data.table::key(***)». Bare linjer
  // som ser ut som direktiv-kommentarer kan bære nøkkelliteraler.
  var DIRECTIVE_LINE_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*(connect|load|require)\b/i;
  var MASK_WARNING = 'key(...)-verdier ble maskert i eksporten — bruk key(ask) eller egen nøkkelhåndtering utenfor appen';

  function scrubDirectiveLine(line, DD, state) {
    if (!DIRECTIVE_LINE_RE.test(line)) return line;
    var scrubbed = DD.scrubKeys(line);
    if (scrubbed !== line) state.masked = true;
    return scrubbed;
  }

  // /api/hent?url=<enc>[&body=<enc-json>] → {url, body|null}; ellers null.
  function decodeHentUrl(target) {
    if (target.indexOf('/api/hent?') !== 0) return null;
    var mUrl = /[?&]url=([^&]+)/.exec(target);
    if (!mUrl) return null;
    var mBody = /[?&]body=([^&]+)/.exec(target);
    try {
      return {
        url: decodeURIComponent(mUrl[1]),
        body: mBody ? decodeURIComponent(mBody[1]) : null,
      };
    } catch (e) { return null; }
  }

  // kind() vinner; ellers URL-endelse; ellers csv (som kjøretidens default) + warn.
  function formatFor(item, url, warnings) {
    if (item.kind) return item.kind;
    if (/\.parquet(\?|$)/.test(url)) return 'parquet';
    if (/\.json(\?|$)/.test(url)) return 'json';
    if (/\.csv(\?|$)/.test(url)) return 'csv';
    warnings.push('«' + item.alias + '»: ukjent format — antar csv (bruk kind(...) i direktivet for å styre)');
    return 'csv';
  }

  function pyStr(s) { return JSON.stringify(s); }

  // Registerkilder med auth (spec §2): finn registeroppføringen for URL-ens
  // vert, uansett auth-type (i motsetning til js/data-loader.js sin
  // userAuthSourceFor, som bare ser etter auth.user). Samme defensive
  // try/catch rundt URL-parsing.
  function findAuthSource(url, registry) {
    var target = url;
    if (typeof target === 'string' && target.indexOf('/api/hent?') === 0) {
      var m = /[?&]url=([^&]+)/.exec(target);
      if (!m) return null;
      try { target = decodeURIComponent(m[1]); } catch (e) { return null; }
    }
    var host;
    try { host = new URL(target).host; } catch (e) { return null; }
    var reg = registry || [];
    for (var i = 0; i < reg.length; i++) {
      var s = reg[i];
      if (!s.auth) continue;
      try { if (new URL(s.base_url).host === host) return s; } catch (e2) {}
    }
    return null;
  }

  // Marker satt av den nøkkel-plassering-grenen i emitFor når URL-en må
  // bygges i koden (variabel), ikke som strenglitteral — se emitFor. Denne
  // markøren skal ALDRI ende opp bokstavelig i emittert kode; urlExpr()
  // er eneste sted som leser den, og alle emisjonsfunksjoner går via den.
  function urlExpr(url, item, mode) {
    if (typeof url === 'string' && url.indexOf('__URLVAR__') === 0) {
      return mode === 'python' ? '_url_' + item.alias : 'url_' + item.alias + '_';
    }
    return mode === 'python' ? pyStr(url) : rStr(url);
  }

  // Emisjon for én kilde i python-modus. out.lines fylles; out.needs merkes.
  function emitPython(item, url, body, fmt, out) {
    if (body !== null) {
      out.needs.requests = true;
      out.needs.json = true;
      // Body inlines som vanlig (escapet) strenglitteral — IKKE r'''...''',
      // som knekker/korrumperer stille dersom bodyen inneholder ''' selv.
      if (fmt === 'json') {
        out.lines.push(item.alias + ' = requests.post(' + urlExpr(url, item, 'python') + ', json=json.loads(' + pyStr(body) + ')).json()');
      } else {
        out.needs.io = true;
        out.needs.pandas = true;
        out.lines.push('_resp = requests.post(' + urlExpr(url, item, 'python') + ', json=json.loads(' + pyStr(body) + '))');
        out.lines.push(item.alias + ' = pd.read_csv(io.StringIO(_resp.text), sep=None, engine="python")');
      }
      return;
    }
    if (fmt === 'json') {
      out.needs.requests = true;
      out.lines.push(item.alias + ' = requests.get(' + urlExpr(url, item, 'python') + ').json()  # rå JSON — appens binding kan avvike');
      return;
    }
    if (fmt === 'parquet') {
      out.needs.pandas = true;
      out.lines.push(item.alias + ' = pd.read_parquet(' + urlExpr(url, item, 'python') + ')  # krever pyarrow');
      return;
    }
    out.needs.pandas = true;
    out.lines.push(item.alias + ' = pd.read_csv(' + urlExpr(url, item, 'python') + ', sep=None, engine="python")');
  }

  // Importblokk for python — bare det som trengs og ikke alt finnes i scriptet.
  function pythonImports(needs, script) {
    var want = [];
    if (needs.pandas && !/^\s*import pandas as pd\b/m.test(script)) want.push('import pandas as pd');
    if (needs.requests && !/^\s*import requests\b/m.test(script)) want.push('import requests');
    if (needs.io && !/^\s*import io\b/m.test(script)) want.push('import io');
    if (needs.json && !/^\s*import json\b/m.test(script)) want.push('import json');
    return want;
  }

  // Én kilde → linjer. Task 3 legger nøkkel/ikke-portabel-grener FØRST her.
  function emitFor(item, mode, registry, warnings, needs) {
    var out = { lines: [], needs: needs };
    // Ikke-portable kilder (spec §2): krypterte (key), Anvil/SafeStat, remote.
    // MÅ kjøre FØR noe forsøk på å lese item.url — anvil-oppløste items har
    // ikke noe .url-felt i det hele tatt (se DataDirectives.resolve), så en
    // decodeHentUrl(undefined) lenger ned ville kastet TypeError.
    if (item.anvil || item.exec === 'remote' || item.key) {
      out.lines.push('# (denne kilden krever OpenStat-appen — hopp over eller erstatt manuelt: «' + item.alias + '»)');
      warnings.push('«' + item.alias + '»: kilden krever appen (kryptert/registrert/remote) og ble ikke transpilert');
      return out.lines;
    }
    var url = item.url, body = null;
    var hent = decodeHentUrl(url);
    if (hent) { url = hent.url; body = hent.body; }
    if (url.indexOf('/') === 0) {
      out.lines.push('# (ikke portabel: app-intern URL «' + url + '» — hopp over eller erstatt manuelt)');
      warnings.push('«' + item.alias + '»: app-intern URL kan ikke gjøres portabel');
      return out.lines;
    }
    if (item.kind === 'duckdb' || item.kind === 'sqlite') {
      out.lines.push('# (ikke portabel i v1: ' + item.kind + '-kilde med tabellen «' + (item.table || '') + '» — last ned fila og spør den manuelt)');
      warnings.push('«' + item.alias + '»: ' + item.kind + '-kilder eksporteres ikke i v1');
      return out.lines;
    }
    // pxweb (plan 2026-07-25 Task 2): data-URL-en bygges på transpile-tid
    // (js/pxweb.js), konverteringen json-stat2 → langt format emitteres som
    // hjelpefunksjon én gang (needs.pxHelperPy/R) — selvforsynt eksport.
    if (item.kind === 'pxweb') {
      var PX = global.PxWeb;
      if (!PX) {
        out.lines.push('# (pxweb-kilde «' + item.alias + '»: intern feil — js/pxweb.js er ikke lastet)');
        warnings.push('«' + item.alias + '»: pxweb-transpilering utilgjengelig (js/pxweb.js mangler)');
        return out.lines;
      }
      var du = PX.dataUrl(url);
      if (mode === 'python') {
        needs.requests = true;
        needs.pandas = true;
        needs.pxHelperPy = true;
        out.lines.push(item.alias + ' = _px_frame(requests.get(' + pyStr(du) + ').json())');
      } else {
        needs.pxHelperR = true;
        out.lines.push(item.alias + ' <- px_frame_(jsonlite::fromJSON(' + rStr(du) + ', simplifyVector = FALSE))  # krever jsonlite');
      }
      return out.lines;
    }
    // fmt regnes ut FØR ev. nøkkel-plassering markerer url som variabel
    // (__URLVAR__), slik at endelsesniffing i formatFor fortsatt ser den
    // ekte URL-en.
    var fmt = formatFor(item, url, warnings);

    // Registerkilder med auth: plassholder-nøkkel (aldri verdier) — spec §2.
    var authSrc = findAuthSource(url, registry);
    if (authSrc && authSrc.auth) {
      if (authSrc.auth.valgfri) {
        out.lines.push('# nøkkel er valgfri for ' + authSrc.id + ' — åpne datasett virker uten; privat-/konkurransedata krever egen nøkkel');
      } else {
        var cname = authSrc.id.toUpperCase() + '_API_KEY';
        needs.placeholders = needs.placeholders || {};
        needs.placeholders[cname] = true;
        warnings.push('«' + item.alias + '»: ' + authSrc.id + ' krever egen nøkkel — sett inn verdien i ' + cname);
        var plass = authSrc.auth.plassering || '';
        if (plass.indexOf('query:') === 0) {
          var param = plass.slice(6);
          // URL-en bygges i koden med nøkkelen limt på:
          if (mode === 'python') {
            out.lines.push('_url_' + item.alias + ' = ' + pyStr(url) + ' + "' + (url.indexOf('?') >= 0 ? '&' : '?') + param + '=" + ' + cname);
          } else {
            out.lines.push('url_' + item.alias + '_ <- paste0(' + rStr(url) + ', "' + (url.indexOf('?') >= 0 ? '&' : '?') + param + '=", ' + cname + ')');
          }
          url = '__URLVAR__' + item.alias;   // marker: emisjonen bruker variabelen (urlExpr)
        } else {
          out.lines.push('# ' + authSrc.id + ' bruker ' + plass + '-autentisering — legg nøkkelen i ' + cname + ' og send den som beskrevet i API-dokumentasjonen');
        }
      }
    }

    if (mode === 'python') emitPython(item, url, body, fmt, out);
    else emitR(item, url, body, fmt, out);   // Task 2
    return out.lines;
  }

  function rStr(s) { return JSON.stringify(s); }

  // json-stat2 → langt format (koder + value) — speiler js/pxweb.js
  // columnsFromJsonStat: koder i posisjonsorden (index som objekt ELLER
  // array), row-major-ekspansjon etter id/size, sparse value-objekt → NA.
  var PX_HELPER_PY = [
    '',
    'def _px_frame(ds):',
    '    ids = ds.get("id") or []',
    '    size = ds.get("size") or []',
    '    def _codes(dim):',
    '        idx = (dim.get("category") or {}).get("index")',
    '        if isinstance(idx, list):',
    '            return [str(c) for c in idx]',
    '        return [c for c, _ in sorted((idx or {}).items(), key=lambda kv: kv[1])]',
    '    dims = [_codes((ds.get("dimension") or {}).get(i) or {}) for i in ids]',
    '    total = 1',
    '    for s in size:',
    '        total *= s',
    '    val = ds.get("value")',
    '    cols = {i: [] for i in ids}',
    '    vals = []',
    '    for flat in range(total):',
    '        rest = flat',
    '        for d in range(len(ids) - 1, -1, -1):',
    '            cols[ids[d]].append(dims[d][rest % size[d]])',
    '            rest //= size[d]',
    '        v = val[flat] if isinstance(val, list) else (val or {}).get(str(flat))',
    '        vals.append(v)',
    '    cols["value"] = vals',
    '    return pd.DataFrame(cols)',
  ];
  var PX_HELPER_R = [
    '',
    'px_frame_ <- function(ds) {',
    '  ids <- unlist(ds$id); size <- unlist(ds$size)',
    '  codes_ <- function(dim) {',
    '    idx <- dim$category$index',
    '    if (is.null(names(idx))) as.character(unlist(idx)) else names(sort(unlist(idx)))',
    '  }',
    '  dims <- lapply(ids, function(i) codes_(ds$dimension[[i]]))',
    '  grid <- rev(expand.grid(rev(setNames(dims, ids)), stringsAsFactors = FALSE))',
    '  v <- ds$value',
    '  if (!is.null(names(v))) {',
    '    vals <- rep(NA, prod(size))',
    '    vals[as.integer(names(v)) + 1] <- unlist(v)',
    '  } else {',
    '    vals <- unlist(lapply(v, function(x) if (is.null(x)) NA else x))',
    '  }',
    '  grid$value <- vals',
    '  grid',
    '}',
  ];
  function pxHelperLines(mode, needs) {
    if (mode === 'python' && needs.pxHelperPy) return PX_HELPER_PY;
    if (mode === 'r' && needs.pxHelperR) return PX_HELPER_R;
    return [];
  }

  function emitR(item, url, body, fmt, out) {
    if (body !== null) {
      out.lines.push('# krever httr (+ jsonlite for JSON-svar):');
      out.lines.push('resp_ <- httr::POST(' + urlExpr(url, item, 'r') + ', body = ' + rStr(body) + ', encode = "raw", httr::content_type_json())');
      if (fmt === 'json') {
        out.lines.push(item.alias + ' <- httr::content(resp_, as = "parsed")');
      } else {
        out.lines.push(item.alias + ' <- read.csv(text = httr::content(resp_, as = "text"))  # NB: sjekk skilletegn (sep=";")');
      }
      return;
    }
    if (fmt === 'json') {
      out.lines.push(item.alias + ' <- jsonlite::fromJSON(' + urlExpr(url, item, 'r') + ')  # krever jsonlite');
      return;
    }
    if (fmt === 'parquet') {
      var tmp = '"' + item.alias + '.parquet"';
      out.lines.push('download.file(' + urlExpr(url, item, 'r') + ', ' + tmp + ', mode = "wb")');
      out.lines.push(item.alias + ' <- arrow::read_parquet(' + tmp + ')  # krever arrow');
      return;
    }
    out.lines.push(item.alias + ' <- read.csv(' + urlExpr(url, item, 'r') + ')  # NB: sjekk skilletegn — nordiske CSV-er bruker ofte sep=";"');
  }

  // Montering i eksporten (plan 2026-07-25 Task 3): create-dataset/import/
  // join → kildelesing (src_<key>-variabler via emitFor) + merge-kjeder.
  // Datasett med .load er alt emittert av sine egne load-linjer; kilder som
  // ikke kan gjøres portable (duckdb/sqlite/kryptert/uløselig) gjør at
  // datasettet hoppes over med kommentar + warning i stedet for knekt kode.
  var ASM_LINE_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*(create-dataset|import|join)\b/i;

  function mergeLine(name, rightExpr, keys, how, mode) {
    if (mode === 'python') {
      return name + ' = ' + name + '.merge(' + rightExpr + ', on=[' + keys.map(pyStr).join(', ') + '], how=' + pyStr(how) + ')';
    }
    var tail = how === 'left' ? ', all.x = TRUE' : how === 'outer' ? ', all = TRUE' : '';
    return name + ' <- merge(' + name + ', ' + rightExpr + ', by = c(' + keys.map(rStr).join(', ') + ')' + tail + ')';
  }

  function emitAssembly(script, mode, registry, warnings, needs, DD) {
    var asm = DD.parseAssembly(script);
    if (asm.errors.length) return null;   // monteringsfeil rapporteres av kjøretiden, ikke eksporten
    var all = asm.spec.datasets || [];
    var withSteps = all.filter(function (d) { return !('load' in d) && (d.steps || []).length; });
    if (!withSteps.length) return null;

    var srcKeys = [], seen = {};
    withSteps.forEach(function (d) {
      (d.steps || []).forEach(function (st) {
        if (st.op === 'import' && !seen[st.source]) { seen[st.source] = true; srcKeys.push(st.source); }
      });
    });
    var tables = asm.spec.sourceTables || {};
    var connectLines = String(script).split('\n').filter(function (ln) { return /^[ \t]*(?:#|--|\/\/)[ \t]*connect\b/i.test(ln); }).join('\n');
    var synth = srcKeys.map(function (k) {
      var t = tables[k];
      return '# load ' + (t ? (t.source + '/' + t.table) : k) + ' as src_' + k;
    });
    var resolvedSynth = DD.resolve(DD.parse(connectLines + '\n' + synth.join('\n')), registry);

    var lines = [], failed = {};
    resolvedSynth.forEach(function (item, i) {
      var key = srcKeys[i];
      if (item.error) {
        failed[key] = true;
        warnings.push('montering: ' + item.error);
        lines.push('# (kilden «' + key + '» kunne ikke løses: ' + item.error + ')');
        return;
      }
      if (item.anvil || item.key || item.exec === 'remote' ||
          item.kind === 'duckdb' || item.kind === 'sqlite') failed[key] = true;
      lines.push.apply(lines, emitFor(item, mode, registry, warnings, needs));
    });

    var ordered = (global.AssemblyDuckdb && global.AssemblyDuckdb._topoSort)
      ? global.AssemblyDuckdb._topoSort(all) : all;
    var built = {};
    all.forEach(function (d) { if ('load' in d) built[d.name] = true; });
    ordered.forEach(function (d) {
      if ('load' in d || !(d.steps || []).length) return;
      var keys = d.key || [];
      var bad = d.steps.some(function (st) { return st.op === 'import' && failed[st.source]; })
        || d.steps.some(function (st) { return st.op === 'join' && !built[st.from]; })
        || (d.steps[0] || {}).op !== 'import';
      if (bad) {
        lines.push('# (datasettet «' + d.name + '» kunne ikke eksporteres — se advarslene)');
        warnings.push('montering: datasettet «' + d.name + '» ble ikke eksportert (utilgjengelig kilde eller join-avhengighet)');
        return;
      }
      d.steps.forEach(function (st, si) {
        if (st.op === 'import') {
          var cols = keys.concat(st.columns.filter(function (c) { return keys.indexOf(c) < 0; }));
          var subset = mode === 'python'
            ? 'src_' + st.source + '[[' + cols.map(pyStr).join(', ') + ']]'
            : 'src_' + st.source + '[, c(' + cols.map(rStr).join(', ') + ')]';
          if (si === 0) lines.push(mode === 'python' ? (d.name + ' = ' + subset) : (d.name + ' <- ' + subset));
          else lines.push(mergeLine(d.name, subset, keys, st.how, mode));
        } else {
          lines.push(mergeLine(d.name, st.from, st.on, st.how, mode));
        }
      });
      if (mode === 'r' && d.format === 'data.table') lines.push(d.name + ' <- data.table::as.data.table(' + d.name + ')  # krever data.table');
      else if (mode === 'r' && d.format === 'tibble') lines.push(d.name + ' <- tibble::as_tibble(' + d.name + ')  # krever tibble');
      else if (d.format && d.format !== 'pandas' && d.format !== 'data.frame') lines.push('# format(' + d.format + ') er editor-spesifikk — «' + d.name + '» leveres som vanlig ramme');
      built[d.name] = true;
    });
    if (mode === 'python') needs.pandas = true;
    return lines;
  }

  function transpile(script, mode, registry) {
    if (mode !== 'python' && mode !== 'r') throw new Error('portabel eksport støtter python og r, ikke «' + mode + '»');
    var DD = global.DataDirectives;
    var parsed = DD.parse(script);
    if (parsed.errors.length) throw new Error('Direktivfeil: ' + parsed.errors.join('; '));
    // Montering uten load-linjer skal OGSÅ transpileres — sjekken speiler
    // emitAssembly sin (datasett med steg).
    var _asmProbe = DD.parseAssembly(script);
    var _hasAsm = !_asmProbe.errors.length && (_asmProbe.spec.datasets || []).some(function (d) { return !('load' in d) && (d.steps || []).length; });
    if (!parsed.loads.length && !_hasAsm) {
      // Ingen (parsebare) loads → ingen emisjon å gjøre, men linjer som SER UT
      // som direktiver (også malformerte, f.eks. «# load … key(secret)» uten
      // «as») kan likevel bære nøkkelliteraler. Kjør derfor alltid den
      // linje-skopede scrubben — output blir byte-identisk når ingen linje
      // matcher direktivformen (DIRECTIVE_LINE_RE), så passthrough-testen
      // holder uendret.
      var st0 = { masked: false };
      var passthrough = String(script).split('\n').map(function (l) {
        return scrubDirectiveLine(l, DD, st0);
      }).join('\n');
      return { code: passthrough, warnings: st0.masked ? [MASK_WARNING] : [] };
    }
    var resolved = DD.resolve(parsed, registry || []);
    var bad = resolved.filter(function (r) { return r.error; });
    if (bad.length) throw new Error('Direktivfeil: ' + bad.map(function (b) { return b.error; }).join('; '));

    var warnings = [];
    var needs = {};
    // load-linje (trimmet tekst) → emitterte linjer, konsumert i rekkefølge.
    var queue = parsed.loads.map(function (l, i) {
      return { line: l.line, emitted: emitFor(resolved[i], mode, registry || [], warnings, needs) };
    });

    var outLines = [];
    var maskState = { masked: false };
    var lines = String(script).split('\n');
    var lastAsmIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      var qi = -1;
      for (var q = 0; q < queue.length; q++) {
        if (queue[q] && queue[q].line === trimmed) { qi = q; break; }
      }
      if (qi >= 0) {
        // originaldirektivet som kommentar — key(<literal>) maskeres
        outLines.push(scrubDirectiveLine(lines[i], DD, maskState));
        outLines.push.apply(outLines, queue[qi].emitted);
        queue[qi] = null;                        // konsumert (duplikatlinjer i rekkefølge)
      } else {
        // passthrough — connect-linjer (også direktiver) linje-skopes
        outLines.push(scrubDirectiveLine(lines[i], DD, maskState));
      }
      if (ASM_LINE_RE.test(lines[i])) lastAsmIdx = outLines.length;
    }
    // Monteringsblokken settes inn rett etter siste monteringsdirektiv-linje.
    var asmBlock = _hasAsm ? emitAssembly(script, mode, registry || [], warnings, needs, DD) : null;
    if (asmBlock && asmBlock.length) {
      Array.prototype.splice.apply(outLines, [lastAsmIdx < 0 ? outLines.length : lastAsmIdx, 0].concat(asmBlock));
    }
    if (maskState.masked) warnings.push(MASK_WARNING);

    var head = HEADER.slice();
    // Plassholder-konstanter øverst (etter header, før imports): NAVN = "..."
    // (python) / NAVN <- "..." (r) — én linje per oppdaget plassholder, i
    // rekkefølgen de ble oppdaget (needs.placeholders-nøkler er unike, så
    // samme kilde brukt flere ganger gir bare én konstant).
    var placeholders = Object.keys(needs.placeholders || {});
    placeholders.forEach(function (name) {
      head.push(mode === 'python' ? (name + ' = "SETT-INN-EGEN-NØKKEL"') : (name + ' <- "SETT-INN-EGEN-NØKKEL"'));
    });
    var imports = mode === 'python' ? pythonImports(needs, script) : rImports(needs, script); // rImports: Task 2
    var code = head.concat(imports.length ? imports : []).concat(pxHelperLines(mode, needs)).concat(['']).join('\n') + outLines.join('\n');
    return { code: code, warnings: warnings };
  }

  function rImports() { return []; }   // R: pakker refereres med :: — ingen import-blokk

  global.PortableExport = { transpile: transpile };
})(typeof window !== 'undefined' ? window : globalThis);
