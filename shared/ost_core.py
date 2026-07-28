"""ost for mini-motorene (Brython/MicroPython) — r-factor-runden §4.

Delt fil (ui_core-presedensen): dialektforskjellen er KUN js-roten
(Brython: browser.window; MicroPython: js). Typemeta kommer som STRENGER
fra window.PxWeb (metaUrlFor/typemetaTsvFromText — Task 1-flaten); ingen
logikk-tvilling her. Anvendelse speiler openstat.py _apply_best_effort:
kun kolonner hvis verdier (str-form) er kildens KODER typles; time+intlike
-> int64; ellers category. Verdier endres ALDRI; metadata-feil -> utypet +
notat, aldri kast.

read_csv(convert=True) (mini-knippet §2, py-tvilling-mønsteret i
openstat.py read_csv): typemeta hentes FØR pd.read_csv (rekkefølgeflipp —
CSV-parsingen skjer ETTER metadatakallet nå, motsatt av tidligere), slik at
ALLE gjenkjente kolonner (også tidskolonnen — py-tvillingens vern dekker
tm["dims"] i sin helhet, som INKLUDERER tidsdimensjonen; den skilles kun ut
via den separate "time"-lista) kan få dtype=str-VERN rett ved parse —
0301-koder mister ellers den ledende nullen for godt før typingen rekker
frem. Tidskolonnen types likevel til int64 som før (_apply gjør det
eksplisitt uansett underliggende parse-form). Brukerens egen dtype-kwarg
vinner ALLTID: en dict flettes med brukerens nøkler først (vernet fyller
bare inn kolonner brukeren ikke selv nevnte), en skalar dtype (f.eks.
dtype=str) dekker allerede alt selv og gis videre urørt — ingen vern
injiseres da. convert=False fetcher ikke metadata i det hele tatt og
forblir byte-lik naken (py-paritet).

convert_dtypes(df, meta=) tar nå i tillegg en py-formet typemeta-dict
(mini-knippet §4): {"dims": {did: {"categories": [...]}}, "time": [...]}
— samme kontrakt som openstat.py sin typemeta_from_jsonstat/
_apply_best_effort. Konverteres lokalt til entries, ingen PxWeb-rundtur.
meta som URL-streng (uendret) eller None gir samme feil som før.

read_csv(...) setter i tillegg df.attrs["ost_url"] = url for en GJENKJENT
kilde, UANSETT convert (mini-knippet §3, R-arkitekturen gjenbrukt — se
attr(res,"ost_url") i js/read-bridge.js sin rPatchSource). Dette er ren
proveniens (ingen typing), så det gjelder også den nakne convert=False-
veien. index.html sin refreshDatasetSidebarFromEngineInfo bruker attrs'et
til å berike sidepanelet med typemeta via ReadBridge.typemetaForUrl.

KJENTE BEGRENSNINGER (mini-pandas):
- Ingen Int64 -> NaN i intlike tidskolonne forblir utypet (notat).
- ordered + KILDENS kategoriorden settes via CategoricalDtype-internalen
  (_cats) — guardet; paa eldre/avvikende mini-bygg faller den tilbake til
  uordnet category i dataens sorterte orden. Kategoriene faar verdienes
  parse-form (tall forblir tall) — py-tvillingen str-konverterer verdiene;
  medlemskaps-semantikken (vals ⊆ codes paa str-form) er identisk uansett.
- typing returnerer en NY ramme (DataFrame.astype kopierer alltid i
  mini-pandas) — bruk returverdien; py-tvillingen muterer in-place.
"""
# Dialektfri pandas-import med fallback-kjede (_js_root-presedensen — task-5-
# review): mini-motorene har IKKE noe 'pandas'-alias i LIB_REGISTRY (bar
# `import pandas` i brukerkode skal fortsatt gi høylytt ModuleNotFoundError).
# I motoren er tvillingen registrert under kanonisk navn FØR ost_core lastes
# (deps-listene i ost_core-oppføringene sikrer rekkefølgen).
try:
    import pandas as pd            # CPython-testene stubber denne
except ImportError:
    try:
        import pandas_brython as pd    # Brython-motoren (kanonisk navn)
    except ImportError:
        import pandas_mpy as pd        # MicroPython-motoren


class _PendingFetch(BaseException):
    # Klasse-attributt, ikke instans (mpy-fella; se pandas_mpy._PendingFetch)
    __brython_pending__ = True


def _js_root():
    try:
        from browser import window as w   # Brython
        return w
    except ImportError:
        import js                          # MicroPython
        return js


def _fetch_text(url):
    import json as _json
    w = _js_root()
    hook = getattr(w, "__brythonFetchSync", None)
    if hook is None:
        hook = getattr(w, "__mpyFetchSync", None)
    if hook is None:
        # js-namespace-fella (se pandas_mpy read_csv): 'import js' kan lykkes
        # stille utenfor motoren — sjekk at broen faktisk er koblet.
        raise ValueError("ost: URL-broen er ikke koblet (kjorer du utenfor motoren?)")
    res = _json.loads(hook(url))
    if res.get("pending"):
        raise _PendingFetch("venter paa " + url)
    if res.get("error"):
        raise ValueError(str(res["error"]))
    return res["text"]


def _intlike(codes):
    if not codes:
        return False
    for c in codes:
        try:
            int(str(c))
        except (TypeError, ValueError):
            return False
    return True


def _typemeta_entries(url):
    """[{did, time, codes}] for gjenkjent kilde; (None, feiltekst) ellers.
    Returnerer (entries, err) — err=None og entries=None betyr ukjent kilde
    (stille passthrough, som py)."""
    w = _js_root()
    px = getattr(w, "PxWeb", None)
    if px is None:
        return None, "PxWeb utilgjengelig"
    # try/except-symmetri med _recognized_url (task-3-review-funn 2): et
    # uventet kast fra metaUrlFor skal bli en metadata-feil (utypet + notat
    # hos kalleren), aldri velte read_csv/convert_dtypes.
    try:
        murl = str(px.metaUrlFor(str(url)) or "")
    except Exception as e:
        return None, str(e)
    if not murl:
        return None, None
    try:
        text = _fetch_text(murl)
    except _PendingFetch:
        raise
    except Exception as e:
        return None, str(e)
    tsv = str(px.typemetaTsvFromText(text))
    if tsv.startswith("ERR:"):
        return None, tsv[4:]
    if not tsv:
        return None, None
    out = []
    for line in tsv.split("\n"):
        if not line:
            continue
        p = line.split("\x1f")
        out.append({"did": p[0], "time": p[1] == "time", "codes": p[2:]})
    return out, None


def _recognized_url(url):
    """Kun mønstergjenkjenning (px.metaUrlFor) — ALDRI et nettverkskall.
    Den ENE gjenkjenningskilden for ost_url-attrs (mini-knippet §3 +
    task-3-review-funn 1): BEGGE convert-veier i read_csv bruker denne, så
    px=None/kast gir samme svar (ukjent -> ingen attr) uansett convert — å
    utlede gjenkjenning fra _typemeta_entries sitt (entries, err)-par ga
    sprik (err "PxWeb utilgjengelig" er IKKE en gjenkjent kilde). convert=
    False henter for øvrig aldri metadata ("byte-lik naken" gjelder
    VERDIENE, ikke denne rene proveniens-annoteringen). PxWeb utilgjengelig/
    uventet unntak -> ukjent (samme forsiktige feilmodus som resten av
    modulen: ingen attr, aldri kast)."""
    w = _js_root()
    px = getattr(w, "PxWeb", None)
    if px is None:
        return False
    try:
        return bool(str(px.metaUrlFor(str(url)) or ""))
    except Exception:
        return False


def _apply(df, entries, who):
    # mini-pandas-felle (målt under rød-fasen, se task-5-report.md): DataFrame
    # sin kolonnetildeling df[col] = ... skriver bare de rå verdiene til den
    # flate data-listen — den oppdaterer ALDRI DataFrame._cats, så en
    # 'category'-dtype forsvinner stille ved neste oppslag av kolonnen. Den
    # STØTTEDE ruten som faktisk setter/rydder _cats[col] er
    # DataFrame.astype(dict) (pandas_brython.py/pandas_mpy.py) — den brukes
    # derfor for BEGGE grener: int64-grenen via astype-dicten rydder også en
    # ev. stale category-dtype fra en tidligere convert_dtypes-runde
    # (astype-implementasjonens `del cp._cats[col]`-gren). Series.astype
    # ('category') endrer ikke dataene, bare metadata — mekanikk-tilpasning,
    # ikke semantikkendring.
    for e in entries:
        did = e["did"]
        if did not in df.columns:
            continue
        cats = e["codes"]
        if not cats:
            continue
        col = df[did]
        vals = set()
        has_none = False
        for v in col:
            # py-tvillingen bygger vals via .dropna() FØR str-sammenlikningen
            # (openstat.py _apply_best_effort) — NaN skal ALDRI telle som "en
            # verdi utenfor kodene". pd.isna fanger mini-pandas sin egen
            # nan-sentinel (brukt for tomme CSV-felt i tallkolonner); 'v is
            # None' i tillegg for hånd-bygde rammer til convert_dtypes.
            if v is None or pd.isna(v):
                has_none = True
            else:
                vals.add(str(v))
        if not vals or not vals.issubset(set(cats)):
            continue
        if e["time"] and _intlike(cats):
            if has_none:
                print(who + ": NaN i tidskolonnen " + did +
                      " - forblir utypet (ingen Int64 i mini-pandas)")
                continue
            df = df.astype({did: "int64"})
        else:
            df = df.astype({did: "category"})
            # ordered-/kildeorden-paritet (task-5-review): py-tvillingen gir
            # ordered Categorical i KILDENS kategoriorden; mini-astype gir
            # uordnet i dataens sorterte orden. Overstyr dtype-internalen
            # guardet. Kategoriene legges i VERDIENES parse-form via valmap
            # (målt: rene str-kategorier på en tallparset kolonne gir
            # code_of == -1 for alt — sorteringsnøkkelen dør). vals ⊆ codes
            # (str-form) er alt bevist over, så hver sett verdi har sin kode;
            # usette koder beholder str-formen (kan ikke forekomme i dataene,
            # posisjonen i kildeordenen bevares uansett).
            try:
                valmap = {}
                for v in col:
                    if not (v is None or pd.isna(v)):
                        valmap[str(v)] = v
                cat_list = [valmap.get(str(c), str(c)) for c in cats]
                df._cats[did] = pd.CategoricalDtype(cat_list, e["time"])
            except Exception:
                pass  # eldre/avvikende mini-bygg: uordnet + docstring-begrensningen
    return df


def read_csv(url, convert=True, **kwargs):
    # rekkefølgeflipp (mini-knippet §2, docstring over): metadata FØR parse,
    # kun når convert (ellers ingen metadatahenting i det hele tatt — samme
    # kontrakt som før, testet av test_read_csv_convert_false_er_naken).
    entries, err = _typemeta_entries(url) if convert else (None, None)
    if entries:
        # ALLE gjenkjente kolonner (dims OG time — py-tvillingens tm["dims"]
        # dekker begge, se docstring), ikke bare ikke-tid-dimensjonene:
        # tidskolonnen types likevel til int64 nedenfor uansett parse-form.
        # (guard_cols er alltid ikke-tom her — 1:1 med entries.)
        guard_cols = [e["did"] for e in entries]
        user_dtype = kwargs.get("dtype")
        if "dtype" not in kwargs:
            kwargs = dict(kwargs, dtype={d: str for d in guard_cols})
        elif isinstance(user_dtype, dict):
            vern = {d: str for d in guard_cols}
            vern.update(user_dtype)          # brukerens dict-nøkler vinner
            kwargs = dict(kwargs, dtype=vern)
        # else: brukeren ga en SKALAR dtype (f.eks. str) — den dekker
        # allerede alt selv og vinner urørt; intet vern injiseres.
    df = pd.read_csv(url, **kwargs)      # replay-broen håndterer henting
    # ost_url (mini-knippet §3, R-arkitekturen gjenbrukt: attr(res,"ost_url")
    # i js/read-bridge.js sin rPatchSource): satt for GJENKJENT kilde UANSETT
    # convert — panelberikelsen (index.html refreshDatasetSidebarFromEngineInfo)
    # trenger stien tilbake til kilde-URL-en også for den nakne convert=False-
    # veien; dette er ren proveniens, ikke typing. ÉN gjenkjenningskilde for
    # begge convert-veier (task-3-review-funn 1): entries/err-utledning ga
    # sprik ved px=None (err satt != gjenkjent kilde). Det ekstra
    # metaUrlFor-kallet i convert=True-veien er en ren strengfunksjon —
    # ingen nettverkskall.
    if _recognized_url(url):
        df.attrs["ost_url"] = url
    if not convert:
        return df
    if err:
        print("ost.read_csv: metadata utilgjengelig for " + str(url) +
              " (" + err + ") - fortsetter utypet")
        return df
    if entries is None:
        return df                        # ukjent kilde: ren passthrough
    return _apply(df, entries, "ost.read_csv")


def _entries_from_meta_dict(meta):
    """py-formet typemeta-dict (mini-knippet §4, openstat.py
    typemeta_from_jsonstat-kontrakten) -> samme entries-form som
    _typemeta_entries: [{did, time, codes}]. Lokal konvertering, ingen
    PxWeb-rundtur — did'er som ikke er med i "dims" ignoreres (samme regel
    som openstat.py _apply_best_effort: den itererer KUN tm["dims"])."""
    time_set = set(meta.get("time") or [])
    out = []
    for did, d in (meta.get("dims") or {}).items():
        cats = [str(c) for c in ((d or {}).get("categories") or [])]
        out.append({"did": did, "time": did in time_set, "codes": cats})
    return out


def convert_dtypes(df, meta=None):
    if isinstance(meta, dict):
        return _apply(df, _entries_from_meta_dict(meta), "ost.convert_dtypes")
    if meta is None or not isinstance(meta, str):
        raise ValueError("ost.convert_dtypes i mini-motorene krever meta= "
                         "(register-URL eller typemeta-dict) - heuristikk "
                         "(meta=None) er ikke stottet her")
    entries, err = _typemeta_entries(meta)
    if err or entries is None:
        raise ValueError("kunne ikke hente metadata for " + str(meta) +
                         ((" (" + err + ")") if err else ""))
    return _apply(df, entries, "ost.convert_dtypes")
