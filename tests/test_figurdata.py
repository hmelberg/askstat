"""Figurdata-utskriften (R11-C, Hans' alternativ 1, 2026-08-17): print-gap
var rundens dominerende klasse (5/8) — modellen behandler figuren som
utskriften, men aksene bærer ikke tallene, og kontrakten «alle svar-tall
finnes i output» sto tom for figur-svar. Miljøkuren: motoren printer selv
figurens EGNE datapunkter (fig.data-traces) kompakt før embedden — én
vern-vennlig «etikett verdi»-linje per punkt, med tak og hode/hale-kutt.
Tekst-regelen (regel 10-skjerpingen) består som belte; dette er selene.

Tester den EKTE _m2py_figurdata_utskrift hentet ut av index.html (samme
mønster som test_ts_vakt)."""
import pathlib

import plotly.graph_objects as go

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"


def _last_utskrift():
    text = INDEX.read_text(encoding="utf-8")
    start = text.index("def _m2py_figurdata_utskrift(")
    end = text.index("def _m2py_ts_vakt(", start)
    src = text[start:end].replace("\\\\", "\\")
    ns = {}
    exec(compile(src, "<index.html:_m2py_figurdata_utskrift>", "exec"), ns)
    return ns["_m2py_figurdata_utskrift"]


def test_soylediagram_gir_etikett_verdi_linjer():
    f = _last_utskrift()
    fig = go.Figure(go.Bar(x=["Texas", "California", "Florida"], y=[4481, 4407, 3548]))
    ut = f(fig)
    assert ut is not None and "Figurdata" in ut
    linjer = ut.split("\n")
    assert any("Texas" in l and "4481" in l for l in linjer)
    assert any("Florida" in l and "3548" in l for l in linjer)


def test_navngitte_tidsserier_prefikses_og_kuttes():
    f = _last_utskrift()
    aar = list(range(1960, 2027))          # 67 punkter
    verdier = [600000 + i * 2000 for i in range(len(aar))]
    fig = go.Figure(go.Scatter(x=aar, y=verdier, name="Oslo"))
    ut = f(fig)
    linjer = [l for l in ut.split("\n") if "Oslo" in l]
    # hode+hale, aldri alle 67
    assert 10 <= len(linjer) <= 20
    assert any("1960" in l and "600000" in l for l in linjer)
    assert any("2026" in l for l in linjer)
    assert "punkter utelatt" in ut


def test_flyttall_formateres_uten_e_notasjon_og_uten_stoyende_nuller():
    f = _last_utskrift()
    fig = go.Figure(go.Bar(x=["NO", "SE"], y=[5594340.0, 10.35]))
    ut = f(fig)
    assert "5594340" in ut and "5.59434e" not in ut
    assert "10.35" in ut and "10.3500" not in ut


def test_ikke_numerisk_y_hoppes_over_og_tom_figur_gir_none():
    f = _last_utskrift()
    fig = go.Figure(go.Scatter(x=[1, 2], y=["a", "b"]))
    assert f(fig) is None
    assert f(go.Figure()) is None
    assert f("ikke en figur") is None


def test_radtak_over_flere_traces():
    f = _last_utskrift()
    fig = go.Figure()
    for navn in ("a1", "b2", "c3", "d4", "e5"):
        fig.add_trace(go.Scatter(x=list(range(30)), y=list(range(30)), name=navn))
    ut = f(fig)
    datalinjer = [l for l in ut.split("\n") if l and "Figurdata" not in l]
    assert len(datalinjer) <= 46  # 40 punktlinjer + utelatt-markører
