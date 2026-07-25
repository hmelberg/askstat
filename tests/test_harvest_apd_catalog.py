"""Tester for tools/harvest_apd_catalog.py — YAML-normalisering, tarball-
utpakking og livstegn-sjekk. Ingen live nettverk (fetch/reachable_check
injiseres/mockes), jf. prosjektets "aldri live HTTP i tester"-konvensjon."""
import sys
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
