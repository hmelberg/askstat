// connect/load-direktiver for Web-modus (spec 5b/5c i
// docs/superpowers/specs/2026-07-03-web-data-svar-design.md, utvidet av
// docs/superpowers/specs/2026-07-05-encrypted-external-sources-design.md §1).
// Syntaksen er pythonsk siden 2026-07-27 (spec
// docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md).
// Formen parses av js/directive-parser.js; denne fila gir den betydning:
//   # <alias> = ost.connect("<base-url|register-id|anvil-navn>", kind="…")
//   # <navn>  = ost.read("<url>", secret_key="…", exec="…", cache="…")
//   # <navn>  = <alias>.read("<sti|tabell>", years="…", countries=[…], …)
//   kind="csv|parquet|duckdb|sqlite|json" — eksplisitt kildetype, hopper over sniffing
//   duckdb/sqlite: <alias>.read("<tabell>") og <datasett>.add(<alias>, ["<kolonne>"], table="<tabell>")
//   (se docs/superpowers/specs/2026-07-06-remote-columnar-sources-design.md)
//   INGEN aliaser: load/import/create-dataset/require er borte, ikke stille
//   oversatt — gammel syntaks gir migrasjonshint (js/directive-parser.js:124).
// Ren parsing/resolusjon — ingen fetch her. Brukes av index.html
// (materialisering) og testes med deno via eval (data-directives.test.ts).
(function (global) {
  'use strict';

  // Project A (variable-level assembly): ost.create/add/join -> AssemblySpec.
  // See docs/superpowers/plans/2026-07-05-variable-level-assembly.md.
  // format="<navn>" (2026-07-24): lever datasettet direkte i valgt frameformat
  // uten konverteringslinje — data.table/tibble i R, pandas i python (polars
  // når wasm-bygget finnes). Ustøttede kombinasjoner feiler høyt ved binding.
  // Composite keys (spec 2026-07-24-pxweb-sources-design §1): key=["region",
  // "aar"] tar 1+ kolonner, likeså on=[…] på join. d.key og step.on er ALLTID
  // arrays (én streng pakkes).
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
      // Fix round 3 (kodegjennomgang 2026-08-05): IKKE endret her, kun
      // vurdert — WB sine kjente filters-parametre (mrv=, gapfill=,
      // frequency= m.fl.) er alle skalarer i den offisielle API-
      // dokumentasjonen; det finnes ingen kjent WB-parameter der en
      // repeat-per-verdi- eller komma-liste-form gir mening (i motsetning
      // til Eurostats geo=, der API-et har BEGGE former, men bare den ene
      // virker — se eurostat-grenen under). Uten en MÅLT liste-brukstilfelle
      // for WB latt jeg denne linja stå — endres først når et konkret
      // filters={"<param>": [...]}-behov måles mot WB.
      // Sluttreview 2026-08-15 funn 2a: en liste-verdi ble tidligere
      // komma-joinet STILLE her (samme feilmønster eurostat hadde før
      // fiksen over) — WB-parametrene er skalare. Speiler openstat.py sin
      // ValueError (~openstat.py:676) eksakt, FØR dagens komma-join.
      var wbFilterKeys = Object.keys(c.filters || {});
      for (var wbi = 0; wbi < wbFilterKeys.length; wbi++) {
        var wbk = wbFilterKeys[wbi];
        if (isArr(c.filters[wbk])) {
          return { error: "liste-verdi for filters['" + wbk + "'] støttes ikke for worldbank — WB-parametrene er skalare (én verdi per parameter)" };
        }
      }
      Object.keys(c.filters || {}).forEach(function (k) { params.push(k + '=' + c.filters[k]); });
      return out;
    }
    if (kind === 'eurostat') {
      if (c.indicators) return { error: 'Eurostat har ikke et felles indikatorbegrep — bruk filters(na_item=…) e.l. for dette datasettet' };
      (c.countries || []).concat(c.regions || []).forEach(function (g) { params.push('geo=' + g); });
      if (y && y.from) params.push('sinceTimePeriod=' + y.from);
      if (y && y.to) params.push('untilTimePeriod=' + y.to);
      // Fix round 3 (kodegjennomgang 2026-08-05, MÅLT bug): en liste-verdi i
      // filters (f.eks. filters={"geo": ["DK","FI","IS","NO","SE"]}) ble
      // JS-toString'et til ÉN komma-param (geo=DK,FI,IS,NO,SE av
      // k+'='+c.filters[k]) — Eurostat statistics-API-et svarer STILLE TOMT
      // (value:{}) på komma-formen, mens repetert form (geo=DK&geo=FI&…) gir
      // data (36 verdier målt live). Dette var årsaken til «eurostat
      // directive returned empty» i ledighets-verifiseringen (5 land bedt
      // om via filters). Samme mønster som countries()/regions() to linjer
      // over: én param PER verdi for liste-verdier; skalarverdier uendret.
      Object.keys(c.filters || {}).forEach(function (k) {
        var fv = c.filters[k];
        if (isArr(fv)) fv.forEach(function (one) { params.push(k + '=' + one); });
        else params.push(k + '=' + fv);
      });
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
      // Sluttreview 2026-08-15 funn 2b: denne armen ser filters KUN via
      // needsSdmxKey-payloaden under (bygges lenger ned, ikke her) — en
      // liste-verdi ble tidligere sendt videre inn i nøkkelsti-byggingen
      // (stille feil URL i stedet for feil). Guarden ligger FØR needsSdmxKey
      // bygges. Speiler openstat.py sin ValueError (~openstat.py:736) eksakt.
      var sdmxFilterKeys = Object.keys(c.filters || {});
      for (var sdi = 0; sdi < sdmxFilterKeys.length; sdi++) {
        var sdk = sdmxFilterKeys[sdi];
        if (isArr(c.filters[sdk])) {
          return { error: "liste-verdi for filters['" + sdk + "'] støttes ikke ennå for sdmx-kilder — angi én kode, eller bruk flere read()-kall" };
        }
      }
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
      // countries/indicators/regions har INGEN fast dimensjonsnavn hos
      // dbnomics (weo-country, geo, REF_AREA … varierer per datasett), så de
      // kan ikke oversettes verifiserbart — hard feil, men pek på veien som
      // FINNES (filters=), ikke på serie-masken grammatikken ikke tar.
      if (c.countries || c.indicators || c.regions) {
        return { error: 'countries()/indicators()/regions() støttes ikke for dbnomics — dimensjonsnavnene varierer per datasett; bruk filters={"<dimensjon>": "<kode>"} (table_metadata gir dimensjonskodene)' };
      }
      // ?dimensions=<url-enkodet JSON> (verifisert live 2026-08-01 mot
      // /v22/series/<provider>/<dataset>): verdiene MÅ være lister. Uten
      // dette traff et helt datasett 1000-serie-taket og kastet.
      if (c.filters) {
        var dims = {};
        Object.keys(c.filters).forEach(function (k) {
          var v = c.filters[k];
          dims[k] = Object.prototype.toString.call(v) === '[object Array]' ? v : [v];
        });
        params.push('dimensions=' + encodeURIComponent(JSON.stringify(dims)));
      }
      if (y) out.clientYears = { from: y.from, to: y.to };   // filtreres klient-side etter flatening
      return out;
    }
    if (kind === 'datacommons') {
      // Data Commons observation-API (spec fase 3c): entity.dcids er den
      // ENESTE geografi-parameteren API-et forstår — «indikatoren» ER
      // dcid-en i ressurstien (som hos worldbank/dbnomics er en sti-del),
      // så indicators()/regions() har ingen oversettelse (hard feil, som
      // dbnomics' countries()). countries() og filters={"entity": […]} er
      // to veier til SAMME parameter (ISO3-landkode vs. vilkårlig dcid,
      // f.eks. delstat/fylke) — begge bygger entity.dcids-params.
      if (c.indicators || c.regions) return { error: 'indicators()/regions() støttes ikke for datacommons — bruk countries() eller filters={"entity": [...]} med dcid-er' };
      (c.countries || []).forEach(function (code) { params.push('entity.dcids=country/' + String(code).toUpperCase()); });
      if (c.filters) {
        var dcBad = Object.keys(c.filters).filter(function (k) { return k !== 'entity'; });
        if (dcBad.length) return { error: 'filters(' + dcBad[0] + '=…) støttes ikke for datacommons — bare filters={"entity": [...]} (liste av dcid-er)' };
        var dcEnts = isArr(c.filters.entity) ? c.filters.entity : [c.filters.entity];
        dcEnts.forEach(function (e) { params.push('entity.dcids=' + e); });
      }
      // years(): API-et har ingen tidsvindu-parameter — samme klient-side
      // filtrering som dbnomics (hele serien hentes, årene siles etterpå).
      if (y) out.clientYears = { from: y.from, to: y.to };
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

  // KEYS = {...} (egne nøkler v1, innstillinger-runden 2026-08-08 Task 11):
  // js/ai-chat.js sin mdAskExecuteScript prepender en linje som DENNE med
  // RÅ nøkkelverdier foran scriptet FØR det havner i editoren, slik at
  // generert kode kan lese KEYS['navn']. Uten dette maskerer scrubKeys
  // ALDRI den linja — og en senere handling som leser editorinnholdet
  // (AI-panelets «Inkluder skript» → questionTurn()-prompten, feiltelemetri,
  // delelenke/GitHub-lagring i js/github-storage.js, portable-export.js)
  // ville sendt/lagret den rå verdien i klartekst. Ordet KEYS (store
  // bokstaver, tildelt en dict-literal på egen linje) er, som secret_key,
  // bevisst valgt uvanlig nok til ikke å kollidere med ekte kode.
  var KEYS_LINE_RE = /^[ \t]*KEYS[ \t]*=[ \t]*\{.*\}[ \t]*$/;

  function scrubKeys(script) {
    var lines = String(script == null ? '' : script).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (KEYS_LINE_RE.test(line)) { lines[i] = 'KEYS = {"***": "***"}'; continue; }
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

  // vane-myking 2026-08-04 (spec docs/superpowers/specs/2026-08-04-vane-
  // myking-design.md §3): nær-treff for GATING (skal denne kwarg-en fortsatt
  // få suggest-feilen, eller folde inn i filters?) sjekkes KUN mot de
  // kanoniske nøklene, med RÅ (ikke lengdenormalisert) redigeringsavstand
  // ≤ 2. suggest() under (lengdenormalisert, PLAIN_KEYS+CANON_KEYS) brukes
  // fortsatt til selve hint-teksten når vi VET det blir en feil — men den
  // kan IKKE gate folding: kildens egne dimensjonsnavn havner ofte
  // tilfeldig nær et PLAIN_KEYS-ord i redigeringsavstand (målt: «siec» er 2
  // fra «exec», «unit» er innenfor suggest()s 0.7-brøkterskel til
  // «countries») uten at det er en skrivefeil av det ordet.
  // «all» er BEVISST utelatt fra CANON_KEYS-skanningen: den er den eneste
  // kanoniske nøkkelen kort nok (3 tegn) til at ekte, hyppig brukte
  // dimensjonsnavn havner innenfor redigeringsavstand 2 REN TILFELDIG —
  // målt: «age» (SSB/Eurostat/SDMX-alder, en av de aller vanligste
  // dimensjonene) og «adj» (sesongjustering) er begge avstand 2 fra «all»
  // uten å ligne semantisk. Ingen kwarg med en literal STRENG-/tall-/liste-
  // verdi er en plausibel «all=True»-skrivefeil uansett (all tar en boolsk
  // verdi) — og et ikke-literalt all-forsøk (f.eks. «al=True») treffer
  // likevel suggest()s brede sjekk i feilteksten under, siden den
  // fortsatt inkluderer «all». Utelatelsen mister derfor ikke
  // skrivefeil-vernet for «all», bare det tilfeldige treffet på ekte
  // kildeparametre.
  //
  // Fix (kodegjennomgang 2026-08-04, runde 1, Medium): rå redigeringsavstand
  // ≤ 2 fanger IKKE entallsformen av «countries» — «country» -> «countries»
  // er 1 substitusjon (y->i) + 2 innskudd (e,s) = avstand 3, over grensa.
  // Uten dette vernet foldet «country="NOR"» STILLE inn i
  // filters.country — for eurostat blir det et ?country=NOR-parameter som
  // API-et stille IGNORERER (nøyaktig SDMX-fellen-klassen: et felt som ser
  // ut som det virker, men ikke oversettes verifiserbart). «year»/
  // «region»/«indicator» -> «years»/«regions»/«indicators» er alle
  // regelrette entall+s (avstand 1) og var derfor allerede dekket av
  // redigeringsavstand-sjekken over — men +s-regelen skrives ut eksplisitt
  // her likevel, for symmetri og for å ikke stole på at avstand-1 alltid
  // holder om en kanonisk nøkkel endres i fremtiden.
  //
  // Fix (kodegjennomgang 2026-08-04, runde 2/final, Medium): funksjonen
  // sjekket KUN CANON_KEYS — skrivefeil på en PLAIN_KEYS-nøkkel
  // (kinds="pxweb", kimd="pxweb", kache="30m") foldet STILLE inn i
  // filters, og selve kind()/cache()-oppsettet gikk tapt (en ikke-
  // registerkilde med kinds= mister HELE pxweb-oversettelsen — verre enn
  // en vanlig filters-miss, siden hele kildetolkningen faller bort).
  // PLAIN_KEYS sjekkes derfor også, men med en STRENGERE terskel
  // (avstand ≤ 1, ikke ≤ 2): PLAIN_KEYS-ordene (exec/kind/cache) er korte
  // nok (3-4 tegn) til at ≤ 2 ville fanget for mange ekte kildeparametre
  // (målt: «siec» er avstand 2 fra «exec»; det skal FORTSATT folde til
  // filters). Målt trygt ved avstand ≤ 1: «kinds»/«kimd» -> «kind» (1),
  // «kache» -> «cache» (1) blokkeres; «siec»/«unit»/«age»/«adj»/«s_adj»/
  // «indic»/«freq» m.fl. har ingen ≤ 1-treff mot secret_key/exec/kind/
  // cache og folder fortsatt til filters. `secret_key` er selv unntatt fra
  // sjekken (checkKey/parseArgs gjør navnet SVÆRT bevisst valgt av
  // brukeren — det finnes ingen kort kildeparameter som er en plausibel
  // avstand-1-nabo av et 10-tegns sammensatt ord).
  function isKeyTypo(name) {
    var low = String(name).toLowerCase(), canonKeys = Object.keys(CANON_KEYS);
    for (var i = 0; i < canonKeys.length; i++) {
      if (canonKeys[i] === 'all') continue;
      if (editDistance(canonKeys[i], low) <= 2) return true;
      if (low + 's' === canonKeys[i]) return true;
      if (low.replace(/y$/, 'ies') === canonKeys[i]) return true;
    }
    var plainKeys = Object.keys(PLAIN_KEYS);
    for (var j = 0; j < plainKeys.length; j++) {
      if (editDistance(plainKeys[j], low) <= 1) return true;
    }
    return false;
  }

  function isLiteralFilterValue(v) {
    return typeof v === 'string' || typeof v === 'number' ||
           Object.prototype.toString.call(v) === '[object Array]';
  }

  // kwargs -> dagens options-form (uendret for resolve()).
  function optionsFromKwargs(kwargs, errors, lineNo) {
    var opts = {}, canonical = null;
    function canon() { return (canonical = canonical || (opts.canonical = {})); }
    // Løse kwargs (vane-myking) og eksplisitt filters={...} samles hver for
    // seg og flettes ETTER løkka — uavhengig av rekkefølgen de sto i på
    // linja, ellers ville f.eks. «geo="NO", filters={...}» eller
    // «filters={...}, geo="NO"» oppført seg ulikt (sistnevnte ville stille
    // overskrevet/blitt overskrevet av førstnevnte).
    var hasExplicitFilters = false, explicitFilters = null, looseFilters = null;
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
        hasExplicitFilters = true; explicitFilters = v; return;
      }
      if (name === 'all') { if (v) canon().all = true; return; }
      // vane-myking 2026-08-04: kildens egne parametre aksepteres og
      // oversettes — verifiseringen bor i lasterlaget (SDMX-introspeksjon,
      // dbnomics-dimensjonskrav), som før.
      if (!isKeyTypo(name) && isLiteralFilterValue(v)) {
        looseFilters = looseFilters || {};
        looseFilters[name] = v;
        return;
      }
      var s = suggest(name);
      errors.push('linje ' + lineNo + ': ukjent argument «' + name + '»' +
                  (s ? ' — mente du «' + s + '»?' : ''));
    });
    if (hasExplicitFilters || looseFilters) {
      var merged = {}, loose = looseFilters || {};
      Object.keys(loose).forEach(function (k) { merged[k] = loose[k]; });
      if (hasExplicitFilters) {
        Object.keys(explicitFilters).forEach(function (k) {
          if (has(loose, k)) {
            errors.push('linje ' + lineNo + ': «' + k + '» er angitt to steder — som eget argument og i filters={...} — velg én form');
            return;
          }
          merged[k] = explicitFilters[k];
        });
      }
      canon().filters = merged;
    }
    return opts;
  }

  // Direktivstyrte strenger blir dynamiske nøkler. Uten vern lar
  // «#meta.__proto__.title = "x"» seg skrive rett inn i Object.prototype,
  // globalt for resten av økten (verifisert). Og prototypemedlemmer som
  // «constructor» ville blitt feilklassifisert som kjente nøkler.
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function unsafeName(n) { return n === '__proto__' || n === 'constructor' || n === 'prototype'; }

  // Spec §3.3: «=» betyr OVERSKRIV, «+=» betyr FØYD TIL (2026-07-27). Uten
  // dropPrevious akkumulerer gjentatte tilordninger som i gammel syntaks —
  // to «publisher»-rader i sidepanelet. Returnerer antall fjernede: gjentatt
  // «=» på note/link varsler (før migreringen akkumulerte de, så vanen
  // sitter, og tapet er brukerens egen tekst — aldri stille).
  function dropPrevious(metas, target, variable, kind, field) {
    var n = 0;
    for (var i = metas.length - 1; i >= 0; i--) {
      var m = metas[i];
      if (m.target === target && m.variable === variable && m.kind === kind &&
          (kind !== 'field' || m.field === field)) { metas.splice(i, 1); n++; }
    }
    return n;
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

  // Notater, symmetrisk med lenker (streng = ett, liste = flere). Listeformen
  // er ikke pynt: uten den overlever ikke to notater på samme mål migreringen
  // fra gammel syntaks. Der AKKUMULERTE gjentatte «# meta iris …»-linjer; her
  // fjerner dropPrevious den forrige, så «# meta.iris.note» skrevet to ganger
  // ville mistet det første notatet i stillhet.
  // -> [tekst, …], eller null når verdien ikke er tekst (kalleren feiler).
  function toTexts(v) {
    if (typeof v === 'string') return v ? [v] : [];
    if (isArr(v)) {
      var out = [];
      for (var i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'string') return null;
        if (v[i]) out.push(v[i]);
      }
      return out;
    }
    return null;
  }

  function collectMeta(item, metas, errors, warnings) {
    var p = item.path, raw = item.raw, ln = item.lineNo;
    var augment = !!item.augment;
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

    // += gir bare mening for de akkumulerende nøklene. På enkeltverdinøkler
    // (title/label/felt) ville den enten vært et synonym for = eller en
    // strengkonkatenering ingen ba om — begge stille overraskende.
    function rejectAugment(key) {
      if (!augment) return false;
      errors.push('linje ' + ln + ': «+=» støttes bare for note og link — «' + key + '» settes med =');
      return true;
    }

    // Overskriving med = er lov (spec §3.3) men aldri stille: før migreringen
    // AKKUMULERTE gjentatte meta-linjer, så vanen sitter.
    function warnOverwrite(what, variable) {
      var target = variable ? ds + '.' + variable : ds;
      (warnings || []).push('linje ' + ln + ': ' + what + ' for «' + target +
                            '» overskriver en tidligere — bruk «+=» for å beholde begge');
    }

    function pushLinks(variable, val) {
      var ls = toLinks(val);
      if (!ls.length) { errors.push('linje ' + ln + ': «link» må være en URL, en liste av URL-er, eller en dict {url: etikett}'); return; }
      if (!augment && dropPrevious(metas, ds, variable, 'link')) warnOverwrite('link', variable);
      ls.forEach(function (l) {
        metas.push({ target: ds, variable: variable, kind: 'link',
                     url: l.url, label: l.label, text: undefined, line: raw });
      });
    }

    // Ett notat eller flere, på datasett- eller variabelnivå.
    function pushNotes(variable, val) {
      var ts = toTexts(val);
      if (!ts) { errors.push('linje ' + ln + ': «note» må være en tekst eller en liste av tekster'); return; }
      if (!augment && dropPrevious(metas, ds, variable, 'text')) warnOverwrite('note', variable);
      ts.forEach(function (t) {
        // url/label settes eksplisitt til undefined, symmetrisk med pushLinks'
        // «text: undefined». Formen er en dokumentert kontrakt (deno-testen
        // sammenligner hele objektet, og assertEquals skiller manglende nøkkel
        // fra undefined verdi) — ikke fjern dem fordi de «alltid er tomme».
        metas.push({ target: ds, variable: variable, kind: 'text', text: t,
                     url: undefined, label: undefined, line: raw });
      });
    }

    // Enkeltverdier: en liste eller dict her ville blitt «A,B» eller
    // «[object Object]» gjennom String() — stille søppel i sidepanelet.
    function textOrNull(val, key) {
      if (typeof val === 'string') return val;
      errors.push('linje ' + ln + ': «' + key + '» må være en tekst');
      return null;
    }

    // Datasettnivå (to ledd)
    if (p.length === 2) {
      if (k1 === 'link') { pushLinks(null, v); return; }
      if (k1 === 'title') {
        if (rejectAugment('title')) return;
        var ti = textOrNull(v, 'title'); if (ti === null) return;
        dropPrevious(metas, ds, null, 'title');
        metas.push({ target: ds, variable: null, kind: 'title', text: ti, line: raw });
        return;
      }
      if (k1 === 'note') { pushNotes(null, v); return; }
      if (k1 === 'labels') {
        if (rejectAugment('labels')) return;
        if (typeof v !== 'object' || v === null || isArr(v)) {
          errors.push('linje ' + ln + ': «labels» må være en dict — labels={"kolonne": "Etikett"}');
          return;
        }
        Object.keys(v).forEach(function (name) {
          if (unsafeName(name)) { errors.push('linje ' + ln + ': «' + name + '» kan ikke brukes som variabelnavn'); return; }
          var lb = textOrNull(v[name], 'labels.' + name); if (lb === null) return;
          dropPrevious(metas, ds, name, 'label');
          metas.push({ target: ds, variable: name, kind: 'label', text: lb, line: raw });
        });
        return;
      }
      if (rejectAugment(k1)) return;
      var fv = textOrNull(v, k1); if (fv === null) return;
      dropPrevious(metas, ds, null, 'field', k1);
      metas.push({ target: ds, variable: null, kind: 'field', field: k1, text: fv, line: raw });
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
    if (k2 === 'note') { pushNotes(k1, v); return; }
    if (rejectAugment('label')) return;
    var lv = textOrNull(v, 'label'); if (lv === null) return;
    dropPrevious(metas, ds, k1, 'label');
    metas.push({ target: ds, variable: k1, kind: 'label', text: lv, line: raw });
  }

  function parse(script) {
    var connects = [], loads = [], metas = [], errors = [], warnings = [];
    var res = global.DirectiveParser.parseScript(script);
    errors = res.errors.slice();
    res.items.forEach(function (it) {
      if (it.form === 'ns') { collectMeta(it, metas, errors, warnings); return; }
      if (it.form !== 'call') return;
      // optionsFromKwargs kjenner BARE connect/read sine argumenter. Kjørt på
      // alle verb rapporterte den «ukjent argument «key»» for ost.create,
      // «table»/«how» for add og «on» for join — og portable-export.js kaster
      // på parse().errors, så en helt gyldig monteringsscript feilet eksporten
      // med «Direktivfeil: ukjent argument «key» — mente du «secret_key»?».
      // create/add/join eies av parseAssembly, use av parseUse; deres kwargs
      // valideres der.
      var isConnect = (it.recv === 'ost' && it.verb === 'connect');
      if (!isConnect && it.verb !== 'read') return;
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
    return { connects: connects, loads: loads, metas: metas, errors: errors, warnings: warnings };
  }

  // Ett element på nøyaktig parse().loads[i]-form, bygget DIREKTE. Alternativet
  // — å skrive en direktivstreng og parse den tilbake — har dødd stille tre
  // ganger i denne omleggingen: strengen og grammatikken har ingen kobling, så
  // en syntaksendring gjør bare at ingenting matcher. Ingen feil, ingen data.
  // `line` er kun for feilmeldinger og logg; ingenting parser den igjen.
  function makeLoad(o) {
    var target = o.target || (o.table ? (o.source + '/' + o.table) : o.source);
    var line = o.table
      ? ('# ' + o.alias + ' = ' + o.source + '.read("' + o.table + '")')
      : ('# ' + o.alias + ' = ' + o.source + '.read()');
    return { verb: 'read', target: target, alias: o.alias, options: {}, line: line };
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
    // ssb/scb har ALDRI hatt et «kind»-felt i data-sources.json (git-historikk
    // sjekket 2026-07-31) — bare tilgang: "pxweb". Kanonisk `<alias>.read(...)`
    // via registeret (resolve() uten eksplisitt kind()) har derfor ikke
    // fungert i dette repoet før nå: uten kind falt resolve() rett forbi
    // pxweb-grenen (years=/indicators=/regions=-oversettelse OG
    // tables/-sti-fiksen kjørte ALDRI), og URL-en ble base+id — 404. Det som
    // faktisk fungerte var den eldre connect-direkte-til-…/tables-URL-formen
    // (kind="pxweb" oppgitt eksplisitt i connect()), brukt i eldre
    // tester/eksempler. data-sources.json har nå kind: "pxweb" eksplisitt på
    // begge (samme som alle andre kilder), men behold denne avledningen som
    // sikkerhetsnett mot at feltet mangler igjen — KUN for
    // tilgang==="pxweb", ikke andre tilgang-verdier (de skal fortsatt gi
    // undefined og feile synlig et annet sted, ikke late som de er pxweb).
    var k = kind || (src && src.kind) || (src && src.tilgang === 'pxweb' ? 'pxweb' : undefined);
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
      if (!conn) {
        // Auto-connect (2026-08-01): en registerkilde-id direkte som receiver
        // er en implisitt «# <id> = ost.connect("<id>")». Feilklassen var målt:
        // how_to_read-hintene og DELIVERY-eksemplene viser bare read-linja.
        if (findRegistrySource(registry, head)) {
          conn = { target: head, alias: head, options: {} };
        } else {
          return { alias: l.alias, url: '', viaProxy: false, error: 'ukjent kilde-alias «' + head + '» (mangler connect-linje?)' };
        }
      }
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
      if (kind === 'pxweb' || kind === 'eurostat' || kind === 'sdmx' || kind === 'dbnomics' || kind === 'worldbank' || kind === 'datacommons') {
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
          error: '«' + l.alias + '»: ' + kind + '-kilder krever en ressurssti — «# ' + l.alias + ' = ' + head + '.read("<sti>")» (f.eks. ' +
            (kind === 'worldbank' ? 'country/NOR/indicator/NY.GDP.MKTP.CD' :
             kind === 'dbnomics' ? 'IMF/WEO:latest/NOR.NGDP_RPCH' :
             kind === 'sdmx' ? 'EXR/D.USD.EUR.SP00.A' :
             kind === 'datacommons' ? 'Count_Person' : '<tabellid>') + ')' };
        // pxweb v2: tabellressursen bor under tables/<id> — direktivstien er
        // bare tabell-id-en (regresjon fra v2-beta→v2-migreringen 2026-07-25:
        // base_url mistet tables/-segmentet; målt 404 uten, 200 med).
        // Normaliser også et eksplisitt «tables/<id>» fra brukeren. Kun når
        // base IKKE allerede ender på /tables — direkte connect() til en URL
        // som selv er tabell-kolleksjonen (utbredt i eksisterende skript/
        // tester) skal ikke få et doblet tables/tables/-segment.
        var tableForItem = restPath;
        if (kind === 'pxweb') {
          // Registerstyrt språk-default (forbedringsrunden 2026-08-15, målt
          // kilder-runde 2: SCB 400-er på lang=no-defaulten fra
          // pxweb.js buildUrl; 200 på sv/en). Kun når brukeren ikke selv
          // har valgt lang — eksplisitt valg vinner alltid.
          if (src && src.sprak && !/(^|&)lang=/i.test(restQuery)) {
            restQuery = restQuery ? restQuery + '&lang=' + src.sprak : 'lang=' + src.sprak;
          }
          if (restPath.indexOf('tables/') === 0) restPath = restPath.slice(7);
          tableForItem = restPath;
          if (!/\/tables$/.test(base.replace(/\/+$/, ''))) restPath = 'tables/' + restPath;
        }
        if (base.charAt(base.length - 1) !== '/') base += '/';
        var item = { alias: l.alias, url: base + restPath + (restQuery ? '?' + restQuery : ''),
                     viaProxy: viaProxy, key: key, exec: exec, kind: kind,
                     cache: cache, table: tableForItem };
        if (tr && tr.needsSdmxKey) item.needsSdmxKey = tr.needsSdmxKey;
        if (tr && tr.clientYears) item.clientYears = tr.clientYears;
        if (tr && tr.all) item.all = true;
        return item;
      }
      // duckdb/sqlite: én fil, flere tabeller — "stien" er tabellnavnet, ikke
      // en URL-sti (spec 2026-07-06-remote-columnar-sources-design §1).
      if (kind === 'duckdb' || kind === 'sqlite') {
        if (!rest) return { alias: l.alias, url: base, viaProxy: viaProxy, kind: kind,
          error: '«' + l.alias + '»: duckdb/sqlite-kilder krever en tabell — «# ' + l.alias + ' = ' + head + '.read("<tabell>")»' };
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
    var errors = [], datasets = [];
    // Direktivstyrte navn blir objektnøkler. Uten null-prototype arver
    // «__proto__»/«constructor» sannhetsverdier: de kunne aldri opprettes
    // («allerede opprettet» på første linje), og sources['__proto__'] = true
    // er et stille no-op som bryter invarianten «hver step.source finnes i
    // spec.sources» — uten én eneste feilmelding.
    var byName = Object.create(null), sources = Object.create(null), sourceTables = Object.create(null);
    var res = global.DirectiveParser.parseScript(script);
    res.errors.forEach(function (e) { errors.push(e); });

    // parse() validerer BARE connect/read sine argumenter (den skopet seg til
    // dem i Task 8 fordi den ellers ropte «ukjent argument «key»» på en helt
    // gyldig ost.create). Da mistet create/add/join den tilfeldige dekningen de
    // hadde. Uten denne vakten er «add(py, ["a"], hwo="inner")» stille: steget
    // bygges med how="left", brukeren ba om inner, ingen sier fra.
    var ASM_KWARGS = { create: ['key', 'format'], add: ['table', 'how'], join: ['on', 'how'] };
    function checkKwargs(it) {
      var ok = ASM_KWARGS[it.verb], bad = Object.keys(it.kwargs).filter(function (k) {
        return ok.indexOf(k) < 0;
      });
      if (!bad.length) return true;
      errors.push('linje ' + it.lineNo + ': ukjent argument «' + bad[0] + '» for ' + it.verb +
                  ' — gyldige: ' + ok.join(', '));
      return false;
    }

    // how= er et lukket sett. «innner» eller «Inner » ville ellers falt til
    // left uten et ord — feil sammenslåing, riktig-utseende resultat.
    function checkHow(it) {
      if (!Object.prototype.hasOwnProperty.call(it.kwargs, 'how')) return 'left';
      var h = typeof it.kwargs.how === 'string' ? it.kwargs.how.toLowerCase() : null;
      if (h === 'left' || h === 'inner' || h === 'outer') return h;
      errors.push('linje ' + it.lineNo + ': how må være left, inner eller outer, fikk «' +
                  String(it.kwargs.how) + '»');
      return null;
    }

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
        if (!checkKwargs(it)) return;
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
        // Kodesak C (eval-r11/r12, 3 målinger): en read MED kwargs
        // (years/filters/countries/…) er en FILTRERT lesing — aldri en
        // monteringskilde. synthSourceLoads bærer kun alias+tabell, så en
        // kwarg-bærende read ville re-hentes UFILTRERT her og montering-
        // preamblet (ETTER load-preamblet) overskrev den riktig filtrerte
        // rammen. Målt: eurostat une_rt_m (1,07 mill. rader) og
        // prc_hicp_manr (52 MB → størrelsesvakta) — mens ssb var immun
        // fordi siffer-tabellnavn («14706») aldri passerer identifikator-
        // vakten under. Gammel LOADAS var kwarg-løs; den rollen består.
        if (Object.keys(it.kwargs || {}).length) return;
        if (byName[it.target]) { errors.push('datasettet «' + it.target + '» er allerede opprettet'); return; }
        var table = it.args.length ? String(it.args[0]) : null;
        // Bare enkle tabellnavn deltar i montering (som LOADAS_RE før).
        if (table !== null && !/^[A-Za-z_]\w*$/.test(table)) return;
        var k = noteSource(it.recv, table);
        var dl = { name: it.target, load: k };
        datasets.push(dl); byName[it.target] = dl;
      }
    });

    // Pass 2 og 3: alle add FØR alle join, uavhengig av rekkefølgen i
    // scriptet. De gamle regex-passene (IMPORT_RE helt ut, så JOIN_RE) gjorde
    // det implisitt, og to konsumenter er avhengige av det:
    // assembly-duckdb.js:129 kaster «join krever minst én import først», og
    // portable-export.js:597 dropper datasettet STILLE fra eksporten.
    // Et script som setter opp joinen først og pynter med flere add-linjer
    // etterpå — en naturlig skrivemåte — ville ellers regrert fra «virker»
    // til «hard feil eller taus utelatelse».
    ['add', 'join'].forEach(function (pass) {
    res.items.forEach(function (it) {
      if (it.form !== 'call') return;
      if (it.verb !== 'add' && it.verb !== 'join') return;
      if (it.verb !== pass) return;
      // Stille dropp er forbudt: «# x = panel.add(...)» parser fint, men ville
      // ellers blitt kastet uten feilmelding.
      if (it.target) {
        errors.push('linje ' + it.lineNo + ': ' + it.verb + ' returnerer ingenting — skriv «# ' +
                    it.recv + '.' + it.verb + '(…)» uten tilordning');
        return;
      }
      var d = byName[it.recv];
      if (!d || d.load) { errors.push('ukjent datasett «' + it.recv + '» (mangler ost.create?)'); return; }
      if (!checkKwargs(it)) return;
      var how = checkHow(it);
      if (how === null) return;

      if (it.verb === 'add') {
        var ref = it.args[0];
        if (!ref || !ref.__ref) { errors.push('linje ' + it.lineNo + ': add krever en kilde som første argument — add(<kilde>, ["<kolonne>"])'); return; }
        // ÉN kolonneparameter, ikke varargs (spec §4.5(a)). Pakken har
        // signaturen add(source, columns, table=None, how=None), så
        // «add(p, "income", "edu")» ble der lest som table="edu" — «edu»
        // forsvant STILLE fra rammen mens editoren tok den med. Samme linje,
        // to svar; nettopp det kopier-og-lim-pariteten lover at ikke skjer.
        if (it.args.length > 2) {
          errors.push('linje ' + it.lineNo + ': add tar én kolonneparameter — samle dem i en liste: ' +
                      'add(' + ref.__ref + ', ["<kolonne>", "<kolonne>"])');
          return;
        }
        var cols = names(it.args[1]);
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
    });

    return { spec: { sources: Object.keys(sources), datasets: datasets, sourceTables: sourceTables }, errors: errors };
  }

  // "# <navn> = ost.use("<navn>"[, source="r|python|duckdb"])" — kryssruntime-
  // kopi av et datasett (parquet-bro, kopisemantikk: endringer smitter ikke).
  // Ren parsing; overføringen gjøres av index.html i materialiseringsfasen.
  // source= er valgfri: uten den utleder parseSegmentUses() kilden fra
  // segmentrekkefølgen, og run-start-brukere som krever eksplisitt kilde
  // feiler med tydelig melding.
  // Omdøping (mine = ost.use("df")) er IKKE støttet — forbrukerne i
  // index.html leser u.name som navnet i BEGGE kjøretider.

  // Ingen oppslagsobjekter her: {r:1,python:1}["constructor"] er sann, og den
  // klassen kostet allerede fikserunder i Task 5 og 6.
  function isUseSource(s) { return s === 'r' || s === 'python' || s === 'duckdb'; }

  // Linjene DENNE funksjonen eier: gammel «# use …» og ny «# x = ost.use(…)».
  // Parserfeil på dem videresendes; alt annet er parse()/parseAssembly() sitt.
  // Uten første halvdel ville «# use df from python» blitt stille ignorert av
  // den nye grammatikken (ingen use, ingen feil, ingen kopi) — hard omlegging
  // betyr feilmelding. Uten andre halvdel ville en avvist ny-syntaks-linje
  // (f.eks. «__proto__=» som argumentnavn) lent seg på at en ANNEN kaller
  // rekker å rapportere den først.
  var USE_SHAPED_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*(?:use\b|(?:[A-Za-z_]\w*[ \t]*=[ \t]*)?ost[ \t]*\.[ \t]*use\b)/i;

  // parseLiteral gir {__ref:"df"} for bare ord — «[object Object]» i en
  // feilmelding hjelper ingen.
  function showLit(v) {
    if (v && typeof v === 'object' && typeof v.__ref === 'string') return v.__ref;
    return String(v);
  }

  // Ett use-item fra et parsetre-element, eller null (+ feil i errors).
  function useFromItem(it, errors) {
    if (it.form !== 'call' || it.recv !== 'ost' || it.verb !== 'use') return null;
    if (it.args.length > 1) {
      errors.push('use tar ett posisjonsargument — kilden er navngitt: ost.use("' +
                  showLit(it.args[0]) + '", source="python")');
      return null;
    }
    var name = it.args[0];
    if (typeof name !== 'string' || !/^[A-Za-z_]\w*$/.test(name)) {
      errors.push('ugyldig datasettnavn i use: «' + showLit(name) + '» — navnet må være en streng: ost.use("df")');
      return null;
    }
    if (!it.target) { errors.push('use krever en tilordning — «# ' + name + ' = ost.use("' + name + '")»'); return null; }
    if (it.target !== name) {
      errors.push('omdøping i use er ikke støttet ennå — skriv «# ' + name + ' = ost.use("' + name + '")»');
      return null;
    }
    // Ukjent argument må ALDRI falle stille tilbake til inferens: «from=»
    // (den gamle vanen) ville da gitt en gjetning på feil kjøretid.
    var bad = Object.keys(it.kwargs).filter(function (k) { return k !== 'source'; });
    if (bad.length) {
      errors.push('use «' + name + '»: ukjent argument «' + bad[0] + '»' +
                  (bad[0] === 'from' ? ' — mente du «source»?' : ' — gyldige: source'));
      return null;
    }
    var from = null;
    if (Object.prototype.hasOwnProperty.call(it.kwargs, 'source')) {
      // typeof-vakten er ikke pedanteri: String(["python"]) === "python", så
      // uten den ville en liste blitt godtatt som streng.
      from = typeof it.kwargs.source === 'string' ? it.kwargs.source.toLowerCase() : null;
      if (!isUseSource(from)) {
        errors.push('use «' + name + '»: kilde må være r, python eller duckdb, fikk «' + showLit(it.kwargs.source) + '»');
        return null;
      }
    }
    return { name: name, from: from };
  }

  function parseUse(script) {
    var uses = [], errors = [];
    var lines = String(script == null ? '' : script).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var pl = global.DirectiveParser.parseLine(lines[i]);
      if (!pl) continue;
      if (pl.error) {
        if (USE_SHAPED_RE.test(lines[i])) errors.push('linje ' + (i + 1) + ': ' + pl.error);
        continue;
      }
      var u = useFromItem(pl, errors);
      if (u) uses.push(u);
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
  // returner segmentene med use-linjene tømt (de er metadata; «# use»
  // er ikke gyldig SQL, og i R/py ville de bare vært støy).
  // -> { segments: [{kind, text, uses: [{name, from}]}], errors: [...] }
  function parseSegmentUses(segments) {
    var out = [], errors = [];
    (segments || []).forEach(function (seg, i) {
      var fam = runtimeFamily(seg.kind);
      var uses = [];
      // Splitt med FANGET linjeskift. use-linja tømmes (''), den slettes ikke:
      // linjenummer og \r\n må stå urørt, for R/Python peker feilmeldinger
      // tilbake i brukerens editor. Den gamle replace()-veien gjorde det samme.
      var parts = String(seg.text || '').split(/(\r?\n)/);
      for (var p = 0; p < parts.length; p += 2) {
        var line = parts[p];
        var pl = global.DirectiveParser.parseLine(line);
        if (pl && pl.error) {
          // Bare use-formede linjer varsles: en prosakommentar som tilfeldigvis
          // trigger et migrasjonshint skal ikke stoppe kjøringen her.
          if (USE_SHAPED_RE.test(line)) errors.push(pl.error);
          continue;
        }
        if (!pl || pl.form !== 'call' || pl.recv !== 'ost' || pl.verb !== 'use') continue;
        parts[p] = '';
        var u = useFromItem(pl, errors);
        if (!u) continue;                      // feil er registrert; linja er tømt uansett
        if (u.from === null) {
          for (var j = i - 1; j >= 0; j--) {
            var pf = runtimeFamily((segments[j] || {}).kind);
            if (pf !== fam) { u.from = pf; break; }
          }
          if (u.from === null) {
            errors.push('use «' + u.name + '»: fant ingen tidligere blokk med annet språk å hente fra — angi kilden: # ' + u.name + ' = ost.use("' + u.name + '", source="python")');
            continue;
          }
        }
        if (u.from === fam) {
          errors.push('use «' + u.name + '» from ' + u.from + ': blokken kjører allerede i ' + u.from + ' — datasett derfra refereres direkte');
          continue;
        }
        uses.push(u);
      }
      out.push({ kind: seg.kind, text: parts.join(''), uses: uses });
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

  // Reeksportert fra DirectiveParser slik at kallsteder som bare har
  // DataDirectives (index.html, portable-export) slipper å rulle sin egen
  // verbliste — de listene sluttet å matche stille da grammatikken ble
  // pythonsk. Én kilde til sannhet: parsetreet.
  function isDirectiveLine(line) { return global.DirectiveParser.isDirectiveLine(line); }

  global.DataDirectives = { parse: parse, makeLoad: makeLoad, metaByTarget: metaByTarget, resolve: resolve, scrubKeys: scrubKeys, parseAssembly: parseAssembly, translateCanonical: translateCanonical, parseUse: parseUse, parseSegmentUses: parseSegmentUses, runtimeFamily: runtimeFamily, isDirectiveLine: isDirectiveLine };
})(typeof window !== 'undefined' ? window : globalThis);
