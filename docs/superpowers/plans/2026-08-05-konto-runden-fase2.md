# Konto-runden fase 2 (login + synk) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Valgfri innlogging i askstat som synker profiler, historikk (question+kode, ALDRI markdown) og API-nøkler (kryptert med login-koden) via microdata-api.

**Architecture:** Server: generisk `/userdoc/:name`-endepunktpar (klon av keystore-mønsteret) + hash-splitt i auth (koder → PBKDF2-600k m/fast salt i ren modul `auth_hash.py`; sesjonstokens beholder sha256). Klient: login-port fra safestat (engelsk, kode fanges til KEK-avledning), `keys-crypto.js` (WebCrypto AES-GCM under PBKDF2(login-koden, salt=email)), tombstone+merge-utvidelser i fase 1-lagrene, `konto-sync.js` som orkestrerer tre dokumenter. Alt er best-effort og blokkerer aldri ask-flyten.

**Tech Stack:** Vanilla JS (IIFE + node --test, node ≥19 WebCrypto), Python/Anvil (pytest på rene moduler), to repoer: askstat + microdata-api.

**Spec:** `docs/superpowers/specs/2026-08-05-konto-runden-design.md` (§Fase 2a–2d, §Sikkerhet, §Feilhåndtering)

## Global Constraints

- Testkommandoer: askstat `node --test tests/js/*.test.js`; microdata-api `python3 -m pytest -q` (fra repo-rot).
- Kodenormalisering MÅ speile serverens `_normalize_magic_code`: lowercase, `[^a-z]+` → `-`, strip ledende/avsluttende `-`.
- KEK: PBKDF2-SHA256, **600 000** iter, passord = normalisert kode (UTF-8), salt = email lowercase (UTF-8) → AES-GCM-256. kekId = første 8 hex av SHA-256(normalisert kode).
- Server-kodehash: PBKDF2-SHA256, 600 000 iter, FAST salt `b"mdataapi-code-salt-v1"` (O(1)-verify); sesjonstokens (prefiks `mdapi_`) beholder sha256.
- Server-historikk: `markdown`-feltet STRIPPES før push; lokal cache beholder det. Caps: askkeys 64 kB, profiles 128 kB, history 256 kB.
- Tombstones: `{id, deleted:true, updated}`; prunes når `updated` er >90 dager gammel; merge = union-by-id, nyeste `updated` vinner, likhet → lokal vinner.
- Synk-feil er stille (console.warn maks); 401 → lokal logout, data beholdes. Logout beholder lokale data; «Log out and clear this device» tømmer md_keys/md_profiles/md_ask_history/md_kek*/mdapi_*.
- Ask-strenger engelsk uten i18n. Ingen bakoverkompat-hensyn (koder reutstedes etter Anvil-pull).
- microdata-api-endringer committes/pushes i DET repoet og VENTER PÅ ANVIL-PULL + manuell `userdocs`-tabell (email: text, name: text, doc: text, updated: text) i Anvil-editoren.

---

### Task 1 (microdata-api): `auth_hash.py` + hash-splitt i auth.py

**Files:** Create `server_code/auth_hash.py`, `tests/test_auth_hash.py`; Modify `server_code/auth.py` (issue_magic_code, issue_shared_code, consume_magic_code, _normalize_magic_code → delegat).

**Interfaces:** `auth_hash.normalize_code(raw) → str`, `auth_hash.hash_code(raw) → str` (pbkdf2-hex av NORMALISERT kode), `auth_hash.CODE_SALT`, `auth_hash.ITERATIONS`. auth.py bruker `hash_code` for magic/shared (utstedelse OG oppslag), `_hash_token` (sha256) forblir for sesjoner.

- [ ] Test (`tests/test_auth_hash.py`): normalisering («Abacus Charity Twelve» → «abacus-charity-twelve», tegn/tall-runs → én bindestrek, tomt → tomt); hash er deterministisk 64-hex, normalisert-invariant (`hash_code('A B C') == hash_code('a-b-c')`), og ULIK sha256 (`!= hashlib.sha256(...)`); kjente-vektor-test som JS-speilet i Task 3 gjenbruker: `hash_code('abacus-charity-twelve')` mot fasit-hex beregnet i testen med `hashlib.pbkdf2_hmac('sha256', b'abacus-charity-twelve', b'mdataapi-code-salt-v1', 600_000)`.
- [ ] `auth_hash.py` (RENT: kun hashlib+re):

```python
"""Kodehash for magic-/delt-koder (konto-runden fase 2, askstat-spec
2026-08-05): PBKDF2-600k med FAST salt — gjør DB-dump-knekking av 3-ords
koder (~39 bits) dyr, mens verify forblir ett kall + indeksert oppslag.
Sesjonstokens (høy entropi) beholder sha256 i auth.py. Fast salt er
akseptabelt: iterasjonstallet er forsvaret; kodene er tilfeldige."""
import hashlib
import re

CODE_SALT = b"mdataapi-code-salt-v1"
ITERATIONS = 600_000


def normalize_code(raw: str) -> str:
    s = (raw or "").lower().strip()
    s = re.sub(r"[^a-z]+", "-", s)
    return s.strip("-")


def hash_code(raw: str) -> str:
    normalized = normalize_code(raw)
    return hashlib.pbkdf2_hmac(
        "sha256", normalized.encode("utf-8"), CODE_SALT, ITERATIONS
    ).hex()
```

- [ ] auth.py: `import auth_hash`; `_normalize_magic_code = auth_hash.normalize_code` (behold navnet); i `issue_magic_code`/`issue_shared_code`: `token_hash=auth_hash.hash_code(code)`; i `consume_magic_code`: `token_hash = auth_hash.hash_code(normalized)`. Docstring-notat: eksisterende koder invalideres ved deploy — reutstedes.
- [ ] `python3 -m pytest -q` grønn; commit i microdata-api.

### Task 2 (microdata-api): `userdoc.py` — generisk per-bruker-dokument

**Files:** Create `server_code/userdoc.py`, `tests/test_userdoc.py`.

**Interfaces:** `validate_userdoc(name, raw) → str` (returnerer `updated`, kaster ValueError); HTTP `GET/POST /_/api/userdoc/:name` (auth = innlogget bruker, delt-kode → 403), tabell `userdocs` (rad per email+name).

- [ ] Test: allowlist (`askkeys/profiles/history` ok; `annet` → ValueError); caps per navn (64k/128k/256k — test med `"x" * (cap+1)` innbakt i gyldig JSON-streng-felt); ikke-JSON → ValueError; manglende `updated` → ValueError; gyldig dok returnerer updated.
- [ ] `userdoc.py` — keystore.py-mønsteret (ren logikk øverst, endepunkter bak `_ANVIL`-gate):

```python
"""Generisk per-bruker-dokumentlagring (askstat konto-runden fase 2, spec
2026-08-05 §Fase 2b). Ett endepunktpar dekker profiles/history/askkeys —
klienten eier semantikken (askkeys-innholdet er AES-GCM-ciphertext under
brukerens login-kode; serveren lagrer AS-IS). Merge gjøres av KLIENTEN
(union-by-id + tombstones); serveren lagrer bare siste innsendte dokument.

  GET  /userdoc/:name                → {"doc": str|null, "updated": str|null}
  POST /userdoc/:name {"doc":"..."}  → {"ok": true, "updated": str}
"""
from __future__ import annotations

import json

CAPS = {"askkeys": 65536, "profiles": 131072, "history": 262144}


def validate_userdoc(name, raw) -> str:
    if name not in CAPS:
        raise ValueError(f"ukjent dokumentnavn: {name}")
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("doc mangler")
    if len(raw.encode("utf-8")) > CAPS[name]:
        raise ValueError(f"dokumentet er for stort (maks {CAPS[name] // 1024} kB)")
    try:
        doc = json.loads(raw)
    except Exception:
        raise ValueError("doc er ikke gyldig JSON")
    if not isinstance(doc, dict):
        raise ValueError("doc må være et JSON-objekt")
    updated = doc.get("updated")
    if not isinstance(updated, str) or not updated:
        raise ValueError("doc mangler updated-tidsstempel")
    return updated


try:
    import anvil.server
    from anvil.tables import app_tables
    import auth
    import http_utils
    _ANVIL = True
except Exception:            # ren testkjøring
    _ANVIL = False


if _ANVIL:
    _json = http_utils.json_response
    _load_body = http_utils.load_body

    def _require_user():
        principal, err = auth.authenticate_or_fail()
        if err:
            return None, err
        user = auth.principal_user(principal)
        if user is None:
            return None, _json({"error": "krever innlogget bruker"}, status=403)
        return user, None

    @anvil.server.http_endpoint("/userdoc/:name", methods=["GET"],
                                cross_site_session=False, enable_cors=True)
    def http_userdoc_get(name):
        user, err = _require_user()
        if err:
            return err
        if name not in CAPS:
            return _json({"error": "ukjent dokumentnavn"}, status=404)
        row = app_tables.userdocs.get(email=user["email"], name=name)
        if row is None:
            return _json({"doc": None, "updated": None})
        return _json({"doc": row["doc"], "updated": row["updated"]})

    @anvil.server.http_endpoint("/userdoc/:name", methods=["POST", "PUT"],
                                cross_site_session=False, enable_cors=True)
    def http_userdoc_put(name):
        user, err = _require_user()
        if err:
            return err
        body = _load_body()
        try:
            updated = validate_userdoc(name, body.get("doc"))
        except ValueError as exc:
            return _json({"error": str(exc)}, status=400)
        row = app_tables.userdocs.get(email=user["email"], name=name)
        if row is None:
            app_tables.userdocs.add_row(email=user["email"], name=name,
                                        doc=body["doc"], updated=updated)
        else:
            row.update(doc=body["doc"], updated=updated)
        return _json({"ok": True, "updated": updated})
```

- [ ] pytest grønn; commit + push microdata-api (begge tasks). NOTER: Anvil-pull + `userdocs`-tabell gjenstår hos Hans.

### Task 3 (askstat): `js/keys-crypto.js`

**Files:** Create `js/keys-crypto.js`, `tests/js/keys-crypto.test.js`; Modify index.html (script-tag etter profiles.js).

**Interfaces:** `window.KeysCrypto = { normalizeCode(raw), kekId(code) → Promise<8-hex>, deriveKekHex(code, email) → Promise<64-hex>, encryptDoc(obj, kekHex, kekIdStr, now) → Promise<blob>, decryptDoc(blob, kekHex) → Promise<obj|null> }`; blob = `{v:'ask1', ct(b64), iv(b64), kekId, updated}`. Node-seam `module.exports = { makeKeysCrypto }` med injiserbar `crypto` (node: globalThis.crypto).

- [ ] Tester: normalizeCode speiler serveren (samme vektorer som Task 1); rundtur encrypt→decrypt gir samme objekt; feil KEK → null (ikke kast); kekId 8 hex-tegn og deterministisk; blob har alle felter.
- [ ] Implementasjon: PBKDF2 via `crypto.subtle.importKey('raw', code)` → `deriveBits({salt: email, iterations: 600000, hash:'SHA-256'}, 256)`; AES-GCM med 12-byte tilfeldig iv; b64 via egne helpers (ingen Buffer i browser); decryptDoc try/catch → null.

### Task 4 (askstat): synk-kroker i lagrene (keys/profiles/history)

**Files:** Modify `js/keys.js`, `js/profiles.js`, `js/ask-history.js`; utvid `tests/js/profiles.test.js`, `tests/js/ask-history.test.js`, ny `tests/js/keys-onchange.test.js`.

**Interfaces (produserer, konsumeres av Task 6):**
- keys.js: `Keys.onChange(cb)` (fyrer på set/remove), `Keys.getAll() → obj`, `Keys.replaceAll(obj, updatedIso)` (skriver UTEN å fyre), `Keys.updatedAt() → iso|''` (md_keys_updated, settes ved hver mutasjon).
- profiles.js: `remove` → tombstone; `list/get/active` filtrerer deleted; `exportDoc() → doc` (kopi), `mergeRemote(remoteDoc) → boolean endret` (union per id, nyeste updated vinner, doc.active fra dokumentet med nyest doc.updated; skriver STILLE — fyrer ikke onChange), prune >90 d ved skriving.
- ask-history.js: samme mønster (`onChange(cb)` på save/remove/clear; `remove`/`clear` → tombstones; `exportDoc({stripMarkdown})` — stripMarkdown utelater markdown-feltet per innslag; `mergeRemote(remoteDoc) → boolean`; merge bevarer lokal markdown når updated er lik).

- [ ] Tester (de viktige): tombstone skjules i list/get men ligger i exportDoc; merge: fjern-slettet innslag forsvinner lokalt; lokalt innslag ukjent remote overlever; lik updated → lokal markdown beholdes; prune fjerner >90 d gamle tombstones (injiser `now`); clear() tombstoner alle; Keys.replaceAll fyrer IKKE onChange, set fyrer.
- [ ] Implementasjon per beskrivelsen; `updated` sammenlignes leksikografisk (ISO). Kjør hele node-suiten grønn; commit.

### Task 5 (askstat): login-port + konto-UI i sidebaren

**Files:** Create `js/login.js` (port); Modify `index.html` (login-modal + kek-modal + `askLoginBtn` m/pop-meny i `.ask-side-bottom`, script-tag FØR konto-sync), `css/ask.css` (småstiler).

**Interfaces:** `window.mdAuth = { token, user, isLoggedIn, apiBase(), showLogin(), logout(), logoutAndClear() }`; ved vellykket verify kalles `window.KontoSync.onLogin(code)` (Task 6) med RÅKODEN — koden lagres aldri selv. `?login=<code>`-param støttes (magic-lenke) og gir også koden til onLogin.

- [ ] Port safestats login.js med endringene: engelske strenger uten `T()`; `DEFAULT_BASE = 'https://mdataapi.anvil.app'`; alle `alert()` byttes til feiltekst i modalen (`loginError`-div); `persistLogin(data, code)` kaller `window.KontoSync && KontoSync.onLogin(code)`; logout kaller `KontoSync.onLogout()`; NY `logoutAndClear()` = logout + fjern `md_keys, md_keys_updated, md_profiles, md_ask_history, md_kek, md_kek_id` + reload. Ingen `loginSwitchToCode` (delt kode gir ingen synk — YAGNI).
- [ ] Modal-markup (engelsk, `ai-modal-backdrop`-mønsteret, IDs `loginBackdrop/loginStep1/2/3/loginEmail/loginSubmit/loginCancel/loginSentEmail/loginCode/loginVerify/loginCodeError/loginDone/loginError`): steg 1 e-post («We'll email you a 3-word login code»), steg 2 kode-inntasting, steg 3 «Signing you in…». KEK-modal (`kekBackdrop/kekCode/kekTry/kekSkip`): «Your synced keys were saved under a different login code. Enter that code to unlock them, or skip and re-enter keys manually.»
- [ ] Sidebar: nederst i `.ask-side-bottom` en `askLoginBtn` (person-ikon SVG + `ask-side-label` = 'Log in' / e-post) med `ask-pop-menu` (`askAccountMenu`): e-postheader, «Log out», «Log out and clear this device». Logget ut → klikk åpner login-modalen. Oppdateres via `mdAuth`-tilstand (login.js eksponerer `renderAccountUi()` og kaller den ved persist/logout).
- [ ] Node-suiten fortsatt grønn (login.js er DOM-modul; ingen node-test — röyk i Task 8); commit.

### Task 6 (askstat): `js/konto-sync.js` — tre dokumenter

**Files:** Create `js/konto-sync.js`, `tests/js/konto-sync.test.js`; Modify index.html (script-tag SIST av konto-filene).

**Interfaces:** `window.KontoSync = { onLogin(code), onLogout(), syncNow(), status(), _configure(deps, debounceMs) }`. Deps (test-injiserbare som keys-sync): `{auth, keys, profiles, history, crypto: KeysCrypto, fetchImpl, storage}`.

- [ ] Kjernelogikk:
  - `active()` = innlogget MED brukerkonto (`auth.user && auth.user.email`).
  - `onLogin(code)`: `deriveKekHex(code, email)` + `kekId(code)` → storage `md_kek`/`md_kek_id` → `syncNow()`.
  - `syncNow()`: for profiles og history: GET `/userdoc/<name>` → `mergeRemote(JSON.parse(remote.doc))` → POST `exportDoc()` (history: `{stripMarkdown:true}`) hvis merged ≠ remote-doc (strengsammenligning av det som VILLE blitt pushet). For askkeys: GET → blob finnes og `blob.updated > keys.updatedAt()` → kekId-match? decrypt → `keys.replaceAll(obj, blob.updated)`; kekId-mismatch eller decrypt-null → vis kek-modalen (callback `onKekMismatch` som Task 5s modal kobler til); lokal nyere → encrypt (med cached kek) → POST.
  - Debounced push (1,5 s) per dok via `keys.onChange`/`profiles.onChange`/`history.onChange`.
  - `onLogout()`: stopp timere; RØR IKKE lagrene (logout beholder lokalt); behold md_kek (samme maskin kan fortsette å pushe? NEI — ikke innlogget = ingen synk; kek beholdes likevel så re-login med lenke uten kode... lenken HAR koden. Slett md_kek/md_kek_id ved logout — enklere og strammere).
  - Alle feil → `console.warn('[konto-sync]', …)` + status 'error'; ALDRI kast ut av offentlige funksjoner.
- [ ] Tester (fake fetch/lagre, mønster fra keys-sync): pull-merger og pusher når lokal har mer; tom server → ren opplasting; history-push inneholder ALDRI markdown-nøkkelen; keys: remote nyere + riktig kekId → replaceAll kalt uten onChange-løkke; kekId-mismatch → onKekMismatch kalt, ingen replaceAll; 401 → auth.logoutLocal-callback; inaktiv (utlogget) → 'off'.
- [ ] Kjør suiten; commit.

### Task 7 (askstat): personvern + finpuss

**Files:** Modify `personvern.html`, `personvern.en.html` (ny §: «Konto og synkronisering» / «Account and sync»), `css/ask.css` om nødvendig.

- [ ] Tekst (en, norsk speiles): logged out → nothing leaves the browser (except anonymous error telemetry, as before). Logged in → we store your questions and the generated code (never the written answers), your profiles, and your API keys encrypted in the browser with your login code before upload — the server stores only ciphertext it cannot read; the operator could technically capture the code at login, which is stated openly. Log out and clear removes everything from the device; deleting the account removes the server rows (e-post til kontakt).
- [ ] Commit.

### Task 8: sluttverifisering

- [ ] `node --test tests/js/*.test.js` + deno-suiten grønn.
- [ ] Playwright-røyk (statisk server 3998): boot uten konsollfeil; «Log in» åpner modal, steg 1→(fake)→ingen krasj uten nett (requesten feiler stille i modalfeil-teksten); KontoSync.status() = off når utlogget; logget-ut-appen oppfører seg som før (ask, historikk, profiler urørt).
- [ ] Commit + push askstat; rapport til Hans med Anvil-pull-instruks (pull + `userdocs`-tabell (email/name/doc/updated: text) + reutsted koder; safestat-koder invalideres).
