# micropython/tests/test_read_csv_url.py — pandas-URL-broen i MicroPython-modus.
import json
import sys
import types
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _install_fake_js(responses):
    calls = []

    def fetch_sync(url):
        calls.append(url)
        return json.dumps(responses.get(url, {"error": "uventet url: " + url}))

    mod = types.ModuleType("js")
    mod.__mpyFetchSync = fetch_sync
    sys.modules["js"] = mod
    return calls


def _fresh_pandas():
    sys.modules.pop("pandas_mpy", None)
    import pandas_mpy
    return pandas_mpy


def test_read_csv_url_bruker_broen():
    _install_fake_js({"https://x.example/iris.csv": {"text": "a,b\n1,2\n3,4"}})
    pd = _fresh_pandas()
    df = pd.read_csv("https://x.example/iris.csv")
    assert df.shape == (2, 2)


def test_read_csv_url_pending_reiser_replay_unntak():
    _install_fake_js({"https://x.example/sen.csv": {"pending": True}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/sen.csv")
        raise AssertionError("skulle reist pending-unntak")
    # _PendingFetch er BaseException (ikke Exception) med vilje — signalet
    # skal overleve brukerkodens `except Exception:`, se _PendingFetch.
    except BaseException as e:
        assert getattr(e, "__brython_pending__", False), e


def test_read_csv_url_http_feil_er_hoylytt():
    _install_fake_js({"https://x.example/borte.csv": {"error": "HTTP 404 for https://x.example/borte.csv"}})
    pd = _fresh_pandas()
    try:
        pd.read_csv("https://x.example/borte.csv")
        raise AssertionError("skulle feilet")
    except ValueError as e:
        assert "HTTP 404" in str(e)
