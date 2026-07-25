"""openstat — connect/read/dataset-verbene i og utenfor nettleseren.

Ring 1-ren (ROADMAP 2026-07-25, pakke-diskusjonen): kun stdlib + pandas som
harde avhengigheter. Samme fil kjører i CPython og i Pyodide/emscripten —
transporten bytter selv til synkron XHR i browseren (pyodide-http-trikset).
duckdb brukes KUN hvis den kan importeres (kolonne-pushdown for parquet).

    import openstat as ost
    ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")
    bef = ssb.read("05839", valueCodes={"Tid": "*"})
    panel = ost.dataset(key=["kommune_nr", "year"])
    panel.add(kilde, "SB12843_KOSTRA_EIENDOMSSKATT_I_ALT")
    df = panel.frame()

pxweb-logikken speiler js/pxweb.js — kontrakts-pariteten håndheves av delt
fixture (tests/fixtures/pxweb_dataset.json) i begge testsuitene.
"""

import io
import json as _json
import sys

import pandas as pd

__all__ = ["connect", "read", "dataset", "datasets",
           "data_url", "metadata_url", "columns_from_jsonstat"]

_MEMO = {}


def _fetch_bytes(url):
    """Rå bytes fra URL, memoisert per URL i økten. Synkron XHR i emscripten
    (binærtrygg via x-user-defined-charset), urllib ellers."""
    if url in _MEMO:
        return _MEMO[url]
    if sys.platform == "emscripten":
        from js import XMLHttpRequest
        req = XMLHttpRequest.new()
        req.open("GET", url, False)
        req.overrideMimeType("text/plain; charset=x-user-defined")
        req.send(None)
        if req.status >= 400:
            raise RuntimeError("HTTP " + str(req.status) + " for " + url)
        data = bytes(ord(c) & 0xFF for c in req.responseText)
    else:
        from urllib.request import Request, urlopen
        with urlopen(Request(url, headers={"User-Agent": "openstat"})) as r:
            data = r.read()
    _MEMO[url] = data
    return data


# ── pxweb (paritet med js/pxweb.js — endres den ene, endres den andre) ──────

def _build_url(url, endpoint, force_jsonstat):
    s = str(url or "")
    base, _, query = s.partition("?")
    parts = [p for p in query.split("&") if p]
    if force_jsonstat:
        parts = [p for p in parts if p.split("=")[0].lower() != "outputformat"]
    if not any(p.split("=")[0].lower() == "lang" for p in parts):
        parts.insert(0, "lang=no")
    if force_jsonstat:
        parts.append("outputFormat=json-stat2")
    return base.rstrip("/") + "/" + endpoint + "?" + "&".join(parts)


def data_url(url):
    return _build_url(url, "data", True)


def metadata_url(url):
    return _build_url(url, "metadata", False)


def _category_codes(dim):
    idx = ((dim or {}).get("category") or {}).get("index")
    if isinstance(idx, list):
        return [str(c) for c in idx]
    return [c for c, _ in sorted((idx or {}).items(), key=lambda kv: kv[1])]


def columns_from_jsonstat(ds):
    """json-stat2-dataset -> {DimId: [koder], ..., "value": [tall|None]}.
    Row-major over id/size; value kan være array eller sparse objekt."""
    ids = ds.get("id") or []
    size = ds.get("size") or []
    codes = [_category_codes((ds.get("dimension") or {}).get(i)) for i in ids]
    total = 1
    for s in size:
        total *= s
    val = ds.get("value")
    cols = {i: [None] * total for i in ids}
    vals = [None] * total
    for flat in range(total):
        rest = flat
        for d in range(len(ids) - 1, -1, -1):
            cols[ids[d]][flat] = codes[d][rest % size[d]]
            rest //= size[d]
        v = val[flat] if isinstance(val, list) else (val or {}).get(str(flat))
        vals[flat] = None if v is None else v
    cols["value"] = vals
    return cols


# ── verbene ──────────────────────────────────────────────────────────────────

_SNIFF = ((".parquet", "parquet"), (".csv", "csv"), (".json", "json"))


def _sniff_kind(url):
    base = url.split("?")[0].lower()
    for ext, kind in _SNIFF:
        if base.endswith(ext):
            return kind
    return "csv"


class Source:
    """Én datakilde: en fil-URL eller en API-base (kind='pxweb')."""

    def __init__(self, url, kind=None):
        self.url = str(url)
        self.kind = kind

    def read(self, table=None, columns=None, **query):
        kind = self.kind or _sniff_kind(self.url)
        if kind == "pxweb":
            if not table:
                raise ValueError("pxweb-kilder krever tabell-id: kilde.read('05839')")
            qs = []
            for k, v in query.items():
                if isinstance(v, dict):
                    qs += [str(k) + "[" + str(dk) + "]=" + str(dv) for dk, dv in v.items()]
                else:
                    qs.append(str(k) + "=" + str(v))
            target = self.url.rstrip("/") + "/" + str(table) + (("?" + "&".join(qs)) if qs else "")
            ds = _json.loads(_fetch_bytes(data_url(target)).decode("utf-8"))
            df = pd.DataFrame(columns_from_jsonstat(ds))
            return df[list(columns)] if columns else df
        url = self.url if table is None else self.url.rstrip("/") + "/" + str(table)
        if kind == "parquet":
            if columns:
                try:
                    import duckdb  # valgfri akselerator: bare valgte kolonner hentes
                    collist = ", ".join('"' + str(c).replace('"', '""') + '"' for c in columns)
                    return duckdb.sql(
                        "SELECT " + collist + " FROM read_parquet('" + url.replace("'", "''") + "')"
                    ).df()
                except ImportError:
                    pass
            df = pd.read_parquet(io.BytesIO(_fetch_bytes(url)))
        elif kind == "json":
            df = pd.DataFrame(_json.loads(_fetch_bytes(url).decode("utf-8")))
        else:
            df = pd.read_csv(io.BytesIO(_fetch_bytes(url)), sep=None, engine="python")
        return df[list(columns)] if columns else df


def connect(url, kind=None):
    return Source(url, kind)


def read(url, table=None, columns=None, kind=None, **query):
    return Source(url, kind).read(table, columns=columns, **query)


_DATASETS = {}


class Dataset:
    """Variabel-for-variabel-bygging: deklarer nøkkelen én gang, add() legger
    til kolonner fra rammer eller kilder, frame() gir resultatet."""

    def __init__(self, key, name=None, how="left"):
        self.key = [key] if isinstance(key, str) else list(key)
        self.name = name
        self.how = how
        self._df = None
        if name:
            _DATASETS[name] = self

    def add(self, source, columns, table=None, how=None):
        cols = [columns] if isinstance(columns, str) else list(columns)
        want = self.key + [c for c in cols if c not in self.key]
        if isinstance(source, pd.DataFrame):
            piece = source[want]
        else:
            piece = source.read(table, columns=want)
        if self._df is None:
            self._df = piece.copy()
        else:
            self._df = self._df.merge(piece, on=self.key, how=how or self.how)
        return self

    def frame(self):
        if self._df is None:
            raise ValueError("datasettet er tomt — bruk add() først")
        return self._df


def dataset(key, name=None, how="left"):
    return Dataset(key, name=name, how=how)


def datasets():
    """Navnregisteret over Dataset-objekter bygget i denne økten."""
    return dict(_DATASETS)
