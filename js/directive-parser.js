// js/directive-parser.js — grammatikken for direktivlinjer.
// Ren: kjenner ikke kilder, registre, kinds eller URL-er — kun form.
// Spec: docs/superpowers/specs/2026-07-26-pythonsk-direktivsyntaks-design.md §5.
(function (global) {
  'use strict';

  var IDENT_RE = /^[A-Za-z_]\w*/;

  function skipWs(s, i) {
    while (i < s.length && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) i++;
    return i;
  }

  function fail(msg) { throw new Error(msg); }

  // parseLiteral(s, i) -> {value, pos}
  function parseLiteral(s, i) {
    i = skipWs(s, i);
    if (i >= s.length) fail('mangler verdi');
    var c = s.charAt(i);

    if (c === '"' || c === "'") return parseString(s, i, c);
    if (c === '[') return parseSeq(s, i, ']');
    if (c === '(') return parseSeq(s, i, ')');
    if (c === '{') return parseDict(s, i);
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber(s, i);

    var m = IDENT_RE.exec(s.slice(i));
    if (m) {
      var word = m[0];
      // Kodesak B (målt r10): «f"…"»-prefiks i et direktiv-arg ga den
      // uinstruktive «forventet «,» eller «)»» og kostet en kjøring på
      // gjettede teorier. Direktiver er LITERAL-only (EVAL-regel 7) —
      // si det rett ut når et strengprefiks (f/r/b-kombinasjoner) står
      // rett foran et anførselstegn.
      var etter = s.charAt(i + word.length);
      if ((etter === '"' || etter === "'") && /^[frbuFRBU]{1,3}$/.test(word)) {
        fail('f-streng/strengprefiks («' + word + etter + '…») støttes ikke i direktiver — ' +
             'direktiver er literal-only: skriv URL-en/verdien ferdig, eller bygg den i vanlig kode');
      }
      if (word === 'True') return { value: true, pos: i + 4 };
      if (word === 'False') return { value: false, pos: i + 5 };
      if (word === 'None') return { value: null, pos: i + 4 };
      return { value: { __ref: word }, pos: i + word.length };
    }
    fail('uventet tegn «' + c + '»');
  }

  // Pythons standard-escapes (B10a): «"a\\nb"» ga før «anb» fordi alle
  // backslasher ble strøket. Ukjente escapes beholdes ordrett («C:\\dir»),
  // som i python.
  var ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
  function parseString(s, i, quote) {
    var out = '', j = i + 1;
    while (j < s.length) {
      var ch = s.charAt(j);
      if (ch === '\\' && j + 1 < s.length) {
        var e = s.charAt(j + 1);
        var hex = e === 'u' ? /^[0-9a-fA-F]{4}/.exec(s.slice(j + 2)) : (e === 'x' ? /^[0-9a-fA-F]{2}/.exec(s.slice(j + 2)) : null);
        if (hex) { out += String.fromCharCode(parseInt(hex[0], 16)); j += 2 + hex[0].length; continue; }
        if (Object.prototype.hasOwnProperty.call(ESC, e)) { out += ESC[e]; j += 2; continue; }
        out += ch + e; j += 2; continue;
      }
      if (ch === quote) return { value: out, pos: j + 1 };
      out += ch; j++;
    }
    fail('uavsluttet streng');
  }

  function parseNumber(s, i) {
    var m = /^-?(\d+)(?:\.\d+)?/.exec(s.slice(i));
    if (!m) fail('ugyldig tall');
    // Ledende null (B10a): «0301» er en SSB-regionkode, ikke 301. Python
    // avviser 0301 som tall-literal; her beholdes den som streng. «0» og
    // «0.5» er fortsatt tall.
    if (m[1].length > 1 && m[1].charAt(0) === '0') return { value: m[0], pos: i + m[0].length };
    return { value: parseFloat(m[0]), pos: i + m[0].length };
  }

  function parseSeq(s, i, close) {
    var out = [], j = skipWs(s, i + 1);
    if (s.charAt(j) === close) return { value: out, pos: j + 1 };
    while (j < s.length) {
      var r = parseLiteral(s, j);
      out.push(r.value);
      j = skipWs(s, r.pos);
      if (s.charAt(j) === ',') { j = skipWs(s, j + 1); if (s.charAt(j) === close) return { value: out, pos: j + 1 }; continue; }
      if (s.charAt(j) === close) return { value: out, pos: j + 1 };
      fail('forventet «,» eller «' + close + '»');
    }
    fail('mangler «' + close + '»');
  }

  // «__proto__» er den ENE nøkkelen som er en aksessor på Object.prototype:
  // out['__proto__'] = v setter prototypen i stedet for å lage en egen
  // nøkkel, så verdien forsvinner STILLE og ingen Object.keys-basert vakt
  // nedstrøms ser den. «constructor» og resten er vanlige dataegenskaper som
  // skygges normalt. Vi avviser den i stedet for å gi alle dicter og
  // kwargs-objekter null-prototype: Object.create(null) ville fått String(v)
  // til å kaste hos hver forbruker som formaterer en verdi.
  function checkKey(k, what) {
    if (k === '__proto__') fail('«__proto__» kan ikke brukes som ' + what);
    return k;
  }

  function parseDict(s, i) {
    var out = {}, j = skipWs(s, i + 1);
    if (s.charAt(j) === '}') return { value: out, pos: j + 1 };
    while (j < s.length) {
      var k = parseLiteral(s, j);
      if (typeof k.value !== 'string') fail('dict-nøkkel må være streng');
      checkKey(k.value, 'dict-nøkkel');
      j = skipWs(s, k.pos);
      if (s.charAt(j) !== ':') fail('forventet «:» etter dict-nøkkel');
      var v = parseLiteral(s, j + 1);
      out[k.value] = v.value;
      j = skipWs(s, v.pos);
      if (s.charAt(j) === ',') { j = skipWs(s, j + 1); if (s.charAt(j) === '}') return { value: out, pos: j + 1 }; continue; }
      if (s.charAt(j) === '}') return { value: out, pos: j + 1 };
      fail('forventet «,» eller «}»');
    }
    fail('mangler «}»');
  }

  var MARKER_RE = /^[ \t]*(?:#|--|\/\/)[ \t]*/;
  var NS = { meta: 1 };
  var OST_VERBS = { connect: 1, read: 1, create: 1, use: 1 };
  var METHODS = { read: 1, add: 1, join: 1 };

  // Gammel syntaks -> migrasjonshint. Hvert mønster krever et KJENNETEGN som
  // prosa ikke har: " as " sammen med en sti/URL eller opsjonshale, " into "
  // med en <kilde>/<kolonne>-referanse, " on ", ", key(", " from ".
  //
  // Prinsippet er at falske positiver er verre enn tapte hint: et hint som
  // uteblir koster brukeren en oppslagstur, mens en kommentar som blir en
  // hard feilmelding stopper scriptet. Derfor varsles IKKE de bare
  // enkeltord-formene, som er strukturelt identiske med prosa:
  //   «# meta bef tekst»  ~ «# meta information about this repo»
  //   «# use df»          ~ «# use caution»
  //   «# connect ssb»     ~ «# connect manually»
  //   «# read h as df»    ~ «# read this as int»
  // AKSEPTERT GJENSTÅENDE: «connect <ord> as <ord>» kan ikke strammes uten å
  // miste hintet for den vanligste ekte formen («# connect ssb as s»), så
  // «# connect early as needed» gir feilmelding. `use` slipper unna fordi
  // kilden der er et lukket sett (r|python|duckdb).
  // Migreringsskriptet (Task 8) konverterer alle eksisterende filer, så disse
  // formene finnes ikke i repoet — vakten er kun en håndskrivingshjelp.
  var OLD_PATTERNS = [
    { w: 'connect', re: /^connect[ \t]+\S+[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*(?:,[ \t]*\w+\(.*)?$|^connect[ \t]+\S+[ \t]*,[ \t]*\w+\(.*$/i },
    { w: 'read',    re: /^(?:read|load|require)[ \t]+\S*[\/:]\S*[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*(?:,[ \t]*\w+\(.*)?$|^(?:read|load|require)[ \t]+\S+[ \t]+as[ \t]+[A-Za-z_]\w*[ \t]*,[ \t]*\w+\(.*$/i },
    { w: 'create',  re: /^create(?:[-_]dataset)?[ \t]+[A-Za-z_]\w*[ \t]*,[ \t]*key\(/i },
    { w: 'add',     re: /^(?:add|import)[ \t]+\S*\/\S*.*[ \t]+into[ \t]+[A-Za-z_]\w*(?:[ \t]+(?:left|inner|outer))?[ \t]*$/i },
    { w: 'join',    re: /^join[ \t]+[A-Za-z_]\w*[ \t]+into[ \t]+[A-Za-z_]\w*[ \t]+on[ \t]+\S/i },
    { w: 'use',     re: /^use[ \t]+[A-Za-z_]\w*[ \t]+from[ \t]+(?:r|python|duckdb)[ \t]*$/i }
  ];

  var HINT = {
    connect: 'skriv «# <alias> = ost.connect("<mål>")»',
    read: 'skriv «# <navn> = ost.read("<mål>")» eller «# <navn> = <alias>.read("<tabell>")»',
    create: 'skriv «# <navn> = ost.create(key="<kolonne>")»',
    add: 'skriv «# <datasett>.add(<kilde>, ["<kolonne>"])»',
    join: 'skriv «# <datasett>.join(<navn>, on="<kolonne>")»',
    use: 'skriv «# <navn> = ost.use("<navn>")»'
  };

  // Hale-kommentar etter en meta-verdi (B10a): «# meta.x = "a"  # note» var
  // en feil mens samme hale etter et kall ble ignorert. Bare en ny
  // kommentarmarkør er en hale — annen løs tekst er fortsatt en feil.
  function isTail(s, i) {
    var c = s.charAt(i), d = s.charAt(i + 1);
    return c === '#' || (c === '-' && d === '-') || (c === '/' && d === '/');
  }

  function parseArgs(s, i) {
    var args = [], kwargs = {};
    i = skipWs(s, i);
    if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 };
    while (i < s.length) {
      var kw = /^([A-Za-z_]\w*)[ \t]*=(?!=)/.exec(s.slice(i));
      if (kw) {
        // Samme grunn som i parseDict: «__proto__="python"» ville slukt seg
        // selv, og ost.use ville stille GJETTET kjøretiden i stedet for å
        // varsle om et ukjent argument (funnet i Task 7-reviewen).
        checkKey(kw[1], 'argumentnavn');
        var v = parseLiteral(s, i + kw[0].length);
        kwargs[kw[1]] = v.value;
        i = skipWs(s, v.pos);
      } else {
        var a = parseLiteral(s, i);
        if (Object.keys(kwargs).length) fail('posisjonsargument etter navngitt argument');
        args.push(a.value);
        i = skipWs(s, a.pos);
      }
      if (s.charAt(i) === ',') { i = skipWs(s, i + 1); if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 }; continue; }
      if (s.charAt(i) === ')') return { args: args, kwargs: kwargs, pos: i + 1 };
      fail('forventet «,» eller «)»');
    }
    fail('mangler «)»');
  }

  function oldSyntaxError(body) {
    for (var i = 0; i < OLD_PATTERNS.length; i++) {
      if (OLD_PATTERNS[i].re.test(body)) {
        return { error: '«' + body + '» er gammel syntaks — ' + (HINT[OLD_PATTERNS[i].w] || 'se hjelpen') };
      }
    }
    return null;
  }

  // parseLine(line) -> null | {form…} | {error}
  function parseLine(line) {
    var raw = String(line == null ? '' : line);
    var mk = MARKER_RE.exec(raw);
    if (!mk) return null;
    var body = raw.slice(mk[0].length).replace(/[ \t\r]+$/, '');
    if (!body) return null;

    var call = null;
    // Den NYE grammatikken prøves først. Motsatt rekkefølge lot
    // gammel-syntaks-vakten svelge gyldige linjer som «read = ost.read("x")».
    try {
      // Form 1: <navnerom>.<sti> = <literal>  |  <navnerom>.<sti> += <literal>
      // += (2026-07-27): «=» erstatter, «+=» føyer til — standard Python-
      // semantikk. Semantikken (hvilke nøkler som godtar +=) eies av
      // data-directives.js; her bæres bare flagget.
      var ns = /^([A-Za-z_]\w*)((?:\.[A-Za-z_]\w*)+)[ \t]*(\+?=)[ \t]*/.exec(body);
      if (ns && NS[ns[1]]) {
        var path = ns[2].slice(1).split('.');
        var aug = ns[3] === '+=';
        var rest = body.slice(ns[0].length);
        var first = parseLiteral(rest, 0);
        var after = skipWs(rest, first.pos);
        if (isTail(rest, after)) after = rest.length;
        if (after >= rest.length) return { form: 'ns', ns: ns[1], path: path, value: first.value, augment: aug, raw: raw.trim() };
        if (rest.charAt(after) !== ',') fail('uventet tekst etter verdi');
        var tup = [first.value];
        while (rest.charAt(after) === ',') {
          var probe = skipWs(rest, after + 1);
          if (probe >= rest.length || isTail(rest, probe)) { after = rest.length; break; }   // trailing komma
          var nx = parseLiteral(rest, probe);
          tup.push(nx.value);
          after = skipWs(rest, nx.pos);
          if (isTail(rest, after)) after = rest.length;
        }
        if (after < rest.length) fail('uventet tekst etter verdi');
        return { form: 'ns', ns: ns[1], path: path, value: tup, augment: aug, raw: raw.trim() };
      }

      // Form 2: [<navn> =] <mottaker>.<verb>(<args>)
      call = /^(?:([A-Za-z_]\w*)[ \t]*=[ \t]*)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)[ \t]*\(/.exec(body);
      if (call) {
        var target = call[1] || null, recv = call[2], verb = call[3];
        if ((recv === 'ost') || METHODS[verb]) {
          if (recv === 'ost' && !OST_VERBS[verb]) {
            return { error: 'ukjent verb «ost.' + verb + '» — gyldige: connect, read, create, use' };
          }
          var pr = parseArgs(body, call[0].length);
          // Juli-feilklassen (målt 2026-07-28): modeller legger ofte til en
          // forklarende hale ETTER kallets avsluttende «)» («# e =
          // eurostat.read("x")  # forklaring», «… ) — kilde: X»). pr.pos
          // peker allerede på det BALANSERTE endepunktet — parseArgs har
          // konsumert nøstede strenger/lister/dicter korrekt (en «)» inni en
          // strengverdi/etikett teller ALDRI som kallets lukkeparentes, se
          // parseString/parseSeq over) — så alt fra der og ut er en hale å
          // IGNORERE, ikke en syntaksfeil. En linje uten noen balansert «)»
          // når aldri hit: parseArgs kaster «mangler «)»» over i stedet, og
          // den oppførselen er uendret.
          return { form: 'call', target: target, recv: recv, verb: verb,
                   args: pr.args, kwargs: pr.kwargs, raw: raw.trim() };
        }
      }
    } catch (e) {
      // recv/verb følger med slik at parseScript kan avgjøre om linja i det
      // hele tatt var et direktiv (B2: «# seen.add(f"…")» er en kommentar).
      return call ? { error: e.message, recv: call[2], verb: call[3] } : { error: e.message };
    }

    return oldSyntaxError(body);
  }

  // Kodesak C (eval-r11/r12, 3 målinger): feilklassene som betyr «linja
  // sluttet midt i en ubalansert struktur» — kandidater for python-stil
  // linjefortsettelse. Bevisst UTEN «uavsluttet streng»: strenger er
  // én-linjes (som i python), en sammenføyning ville stille slukt
  // markør+innrykk inn i strengverdien.
  // «forventet «,» eller «X»» er med: den fyrer også når input tar slutt
  // rett etter en komplett verdi (målt: {"Region": "0301"<linjeslutt>) —
  // på en ekte feil-CHAR midt i linja vil sammenføyningen bare feile med
  // samme melding og originalfeilen består (kappet på 8 linjer).
  var UNBALANCED_RE = /^(mangler «[)}\]]»|mangler verdi|forventet «,» eller «[)}\]]»)$/;

  function parseScript(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var items = [], errors = [], errs = [];
    for (var i = 0; i < lines.length; i++) {
      var r = parseLine(lines[i]);
      if (!r) continue;
      var startLine = i + 1;
      // Linjefortsettelse (kodesak C): kildeguidenes oppskrifter er
      // linjebrutt (~72 tegn) og modellene limer dem ordrett — én-linjes-
      // grammatikken ga «mangler «}»», og modellene «reparerte» ved å
      // STRYKE filters (målt: hele tabellen lastet, r11-norden/r12-norden/
      // r12-inflasjon). En ubalansert direktivlinje absorberer derfor
      // påfølgende markørlinjer til kallet balanserer. En linje som selv
      // parser som gyldig direktiv er ALDRI en fortsettelse, og feiler
      // sammenføyningen forblir originalfeilen på originallinja.
      if (r.error && UNBALANCED_RE.test(r.error)) {
        var acc = lines[i];
        for (var j = i + 1; j < lines.length && j - i <= 8; j++) {
          if (!MARKER_RE.test(lines[j])) break;
          var alene = parseLine(lines[j]);
          if (alene && !alene.error) break;
          acc += ' ' + String(lines[j]).replace(MARKER_RE, '');
          var r2 = parseLine(acc);
          if (r2 && !r2.error) { r = r2; i = j; break; }
          if (r2 && r2.error && !UNBALANCED_RE.test(r2.error)) break;
        }
      }
      if (r.error) { errs.push({ msg: 'linje ' + startLine + ': ' + r.error, recv: r.recv, verb: r.verb }); continue; }
      r.lineNo = startLine;
      items.push(r);
    }
    // B2: METHODS-formen (`<x>.add/.join/.read(…)`) er grammatisk identisk
    // med helt vanlige kodekommentarer («# seen.add(code)», «# html =
    // resp.read()»), og parseAssembly/resolve gjorde dem til harde
    // Monteringsfeil som stoppet kjøringen. Mottakeren avgjør derfor:
    //   .add/.join — bare på et datasett opprettet med ost.create i scriptet
    //   .read      — på et connect-alias, en kjent kilde-id (setKnownSources),
    //                eller når kallet bærer et streng-argument/kwargs (slik
    //                at «ssbb.read("05839")» fortsatt gir «ukjent kilde-alias»
    //                i stedet for å forsvinne stille).
    // Alt annet er en vanlig kommentar. ost.* og meta.* berøres ikke.
    var created = Object.create(null), aliases = Object.create(null);
    items.forEach(function (it) {
      if (it.form !== 'call' || it.recv !== 'ost' || !it.target) return;
      if (it.verb === 'create') created[it.target] = true;
      if (it.verb === 'connect') aliases[it.target] = true;
    });
    function nearCreated(name) {
      return Object.keys(created).some(function (c) { return closeTypo(name, c); });
    }
    function isDirectiveCall(recv, verb, it) {
      if (!recv || recv === 'ost') return true;
      // En nær-skrivefeil («pnael» for «panel») er fortsatt et direktiv, så
      // parseAssembly kan si «ukjent datasett» i stedet for å droppe stille.
      // Det samme gjelder når argumentet peker på et connect-alias (add) eller
      // et opprettet datasett (join): «# ghost.add(p, ["x"])» er et direktiv
      // med glemt create, ikke prosa.
      if (verb === 'add' || verb === 'join') {
        if (created[recv] || nearCreated(recv)) return true;
        var a0 = it && it.args[0] && it.args[0].__ref;
        return !!a0 && (verb === 'add' ? !!aliases[a0] : !!created[a0]);
      }
      if (verb === 'read') {
        if (aliases[recv] || (KNOWN && KNOWN[recv])) return true;
        if (!it) return true;   // syntaksfeil i en read: behold feilen
        return typeof it.args[0] === 'string' || Object.keys(it.kwargs).length > 0;
      }
      return true;
    }
    items = items.filter(function (it) {
      return it.form !== 'call' || isDirectiveCall(it.recv, it.verb, it);
    });
    errs.forEach(function (e) { if (isDirectiveCall(e.recv, e.verb, null)) errors.push(e.msg); });
    return { items: items, errors: errors };
  }

  // Levenshtein ≤ 2 (og ikke for korte navn — «df» vs «d» er ingen skrivefeil).
  function closeTypo(a, b) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 2) return false;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length] <= 2;
  }

  // Kjente kilde-id-er (registeret). data-loader.js setter dem når
  // data-sources.json er lastet; null = ukjent (bare connect-alias og
  // streng-arg/kwargs-heuristikken gjelder da).
  var KNOWN = null;
  function setKnownSources(ids) {
    if (!ids) { KNOWN = null; return; }
    KNOWN = Object.create(null);
    ids.forEach(function (id) { if (typeof id === 'string') KNOWN[id] = true; });
  }

  function isDirectiveLine(line) {
    return parseLine(line) !== null;
  }

  global.DirectiveParser = { parseLiteral: parseLiteral, parseLine: parseLine,
                             parseScript: parseScript, isDirectiveLine: isDirectiveLine,
                             setKnownSources: setKnownSources };
})(typeof window !== 'undefined' ? window : globalThis);
