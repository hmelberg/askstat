# tests/test_openstat.py — openstat.py (ring 1: CPython-veien). Kontrakts-
# paritet med js/pxweb.js håndheves via delt fixture
# (tests/fixtures/pxweb_dataset.json — leses også av tests/js/pxweb.test.js).
import json
import pathlib
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import openstat as ost

FIX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "pxweb_dataset.json").read_text())


def test_data_url_defaults():
    assert ost.data_url("https://x/tables/05839") == \
        "https://x/tables/05839/data?lang=no&outputFormat=json-stat2"


def test_data_url_bevarer_query_og_overstyrer_outputformat():
    assert ost.data_url("https://x/tables/05839?valueCodes[Tid]=2020,2021&lang=en&outputFormat=csv") == \
        "https://x/tables/05839/data?valueCodes[Tid]=2020,2021&lang=en&outputFormat=json-stat2"


def test_metadata_url():
    assert ost.metadata_url("https://x/tables/05839") == "https://x/tables/05839/metadata?lang=no"
    assert ost.metadata_url("https://x/tables/05839?lang=en") == "https://x/tables/05839/metadata?lang=en"


def test_columns_from_jsonstat_row_major():
    cols = ost.columns_from_jsonstat(FIX)
    assert list(cols) == ["Kjonn", "Tid", "ContentsCode", "value"]
    assert cols["Kjonn"] == ["1", "1", "2", "2"]
    assert cols["Tid"] == ["2020", "2021", "2020", "2021"]
    assert cols["ContentsCode"] == ["Personer"] * 4
    assert cols["value"] == [10, 11, 20, 21]


def test_columns_from_jsonstat_sparse_verdi_objekt():
    fx = dict(FIX)
    fx["value"] = {"0": 10, "3": 21}
    assert ost.columns_from_jsonstat(fx)["value"] == [10, None, None, 21]


def test_eurostat_data_url():
    assert ost.eurostat_data_url("https://x/data/nama_10_gdp") == "https://x/data/nama_10_gdp?lang=en&format=JSON"
    assert ost.eurostat_data_url("https://x/data/tab?geo=NO&format=csv") == "https://x/data/tab?lang=en&geo=NO&format=JSON"


def test_connect_read_eurostat(monkeypatch):
    calls = []

    def fake(url):
        calls.append(url)
        return json.dumps(FIX).encode()

    monkeypatch.setattr(ost, "_fetch_bytes", fake)
    eu = ost.connect("https://x/data", kind="eurostat")
    df = eu.read("nama_10_gdp", geo="NO")
    assert calls == ["https://x/data/nama_10_gdp?lang=en&geo=NO&format=JSON"]
    assert df.shape == (4, 4)


def test_connect_read_pxweb(monkeypatch):
    calls = []

    def fake(url):
        calls.append(url)
        return json.dumps(FIX).encode()

    monkeypatch.setattr(ost, "_fetch_bytes", fake)
    ssb = ost.connect("https://x/tables", kind="pxweb")
    df = ssb.read("05839", valueCodes={"Tid": "*"})
    assert calls == ["https://x/tables/05839/data?lang=no&valueCodes[Tid]=*&outputFormat=json-stat2"]
    assert df.shape == (4, 4)
    assert list(df.columns) == ["Kjonn", "Tid", "ContentsCode", "value"]


def test_pxweb_krever_tabell(monkeypatch):
    with pytest.raises(ValueError):
        ost.connect("https://x/tables", kind="pxweb").read()


def test_read_csv_med_columns_subset(monkeypatch):
    monkeypatch.setattr(ost, "_fetch_bytes", lambda url: b"a,b,c\n1,2,3\n4,5,6\n")
    df = ost.read("https://x/f.csv", columns=["a", "c"])
    assert list(df.columns) == ["a", "c"]
    assert df.shape == (2, 2)


def test_create_add_composite_key():
    a = pd.DataFrame({"k1": [1, 1], "k2": [1, 2], "x": [10, 20]})
    b = pd.DataFrame({"k1": [1, 1], "k2": [1, 2], "y": [7, 8]})
    d = ost.create(key=["k1", "k2"], name="panel_test")
    d.add(a, "x").add(b, "y")
    df = d.frame()
    assert list(df.columns) == ["k1", "k2", "x", "y"]
    assert df.shape == (2, 4)
    assert "panel_test" in ost.datasets()


def test_create_add_fra_kilde(monkeypatch):
    monkeypatch.setattr(ost, "_fetch_bytes", lambda url: b"k,x,ekstra\n1,10,99\n2,20,98\n")
    src = ost.connect("https://x/g.csv", kind="csv")
    d = ost.create(key="k")
    d.add(src, "x")
    assert list(d.frame().columns) == ["k", "x"]


def test_create_tomt_frame_feiler():
    with pytest.raises(ValueError):
        ost.create(key=["k"]).frame()
