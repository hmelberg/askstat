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
    # rekkefølgeflipp (mini-knippet §2, R-tvilling-mønsteret): typemeta hentes
    # FØR CSV-en parses, slik at dims kan få dtype=str-vern VED parse
    # (0301-vernet er umulig etterpå — tallet har alt mistet den ledende
    # nullen). Metadata-kallet kommer derfor FØR CSV-kallet nå, motsatt av
    # den gamle rekkefølgen.
    assert calls == ["https://meta.example/js2", CSV_URL]


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
    with pytest.raises(ValueError, match="krever meta="):
        ost.convert_dtypes(object())


def test_read_csv_nan_hull_i_dim_blir_likevel_category():
    # py-dropna-paritet (openstat.py:276): NaN teller ALDRI som en verdi
    # utenfor kodene. Tomt CSV-felt i en tallkolonne blir mini-pandas sin
    # nan-sentinel — de øvrige verdiene (11 ⊆ {11, 31}) skal fortsatt gi
    # category, ikke stille passthrough via "verdier utenfor kodene"-grenen.
    ost, _ = _install({CSV_URL: {"text": "Region,Tid,value\n11,2023,1\n,2024,2\n"},
                       "https://meta.example/js2": META})
    df = ost.read_csv(CSV_URL)
    assert str(df["Region"].dtype) == "category"


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


def test_read_csv_time_kvartalskoder_ordered_i_kildens_orden():
    # Låser valmap/ordered-mekanismen fra fiksrunden: ikke-heltallige
    # tidskoder -> CategoricalDtype i KILDENS orden (2024K1 foran 2023K4 —
    # alfabetisk/dataorden ville gitt motsatt) med ordered=True.
    # sort_values-asserten (fjernet da denne testen ble skrevet fordi
    # DataFrame.sort_values den gang konsulterte IKKE _cats — den hentet
    # sorteringsserien via .loc[:, by], som ikke hekter _cat på, i motsetning
    # til bracket-aksessoren df[col]) er nå lagt inn igjen: mini-knippet §1
    # fikset akkurat det.
    tsv = "Tid\x1ftime\x1f2024K1\x1f2023K4"
    ost, _ = _install({CSV_URL: {"text": "Tid,value\n2023K4,1\n2024K1,2\n"},
                       "https://meta.example/js2": META}, tsv=tsv)
    df = ost.read_csv(CSV_URL)
    assert str(df["Tid"].dtype) == "category"
    cat = df._cats["Tid"]
    assert list(cat.categories) == ["2024K1", "2023K4"]
    assert cat.ordered
    s = df.sort_values(by="Tid")
    assert list(s["Tid"]) == ["2024K1", "2023K4"]


# ── mini-knippet §2: dtype-vern ved parse (0301) + bruker-dtype vinner ─────

def test_read_csv_0301_vern_ved_parse():
    # Uten vernet ville "0301" blitt tallet 301 under CSV-parsingen, og
    # best-effort-sjekken (301 ∉ {"0301","0302"}) ville hoppet Kommune over
    # — akkurat den nå-lukkede begrensningen (docstring-noten er fjernet).
    tsv = "Kommune\x1fdim\x1f0301\x1f0302"
    ost, _ = _install({CSV_URL: {"text": "Kommune,value\n0301,1\n0302,2\n"},
                       "https://meta.example/js2": META}, tsv=tsv)
    df = ost.read_csv(CSV_URL)
    assert str(df["Kommune"].dtype) == "category"
    assert list(df["Kommune"]) == ["0301", "0302"]


def test_read_csv_bruker_skalar_dtype_ingen_vern():
    # "skalar bruker-dtype -> intet vern": spy på pd.read_csv for å se
    # NØYAKTIG hva som sendes videre — en skalar dtype dekker alt selv og
    # skal IKKE bli om til et vern-dict.
    ost, _ = _install({CSV_URL: DATA, "https://meta.example/js2": META})
    captured = {}
    orig = ost.pd.read_csv

    def spy(url, **kwargs):
        captured.update(kwargs)
        return orig(url, **kwargs)
    ost.pd.read_csv = spy
    try:
        ost.read_csv(CSV_URL, dtype=str)
    finally:
        ost.pd.read_csv = orig
    assert captured.get("dtype") is str, captured


def test_read_csv_bruker_dict_dtype_vinner_vern_fyller_resten():
    # Tre gjenkjente kolonner (Region, Kommune, Tid — inkl. tidsdimensjonen:
    # py-tvillingens vern dekker tm["dims"] i sin helhet, se ost_core-
    # docstringen). Brukeren nevner bare Kommune (med en annen gyldig
    # markør enn vernets str) -> vernet fyller likevel inn Region OG Tid
    # (ikke nevnt av brukeren), mens Kommune bruker BRUKERENS verdi. Tid
    # types uansett til int64 til slutt (_apply), så str-vern der endrer
    # ikke sluttresultatet.
    tsv = ("Region\x1fdim\x1f11\x1f31\n"
           "Kommune\x1fdim\x1f0301\x1f0302\n"
           "Tid\x1ftime\x1f2023\x1f2024")
    ost, _ = _install({CSV_URL: {"text": "Region,Kommune,Tid,value\n11,0301,2023,1\n"},
                       "https://meta.example/js2": META}, tsv=tsv)
    captured = {}
    orig = ost.pd.read_csv

    def spy(url, **kwargs):
        captured.update(kwargs)
        return orig(url, **kwargs)
    ost.pd.read_csv = spy
    try:
        df = ost.read_csv(CSV_URL, dtype={"Kommune": "object"})
    finally:
        ost.pd.read_csv = orig
    assert captured.get("dtype") == {"Region": str, "Kommune": "object", "Tid": str}, captured
    assert list(df["Tid"]) == [2023]          # str-vern på Tid -> likevel int64 til slutt


# ── mini-knippet §4: dict-meta i convert_dtypes ────────────────────────────

def test_convert_dtypes_dict_meta_ingen_pxweb_rundtur():
    ost, calls = _install({})
    df = ost.pd.DataFrame({"Region": ["11", "31"], "Tid": [2023, 2024]})
    meta = {"dims": {"Region": {"categories": ["11", "31"]},
                     "Tid": {"categories": ["2023", "2024"]}},
            "time": ["Tid"]}
    out = ost.convert_dtypes(df, meta=meta)
    assert str(out["Region"].dtype) == "category"
    assert list(out["Tid"]) == [2023, 2024]
    assert calls == []          # ingen PxWeb-rundtur for dict-meta


def test_convert_dtypes_url_form_uendret():
    ost, calls = _install({"https://meta.example/js2": META})
    df = ost.pd.DataFrame({"Region": ["11", "31"], "value": [1, 2]})
    out = ost.convert_dtypes(df, meta=CSV_URL)
    assert str(out["Region"].dtype) == "category"
    assert calls == ["https://meta.example/js2"]


def test_convert_dtypes_annet_gir_fortsatt_valueerror():
    ost, _ = _install({})
    with pytest.raises(ValueError):
        ost.convert_dtypes(object(), meta=123)
