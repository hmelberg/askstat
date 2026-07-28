"""ost for mini-motorene (Brython/MicroPython) — r-factor-runden §4.

Delt fil (ui_core-presedensen): dialektforskjellen er KUN js-roten
(Brython: browser.window; MicroPython: js). Typemeta kommer som STRENGER
fra window.PxWeb (metaUrlFor/typemetaTsvFromText — Task 1-flaten); ingen
logikk-tvilling her. Anvendelse speiler openstat.py _apply_best_effort:
kun kolonner hvis verdier (str-form) er kildens KODER typles; time+intlike
-> int64; ellers category. Verdier endres ALDRI; metadata-feil -> utypet +
notat, aldri kast.

KJENTE BEGRENSNINGER (mini-pandas):
- read_csv har ingen dtype-kwarg -> 0301-vernet-ved-parse finnes ikke her;
  ledende-null-koder blir tall ved parse og best-effort hopper dem over.
- Ingen Int64 -> NaN i intlike tidskolonne forblir utypet (notat).
- Ingen attrs settes (TSV baerer ikke etiketter; panel-typemeta er kø).
- convert_dtypes tar KUN register-URL som meta (dict-formen er kø).
"""
import pandas as pd


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
    murl = str(px.metaUrlFor(str(url)) or "")
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


def _apply(df, entries, who):
    # mini-pandas-felle (målt under rød-fasen, se task-5-report.md): DataFrame
    # sin kolonnetildeling df[col] = ... skriver bare de rå verdiene til den
    # flate data-listen — den oppdaterer ALDRI DataFrame._cats, så en
    # 'category'-dtype forsvinner stille ved neste oppslag av kolonnen. Den
    # STØTTEDE ruten som faktisk setter _cats[col] er DataFrame.astype(dict)
    # (se pandas_brython.py/pandas_mpy.py DataFrame.astype); Series.astype
    # ('category') endrer ikke dataene, bare metadata, så verdiene er
    # identiske før/etter — mekanikk-tilpasning, ikke semantikkendring.
    cat_cols = {}
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
            df[did] = col.astype("int64")
        else:
            cat_cols[did] = "category"
    if cat_cols:
        df = df.astype(cat_cols)
    return df


def read_csv(url, convert=True, **kwargs):
    df = pd.read_csv(url, **kwargs)      # replay-broen håndterer henting
    if not convert:
        return df
    entries, err = _typemeta_entries(url)
    if err:
        print("ost.read_csv: metadata utilgjengelig for " + str(url) +
              " (" + err + ") - fortsetter utypet")
        return df
    if entries is None:
        return df                        # ukjent kilde: ren passthrough
    return _apply(df, entries, "ost.read_csv")


def convert_dtypes(df, meta=None):
    if meta is None or not isinstance(meta, str):
        raise ValueError("ost.convert_dtypes i mini-motorene krever meta= "
                         "(register-URL) - heuristikk/dict-form er ikke stottet her")
    entries, err = _typemeta_entries(meta)
    if err or entries is None:
        raise ValueError("kunne ikke hente metadata for " + str(meta) +
                         ((" (" + err + ")") if err else ""))
    return _apply(df, entries, "ost.convert_dtypes")
