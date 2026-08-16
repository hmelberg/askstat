"""Datetime-i-value-vakta (kodesak R6-B, eval-runde 6 2026-08-16): målt at
modellgenerert pivot/merge-kode kan lekke datetime64→int64-nanosekunder inn
i verdikolonnen (Sverige 4.5e17 i une_rt_m-svaret) — DATALAGET er målt rent
(full une_rt_m-uttrekk: max 600), så vakta bor ved VISNINGSGRENSEN
(_show_one) og flagger, aldri blokkerer. Vinduet [1e16, 5e18) er ns-epoker
etter ~april 1970; reelle statistikkverdier når ~1e14 (verdens-BNP) og
skal IKKE flagges — lav falsk-positiv-rate er vaktas levevilkår (samme
prinsipp som rangeringsvernet).

Tester den EKTE _m2py_ts_vakt hentet ut av index.html, samme
utpakkingsmønster som test_display_policy.py."""
import pathlib

import pandas as pd

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"


def _load_vakt():
    text = INDEX.read_text(encoding="utf-8")
    start = text.index("def _m2py_ts_vakt(")
    end = text.index("def _show_one(", start)
    src = text[start:end].replace("\\\\", "\\")
    ns = {}
    exec(compile(src, "<index.html:_m2py_ts_vakt>", "exec"), ns)
    return ns["_m2py_ts_vakt"]


def test_flagger_ns_timestamp_i_dataframe_verdikolonne():
    vakt = _load_vakt()
    df = pd.DataFrame({
        "geo": ["SE", "DK"],
        "ledighetsrate": [450148024712516928.0, 13.2],
    })
    advarsel = vakt(df)
    assert advarsel is not None
    assert "ledighetsrate" in advarsel
    assert "datetime" in advarsel


def test_flagger_ikke_rene_statistikkverdier():
    vakt = _load_vakt()
    # verdens-BNP-størrelsesorden (~1.05e14 USD) er en EKTE verdi og skal
    # ikke flagges — grensen ligger på 1e16
    df = pd.DataFrame({"geo": ["WLD"], "gdp": [1.05e14], "rate": [7.3]})
    assert vakt(df) is None


def test_flagger_series():
    vakt = _load_vakt()
    s = pd.Series([1.7e18, 2.0], name="value")
    advarsel = vakt(s)
    assert advarsel is not None
    assert "value" in advarsel


def test_ekte_datetimekolonner_flagges_ikke():
    vakt = _load_vakt()
    # en datetime64-kolonne VISES som datoer — ufarlig; kun numeriske
    # kolonner med ns-magnitude er lekkasje-signalet
    df = pd.DataFrame({
        "time": pd.to_datetime(["2026-01-01", "2026-02-01"]),
        "value": [7.3, 7.4],
    })
    assert vakt(df) is None


def test_tom_og_ikke_pandas_gir_none():
    vakt = _load_vakt()
    assert vakt(pd.DataFrame()) is None
    assert vakt("en streng") is None
    assert vakt(None) is None


def test_flagger_plotly_figur_med_ns_verdier():
    import plotly.graph_objects as go
    vakt = _load_vakt()
    fig = go.Figure(go.Bar(x=["SE", "DK"], y=[4.5e17, 13.2]))
    advarsel = vakt(fig)
    assert advarsel is not None
    assert "datetime" in advarsel


def test_flagger_ikke_ren_plotly_figur():
    import plotly.graph_objects as go
    vakt = _load_vakt()
    fig = go.Figure(go.Bar(x=["SE", "DK"], y=[7.9, 13.2]))
    assert vakt(fig) is None
