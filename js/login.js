// js/login.js — valgfri innlogging (konto-runden fase 2, spec 2026-08-05
// §Fase 2a; port av safestats login.js: engelsk, uten i18n, modal-feiltekst
// i stedet for alert). Login GATER ALDRI ask — den legger kun til synk:
// ved vellykket verify gis RÅKODEN videre til KontoSync.onLogin (KEK-
// avledning i keys-crypto.js) og lagres aldri selv. Logout beholder lokale
// data; «Log out and clear this device» tømmer enheten (delte maskiner).
(function (global) {
  'use strict';
  var LS_TOKEN = 'mdapi_token';
  var LS_USER = 'mdapi_user';
  var LS_BASE = 'md_ai_api_base';
  var DEFAULT_BASE = 'https://mdataapi.anvil.app';

  var state = {
    token: '',
    user: null,
  };
  try { state.token = localStorage.getItem(LS_TOKEN) || ''; } catch (e) {}
  try { state.user = JSON.parse(localStorage.getItem(LS_USER) || 'null'); } catch (e) {}

  function apiBase() {
    var base = DEFAULT_BASE;
    try { base = localStorage.getItem(LS_BASE) || DEFAULT_BASE; } catch (e) {}
    return base.replace(/\/+$/, '');
  }

  var $ = function (id) { return document.getElementById(id); };
  var dom = {};
  function cacheDom() {
    ['loginBackdrop', 'loginStep1', 'loginStep2', 'loginStep3',
     'loginEmail', 'loginSubmit', 'loginCancel', 'loginDone', 'loginSentEmail',
     'loginCode', 'loginVerify', 'loginCodeError', 'loginError',
     'askLoginBtn', 'askLoginLabel', 'askAccountMenu',
     'kekBackdrop', 'kekCode', 'kekTry', 'kekSkip', 'kekError',
    ].forEach(function (id) { dom[id] = $(id); });
  }

  function setStep(n) {
    if (!dom.loginStep1) return;
    dom.loginStep1.style.display = n === 1 ? '' : 'none';
    dom.loginStep2.style.display = n === 2 ? '' : 'none';
    dom.loginStep3.style.display = n === 3 ? '' : 'none';
  }
  function setError(msg) {
    if (dom.loginError) dom.loginError.textContent = msg || '';
  }
  function showLogin() {
    if (!dom.loginBackdrop) return;
    setStep(1);
    setError('');
    dom.loginBackdrop.classList.add('open');
    setTimeout(function () { dom.loginEmail && dom.loginEmail.focus(); }, 60);
  }
  function hideLogin() { dom.loginBackdrop && dom.loginBackdrop.classList.remove('open'); }

  async function requestCode(email) {
    var res = await fetch(apiBase() + '/_/api/auth/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, lang: 'en', app: 'askstat' }),
    });
    if (!res.ok) {
      var text = await res.text();
      throw new Error('Could not send the code: ' + (text || res.status));
    }
    return res.json();
  }

  async function verifyCode(code) {
    var res = await fetch(apiBase() + '/_/api/auth/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code }),
    });
    if (!res.ok) {
      var text = await res.text();
      throw new Error(text || ('HTTP ' + res.status));
    }
    return res.json();
  }

  function persistLogin(data, code) {
    state.token = data.token;
    state.user = data.user || null;
    try {
      localStorage.setItem(LS_TOKEN, state.token);
      localStorage.setItem(LS_USER, JSON.stringify(state.user));
      // «Show login code» (Hans 2026-08-05): koden caches LOKALT så den kan
      // vises igjen på denne maskinen. Marginal risiko ≈ null her: samme
      // localStorage har alt bearer-token (innlogget økt) og avledet KEK.
      // Serveren kan aldri vise den (kun hash). Fjernes av logoutAndClear.
      if (code) {
        var norm = (global.KeysCrypto && global.KeysCrypto.normalizeCode)
          ? global.KeysCrypto.normalizeCode(code)
          : String(code).toLowerCase().trim().replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
        if (norm) localStorage.setItem('md_login_code', norm);
      }
    } catch (e) {}
    renderAccountUi();
    // Synk-laget får råkoden til KEK-avledning.
    if (global.KontoSync) global.KontoSync.onLogin(code || '');
  }

  function logoutLocal() {
    state.token = '';
    state.user = null;
    try {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER);
    } catch (e) {}
    renderAccountUi();
  }

  async function logout() {
    try {
      await fetch(apiBase() + '/_/api/auth/logout', {
        method: 'POST',
        headers: state.token ? { 'Authorization': 'Bearer ' + state.token } : {},
      });
    } catch (e) {}
    if (global.KontoSync) global.KontoSync.onLogout();
    logoutLocal();
  }

  // Delte maskiner: logg ut OG tøm alt lokalt (nøkler, profiler, historikk,
  // KEK-cache). Vanlig logout beholder lokale data (spec §Fase 2a).
  async function logoutAndClear() {
    await logout();
    ['md_keys', 'md_keys_updated', 'md_profiles', 'md_ask_history',
     'md_kek', 'md_kek_id', 'md_login_code'].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    location.reload();
  }

  async function refreshMe() {
    if (!state.token) return null;
    try {
      var res = await fetch(apiBase() + '/_/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + state.token },
      });
      if (res.status === 401) { logoutLocal(); return null; }
      if (!res.ok) return null;
      var data = await res.json();
      if (data.user) {
        state.user = data.user;
        try { localStorage.setItem(LS_USER, JSON.stringify(state.user)); } catch (e) {}
        renderAccountUi();
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  async function verifyTypedCode() {
    var code = (dom.loginCode.value || '').trim();
    if (!code) { dom.loginCodeError.textContent = 'Enter the code from the email.'; return; }
    dom.loginCodeError.textContent = '';
    dom.loginVerify.disabled = true;
    try {
      var data = await verifyCode(code);
      persistLogin(data, code);
      hideLogin();
    } catch (e) {
      dom.loginCodeError.textContent = e.message || 'The code is invalid or expired.';
    } finally {
      dom.loginVerify.disabled = false;
    }
  }

  async function handleLoginParam() {
    var params = new URLSearchParams(global.location.search);
    var code = params.get('login');
    if (!code) return false;
    if (dom.loginBackdrop) {
      setStep(3);
      dom.loginBackdrop.classList.add('open');
    }
    try {
      var data = await verifyCode(code);
      persistLogin(data, code);
    } catch (e) {
      setStep(1);
      setError('The login link is invalid or expired: ' + (e.message || e));
      params.delete('login');
      history.replaceState({}, document.title, global.location.pathname +
        (params.toString() ? '?' + params.toString() : ''));
      return false;
    }
    params.delete('login');
    history.replaceState({}, document.title, global.location.pathname +
      (params.toString() ? '?' + params.toString() : ''));
    hideLogin();
    return true;
  }

  // ---- Konto-UI i sidebaren: Log in / e-post + meny (Log out / clear).
  function renderAccountUi() {
    if (!dom.askLoginBtn) return;
    var loggedIn = !!(state.token && state.user && state.user.email);
    if (dom.askLoginLabel) {
      dom.askLoginLabel.textContent = loggedIn ? state.user.email : 'Log in';
    }
    dom.askLoginBtn.title = loggedIn
      ? 'Signed in as ' + state.user.email
      : 'Log in to keep your keys, history and profiles across devices';
    if (!loggedIn && dom.askAccountMenu) dom.askAccountMenu.hidden = true;
  }

  // ---- KEK-modal (rotasjon): synkede nøkler ligger under en annen kode.
  // KontoSync kaller mdKekPrompt(blobKekId) → Promise<kekHex|null>.
  function kekPrompt(blobKekId) {
    return new Promise(function (resolve) {
      if (!dom.kekBackdrop || !global.KeysCrypto || !state.user) { resolve(null); return; }
      dom.kekError.textContent = '';
      dom.kekCode.value = '';
      dom.kekBackdrop.classList.add('open');
      function done(v) {
        dom.kekBackdrop.classList.remove('open');
        dom.kekTry.removeEventListener('click', onTry);
        dom.kekSkip.removeEventListener('click', onSkip);
        resolve(v);
      }
      async function onTry() {
        var code = (dom.kekCode.value || '').trim();
        if (!code) { dom.kekError.textContent = 'Enter the code.'; return; }
        dom.kekTry.disabled = true;
        try {
          var id = await global.KeysCrypto.kekId(code);
          if (id !== blobKekId) {
            dom.kekError.textContent = 'That code does not match the saved keys — try another.';
            return;
          }
          var hex = await global.KeysCrypto.deriveKekHex(code, state.user.email);
          done(hex);
        } catch (e) {
          dom.kekError.textContent = 'Could not unlock with that code.';
        } finally {
          dom.kekTry.disabled = false;
        }
      }
      function onSkip() { done(null); }
      dom.kekTry.addEventListener('click', onTry);
      dom.kekSkip.addEventListener('click', onSkip);
      setTimeout(function () { dom.kekCode.focus(); }, 60);
    });
  }

  function init() {
    cacheDom();
    if (!dom.loginBackdrop) return;

    dom.loginSubmit.addEventListener('click', async function () {
      var email = (dom.loginEmail.value || '').trim();
      if (!email || email.indexOf('@') < 0) {
        setError('Enter a valid email address.');
        return;
      }
      dom.loginSubmit.disabled = true;
      var orig = dom.loginSubmit.textContent;
      dom.loginSubmit.textContent = 'Sending…';
      setError('');
      try {
        await requestCode(email);
        dom.loginSentEmail.textContent = email;
        var sentLine = document.getElementById('loginSentLine');
        var haveLine = document.getElementById('loginHaveLine');
        if (sentLine) sentLine.hidden = false;
        if (haveLine) haveLine.hidden = true;
        setStep(2);
        setTimeout(function () { dom.loginCode && dom.loginCode.focus(); }, 100);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        dom.loginSubmit.disabled = false;
        dom.loginSubmit.textContent = orig;
      }
    });
    dom.loginEmail.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); dom.loginSubmit.click(); }
    });
    // «I already have a code» (Hans 2026-08-05): koden er multi-use i 30
    // dager — har du den fra en annen maskin/eposten, hopp rett til steg 2.
    var haveCodeBtn = document.getElementById('loginHaveCode');
    if (haveCodeBtn) {
      haveCodeBtn.addEventListener('click', function () {
        var sentLine = document.getElementById('loginSentLine');
        var haveLine = document.getElementById('loginHaveLine');
        if (sentLine) sentLine.hidden = true;
        if (haveLine) haveLine.hidden = false;
        setStep(2);
        setTimeout(function () { dom.loginCode && dom.loginCode.focus(); }, 60);
      });
    }
    dom.loginCancel.addEventListener('click', hideLogin);
    dom.loginDone.addEventListener('click', hideLogin);
    dom.loginVerify.addEventListener('click', verifyTypedCode);
    dom.loginCode.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); verifyTypedCode(); }
    });
    dom.loginBackdrop.addEventListener('click', function (e) {
      if (e.target === dom.loginBackdrop) hideLogin();
    });

    // Sidebar-knappen: utlogget → login-modal; innlogget → kontomeny.
    if (dom.askLoginBtn) {
      dom.askLoginBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var loggedIn = !!(state.token && state.user && state.user.email);
        if (!loggedIn) { showLogin(); return; }
        if (dom.askAccountMenu) {
          if (dom.askAccountMenu.hidden) {
            var emailEl = document.getElementById('askAccountEmail');
            if (emailEl) emailEl.textContent = state.user.email;
            var cb = document.getElementById('askAccountCode');
            if (cb) cb.hidden = true;   // koden vises kun på eksplisitt klikk
          }
          dom.askAccountMenu.hidden = !dom.askAccountMenu.hidden;
        }
      });
      document.addEventListener('click', function (e) {
        if (dom.askAccountMenu && !dom.askAccountMenu.hidden &&
            !dom.askAccountMenu.contains(e.target)) {
          dom.askAccountMenu.hidden = true;
        }
      });
      // «Show login code»: vis den lokalt cachede koden (setningsform).
      // Finnes ingen cache (eldre login/annen maskin) → forklar + tilby ny.
      var showCodeBtn = document.getElementById('askShowCodeBtn');
      var codeBox = document.getElementById('askAccountCode');
      var codeValue = document.getElementById('askAccountCodeValue');
      if (showCodeBtn && codeBox) {
        showCodeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!codeBox.hidden) { codeBox.hidden = true; return; }
          var cached = '';
          try { cached = localStorage.getItem('md_login_code') || ''; } catch (err) {}
          codeValue.textContent = cached
            ? cached.replace(/-/g, ' ')
            : 'Not saved on this device — request a new code by email to see one.';
          codeBox.hidden = false;
        });
      }
      var outBtn = document.getElementById('askLogoutBtn');
      var clearBtn = document.getElementById('askLogoutClearBtn');
      if (outBtn) outBtn.addEventListener('click', function () {
        dom.askAccountMenu.hidden = true;
        logout();
      });
      if (clearBtn) clearBtn.addEventListener('click', function () {
        dom.askAccountMenu.hidden = true;
        logoutAndClear();
      });
    }

    renderAccountUi();
    handleLoginParam().then(function () {
      if (state.token) refreshMe();
    });
  }

  global.mdAuth = {
    get token() { return state.token; },
    get user() { return state.user; },
    get isLoggedIn() { return !!state.token; },
    apiBase: apiBase,
    showLogin: showLogin,
    logout: logout,
    logoutAndClear: logoutAndClear,
    refreshMe: refreshMe,
    logoutLocal: logoutLocal,
  };
  global.mdKekPrompt = kekPrompt;

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
