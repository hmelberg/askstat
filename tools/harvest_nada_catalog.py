#!/usr/bin/env python3
"""Høster levende NADA-mikrodatakataloger til data/nada-catalog.json.

Kilde: commondataio/dataportals-registry (MIT-lisens, verifisert
2026-08-06) — registeret bak Dateno. Dumpen data/datasets/full.jsonl har
136 oppføringer med catalog_type "Microdata catalog"; nesten alle kjører
NADA med ferdig søkeendepunkt i endpoints-feltet.

Registeret har DØDE oppføringer (microdata.who.int: DNS-død, verifisert
2026-08-06), så hver kandidat PROBES live (?sk=health&ps=1&format=json,
10 s timeout) og beholdes kun ved 200 + parseable JSON med result-felt.
Kjøringen tar noen minutter (sekvensiell probe med lav timeout).

Bruk: python3 tools/harvest_nada_catalog.py [sti-til-full.jsonl]
(uten argument lastes dumpen fra GitHub, ~32 MB).
"""
import datetime
import json
import pathlib
import sys
import urllib.request

DUMP_URL = ("https://raw.githubusercontent.com/commondataio/"
            "dataportals-registry/main/data/datasets/full.jsonl")
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "nada-catalog.json"
UA = {"User-Agent": "askstat-harvester/1.0"}


def les_dump(path):
    if path:
        return pathlib.Path(path).read_text(encoding="utf-8").splitlines()
    req = urllib.request.Request(DUMP_URL, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read().decode("utf-8").splitlines()


def kandidater(lines):
    for line in lines:
        if not line.strip():
            continue
        e = json.loads(line)
        if e.get("catalog_type") != "Microdata catalog":
            continue
        if (e.get("software") or {}).get("id") != "nada":
            continue
        if e.get("status") not in (None, "active"):
            continue
        url = next((p.get("url") for p in e.get("endpoints") or []
                    if p.get("type") == "nada:catalog-search" and p.get("url")), None)
        if not url and e.get("link"):
            url = e["link"].rstrip("/") + "/index.php/api/catalog/search"
        if not url:
            continue
        land = [((c.get("location") or {}).get("country") or {}).get("name")
                for c in e.get("coverage") or []]
        land = [x for x in land if x]
        yield {
            "uid": e.get("uid", ""),
            "name": (e.get("name") or "").strip(),
            "country": land[0] if land else "",
            "search_url": url,
        }


def probe(url):
    """200 + JSON med result-felt = levende NADA-endepunkt."""
    try:
        req = urllib.request.Request(url + "?sk=health&ps=1&format=json", headers=UA)
        with urllib.request.urlopen(req, timeout=10) as r:
            if r.status != 200:
                return False
            d = json.load(r)
            return isinstance(d, dict) and "result" in d
    except Exception:
        return False


def main():
    lines = les_dump(sys.argv[1] if len(sys.argv) > 1 else None)
    kand = list(kandidater(lines))
    levende = []
    for k in kand:
        ok = probe(k["search_url"])
        print(("OK   " if ok else "død  ") + k["search_url"])
        if ok:
            levende.append(k)
    levende.sort(key=lambda k: (k["country"], k["name"]))
    OUT.write_text(json.dumps({
        "v": 1,
        "_provenance": {
            "source": "github.com/commondataio/dataportals-registry (MIT)",
            "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "kandidater": len(kand),
            "levende": len(levende),
        },
        "catalogs": levende,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"skrev {OUT} ({len(levende)}/{len(kand)} levende, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
