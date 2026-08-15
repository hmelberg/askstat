// js/rangeringsvern.js — miljøvern mot etikett/verdi-stokking i rangeringer
// (E17-fabrikasjonsvernets rangeringssøsken; forbedringsrunden 2026-08-15).
// Målt behov: norden-rangeringen fikk riktige VERDIER koblet til FEIL LAND
// tre ganger (eval-rundene 1/3/4) — verdiene fantes i output, KOBLINGEN var
// gal, så ren tall-i-output-sjekk fanger ikke klassen. Prompt-regelen
// (EVAL-regel 10) reduserte men fjernet ikke feilen (målt vipping) — dette
// er miljøkontrollen: (etikett, verdi)-par i SVARET skal gjenfinnes som par
// på ÉN linje i output (slik regel 10s print-par legger dem).
// Ren modul uten DOM/nett — node-testbar; ask-view eier visningen.
(function (global) {
  'use strict';

  // Første tall i en tekst, normalisert (norsk tusenskille/desimalkomma).
  function forsteTall(s) {
    var m = /-?[\d][\d\s .]*[\d]|\d/.exec(String(s).replace(/,/g, '.'));
    if (!m) return null;
    var t = m[0].replace(/[\s ]/g, '');
    var v = parseFloat(t);
    return isNaN(v) ? null : v;
  }

  // (etikett, verdi)-kandidater fra svarets innerText: tabellrader gir
  // celler adskilt med \t; første celle tekst (≥3 bokstaver), en senere
  // celle numerisk. Flagg/emoji i etiketten strippes.
  function parFraSvar(answerText) {
    var ut = [];
    String(answerText || '').split('\n').forEach(function (linje) {
      var celler = linje.split('\t').map(function (c) { return c.trim(); });
      if (celler.length < 2 || celler.length > 6) return;
      // Etiketten er første TEKST-celle — rang-først-tabeller («1 | Island |
      // 6 %», målt eval-runde 5) har rangtallet i celle 0.
      var ei = -1;
      for (var k = 0; k < celler.length - 1; k++) {
        if (/[a-zA-ZæøåÆØÅ]{3}/.test(celler[k].replace(/[^\wæøåÆØÅéüö \-]/g, ''))) { ei = k; break; }
      }
      if (ei < 0) return;
      var etikett = celler[ei].replace(/[^\wæøåÆØÅéüö \-]/g, '').trim();
      for (var i = ei + 1; i < celler.length; i++) {
        var v = forsteTall(celler[i]);
        if (v !== null && /\d/.test(celler[i])) {
          ut.push({ etikett: etikett, verdi: v });
          return;
        }
      }
    });
    return ut;
  }

  // Finnes paret på ÉN output-linje? Ordet (lengste ord ≥4 tegn i
  // etiketten, case-insensitivt) OG verdien (både .- og ,-desimalform,
  // med/uten tusenskille) må stå i samme linje.
  function parITekst(outputText, etikett, verdi) {
    var ord = (etikett.match(/[a-zA-ZæøåÆØÅéüö\-]{4,}/g) || [etikett])
      .sort(function (a, b) { return b.length - a.length; })[0];
    if (!ord) return false;
    var ordRe = new RegExp(ord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    var former = [String(verdi), String(verdi).replace('.', ',')];
    if (verdi === Math.floor(verdi)) former.push(String(Math.floor(verdi)));
    var linjer = String(outputText || '').split('\n');
    for (var i = 0; i < linjer.length; i++) {
      var l = linjer[i].replace(/[\s ]+/g, ' ');
      if (!ordRe.test(l)) continue;
      for (var j = 0; j < former.length; j++) {
        if (l.indexOf(former[j]) >= 0) return true;
      }
    }
    return false;
  }

  // Verdikt: 'ok' (alle par gjenfunnet), 'avvik' (NOEN gjenfunnet, andre
  // ikke — det målte stokke-signalet), 'utestbar' (<2 kandidater, eller
  // INGEN gjenfunnet — parene ble aldri printet; regel 10-miss, men ikke
  // bevis på stokking). Konservativt med vilje: kun delvis mismatch
  // varsles — lav falsk-positiv-rate er vernets levevilkår.
  function sjekk(answerText, outputText) {
    var par = parFraSvar(answerText);
    if (par.length < 2) return { verdikt: 'utestbar', par: par, avvik: [] };
    var avvik = [], treff = 0;
    par.forEach(function (p) {
      if (parITekst(outputText, p.etikett, p.verdi)) treff++;
      else avvik.push(p);
    });
    if (avvik.length === 0) return { verdikt: 'ok', par: par, avvik: [] };
    // Ingen treff = parene ble aldri printet (regel 10-miss): svaret bærer
    // en rangering ingen output kan verifisere — eget, mykere verdikt
    // (målt eval-runde 5: figur-only output + stokket juli-rangering).
    if (treff === 0) return { verdikt: 'uverifisert', par: par, avvik: avvik };
    return { verdikt: 'avvik', par: par, avvik: avvik };
  }

  var api = { sjekk: sjekk, parFraSvar: parFraSvar, parITekst: parITekst };
  global.Rangeringsvern = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
