"""Høsteskriptets rene funksjoner + formatvalidering av committet katalog."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from harvest_owid_catalog import rens_chart

CATALOG = pathlib.Path(__file__).resolve().parents[1] / "data" / "owid-catalog.json"


def test_rens_chart_beholder_gyldig_rad():
    row = {"slug": "life-expectancy", "title": "Life expectancy at birth", "subtitle": "How long people live."}
    c = rens_chart(row)
    assert c == {"slug": "life-expectancy", "title": "Life expectancy at birth", "subtitle": "How long people live."}


def test_rens_chart_dropper_rad_uten_slug():
    assert rens_chart({"slug": None, "title": "Tittel", "subtitle": None}) is None
    assert rens_chart({"slug": "", "title": "Tittel", "subtitle": None}) is None


def test_rens_chart_dropper_rad_uten_tittel():
    assert rens_chart({"slug": "en-slug", "title": None, "subtitle": None}) is None
    assert rens_chart({"slug": "en-slug", "title": "  ", "subtitle": None}) is None


def test_rens_chart_null_subtitle_forblir_null():
    c = rens_chart({"slug": "en-slug", "title": "En tittel", "subtitle": None})
    assert c["subtitle"] is None


def test_rens_chart_klipper_lang_subtitle_til_200_tegn():
    c = rens_chart({"slug": "en-slug", "title": "En tittel", "subtitle": "x" * 500})
    assert len(c["subtitle"]) == 200


def test_committet_katalog_er_gyldig_og_under_1_5mb():
    assert CATALOG.exists(), "kjør tools/harvest_owid_catalog.py"
    assert CATALOG.stat().st_size < 1_500_000
    d = json.loads(CATALOG.read_text())
    assert set(d) == {"charts", "_provenance"}
    charts = d["charts"]
    assert 4000 < len(charts) < 5000
    sample = charts[0]
    assert set(sample) == {"slug", "title", "subtitle"}
    assert set(d["_provenance"]) >= {"source_url", "fetched_at"}
    # kjent chart som søk (Task 3) er avhengig av
    assert any(c["slug"] == "life-expectancy" for c in charts)
