# brython/tests/test_ost_core.py — mini-ost (r-factor-runden §4). Kjøres
# under CPython: pandas = pandas_brython (evt. pandas_mpy for js-hooken,
# se _install), browser/js = stubber, PxWeb = stub med Task 1-strengkontrakten.
import json
import sys
import types
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "brython"))
sys.path.insert(0, str(ROOT / "micropython"))
sys.path.insert(0, str(ROOT / "shared"))

TSV = "Region\x1fdim\x1f11\x1f31\nTid\x1ftime\x1f2023\x1f2024"

# Testene her omdirigerer sys.modules['pandas'] (og browser/js/ost_core)
# midlertidig for å simulere motorens dialektskifte. Uten opprydding lekker
# mini-pandas ut som 'pandas' til RESTEN av pytest-økten (samme prosess) —
# tests/test_openstat.py o.l. bruker ekte pandas og feilet stille av dette
# under rød/grønn-utviklingen (målt: 35 uventede feil andre steder i
# suiten). Snapshot/gjenopprett rundt HVER test i denne filen.
_SNAPSHOT_KEYS = ("pandas", "pandas_brython", "pandas_mpy", "browser", "js", "ost_core")


@pytest.fixture(autouse=True)
def _restore_sys_modules():
    saved = {k: sys.modules.get(k) for k in _SNAPSHOT_KEYS}
    yield
    for k, v in saved.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v


def _install(responses, tsv=TSV, hook="__brythonFetchSync"):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    px = types.SimpleNamespace(
        metaUrlFor=lambda u: "https://meta.example/js2" if "tables/" in u else "",
        typemetaTsvFromText=lambda t: tsv)
    win = types.SimpleNamespace(PxWeb=px)
    setattr(win, hook, fetch_sync)
    mod = types.ModuleType("browser")
    mod.window = win
    sys.modules["browser"] = mod
    sys.modules.pop("pandas", None)
    sys.modules.pop("pandas_brython", None)
    sys.modules.pop("pandas_mpy", None)
    # mpy-varianten må bruke pandas_mpy sin EGEN URL-bro (den bruker 'js',
    # ikke 'browser' — pandas_brython sin bro er hardkodet mot 'browser' og
    # ville feilet i test_mpy_hook_varianten der 'browser' fjernes). Målt
    # under rød-fasen; se task-5-report.md.
    if hook == "__mpyFetchSync":
        import pandas_mpy as _pd_dobbel
    else:
        import pandas_brython as _pd_dobbel
    sys.modules["pandas"] = _pd_dobbel
    sys.modules.pop("ost_core", None)
    import ost_core
    return ost_core, calls


CSV_URL = "https://x.example/tables/05839/data?outputFormat=csv"
DATA = {"text": "Region,Tid,value\n11,2023,1\n31,2024,2\n"}
META = {"text": "{}"}


def test_read_csv_convert_typer_dims_og_time():
    ost, calls = _install({CSV_URL: DATA, "https://meta.example/js2": META})
    df = ost.read_csv(CSV_URL)
    assert str(df["Region"].dtype) == "category"
    assert list(df["Tid"]) == [2023, 2024]
    assert calls == [CSV_URL, "https://meta.example/js2"]


def test_read_csv_convert_false_er_naken():
    ost, calls = _install({CSV_URL: DATA})
    df = ost.read_csv(CSV_URL, convert=False)
    assert str(df["Region"].dtype) != "category"
    assert calls == [CSV_URL]          # metadata hentes ikke engang


def test_read_csv_best_effort_hopper_ved_verdier_utenfor_kodene():
    ost, _ = _install({CSV_URL: {"text": "Region,Tid,value\n99,2023,1\n"},
                       "https://meta.example/js2": META})
    df = ost.read_csv(CSV_URL)
    assert str(df["Region"].dtype) != "category"    # 99 ∉ {11, 31} -> urørt


def test_read_csv_metadatafeil_gir_utypet_ikke_kast():
    ost, _ = _install({CSV_URL: DATA})               # meta-URL svarer error
    df = ost.read_csv(CSV_URL)
    assert list(df.columns) == ["Region", "Tid", "value"]


def test_read_csv_ukjent_url_ren_passthrough():
    url = "https://x.example/plain.csv"
    ost, calls = _install({url: DATA})
    df = ost.read_csv(url)
    assert str(df["Region"].dtype) != "category"
    assert calls == [url]


def test_convert_dtypes_krever_meta():
    ost, _ = _install({})
    import pytest
    with pytest.raises(ValueError, match="krever meta="):
        ost.convert_dtypes(object())


def test_pending_propagerer():
    ost, _ = _install({CSV_URL: {"pending": True}})
    try:
        ost.read_csv(CSV_URL)
        assert False, "skulle reist pending"
    except BaseException as e:
        assert getattr(type(e), "__brython_pending__", False)


def test_mpy_hook_varianten():
    sys.modules.pop("browser", None)
    ost, calls = _install({CSV_URL: DATA, "https://meta.example/js2": META}, hook="__mpyFetchSync")
    # _install la stubben i browser-modulen; mpy-veien går via js-modulen:
    js = types.ModuleType("js")
    js.PxWeb = sys.modules["browser"].window.PxWeb
    js.__mpyFetchSync = getattr(sys.modules["browser"].window, "__mpyFetchSync")
    sys.modules["js"] = js
    del sys.modules["browser"]
    sys.modules.pop("ost_core", None)
    import ost_core
    df = ost_core.read_csv(CSV_URL)
    assert str(df["Region"].dtype) == "category"
    del sys.modules["js"]
