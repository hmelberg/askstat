// connect/load-direktiver for Web-modus (spec 5b/5c i
// docs/superpowers/specs/2026-07-03-web-data-svar-design.md, utvidet av
// docs/superpowers/specs/2026-07-05-encrypted-external-sources-design.md §1).
//   # connect <base-url|register-id|anvil-navn> [as alias] [, key(...)][, exec(...)][, kind(...)]
//   # read <url|alias/sti> as navn [, key(...)]  — uttrekk (hel ramme)
//   Kanoniske ord 2026-07-25 (pakke-paritet): read/add/create — load/import/
//   create-dataset/require godtas som stille aliaser (ett ord i regexene).
//   kind(csv|parquet|duckdb|sqlite|json) — eksplisitt kildetype, hopper over sniffing
//   duckdb/sqlite: "load <alias>/<tabell> as <navn>" og "import <alias>/<tabell>.<kolonne>, ... into <navn>"
//   (punktum skiller tabell fra kolonne — bekreftet 2026-07-06, se
//   docs/superpowers/specs/2026-07-06-remote-columnar-sources-design.md)
// Ren parsing/resolusjon — ingen fetch her. Brukes av index.html
// (materialisering) og testes med deno via eval (data-directives.test.ts).
(function (global) {
  'use strict';

  // Project A (variable-level assembly): create-dataset/import/join/load ->
  // AssemblySpec. See docs/superpowers/plans/2026-07-05-variable-level-assembly.md.
  // format(<navn>) (2026-07-24): lever datasettet direkte i valgt frameformat
  // uten konverteringslinje — data.table/tibble i R, pandas i python (polars
  // når wasm-bygget finnes). Ustøttede kombinasjoner feiler høyt ved binding.
  // Composite keys (spec 2026-07-24-pxweb-sources-design §1): key(region aar)
  // tar 1+ kolonner (mellomrom/komma — parentesene avgrenser), join-on tar
  // komma-liste («on region, aar» — mellomrom alene ville vært tvetydig mot
  // left|inner|outer-halen). d.key og step.on er ALLTID arrays.
  function isUrlish(target) {
    return /^https?:\/\//i.test(target) || target.indexOf('/api/hent?') === 0;
  }

  // Kanonisk → kildens egen spørremodell (spec §3). REGELEN (SDMX-fellen,
  // spec §0): et felt som ikke kan oversettes VERIFISERBART for kilden →
  // hard feil med kildens native alternativ — aldri stille passthrough
  // (2.1-API-ene svarer «vellykket» med ufiltrerte data). Ren funksjon:
  // -> { rest, params: [..], needsSdmxKey?, clientYears?, error? }
  function translateCanonical(kind, rest, c) {
    var params = [], out = { rest: rest, params: params };
    var y = c.years || null;
    // all() (spec 2026-07-26-all-direktiv-design): «last alle verdier av
    // uspesifiserte dimensjoner» er foreløpig kun implementert for pxweb
    // (json-stat2-metadata gjør ekspansjonen mekanisk verifiserbar der) —
    // én felles sjekk her dekker sdmx/worldbank/eurostat/dbnomics uten å
    // duplisere feilen i hver gren.
    if (c.all && kind !== 'pxweb') return { error: 'all() støttes foreløpig kun for pxweb-kilder — for andre kilder, angi utvalg eksplisitt' };
    if (kind === 'worldbank') {
      if (c.regions) return { error: 'regions() støttes ikke for worldbank — bruk landkoder i countries()' };
      if (c.indicators) {
        if (rest) return { error: 'både ressurssti og indicators() angitt — velg én form' };
        out.rest = 'country/' + (c.countries ? c.countries.join(';') : 'all') +
                   '/indicator/' + c.indicators.join(';');
      } else if (c.countries) {
        return { error: 'countries() uten indicators() for worldbank — angi indikatoren også, eller bygg stien selv (country/NOR/indicator/…)' };
      }
      // date=a:b — åpne ender fylles med 1900/2100 (probet 2026-07-25: WB
      // godtar fremtidsår og leverer t.o.m. siste tilgjengelige).
      if (y) params.push('date=' + (y.from || '1900') + ':' + (y.to || '2100'));
      Object.keys(c.filters || {}).forEach(function (k) { params.push(k + '=' + c.filters[k]); });
      return out;
    }
    if (kind === 'eurostat') {
      if (c.indicators) return { error: 'Eurostat har ikke et felles indikatorbegrep — bruk filters(na_item=…) e.l. for dette datasettet' };
      (c.countries || []).concat(c.regions || []).forEach(function (g) { params.push('geo=' + g); });
      if (y && y.from) params.push('sinceTimePeriod=' + y.from);
      if (y && y.to) params.push('untilTimePeriod=' + y.to);
      Object.keys(c.filters || {}).forEach(function (k) { params.push(k + '=' + c.filters[k]); });
      return out;
    }
    if (kind === 'pxweb') {
      if (c.all) out.all = true;   // lasteren (Task 3) ekspanderer uspesifiserte dimensjoner
      if (c.countries) return { error: 'countries() gjelder ikke pxweb-kilder (SSB er norske data) — bruk regions() eller filters(<variabel>=…)' };
      if (c.regions) params.push('valueCodes[Region]=' + c.regions.join(','));
      if (c.indicators) params.push('valueCodes[ContentsCode]=' + c.indicators.join(','));
      if (y) {
        if (y.from && y.to) {
          // range() finnes ikke i PxWeb v2 (probet 2026-07-25: 400) —
          // lukket intervall enumereres eksplisitt.
          var a = parseInt(y.from, 10), b = parseInt(y.to, 10);
          if (isNaN(a) || isNaN(b) || b < a || b - a > 500) return { error: 'years(' + y.from + ':' + y.to + '): kan ikke enumerere intervallet for pxweb — bruk filters(Tid=…)' };
          var aar = [];
          for (var yy = a; yy <= b; yy++) aar.push(String(yy));
          params.push('valueCodes[Tid]=' + aar.join(','));
        } else if (y.from) {
          params.push('valueCodes[Tid]=from(' + y.from + ')');   // probet ok 2026-07-25
        } else {
          return { error: 'years(:' + y.to + ') for pxweb: angi startår også — from()-uttrykket har ingen bakover-variant' };
        }
      }
      Object.keys(c.filters || {}).forEach(function (k) { params.push('valueCodes[' + k + ']=' + c.filters[k]); });
      return out;
    }
    if (kind === 'sdmx') {
      if (c.regions) return { error: 'regions() støttes ikke for sdmx-kilder — bruk countries() (REF_AREA) eller filters(<DIM>=…)' };
      if (y && y.from) params.push('startPeriod=' + y.from);
      if (y && y.to) params.push('endPeriod=' + y.to);
      if (c.countries || c.indicators || c.filters) {
        // Nøkkelen krever dimensjonsordenen — CSV-header-introspeksjon i
        // lastelaget (query-params ville blitt STILLE ignorert, spec §0).
        out.needsSdmxKey = { countries: c.countries || null, indicators: c.indicators || null, filters: c.filters || null };
      }
      return out;
    }
    if (kind === 'dbnomics') {
      if (c.countries || c.indicators || c.regions || c.filters) {
        return { error: 'countries()/indicators()/filters() støttes ikke for dbnomics — dimensjonene ligger i serie-masken i stien (f.eks. IMF/WEO:latest/NOR+SWE.NGDP_RPCH)' };
      }
      if (y) out.clientYears = { from: y.from, to: y.to };   // filtreres klient-side etter flatening
      return out;
    }
    return out;
  }

  // secret_key="<literal>" -> secret_key="***" før scriptet logges eller
  // sendes til AI. secret_key="ask" er ingen hemmelighet og beholdes.
  // secret_key= er ENTYDIG: ingen konstruksjon i python, R, SQL eller JS bruker
  // det ordet. Derfor trengs ingen kandidatheuristikk og ingen parse-status —
  // masker verdien uansett form, og la "ask" stå (den er ingen hemmelighet).
  // create(key=...) heter fortsatt `key` og er et KOLONNENAVN; den røres aldri,
  // fordi vi utelukkende ser etter `secret_key`.
  var SECRET_RE = /\b(secret_key[ \t]*=[ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,)\n]*)/gi;

  function count(s) { return (String(s).match(/\bsecret_key[ \t]*=/gi) || []).length; }

  function scrubKeys(script) {
    var lines = String(script == null ? '' : script).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var before = count(line);
      if (!before) continue;
      var out = line.replace(SECRET_RE, function (m, head, val) {
        var inner = /^["']/.test(val) ? val.replace(/^["']|["']$/g, '') : val;
        return inner === 'ask' ? m : head + '"***"';
      });
      // Ble en secret_key=-klausul SLUKT av en uavsluttet literal foran den?
      // Da gjemmer den hemmeligheten seg utenfor treffet — masker ut linja.
      if (count(out) < before) {
        var m2 = /\bsecret_key[ \t]*=/i.exec(out);
        out = out.slice(0, m2.index) + 'secret_key="***"';
      }
      lines[i] = out;
    }
    return lines.join('\n');
  }

  var CANON_KEYS = { years: 1, countries: 1, regions: 1, indicators: 1, filters: 1, all: 1 };
  // Kwarg-navn -> internt opts-felt. Hemmeligheten heter secret_key utad,
  // men beholder feltnavnet «key» innvendig, slik at resolve() forblir urørt.
  // `key` som kwarg er BORTE — det ordet betyr nå kun kolonnenavn i ost.create.
  var PLAIN_KEYS = { secret_key: 'key', exec: 'exec', kind: 'kind', cache: 'cache' };
  var LOWER_KEYS = { exec: 1, kind: 1, cache: 1 };

  // Ekte Levenshtein: posisjonssammenligning straffer innskudd for hardt og
  // ville foreslått «key» for «yers» (kortere navn vinner på lengdeleddet).
  function editDistance(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  // LENGDENORMALISERT og case-ufølsom: rå avstand favoriserer systematisk
  // korte navn, så «yr» og «ctry» fikk forslaget «key» i stedet for
  // «years»/«countries».
  function suggest(name) {
    var all = Object.keys(PLAIN_KEYS).concat(Object.keys(CANON_KEYS));
    var low = String(name).toLowerCase(), best = null, bestD = 99;
    for (var i = 0; i < all.length; i++) {
      var d = editDistance(all[i], low) / Math.max(all[i].length, low.length);
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    return bestD <= 0.7 ? best : null;
  }

  function asList(v) {
    if (v == null) return [];
    if (Object.prototype.toString.call(v) === '[object Array]') return v.map(String);
    return String(v).split(/[\s,]+/).filter(Boolean);
  }

  // kwargs -> dagens options-form (uendret for resolve()).
  function optionsFromKwargs(kwargs, errors, lineNo) {
    var opts = {}, canonical = null;
    function canon() { return (canonical = canonical || (opts.canonical = {})); }
    Object.keys(kwargs || {}).forEach(function (name) {
      var v = kwargs[name];
      if (PLAIN_KEYS[name]) {
        opts[PLAIN_KEYS[name]] = LOWER_KEYS[name] ? String(v).toLowerCase() : String(v);
        return;
      }
      if (name === 'years') {
        // Spec §5.4: tall er en feil, ikke noe å coerce. years=2020 i stedet
        // for years="2020:2024" ville stille gitt ett år i stedet for fem.
        if (typeof v !== 'string') {
          errors.push('linje ' + lineNo + ': «years» må være streng, fikk ' +
                      (typeof v === 'number' ? 'tall' : typeof v) +
                      ' — skriv years="2020:2024"');
          return;
        }
        var parts = String(v).split(':');
        canon().years = { from: (parts[0] || '').trim() || null,
                          to: parts.length > 1 ? ((parts[1] || '').trim() || null)
                                               : ((parts[0] || '').trim() || null) };
        return;
      }
      if (name === 'countries' || name === 'regions' || name === 'indicators') {
        canon()[name] = asList(v); return;
      }
      if (name === 'filters') {
        if (typeof v !== 'object' || v === null || Object.prototype.toString.call(v) === '[object Array]') {
          errors.push('linje ' + lineNo + ': «filters» må være en dict — filters={"k": "v"}');
          return;
        }
        canon().filters = v; return;
      }
      if (name === 'all') { if (v) canon().all = true; return; }
      var s = suggest(name);
      errors.push('linje ' + lineNo + ': ukjent argument «' + name + '»' +
                  (s ? ' — mente du «' + s + '»?' : ''));
    });
    return opts;
  }

  // Direktivstyrte strenger blir dynamiske nøkler. Uten vern lar
  // «#meta.__proto__.title = "x"» seg skrive rett inn i Object.prototype,
  // globalt for resten av økten (verifisert). Og prototypemedlemmer som
  // «constructor» ville blitt feilklassifisert som kjente nøkler.
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function unsafeName(n) { return n === '__proto__' || n === 'constructor' || n === 'prototype'; }

  // Spec §3.3: «=» betyr OVERSKRIV. Uten dette akkumulerer gjentatte
  // tilordninger som i gammel syntaks — to «publisher»-rader i sidepanelet.
  function dropPrevious(metas, target, variable, kind, field) {
    for (var i = metas.length - 1; i >= 0; i--) {
      var m = metas[i];
      if (m.target === target && m.variable === variable && m.kind === kind &&
          (kind !== 'field' || m.field === field)) metas.splice(i, 1);
    }
  }

  var DS_KEYS = { title: 1, note: 1, link: 1, labels: 1 };
  var VAR_KEYS = { label: 1, note: 1, link: 1 };

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  // Lenker, entydig på type — ingen gjetting:
  //   streng  -> én lenke uten etikett
  //   liste   -> flere lenker uten etikett
  //   dict    -> URL: etikett
  // Tuppelformen ("url", "etikett") er BEVISST droppet: parseren
  // representerer (…) og […] likt, så ("a","b") og ["a","b"] var umulige å
  // skille — «to lenker» ble stille til «én lenke med etikett».
  function toLinks(v) {
    if (typeof v === 'string') return v ? [{ url: v }] : [];
    if (isArr(v)) {
      var out = [];
      for (var i = 0; i < v.length; i++) {
        if (typeof v[i] === 'string' && v[i]) out.push({ url: v[i] });
      }
      return out;
    }
    if (v && typeof v === 'object') {
      return Object.keys(v).map(function (u) {
        var label = String(v[u] == null ? '' : v[u]);
        return label ? { url: u, label: label } : { url: u };
      });
    }
    return [];
  }

  function collectMeta(item, metas, errors) {
    var p = item.path, raw = item.raw, ln = item.lineNo;
    if (p.length < 2) {
      errors.push('linje ' + ln + ': meta krever datasett og nøkkel — «# meta.<datasett>.note = …»');
      return;
    }
    var ds = p[0], k1 = p[1], v = item.value;
    for (var pi = 0; pi < p.length; pi++) {
      if (unsafeName(p[pi])) {
        errors.push('linje ' + ln + ': «' + p[pi] + '» kan ikke brukes som navn i meta');
        return;
      }
    }

    function pushLinks(variable, val) {
      var ls = toLinks(val);
      if (!ls.length) { errors.push('linje ' + ln + ': «link» må være en URL, en liste av URL-er, eller en dict {url: etikett}'); return; }
      dropPrevious(metas, ds, variable, 'link');
      ls.forEach(function (l) {
        metas.push({ target: ds, variable: variable, kind: 'link',
                     url: l.url, label: l.label, text: undefined, line: raw });
      });
    }

    // Datasettnivå (to ledd)
    if (p.length === 2) {
      if (k1 === 'link') { pushLinks(null, v); return; }
      if (k1 === 'title') { dropPrevious(metas, ds, null, 'title'); metas.push({ target: ds, variable: null, kind: 'title', text: String(v), line: raw }); return; }
      if (k1 === 'note') { dropPrevious(metas, ds, null, 'text'); metas.push({ target: ds, variable: null, kind: 'text', text: String(v), line: raw }); return; }
      if (k1 === 'labels') {
        if (typeof v !== 'object' || v === null || isArr(v)) {
          errors.push('linje ' + ln + ': «labels» må være en dict — labels={"kolonne": "Etikett"}');
          return;
        }
        Object.keys(v).forEach(function (name) {
          if (unsafeName(name)) { errors.push('linje ' + ln + ': «' + name + '» kan ikke brukes som variabelnavn'); return; }
          dropPrevious(metas, ds, name, 'label');
          metas.push({ target: ds, variable: name, kind: 'label', text: String(v[name]), line: raw });
        });
        return;
      }
      dropPrevious(metas, ds, null, 'field', k1);
      metas.push({ target: ds, variable: null, kind: 'field', field: k1, text: String(v), line: raw });
      return;
    }

    // Tre ledd: variabelnivå — men en kjent datasettnøkkel her er en feil
    if (has(DS_KEYS, k1)) {
      errors.push('linje ' + ln + ': «' + k1 + '» tar en verdi, ikke en sti');
      return;
    }
    if (p.length > 3) { errors.push('linje ' + ln + ': for dyp meta-sti — «# meta.<datasett>.<variabel>.<nøkkel>»'); return; }
    var k2 = p[2];
    if (!has(VAR_KEYS, k2)) {
      errors.push('linje ' + ln + ': ukjent variabelnøkkel «' + k2 + '» — gyldige: label, note, link');
      return;
    }
    if (k2 === 'link') { pushLinks(k1, v); return; }
    dropPrevious(metas, ds, k1, k2 === 'label' ? 'label' : 'text');
    metas.push({ target: ds, variable: k1, kind: k2 === 'label' ? 'label' : 'text',
                 text: String(v), line: raw });
  }

  function parse(script) {
    var connects = [], loads = [], metas = [], errors = [];
    var res = global.DirectiveParser.parseScript(script);
    errors = res.errors.slice();
    res.items.forEach(function (it) {
      if (it.form === 'ns') { collectMeta(it, metas, errors); return; }
      if (it.form !== 'call') return;
      var opts = optionsFromKwargs(it.kwargs, errors, it.lineNo);

      // Stille dropp er forbudt: «ssb.read("05839", "Personer")» (glemt
      // indicators=) ville ellers gitt et ufiltrert read uten noe signal.
      // MEN vakten må skopes til verbene denne funksjonen eier: add() tar
      // legitimt TO posisjonsargumenter (add(<kilde>, ["<kolonne>"])), og en
      // blank sjekk her ville gitt falsk feil på gyldig Task 6-syntaks.
      function tooManyArgs() {
        if (it.args.length <= 1) return false;
        errors.push('linje ' + it.lineNo + ': ' + it.verb + ' tar ett posisjonsargument — ' +
                    'resten må være navngitte (f.eks. indicators=["Personer"])');
        return true;
      }

      if (it.recv === 'ost' && it.verb === 'connect') {
        if (tooManyArgs()) return;
        if (!it.target) { errors.push('linje ' + it.lineNo + ': ost.connect krever en tilordning — «# <alias> = ost.connect(…)»'); return; }
        if (typeof it.args[0] !== 'string') { errors.push('linje ' + it.lineNo + ': ost.connect krever et mål som streng'); return; }
        connects.push({ target: it.args[0], alias: it.target, options: opts });
        return;
      }
      if (it.verb === 'read') {
        if (tooManyArgs()) return;
        if (!it.target) { errors.push('linje ' + it.lineNo + ': read krever en tilordning — «# <navn> = …read(…)»'); return; }
        var tgt;
        if (it.recv === 'ost') {
          if (typeof it.args[0] !== 'string') { errors.push('linje ' + it.lineNo + ': ost.read krever en URL som streng'); return; }
          tgt = it.args[0];
        } else {
          tgt = it.args.length ? (it.recv + '/' + String(it.args[0])) : it.recv;
        }
        loads.push({ verb: 'read', target: tgt, alias: it.target, options: opts, line: it.raw });
        return;
      }
      // create/add/join/use håndteres av parseAssembly/parseUse (T6/T7).
    });
    return { connects: connects, loads: loads, metas: metas, errors: errors };
  }

  function findRegistrySource(registry, id) {
    if (!registry) return null;
    for (var i = 0; i < registry.length; i++) if (registry[i].id === id) return registry[i];
    return null;
  }

  // API-kinds (spec 2026-07-25-api-kinds-design §1): registeret kan bære kind
  // (`# connect worldbank` uten kind()), og kildenavn (oecd/ecb/norgesbank/
  // imf) normaliseres til protokoll-kind (sdmx) via ApiKinds når modulen er
  // lastet — brukeren kjenner kilden, ikke formatet.
  function normalizeKind(kind, src) {
    var k = kind || (src && src.kind) || undefined;
    var AKD = global.ApiKinds;
    return (k && AKD && AKD.kindAlias(k)) ? AKD.kindAlias(k) : k;
  }

  function resolve(parsed, registry) {
    var byAlias = {};
    parsed.connects.forEach(function (c) { byAlias[c.alias] = c; });
    return parsed.loads.map(function (l) {
      var lopts = l.options || {};
      if (isUrlish(l.target)) {
        return { alias: l.alias, url: l.target,
                 viaProxy: l.target.indexOf('/api/hent?') === 0,
                 key: lopts.key, exec: lopts.exec, kind: normalizeKind(lopts.kind, null), cache: lopts.cache };
      }
      var slash = l.target.indexOf('/');
      var head = slash > 0 ? l.target.slice(0, slash) : l.target;
      var rest = slash > 0 ? l.target.slice(slash + 1) : '';
      var conn = byAlias[head];
      if (!conn) return { alias: l.alias, url: '', viaProxy: false, error: 'ukjent kilde-alias «' + head + '» (mangler connect-linje?)' };
      var copts = conn.options || {};
      var key = lopts.key || copts.key, exec = lopts.exec || copts.exec, kind = lopts.kind || copts.kind;
      var cache = lopts.cache || copts.cache;
      var base, viaProxy = false, src = null;
      if (isUrlish(conn.target)) {
        base = conn.target;
      } else {
        src = findRegistrySource(registry, conn.target);
        if (!src) {
          // Ikke i web-registeret: en registrert Anvil-kilde (spec §1, regel 3).
          return { alias: l.alias, anvil: conn.target, key: key, exec: exec, kind: normalizeKind(kind, null) };
        }
        base = src.base_url;
        viaProxy = !!src.auth || src.cors === false;
      }
      kind = normalizeKind(kind, src);
      // pxweb (spec 2026-07-24-pxweb-sources-design §2) og api-kinds (spec
      // 2026-07-25-api-kinds-design §2): «stien» er tabell-id/ressurssti
      // (evt. med kildens query bak ?); lastelaget bygger data-URL-ene selv.
      if (kind === 'pxweb' || kind === 'eurostat' || kind === 'sdmx' || kind === 'dbnomics' || kind === 'worldbank') {
        // Kanonisk vokabular (spec §3): oversett FØR sti-kravet — worldbank
        // kan syntetisere stien fra indicators()/countries().
        var qi0 = rest.indexOf('?');
        var restPath = qi0 >= 0 ? rest.slice(0, qi0) : rest;
        var restQuery = qi0 >= 0 ? rest.slice(qi0 + 1) : '';
        var tr = null;
        if (lopts.canonical) {
          tr = translateCanonical(kind, restPath, lopts.canonical);
          if (tr.error) return { alias: l.alias, url: base, viaProxy: viaProxy, kind: kind,
                                 error: '«' + l.alias + '»: ' + tr.error };
          restPath = tr.rest;
          if (tr.params.length) restQuery = restQuery ? restQuery + '&' + tr.params.join('&') : tr.params.join('&');
        }
        if (!restPath) return { alias: l.alias, url: base, viaProxy: viaProxy, kind: kind,
          error: '«' + l.alias + '»: ' + kind + '-kilder krever en ressurssti — «read ' + head + '/<sti> as ' + l.alias + '» (f.eks. ' +
            (kind === 'worldbank' ? 'country/NOR/indicator/NY.GDP.MKTP.CD' :
             kind === 'dbnomics' ? 'IMF/WEO:latest/NOR.NGDP_RPCH' :
             kind === 'sdmx' ? 'EXR/D.USD.EUR.SP00.A' : '<tabellid>') + ')' };
        if (base.charAt(base.length - 1) !== '/') base += '/';
        var item = { alias: l.alias, url: base + restPath + (restQuery ? '?' + restQuery : ''),
                     viaProxy: viaProxy, key: key, exec: exec, kind: kind,
                     cache: cache, table: restPath };
        if (tr && tr.needsSdmxKey) item.needsSdmxKey = tr.needsSdmxKey;
        if (tr && tr.clientYears) item.clientYears = tr.clientYears;
        if (tr && tr.all) item.all = true;
        return item;
      }
      // duckdb/sqlite: én fil, flere tabeller — "stien" er tabellnavnet, ikke
      // en URL-sti (spec 2026-07-06-remote-columnar-sources-design §1).
      if (kind === 'duckdb' || kind === 'sqlite') {
        if (!rest) return { alias: l.alias, url: base, viaProxy: viaProxy, kind: kind,
          error: '«' + l.alias + '»: duckdb/sqlite-kilder krever en tabell — «load ' + head + '/<tabell> as ' + l.alias + '»' };
        return { alias: l.alias, url: base, viaProxy: viaProxy, key: key, exec: exec, kind: kind, cache: cache, table: rest };
      }
      if (rest) {
        if (base.charAt(base.length - 1) !== '/') base += '/';
        base += rest;
      }
      return { alias: l.alias, url: base, viaProxy: viaProxy, key: key, exec: exec, kind: kind, cache: cache };
    });
  }

  // Montering: create/add/join + read-med-alias → mode-nøytral spec.
  function parseAssembly(script) {
    var errors = [], datasets = [], byName = {}, sources = {}, sourceTables = {};
    var res = global.DirectiveParser.parseScript(script);
    res.errors.forEach(function (e) { errors.push(e); });

    function srcKey(alias, table) { return table ? (alias + '__' + table) : alias; }
    function noteSource(alias, table) {
      var k = srcKey(alias, table);
      sources[k] = true;
      if (table) sourceTables[k] = { source: alias, table: table };
      return k;
    }
    function names(v) {
      if (typeof v === 'string') return [v];
      if (Object.prototype.toString.call(v) === '[object Array]') {
        return v.filter(function (x) { return typeof x === 'string'; });
      }
      return [];
    }

    // Pass 1: create + read-med-alias definerer navn.
    res.items.forEach(function (it) {
      if (it.form !== 'call') return;
      if (it.recv === 'ost' && it.verb === 'create') {
        if (!it.target) { errors.push('linje ' + it.lineNo + ': ost.create krever en tilordning'); return; }
        if (byName[it.target]) { errors.push('datasettet «' + it.target + '» er allerede opprettet'); return; }
        var key = names(it.kwargs.key);
        if (!key.length) { errors.push('linje ' + it.lineNo + ': ost.create krever key="<kolonne>" eller key=[…]'); return; }
        var d = { name: it.target, key: key,
                  format: it.kwargs.format ? String(it.kwargs.format).toLowerCase() : null, steps: [] };
        datasets.push(d); byName[it.target] = d;
        return;
      }
      // `x = <alias>.read("tabell")` er også en monteringskilde (gammel LOADAS).
      // URL-lesing (`ost.read`) er IKKE en monteringskilde — som før.
      if (it.verb === 'read' && it.recv !== 'ost' && it.target) {
        if (byName[it.target]) { errors.push('datasettet «' + it.target + '» er allerede opprettet'); return; }
        var table = it.args.length ? String(it.args[0]) : null;
        // Bare enkle tabellnavn deltar i montering (som LOADAS_RE før).
        if (table !== null && !/^[A-Za-z_]\w*$/.test(table)) return;
        var k = noteSource(it.recv, table);
        var dl = { name: it.target, load: k };
        datasets.push(dl); byName[it.target] = dl;
      }
    });

    // Pass 2: add/join på definerte navn.
    res.items.forEach(function (it) {
      if (it.form !== 'call' || it.target) return;
      if (it.verb !== 'add' && it.verb !== 'join') return;
      var d = byName[it.recv];
      if (!d || d.load) { errors.push('ukjent datasett «' + it.recv + '» (mangler ost.create?)'); return; }
      var how = it.kwargs.how ? String(it.kwargs.how).toLowerCase() : 'left';

      if (it.verb === 'add') {
        var ref = it.args[0];
        if (!ref || !ref.__ref) { errors.push('linje ' + it.lineNo + ': add krever en kilde som første argument — add(<kilde>, ["<kolonne>"])'); return; }
        var cols = [];
        for (var i = 1; i < it.args.length; i++) cols = cols.concat(names(it.args[i]));
        if (!cols.length) { errors.push('linje ' + it.lineNo + ': add krever minst én kolonne'); return; }
        var tbl = it.kwargs.table ? String(it.kwargs.table) : null;
        d.steps.push({ op: 'import', source: noteSource(ref.__ref, tbl), columns: cols, how: how });
        return;
      }
      var from = it.args[0];
      if (!from || !from.__ref) { errors.push('linje ' + it.lineNo + ': join krever et datasettnavn — join(<navn>, on="<kolonne>")'); return; }
      if (!byName[from.__ref]) { errors.push('ukjent datasett «' + from.__ref + '» i join'); return; }
      var on = names(it.kwargs.on);
      if (!on.length) { errors.push('linje ' + it.lineNo + ': join krever on="<kolonne>" eller on=[…]'); return; }
      d.steps.push({ op: 'join', from: from.__ref, on: on, how: how });
    });

    return { spec: { sources: Object.keys(sources), datasets: datasets, sourceTables: sourceTables }, errors: errors };
  }

  // "# use <navn> from r|python" — kryssruntime-kopi av et datasett (parquet-
  // bro, kopisemantikk: endringer smitter ikke). Ren parsing; overføringen
  // gjøres av index.html i materialiseringsfasen for hver modus.
  // `from <kilde>` er valgfri (kortform, 2026-07-11): uten from er kilden
  // null her — parseSegmentUses() utleder den fra segmentrekkefølgen, og
  // run-start-brukere som krever eksplisitt kilde feiler med tydelig melding.
  var USE_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*use[ \t]+(\S+)(?:[ \t]+from[ \t]+(\S+))?[ \t]*$/gim;
  function parseUse(script) {
    var uses = [], errors = [], m;
    USE_RE.lastIndex = 0;
    while ((m = USE_RE.exec(script || '')) !== null) {
      var name = m[1], from = m[2] ? m[2].toLowerCase() : null;
      if (!/^[A-Za-z_]\w*$/.test(name)) { errors.push('ugyldig datasettnavn i use: «' + name + '»'); continue; }
      if (from !== null && from !== 'r' && from !== 'python' && from !== 'duckdb') { errors.push('use «' + name + '»: kilde må være r, python eller duckdb, fikk «' + m[2] + '»'); continue; }
      uses.push({ name: name, from: from });
    }
    return { uses: uses, errors: errors };
  }

  // Runtime-familie per segment-kind: microdata/pyodide deler Python-heapen
  // (use er aldri nødvendig dem imellom), duckdb og r er egne motorer.
  function runtimeFamily(kind) {
    if (kind === 'r') return 'r';
    if (kind === 'duckdb') return 'duckdb';
    return 'python';   // microdata, pyodide, ukjent → trygt valg
  }

  // Segmentnivå-use (plan 2026-07-11-segment-use-cross-runtime): trekk
  // use-linjene ut av hvert segment, utled manglende kilde som familien til
  // NÆRMESTE FOREGÅENDE segment med annen runtime enn blokken selv, og
  // returner segmentene med use-linjene strippet (de er metadata; «# use»
  // er ikke gyldig SQL, og i R/py ville de bare vært støy).
  // -> { segments: [{kind, text, uses: [{name, from}]}], errors: [...] }
  function parseSegmentUses(segments) {
    var out = [], errors = [];
    // Egen regex-instans: USE_RE deles med parseUse, og replace/exec på samme
    // globale regex-objekt tråkker i hverandres lastIndex.
    var SEG_USE_RE = new RegExp(USE_RE.source, 'gim');
    (segments || []).forEach(function (seg, i) {
      var fam = runtimeFamily(seg.kind);
      var uses = [];
      var text = String(seg.text || '').replace(SEG_USE_RE, function (line, name, fromRaw) {
        var u = { name: name, from: fromRaw ? fromRaw.toLowerCase() : null };
        if (!/^[A-Za-z_]\w*$/.test(u.name)) { errors.push('ugyldig datasettnavn i use: «' + u.name + '»'); return ''; }
        if (u.from !== null && u.from !== 'r' && u.from !== 'python' && u.from !== 'duckdb') {
          errors.push('use «' + u.name + '»: kilde må være r, python eller duckdb, fikk «' + fromRaw + '»');
          return '';
        }
        if (u.from === null) {
          for (var j = i - 1; j >= 0; j--) {
            var pf = runtimeFamily((segments[j] || {}).kind);
            if (pf !== fam) { u.from = pf; break; }
          }
          if (u.from === null) {
            errors.push('use «' + u.name + '»: fant ingen tidligere blokk med annet språk å hente fra — angi kilden: # use ' + u.name + ' from python|r|duckdb');
            return '';
          }
        }
        if (u.from === fam) {
          errors.push('use «' + u.name + '» from ' + u.from + ': blokken kjører allerede i ' + u.from + ' — datasett derfra refereres direkte');
          return '';
        }
        uses.push(u);
        return '';
      });
      out.push({ kind: seg.kind, text: text, uses: uses });
    });
    return { segments: out, errors: errors };
  }


  // metaByTarget(script) -> {alias: {title?, text:[], links:[], fields:[], variables:{…}}}
  // Samme innhold som sidebaren viser (MetaInfo), formet for DataFrame.attrs['meta'].
  function metaByTarget(script) {
    var out = Object.create(null);
    var metas = parse(script).metas || [];
    function bucket(o, key) {
      if (!Object.prototype.hasOwnProperty.call(o, key)) o[key] = { text: [], links: [] };
      return o[key];
    }
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      if (!Object.prototype.hasOwnProperty.call(out, m.target)) {
        out[m.target] = { text: [], links: [], fields: [], variables: Object.create(null) };
      }
      var root = out[m.target];
      var dst = m.variable ? bucket(root.variables, m.variable) : root;
      if (m.kind === 'link') {
        dst.links.push(m.label ? { url: m.url, label: m.label } : { url: m.url });
      } else if (m.kind === 'title') {
        root.title = m.text;
      } else if (m.kind === 'label') {
        bucket(root.variables, m.variable).label = m.text;
      } else if (m.kind === 'field') {
        root.fields.push({ label: m.field, verdi: m.text });
      } else if (m.text) {
        dst.text.push(m.text);
      }
    }
    return out;
  }

  global.DataDirectives = { parse: parse, metaByTarget: metaByTarget, resolve: resolve, scrubKeys: scrubKeys, parseAssembly: parseAssembly, translateCanonical: translateCanonical, parseUse: parseUse, parseSegmentUses: parseSegmentUses, runtimeFamily: runtimeFamily };
})(typeof window !== 'undefined' ? window : globalThis);
