"""openstat — connect/read/create/add-verbene i og utenfor nettleseren.

Ring 1-ren (ROADMAP 2026-07-25, pakke-diskusjonen): kun stdlib + pandas som
harde avhengigheter. Samme fil kjører i CPython og i Pyodide/emscripten —
transporten bytter selv til synkron XHR i browseren (pyodide-http-trikset).
duckdb brukes KUN hvis den kan importeres (kolonne-pushdown for parquet).

    import openstat as ost
    ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2/tables", kind="pxweb")
    bef = ssb.read("05839", valueCodes={"Tid": "*"})
    panel = ost.create(key=["kommune_nr", "year"])
    panel.add(kilde, "SB12843_KOSTRA_EIENDOMSSKATT_I_ALT")
    df = panel.frame()

pxweb-logikken speiler js/pxweb.js — kontrakts-pariteten håndheves av delt
fixture (tests/fixtures/pxweb_dataset.json) i begge testsuitene.
"""

import io
import json as _json
import sys

import pandas as pd

__all__ = ["connect", "read", "create", "datasets",
           "data_url", "metadata_url", "eurostat_data_url", "columns_from_jsonstat",
           "SDMX_ACCEPT", "sdmx_fallback_url", "worldbank_data_url", "worldbank_page_url",
           "worldbank_meta", "worldbank_columns", "dbnomics_data_url", "dbnomics_columns"]

_MEMO = {}


def _fetch_bytes(url, headers=None):
    """Rå bytes fra URL, memoisert per (URL, headere) i økten. Synkron XHR i
    emscripten (binærtrygg via x-user-defined-charset), urllib ellers."""
    memo_key = (url, tuple(sorted((headers or {}).items())))
    if memo_key in _MEMO:
        return _MEMO[memo_key]
    if sys.platform == "emscripten":
        from js import XMLHttpRequest
        req = XMLHttpRequest.new()
        req.open("GET", url, False)
        req.overrideMimeType("text/plain; charset=x-user-defined")
        for hk, hv in (headers or {}).items():
            req.setRequestHeader(hk, hv)
        req.send(None)
        if req.status >= 400:
            raise RuntimeError("HTTP " + str(req.status) + " for " + url)
        data = bytes(ord(c) & 0xFF for c in req.responseText)
    else:
        from urllib.request import Request, urlopen
        hdrs = {"User-Agent": "openstat"}
        hdrs.update(headers or {})
        with urlopen(Request(url, headers=hdrs)) as r:
            data = r.read()
    _MEMO[memo_key] = data
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


def eurostat_data_url(url):
    """Eurostat statistics-API (paritet med js/pxweb.js eurostatDataUrl):
    <base>/<kode>?format=JSON&lang=en&<dim>=<verdi> — json-stat2-svar."""
    s = str(url or "")
    base, _, query = s.partition("?")
    parts = [p for p in query.split("&") if p and p.split("=")[0].lower() != "format"]
    if not any(p.split("=")[0].lower() == "lang" for p in parts):
        parts.insert(0, "lang=en")
    parts.append("format=JSON")
    return base.rstrip("/") + "?" + "&".join(parts)


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


# ── api-kinds (paritet med js/api-kinds.js — endres den ene, endres den
# andre; kontrakten håndheves av delte fixtures i begge testsuitene).
# Spec docs/superpowers/specs/2026-07-25-api-kinds-design.md §1.
# SDMX-fellen (spec §0): 2.1-API-ene ignorerer ukjente parametre STILLE —
# send aldri noe kilden ikke garantert forstår. ─────────────────────────────

_KIND_ALIAS = {"oecd": "sdmx", "ecb": "sdmx", "norgesbank": "sdmx", "imf": "sdmx",
               "sdmx": "sdmx", "dbnomics": "dbnomics", "worldbank": "worldbank"}

SDMX_ACCEPT = "application/vnd.sdmx.data+csv;labels=id"


def _split_url(url):
    base, _, query = str(url or "").partition("?")
    return base, [p for p in query.split("&") if p]


def _strip_param(parts, name):
    return [p for p in parts if p.split("=")[0].lower() != name]


def sdmx_fallback_url(url):
    """ECB 406-er på Accept-veien men tar format=csvdata (verifisert 2026-07-25)."""
    base, parts = _split_url(url)
    parts = _strip_param(parts, "format")
    parts.append("format=csvdata")
    return base + "?" + "&".join(parts)


def worldbank_data_url(url):
    """format=json tvinges; per_page=20000 når brukeren ikke velger (default 50!)."""
    base, parts = _split_url(url)
    parts = _strip_param(parts, "format")
    if not any(p.split("=")[0].lower() == "per_page" for p in parts):
        parts.append("per_page=20000")
    parts.append("format=json")
    return base + "?" + "&".join(parts)


def worldbank_page_url(url, n):
    base, parts = _split_url(worldbank_data_url(url))
    parts = _strip_param(parts, "page")
    parts.append("page=" + str(n))
    return base + "?" + "&".join(parts)


def worldbank_meta(doc):
    if isinstance(doc, list) and doc and isinstance(doc[0], dict) and "message" in doc[0]:
        msgs = "; ".join(m.get("value") or m.get("key") or "" for m in doc[0]["message"])
        raise ValueError("Verdensbanken avviste spørringen: " + msgs)
    if not isinstance(doc, list) or len(doc) < 2 or not doc[0]:
        raise ValueError("Uventet svar fra Verdensbanken (ikke [meta, rader])")
    return {"pages": int(doc[0].get("pages") or 1), "total": int(doc[0].get("total") or 0)}


def worldbank_columns(docs):
    cols = {"indicator": [], "country": [], "countryiso3code": [], "date": [], "value": []}
    for doc in docs:
        for r in (doc[1] or []):
            r = r or {}
            cols["indicator"].append((r.get("indicator") or {}).get("id") or "")
            cols["country"].append((r.get("country") or {}).get("id") or "")
            cols["countryiso3code"].append(r.get("countryiso3code") or "")
            cols["date"].append(r.get("date") or "")
            cols["value"].append(r.get("value"))
    return cols


def dbnomics_data_url(url):
    """observations=1 tvinges (uten den kommer bare metadata)."""
    base, parts = _split_url(url)
    parts = _strip_param(parts, "observations")
    parts.append("observations=1")
    return base + "?" + "&".join(parts)


def dbnomics_columns(doc):
    series = (doc or {}).get("series") or {}
    docs = series.get("docs") or []
    if (series.get("num_found") or 0) > len(docs):
        raise ValueError("DBnomics-spørringen traff " + str(series["num_found"]) + " serier, men "
                         "API-et leverer maks " + str(series.get("limit") or len(docs)) +
                         " — snevre inn med dimensjonsfiltre i stien")
    dim_names = sorted({k for d in docs for k in (d.get("dimensions") or {})})
    cols = {"series_code": []}
    for k in dim_names:
        cols[k] = []
    cols["period"] = []
    cols["value"] = []
    for d in docs:
        periods = d.get("period") or []
        values = d.get("value") or []
        for i, per in enumerate(periods):
            cols["series_code"].append(d.get("series_code") or "")
            for k in dim_names:
                cols[k].append(str((d.get("dimensions") or {}).get(k) or ""))
            cols["period"].append(str(per))
            v = values[i] if i < len(values) else None
            cols["value"].append(None if v is None or v == "NA" else v)
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
        kind = _KIND_ALIAS.get(str(kind).lower(), kind)
        if kind in ("sdmx", "worldbank", "dbnomics"):
            if not table:
                raise ValueError(kind + "-kilder krever en ressurssti: kilde.read('EXR/D.USD.EUR.SP00.A')")
            qs = ["%s=%s" % (k, v) for k, v in query.items()]
            target = self.url.rstrip("/") + "/" + str(table) + (("?" + "&".join(qs)) if qs else "")
            if kind == "sdmx":
                try:
                    raw = _fetch_bytes(target, headers={"Accept": SDMX_ACCEPT})
                except Exception:
                    raw = _fetch_bytes(sdmx_fallback_url(target))   # ECB-veien
                df = pd.read_csv(io.BytesIO(raw))
            elif kind == "worldbank":
                docs = [_json.loads(_fetch_bytes(worldbank_data_url(target)).decode("utf-8"))]
                meta = worldbank_meta(docs[0])
                if meta["pages"] > 10:
                    raise ValueError(str(meta["total"]) + " rader fordelt på " + str(meta["pages"]) +
                                     " sider — snevre inn spørringen (date=…, færre land/indikatorer)")
                for p in range(2, meta["pages"] + 1):
                    docs.append(_json.loads(_fetch_bytes(worldbank_page_url(target, p)).decode("utf-8")))
                df = pd.DataFrame(worldbank_columns(docs))
            else:
                doc = _json.loads(_fetch_bytes(dbnomics_data_url(target)).decode("utf-8"))
                df = pd.DataFrame(dbnomics_columns(doc))
            return df[list(columns)] if columns else df
        if kind in ("pxweb", "eurostat"):
            if not table:
                raise ValueError(kind + "-kilder krever tabell-id: kilde.read('05839')")
            qs = []
            for k, v in query.items():
                if isinstance(v, dict):
                    qs += [str(k) + "[" + str(dk) + "]=" + str(dv) for dk, dv in v.items()]
                else:
                    qs.append(str(k) + "=" + str(v))
            target = self.url.rstrip("/") + "/" + str(table) + (("?" + "&".join(qs)) if qs else "")
            du = eurostat_data_url(target) if kind == "eurostat" else data_url(target)
            ds = _json.loads(_fetch_bytes(du).decode("utf-8"))
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


def create(key, name=None, how="left"):
    """Lag et tomt datasett med deklarert nøkkel — bygg det med add()."""
    return Dataset(key, name=name, how=how)


def datasets():
    """Navnregisteret over Dataset-objekter bygget i denne økten."""
    return dict(_DATASETS)
