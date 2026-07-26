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
      if (word === 'True') return { value: true, pos: i + 4 };
      if (word === 'False') return { value: false, pos: i + 5 };
      if (word === 'None') return { value: null, pos: i + 4 };
      return { value: { __ref: word }, pos: i + word.length };
    }
    fail('uventet tegn «' + c + '»');
  }

  function parseString(s, i, quote) {
    var out = '', j = i + 1;
    while (j < s.length) {
      var ch = s.charAt(j);
      if (ch === '\\' && j + 1 < s.length) { out += s.charAt(j + 1); j += 2; continue; }
      if (ch === quote) return { value: out, pos: j + 1 };
      out += ch; j++;
    }
    fail('uavsluttet streng');
  }

  function parseNumber(s, i) {
    var m = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) fail('ugyldig tall');
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

  function parseDict(s, i) {
    var out = {}, j = skipWs(s, i + 1);
    if (s.charAt(j) === '}') return { value: out, pos: j + 1 };
    while (j < s.length) {
      var k = parseLiteral(s, j);
      if (typeof k.value !== 'string') fail('dict-nøkkel må være streng');
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

  global.DirectiveParser = { parseLiteral: parseLiteral };
})(typeof window !== 'undefined' ? window : globalThis);
