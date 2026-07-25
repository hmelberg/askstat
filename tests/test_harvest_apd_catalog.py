"""Tester for tools/harvest_apd_catalog.py — YAML-normalisering, tarball-
utpakking og livstegn-sjekk. Ingen live nettverk (fetch/reachable_check
injiseres/mockes), jf. prosjektets "aldri live HTTP i tester"-konvensjon."""
import io
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import harvest_apd_catalog as apd

FULL_YAML = b"""\
title: Lemons quality control dataset
homepage: https://github.com/softwaremill/lemon-dataset
category: Agriculture
description: Lemon dataset has been prepared to investigate the possibilities to tackle the issue of fruit quality control. It contains 2690 annotated images.
keywords: fruit, quality, lemon, segmentation
access_level: public
language: en
license: MIT
organization:
  - name: SoftwareMill
    web: https://softwaremill.com/
issued_time: 2020.07
"""

MINIMAL_YAML = b"""\
title: Open Food Facts
homepage: https://world.openfoodfacts.org/
category: Agriculture
"""


def test_normalize_entry_full():
    raw = apd.yaml.safe_load(FULL_YAML)
    entry = apd.normalize_entry("Agriculture", "Lemon-Dataset", raw)
    assert entry["identifier"] == "Agriculture/Lemon-Dataset"
    assert entry["name"] == "Lemons quality control dataset"
    assert entry["url"] == "https://github.com/softwaremill/lemon-dataset"
    assert entry["keywords"] == ["fruit", "quality", "lemon", "segmentation"]
    assert entry["license"] == "MIT"
    assert entry["inLanguage"] == "en"
    assert entry["creator"] == "SoftwareMill"
    assert entry["category"] == "Agriculture"
    assert entry["access_level"] == "public"
    assert entry["distributionUrl"] is None


def test_normalize_entry_minimal_fields_absent_not_crash():
    raw = apd.yaml.safe_load(MINIMAL_YAML)
    entry = apd.normalize_entry("Agriculture", "OpenFoodFacts", raw)
    assert entry["identifier"] == "Agriculture/OpenFoodFacts"
    assert entry["name"] == "Open Food Facts"
    assert entry["keywords"] == []
    assert entry["license"] is None
    assert entry["creator"] is None


def test_description_truncated_at_200_chars():
    long_desc = "x" * 300
    raw = {"title": "T", "homepage": "https://example.com", "category": "Agriculture",
           "description": long_desc}
    entry = apd.normalize_entry("Agriculture", "T", raw)
    assert len(entry["description"]) == 200
    assert entry["description"].endswith("...")


def make_tarball(files):
    """files: {"Agriculture/Lemon-Dataset.yml": b"...yaml bytes..."}"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for path, content in files.items():
            info = tarfile.TarInfo(name=f"apd-core-master/core/{path}")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def test_extract_yaml_entries_from_tarball():
    tb = make_tarball({
        "Agriculture/Lemon-Dataset.yml": FULL_YAML,
        "Agriculture/OpenFoodFacts.yml": MINIMAL_YAML,
    })
    entries = apd.extract_yaml_entries(tb)
    assert len(entries) == 2
    cats_slugs = {(c, s) for c, s, _ in entries}
    assert ("Agriculture", "Lemon-Dataset") in cats_slugs
    assert ("Agriculture", "OpenFoodFacts") in cats_slugs


def test_extract_yaml_entries_ignores_non_core_files():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        info1 = tarfile.TarInfo(name="apd-core-master/core/Agriculture/Lemon-Dataset.yml")
        info1.size = len(FULL_YAML)
        tar.addfile(info1, io.BytesIO(FULL_YAML))
        # toppnivå-fil utenfor core/ — skal IKKE plukkes opp (kun 2 path-deler)
        readme = b"not yaml"
        info2 = tarfile.TarInfo(name="apd-core-master/README.rst")
        info2.size = len(readme)
        tar.addfile(info2, io.BytesIO(readme))
    entries = apd.extract_yaml_entries(buf.getvalue())
    assert len(entries) == 1
    assert entries[0][:2] == ("Agriculture", "Lemon-Dataset")


def test_check_reachable_ok(monkeypatch):
    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(apd.urllib.request, "urlopen", lambda req, timeout=5: FakeResp())
    assert apd.check_reachable("https://example.com") is True


def test_check_reachable_head_405_falls_back_to_get(monkeypatch):
    calls = []
    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake_urlopen(req, timeout=5):
        calls.append(req.get_method())
        if req.get_method() == "HEAD":
            raise apd.urllib.error.HTTPError(req.full_url, 405, "Method Not Allowed", None, None)
        return FakeResp()
    monkeypatch.setattr(apd.urllib.request, "urlopen", fake_urlopen)
    assert apd.check_reachable("https://example.com") is True
    assert calls == ["HEAD", "GET"]


def test_check_reachable_head_404_does_not_fallback_to_get(monkeypatch):
    calls = []
    def fake_urlopen(req, timeout=5):
        calls.append(req.get_method())
        raise apd.urllib.error.HTTPError(req.full_url, 404, "Not Found", None, None)
    monkeypatch.setattr(apd.urllib.request, "urlopen", fake_urlopen)
    assert apd.check_reachable("https://example.com") is False
    assert calls == ["HEAD"]


def test_check_reachable_unreachable_returns_false(monkeypatch):
    def fake_urlopen(req, timeout=5):
        raise OSError("timed out")
    monkeypatch.setattr(apd.urllib.request, "urlopen", fake_urlopen)
    assert apd.check_reachable("https://example.com") is False


def test_check_reachable_empty_url_returns_false():
    assert apd.check_reachable("") is False


def test_harvest_full_pipeline_injected_fetch_and_reachable():
    tb = make_tarball({"Agriculture/Lemon-Dataset.yml": FULL_YAML})
    catalog = apd.harvest(fetch=lambda: tb, reachable_check=lambda url: True, today="2026-07-25")
    assert len(catalog) == 1
    assert catalog[0]["identifier"] == "Agriculture/Lemon-Dataset"
    assert catalog[0]["reachable"] is True
    assert catalog[0]["checked_at"] == "2026-07-25"
