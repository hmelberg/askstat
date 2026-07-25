"""Høst awesome-public-datasets' maskinlesbare kilde (apd-core, én YAML per
datasett) til data/apd-catalog.json — søkbar lokalt av search_catalog(apd, …)
uten live GitHub-kall ved spørretidspunkt.

Kjøres manuelt fra repo-roten når katalogen skal oppdateres:
    python3 tools/harvest_apd_catalog.py
Skjema og beslutninger: docs/superpowers/specs/2026-07-25-apd-catalog-design.md §3.
"""
import io
import json
import os
import tarfile
import urllib.error
import urllib.request

import yaml

TARBALL_URL = "https://github.com/awesomedata/apd-core/archive/refs/heads/master.tar.gz"
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'apd-catalog.json')
DESCRIPTION_MAX = 200
HEAD_TIMEOUT_S = 5


def normalize_entry(category, slug, raw):
    """Map én apd-core-YAML (rå dict fra yaml.safe_load) til
    schema.org/Dataset-feltskjemaet (spec §3). `raw` kan mangle alle felt
    utenom title/homepage/category."""
    keywords_raw = raw.get('keywords') or ''
    keywords = (
        [k.strip() for k in keywords_raw.split(',') if k.strip()]
        if isinstance(keywords_raw, str) else []
    )

    org = raw.get('organization')
    if isinstance(org, list) and org and isinstance(org[0], dict):
        creator = org[0].get('name')
    elif isinstance(org, str):
        creator = org
    else:
        creator = raw.get('publisher')

    description = (raw.get('description') or '').strip()
    if len(description) > DESCRIPTION_MAX:
        description = description[:DESCRIPTION_MAX - 3] + '...'

    return {
        'identifier': f"{category}/{slug}",
        'name': raw.get('title') or slug,
        'description': description,
        'url': raw.get('homepage') or '',
        'distributionUrl': raw.get('specification') or raw.get('data_dictionary') or None,
        'keywords': keywords,
        'license': raw.get('license'),
        'inLanguage': raw.get('language'),
        'creator': creator,
        'category': category,
        'access_level': raw.get('access_level'),
    }
