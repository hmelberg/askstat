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
    if isinstance(keywords_raw, str):
        keywords = [k.strip() for k in keywords_raw.split(',') if k.strip()]
    elif isinstance(keywords_raw, list):
        keywords = [str(k).strip() for k in keywords_raw if str(k).strip()]
    else:
        keywords = []

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


def fetch_tarball_bytes(url=TARBALL_URL):
    """Last ned HELE apd-core-repoet som ett kall — ikke 868 enkelt-fetches
    mot raw.githubusercontent.com (unngår rate-limiting, høflig mot GitHub)."""
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read()


def extract_yaml_entries(tarball_bytes):
    """Pakk ut tarballen i minnet, returner [(kategori, slug, rå_yaml_dict), ...]
    for hver fil under core/<Kategori>/<slug>.yml (nøyaktig to nivåer —
    verifisert live mot repoet 2026-07-25: ingen dypere nesting finnes)."""
    entries = []
    with tarfile.open(fileobj=io.BytesIO(tarball_bytes), mode='r:gz') as tar:
        for member in tar.getmembers():
            # medlemsnavn: apd-core-master/core/<Kategori>/<slug>.yml
            parts = member.name.split('/')
            if len(parts) != 4 or parts[1] != 'core' or not parts[3].endswith('.yml'):
                continue
            category = parts[2]
            slug = parts[3][:-4]  # fjern .yml
            f = tar.extractfile(member)
            if f is None:
                continue
            raw = yaml.safe_load(f.read())
            if isinstance(raw, dict):
                entries.append((category, slug, raw))
    return entries


def check_reachable(url, timeout=HEAD_TIMEOUT_S):
    """Lett livstegn-sjekk: HEAD, fallback GET ved 405/501. IKKE en full
    nedlasting, og IKKE en erstatning for probe-verktøyet ved faktisk bruk
    (jf. DELIVERY-blokkens "ALDRI lever en uprobet URL")."""
    if not url:
        return False
    for method in ('HEAD', 'GET'):
        try:
            req = urllib.request.Request(url, method=method, headers={'User-Agent': 'openstat-harvester'})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return 200 <= resp.status < 400
        except urllib.error.HTTPError as e:
            if e.code in (405, 501) and method == 'HEAD':
                continue
            return False
        except Exception:
            return False
    return False


def harvest(fetch=fetch_tarball_bytes, reachable_check=check_reachable, today=None):
    """Full pipeline: hent → pars → normaliser → livstegn-sjekk. `today` som
    parameter (ikke datetime.date.today() inni funksjonen) holder pipelinen
    testbar og deterministisk."""
    raw_entries = extract_yaml_entries(fetch())
    catalog = []
    for category, slug, raw in raw_entries:
        entry = normalize_entry(category, slug, raw)
        entry['reachable'] = reachable_check(entry['url'])
        entry['checked_at'] = today
        catalog.append(entry)
    return catalog


def main():
    import datetime
    today = datetime.date.today().isoformat()
    catalog = harvest(today=today)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    reachable_n = sum(1 for e in catalog if e['reachable'])
    by_category = {}
    for e in catalog:
        by_category[e['category']] = by_category.get(e['category'], 0) + 1
    print(f"Høstet {len(catalog)} datasett-oppføringer -> {OUT}")
    print(f"Nåbare (HEAD/GET ok): {reachable_n}/{len(catalog)}")
    print(f"Kategorier ({len(by_category)}):")
    for cat, n in sorted(by_category.items()):
        print(f"  {cat}: {n}")


if __name__ == '__main__':
    main()
