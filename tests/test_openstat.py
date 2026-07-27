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


# ── api-kinds (spec 2026-07-25-api-kinds-design §1): paritet med
# js/api-kinds.js — samme delte fixtures som tests/js/api-kinds.test.js,
# samme forventede tall begge steder ER kontrakten. ─────────────────────────

WB_FIX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "worldbank_response.json").read_text())
DBN_FIX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "dbnomics_response.json").read_text())


def test_kind_alias_normaliseres():
    assert ost._KIND_ALIAS["oecd"] == "sdmx"
    assert ost._KIND_ALIAS["norgesbank"] == "sdmx"
    assert ost._KIND_ALIAS["worldbank"] == "worldbank"


def test_sdmx_urler_paritet():
    assert ost.sdmx_fallback_url("https://x/data/EXR/all?format=csvfile") == "https://x/data/EXR/all?format=csvdata"
    assert ost.SDMX_ACCEPT == "application/vnd.sdmx.data+csv;labels=id"


def test_worldbank_urler_paritet():
    assert (ost.worldbank_data_url("https://api.worldbank.org/v2/country/NOR/indicator/NY.GDP.MKTP.CD?date=2015:2024")
            == "https://api.worldbank.org/v2/country/NOR/indicator/NY.GDP.MKTP.CD?date=2015:2024&per_page=20000&format=json")
    assert (ost.worldbank_page_url("https://x/v2/country/NOR/indicator/A?date=2015:2024", 3)
            == "https://x/v2/country/NOR/indicator/A?date=2015:2024&per_page=20000&format=json&page=3")


def test_worldbank_meta_og_feilform():
    assert ost.worldbank_meta(WB_FIX["page1"]) == {"pages": 2, "total": 7}
    with pytest.raises(ValueError, match="Invalid value"):
        ost.worldbank_meta(WB_FIX["error"])


def test_worldbank_columns_paritet():
    cols = ost.worldbank_columns([WB_FIX["page1"], WB_FIX["page2"]])
    assert list(cols) == ["indicator", "country", "countryiso3code", "date", "value"]
    assert len(cols["value"]) == 7
    assert cols["indicator"][0] == "NY.GDP.MKTP.CD"
    assert cols["country"][0] == "NO"
    assert cols["date"][0] == "2024"
    assert cols["value"][0] == 500886328034.123
    assert cols["value"][6] is None


def test_dbnomics_paritet():
    assert (ost.dbnomics_data_url("https://x/v22/series/A/B/C?observations=0&limit=5")
            == "https://x/v22/series/A/B/C?limit=5&observations=1")
    cols = ost.dbnomics_columns(DBN_FIX["ok"])
    assert list(cols) == ["series_code", "unit", "weo-country", "weo-subject", "period", "value"]
    assert len(cols["series_code"]) == 6
    assert cols["weo-country"][0] == "NOR"
    assert cols["weo-country"][3] == "SWE"
    assert cols["value"][0] == 2.058
    assert cols["value"][2] is None
    with pytest.raises(ValueError, match="1500 serier"):
        ost.dbnomics_columns(DBN_FIX["overflow"])


def test_connect_read_worldbank(monkeypatch):
    calls = []

    def fake(url, headers=None):
        calls.append(url)
        # NB: "&page=" — bare "page=" matcher også per_page=20000!
        return json.dumps(WB_FIX["page2"] if "&page=" in url else WB_FIX["page1"]).encode()

    monkeypatch.setattr(ost, "_fetch_bytes", fake)
    wb = ost.connect("https://api.worldbank.org/v2", kind="worldbank")
    df = wb.read("country/NOR/indicator/NY.GDP.MKTP.CD", date="2015:2024")
    assert calls[0] == "https://api.worldbank.org/v2/country/NOR/indicator/NY.GDP.MKTP.CD?date=2015:2024&per_page=20000&format=json"
    assert "&page=2" in calls[1]
    assert df.shape == (7, 5)


def test_connect_read_sdmx_accept_og_fallback(monkeypatch):
    calls = []

    def fake(url, headers=None):
        calls.append((url, headers))
        if headers and "Accept" in headers:
            raise RuntimeError("HTTP 406 for " + url)   # ECB-veien
        return b"KEY,FREQ,TIME_PERIOD,OBS_VALUE\nEXR.D.USD,D,2026-07-20,1.1426\n"

    monkeypatch.setattr(ost, "_fetch_bytes", fake)
    ecb = ost.connect("https://data-api.ecb.europa.eu/service/data", kind="ecb")
    df = ecb.read("EXR/D.USD.EUR.SP00.A", startPeriod="2026-07-20")
    assert calls[0][1] == {"Accept": ost.SDMX_ACCEPT}
    assert calls[1][0].endswith("format=csvdata")
    assert df.shape == (1, 4)
    assert list(df.columns) == ["KEY", "FREQ", "TIME_PERIOD", "OBS_VALUE"]


# ── kanonisk vokabular fase 2 (spec §3): paritet med translateCanonical
# og sdmx-headerintrospeksjonen i JS — samme fixtures, samme feiltekster. ────

HDR_FIX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "sdmx_headers.json").read_text())


def test_sdmx_key_dims_alle_tre_prefiksformene():
    assert len(ost.sdmx_key_dims(HDR_FIX["oecd"])) == 13
    assert ost.sdmx_key_dims(HDR_FIX["oecd"])[0] == "REF_AREA"
    assert ost.sdmx_key_dims(HDR_FIX["nb"]) == ["FREQ", "BASE_CUR", "QUOTE_CUR", "TENOR"]
    assert ost.sdmx_key_dims(HDR_FIX["ecb"]) == ["FREQ", "CURRENCY", "CURRENCY_DENOM", "EXR_TYPE", "EXR_SUFFIX"]
    assert ost.sdmx_key_dims("A,B,C") == []


def test_sdmx_key_path_paritet():
    dims = ost.sdmx_key_dims(HDR_FIX["oecd"])
    assert ost.sdmx_key_path(dims, {"countries": ["NOR", "SWE"]}) == "NOR+SWE" + "." * 12
    ecb = ost.sdmx_key_dims(HDR_FIX["ecb"])
    assert ost.sdmx_key_path(ecb, {"filters": {"CURRENCY": "USD", "FREQ": "D"}}) == "D.USD..."
    with pytest.raises(ValueError, match="ingen REF_AREA"):
        ost.sdmx_key_path(ecb, {"countries": ["NOR"]})


def test_translate_canonical_worldbank_og_eurostat():
    rest, params, _, _ = ost._translate_canonical(
        "worldbank", "", {"indicators": ["NY.GDP.MKTP.CD"], "countries": ["NOR", "SWE"],
                          "years": {"from": "2015", "to": "2024"}})
    assert rest == "country/NOR;SWE/indicator/NY.GDP.MKTP.CD"
    assert params == ["date=2015:2024"]
    with pytest.raises(ValueError, match="én form"):
        ost._translate_canonical("worldbank", "country/NOR/indicator/A", {"indicators": ["B"]})
    _, ep, _, _ = ost._translate_canonical(
        "eurostat", "nama_10_gdp", {"countries": ["NO", "SE"], "years": {"from": "2020", "to": None},
                                    "filters": {"na_item": "B1GQ"}})
    assert "geo=NO" in ep and "geo=SE" in ep and "sinceTimePeriod=2020" in ep and "na_item=B1GQ" in ep


def test_translate_canonical_pxweb_aar():
    _, p1, _, _ = ost._translate_canonical("pxweb", "05839", {"years": {"from": "2007", "to": "2009"}})
    assert p1 == ["valueCodes[Tid]=2007,2008,2009"]
    _, p2, _, _ = ost._translate_canonical("pxweb", "05839", {"years": {"from": "2007", "to": None}})
    assert p2 == ["valueCodes[Tid]=from(2007)"]
    with pytest.raises(ValueError, match="startår"):
        ost._translate_canonical("pxweb", "05839", {"years": {"from": None, "to": "2009"}})


def test_read_sdmx_kanonisk_med_introspeksjon(monkeypatch):
    calls = []

    def fake(url, headers=None):
        calls.append(url)
        if "lastNObservations=1" in url:
            return (HDR_FIX["oecd"] + "\nOECD.X:Y(1.1),COL,A,LFEXP,Y,Y0,M,_Z,_Z,_Z,_Z,_Z,_Z,_Z,2023,73.8,1,,,,0\n").encode()
        return ("DATAFLOW,REF_AREA,TIME_PERIOD,OBS_VALUE\nX:Y(1.1),NOR,2023,84.2\n").encode()

    monkeypatch.setattr(ost, "_fetch_bytes", fake)
    o = ost.connect("https://sdmx.oecd.org/public/rest/data", kind="oecd")
    df = o.read("OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE", countries=["NOR", "SWE"], years="2020:2023")
    assert "/all?lastNObservations=1" in calls[0]
    assert "/NOR+SWE" + "." * 12 + "?" in calls[1]
    assert "startPeriod=2020" in calls[1] and "endPeriod=2023" in calls[1]
    assert df.shape == (1, 4)


def test_read_dbnomics_kanonisk_aarsfilter(monkeypatch):
    monkeypatch.setattr(ost, "_fetch_bytes",
                        lambda url, headers=None: json.dumps(DBN_FIX["ok"]).encode())
    dbn = ost.connect("https://api.db.nomics.world/v22/series", kind="dbnomics")
    df = dbn.read("IMF/WEO:latest/NOR.NGDP_RPCH", years="2025:2026")
    assert list(df["period"]) == ["2025", "2026", "2025", "2026"]


def test_dataset_join_merges_on_explicit_key():
    a = pd.DataFrame({"k": [1, 2], "x": [10, 20]})
    b = pd.DataFrame({"k": [1, 2], "y": [7, 8]})
    d = ost.create(key="k")
    d.add(a, "x")
    d.join(b, on="k")
    out = d.frame()
    assert list(out.columns) == ["k", "x", "y"]
    assert out["y"].tolist() == [7, 8]


def test_dataset_join_how_outer():
    a = pd.DataFrame({"k": [1, 2], "x": [10, 20]})
    b = pd.DataFrame({"k": [2, 3], "y": [8, 9]})
    d = ost.create(key="k")
    d.add(a, "x").join(b, on="k", how="outer")
    assert len(d.frame()) == 3


def test_dataset_join_uten_add_feiler():
    d = ost.create(key="k")
    with pytest.raises(ValueError, match="add"):
        d.join(pd.DataFrame({"k": [1]}), on="k")


def test_dataset_join_manglende_noekkelkolonne_navngir_siden():
    d = ost.create(key="k")
    d.add(pd.DataFrame({"k": [1], "x": [1]}), "x")
    with pytest.raises(ValueError, match="høyre"):
        d.join(pd.DataFrame({"annet": [1]}), on="k")


def test_create_format_leveres_ikke_bare_lagres():
    import polars
    frame = pd.DataFrame({"k": [1], "x": [2]})
    assert isinstance(ost.create(key="k", format="pandas").add(frame, "x").frame(), pd.DataFrame)
    assert isinstance(ost.create(key="k", format="polars").add(frame, "x").frame(), polars.DataFrame)
    assert hasattr(ost.create(key="k", format="duckdb").add(frame, "x").frame(), "df")


def test_create_format_r_only_og_ukjent_feiler():
    frame = pd.DataFrame({"k": [1], "x": [2]})
    with pytest.raises(ValueError, match="R-modus"):
        ost.create(key="k", format="tibble").add(frame, "x").frame()
    with pytest.raises(ValueError, match="ukjent format"):
        ost.create(key="k", format="arrow").add(frame, "x").frame()


def test_editor_only_kwargs_are_rejected_loudly():
    src = ost.connect("https://x/d.csv", kind="csv")
    for bad in ("secret_key", "key", "exec", "cache"):
        with pytest.raises(ValueError, match=bad):
            src.read(**{bad: "ask"})


def test_source_kwarg_er_ikke_avvist():
    # source= er en ekte World Bank-parameter (?source=<db-id>). Editor-formen
    # er ost.use(navn, source=…), som ikke finnes i pakken.
    src = ost.connect("https://api.worldbank.org/v2", kind="worldbank")
    try:
        src.read("country/NOR/indicator/NY.GDP.MKTP.CD", source="2")
    except ValueError as e:
        assert "editor-argument" not in str(e), e
    except Exception:
        pass          # nettverksfeil er greit — vi tester bare at den slipper vakten


def test_ost_use_feiler_hoeylytt():
    with pytest.raises(ValueError, match="editoren"):
        ost.use("df", source="python")
