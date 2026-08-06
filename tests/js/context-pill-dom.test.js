'use strict';

// DOM-halvdel av js/context-pill.js er ikke node-testbar uten en DOM — dette
// er en hånd-stubbet DOM, installert som globaler FØR require('../../js/
// context-pill.js') slik at `typeof document !== 'undefined'`-porten åpner
// seg. Samme mønster/FakeEl-familie som tests/js/ui-dom.test.js,
// tests/js/cells-dom.test.js og tests/js/param-forms-dom.test.js bruker for
// sine respektive DOM-halvdeler.
//
// Regresjon runde 1 (fase 2-runden, controller-funn i ekte Chrome): et
// sjekkboks-klikk i kontekst-menyen (Task 3 §2 og Task 6 sin «Extended
// search…»-rad) kaller Prof.togglePack/setSearchMode → Profiles.onChange
// fyres SYNKRONT → context-pill sin renderSections() → container.innerHTML
// = '' — ALT dette skjer FØR klikk-eventet har rukket å boble videre fra
// raden til document. e.target peker da på en node som allerede er fjernet
// fra treet når document-lytteren omsider kjører.
//
// Runde 1-fiksen sjekket e.target.isConnected, men den invarianten («et
// ekte utenfor-klikk har alltid et tilkoblet mål») holder IKKE i denne
// kodebasen: elementer UTENFOR menyen som detacher SEG SELV synkront i eget
// klikk-handler (askConfirm() sine Run/Cancel-knapper i js/ask-view.js,
// lukk-knappen i js/names.js sin showNameError) ga samme frakoblede-target-
// symptom og ble feilaktig ignorert — menyen ble stående åpen. Runde 2
// bruker i stedet DOM-spec'ens faste propagasjonssti: en klikk-lytter på
// selve `menu`-elementet fyres FORTSATT for et klikk som startet inni
// menyen, selv om raden ble detachet midt i dispatchen (den var en forelder
// DA klikket startet — det spiller ingen rolle at den slutter å være det
// underveis). Et element utenfor menyen fyrer ALDRI menyens lytter, uansett
// om det detacher seg selv. Se de to REGRESJON-testene under.
//
// MERK — FakeEl.innerHTML her er STRENGERE enn søsken-stubbene (ui/cells/
// param-forms-dom.test.js): de nullstiller kun forelderens children-liste;
// denne detacher OGSÅ hvert fjernet barns _parentNode (ekte DOM-oppførsel),
// fordi nettopp DEN detach-en er scenariet begge regresjonene dreier seg
// om — uten den ville testene ikke reprodusere feilene (isConnected ville
// feilaktig forbli sann via en gjenværende, stale parentNode-referanse).
//
// MERK 2 — stubben har INGEN ekte event-bobling (ingen automatisk sti fra
// target til document via forelder-kjeden). fireClick()/fireDocClick() pluss
// testenes egne mellomsteg simulerer derfor MANUELT nøyaktig den fasefølgen
// en ekte nettleser ville brukt for et gitt klikk (mål-fase → ev. `menu`
// hvis målet var en etterkommer AV MENYEN DA KLIKKET STARTET → document) —
// med SAMME event-objekt hele veien, akkurat som ekte DOM-dispatch. Det er
// nettopp den delte identiteten (`e !== menuSawClick`) fiksen i
// js/context-pill.js hviler på.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const CONTEXT_PILL_PATH = path.join(__dirname, '..', '..', 'js', 'context-pill.js');

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this._parentNode = null;
    this._listeners = {};
    this._text = '';
    this._innerHTML = '';
    this.hidden = false;
  }
  get isConnected() {
    var n = this;
    while (n) { if (n.__docRoot) return true; n = n._parentNode; }
    return false;
  }
  get parentNode() { return this._parentNode; }
  appendChild(c) {
    if (c._parentNode && c._parentNode !== this) c._parentNode.removeChild(c);
    this.children.push(c);
    c._parentNode = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    c._parentNode = null;
    return c;
  }
  set innerHTML(v) {
    this._innerHTML = v;
    if (v === '') {
      this.children.forEach(function (c) { c._parentNode = null; }); // se MERK øverst
      this.children = [];
    }
  }
  get innerHTML() { return this._innerHTML; }
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() { return this._text; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  contains(target) {
    var n = target;
    while (n) { if (n === this) return true; n = n._parentNode; }
    return false;
  }
}

// freshEnv: bygger en minimal side-struktur (knapp + meny m/to seksjoner),
// stubber Profiles/PacksUi/ProfilesUi, og laster context-pill.js ferskt
// (closure-tilstand — samme grunn som søsken-stubbene sletter require-cachen
// per scenario).
function freshEnv(opts) {
  opts = opts || {};
  delete require.cache[require.resolve(CONTEXT_PILL_PATH)];

  var btn = new FakeEl('button');
  var labelEl = new FakeEl('span');
  var menu = new FakeEl('div');
  menu.hidden = true;
  menu.__docRoot = true; // menyen selv henger alltid i dokumentet (statisk markup)
  var packSec = new FakeEl('div');
  var profSec = new FakeEl('div');
  menu.appendChild(packSec);
  menu.appendChild(profSec);

  var idIndex = {
    askContextBtn: btn, askContextLabel: labelEl, askContextMenu: menu,
    askCtxPackSection: packSec, askCtxProfileSection: profSec,
  };
  var docListeners = {};
  global.document = {
    readyState: 'complete',
    getElementById: function (id) { return idIndex[id] || null; },
    addEventListener: function (type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  };

  var onChangeCb = null;
  var Prof = {
    packsState: function () { return { ids: [], auto: false }; },
    active: function () { return null; },
    onChange: function (cb) { onChangeCb = cb; },
    // simulerer den ekte Profiles.togglePack: muterer og fyrer onChange
    // SYNKRONT, akkurat som js/profiles.js sin writeDoc → fire() gjør.
    togglePack: function () { if (onChangeCb) onChangeCb(); },
  };
  global.Profiles = Prof;
  global.Packs = undefined; // ikke sentral for denne regresjonen — renderLabel tåler fravær

  var renderCalls = [];
  var lastRow = null;
  // Stub for PacksUi: hver renderInto-kalling tømmer containeren (detacher
  // ev. forrige rad — DETTE er mekanismen regresjonen handler om) og setter
  // inn ÉN sjekkboks-rad hvis klikk-håndtering kaller Prof.togglePack.
  global.PacksUi = {
    renderInto: function (container, close, renderOpts) {
      renderCalls.push(renderOpts);
      container.innerHTML = '';
      var row = new FakeEl('button');
      row.addEventListener('click', function () { Prof.togglePack('demo-id'); });
      container.appendChild(row);
      lastRow = row;
    },
  };
  global.ProfilesUi = { renderInto: function () {} };
  global.t = function (k) { return k; };

  require(CONTEXT_PILL_PATH);

  return {
    btn: btn, menu: menu, packSec: packSec, profSec: profSec,
    docListeners: docListeners, renderCalls: renderCalls,
    getLastRow: function () { return lastRow; },
  };
}

function fireClick(el, evt) {
  (el._listeners.click || []).forEach(function (fn) { fn(evt); });
}
function fireDocClick(docListeners, evt) {
  (docListeners.click || []).forEach(function (fn) { fn(evt); });
}

test('context-pill: knapp-klikk åpner menyen (fresh:true) og stopper propagering', () => {
  const { btn, menu, renderCalls } = freshEnv();
  var stopped = false;
  fireClick(btn, { target: btn, stopPropagation: function () { stopped = true; } });
  assert.strictEqual(menu.hidden, false, 'menyen skal åpnes');
  assert.strictEqual(stopped, true, 'knappens eget klikk skal ikke boble videre');
  assert.deepStrictEqual(renderCalls[renderCalls.length - 1], { fresh: true },
    'nyåpning skal signalisere fresh:true til PacksUi');
});

test('context-pill: ekte utenfor-klikk (tilkoblet mål utenfor menyen) LUKKER menyen', () => {
  const { btn, menu, docListeners } = freshEnv();
  fireClick(btn, { target: btn, stopPropagation: function () {} }); // åpne menyen først
  assert.strictEqual(menu.hidden, false);

  var outside = new FakeEl('div');
  outside.__docRoot = true; // et vanlig, tilkoblet element ANDRE steder på siden
  // outside er aldri en etterkommer av menu — menyens klikk-lytter fyres
  // IKKE (ingen fireClick(menu, …)-mellomsteg), akkurat som i ekte DOM.
  fireDocClick(docListeners, { target: outside });
  assert.strictEqual(menu.hidden, true, 'et ekte utenfor-klikk skal fortsatt lukke menyen');
});

test('REGRESJON 1: sjekkboks-klikk som detacher target FØR bobling til document skal IKKE lukke menyen', () => {
  const { btn, menu, packSec, docListeners, getLastRow, renderCalls } = freshEnv();
  fireClick(btn, { target: btn, stopPropagation: function () {} }); // åpne menyen (fresh-render lager rad1)
  const row1 = getLastRow();
  assert.strictEqual(packSec.children[0], row1);
  assert.strictEqual(row1.isConnected, true, 'rad 1 er tilkoblet rett etter render');

  const evt = { target: row1 }; // samme event-objekt/target hele veien, som i ekte DOM-bobling
  // 1) Mål-fasen: radens eget klikk kjører FØRST — dette trigger
  //    Prof.togglePack → onChange → renderSections(false) SYNKRONT, som
  //    tømmer packSec (detacher row1) og setter inn en ny rad2.
  fireClick(row1, evt);
  assert.notStrictEqual(getLastRow(), row1, 'en ny rad skal ha blitt rendret inn i stedet');
  assert.strictEqual(row1.isConnected, false, 'rad 1 skal nå være frakoblet (kjernen i regresjonen)');
  assert.deepStrictEqual(renderCalls[renderCalls.length - 1], { fresh: false },
    'onChange-re-render skal beholde view (fresh:false)');

  // 2) Bobling til menu: row1 var en etterkommer av menu DA klikket startet,
  //    så DOM-spec'ens faste propagasjonssti gir menu-lytteren eventet
  //    likevel — selv om row1 (og bare row1, ikke menu selv) nå er detachet.
  fireClick(menu, evt);
  // 3) Bobling videre til document MED SAMME (nå frakoblede) target — ekte
  //    nettlesere avbryter ikke bobling selv om target fjernes underveis.
  fireDocClick(docListeners, evt);
  assert.strictEqual(menu.hidden, false,
    'menyen skal IKKE lukkes av et sjekkboks-klikk inni seg selv (regresjon 1)');
});

test('REGRESJON 2 (funnet i re-review): et UTENFOR-element som detacher SEG SELV i eget klikk-handler skal likevel LUKKE menyen', () => {
  const { btn, menu, docListeners } = freshEnv();
  fireClick(btn, { target: btn, stopPropagation: function () {} }); // åpne menyen

  // Simulerer f.eks. askConfirm() sine Run/Cancel-knapper (js/ask-view.js:
  // wrap.remove()) eller lukk-knappen i js/names.js sin showNameError
  // (bar.remove()): et element UTENFOR menyen som fjerner seg selv fra SIN
  // EGEN forelder synkront i eget klikk-handler, FØR eventet har rukket å
  // boble til document. Elementet var ALDRI en etterkommer av menu, så
  // menyens klikk-lytter fyres IKKE her (ingen fireClick(menu, …)) — i
  // motsetning til sjekkboks-raden i regresjon 1 over. Runde 1 sin
  // isConnected-sjekk klarte ikke å skille denne saken fra regresjon 1 (samme
  // frakoblet-target-symptom, men motsatt riktig utfall) — det er nøyaktig
  // det re-reviewen fant.
  var outsideParent = new FakeEl('div');
  outsideParent.__docRoot = true;
  var outsideBtn = new FakeEl('button');
  outsideParent.appendChild(outsideBtn);
  outsideBtn.addEventListener('click', function () { outsideParent.removeChild(outsideBtn); });

  var evt = { target: outsideBtn };
  fireClick(outsideBtn, evt); // mål-fasen: detacher seg selv
  assert.strictEqual(outsideBtn.isConnected, false,
    'utenfor-elementet er nå frakoblet (samme symptom som regresjon 1 — men IKKE innom menyen)');

  fireDocClick(docListeners, evt); // bobler rett til document — menu så det aldri
  assert.strictEqual(menu.hidden, true,
    'et frakoblet UTENFOR-mål skal likevel lukke menyen (der runde 1 sin isConnected-sjekk feilet)');
});

test('context-pill: klikk på et FORTSATT tilkoblet element inni menyen (f.eks. profilseksjonen) lukker ikke menyen', () => {
  const { btn, menu, profSec, docListeners } = freshEnv();
  fireClick(btn, { target: btn, stopPropagation: function () {} });
  var evt = { target: profSec };
  fireClick(menu, evt); // profSec er et ekte barn av menu — bobler gjennom menu-lytteren i ekte DOM
  fireDocClick(docListeners, evt);
  assert.strictEqual(menu.hidden, false, 'et tilkoblet mål inni menyen skal aldri lukke den');
});
