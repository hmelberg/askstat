# brython/tests/test_read_csv_url.py — pandas-URL-broen i Brython-modus.
# Kjøres under CPython med en fake window.__brythonFetchSync; selve
# nettverket testes i browser-smoken.
import json
import sys
import types
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _install_fake_browser(responses):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    win = types.SimpleNamespace(__brythonFetchSync=fetch_sync)
    mod = types.ModuleType("browser")
    mod.window = win
    sys.modules["browser"] = mod
    return calls


def _fresh_pandas():
    sys.modules.pop("pandas_brython", None)
    import pandas_brython
    return pandas_brython


def test_read_csv_url_bruker_broen():
    _install_fake_browser({"https://x.example/iris.csv": {"text": "a,b\n1,2\n3,4"}})
    pd = _fresh_pandas()
    df = pd.read_csv("https://x.example/iris.csv")
    assert df.shape == (2, 2)
    assert list(df.columns) == ["a", "b"]


def test_read_csv_url_pending_reiser_replay_unntak():
    _install_fake_browser({"https://x.example/sen.csv": {"pending": True}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/sen.csv")
        raise AssertionError("skulle reist pending-unntak")
    except Exception as e:
        assert getattr(e, "__brython_pending__", False), e


def test_read_csv_url_http_feil_er_hoylytt():
    _install_fake_browser({"https://x.example/borte.csv": {"error": "HTTP 404 for https://x.example/borte.csv"}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/borte.csv")
        raise AssertionError("skulle feilet")
    except ValueError as e:
        assert "HTTP 404" in str(e)


def test_read_csv_lokal_sti_er_uendret():
    _install_fake_browser({})
    pd = _fresh_pandas()
    import io
    df = pd.read_csv(io.StringIO("a,b\n1,2"))
    assert df.shape == (1, 2)
