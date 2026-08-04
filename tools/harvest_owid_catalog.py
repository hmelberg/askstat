#!/usr/bin/env python3
"""Høster Our World in Datas chart-katalog til data/owid-catalog.json.

Kilde (VERIFISERT 2026-08-04): Datasette-instansen datasette-public.owid.io,
tabellen `charts` (4 445 rader, alle isPublished=1 — filtreres likevel
eksplisitt på isPublished for å tåle fremtidige utkast). Paginert med
limit/offset til tom side, som de andre høsterne (worldbank, eurostat).
"""
import datetime
import json
import pathlib
import urllib.parse
import urllib.request

BASE = "https://datasette-public.owid.io/owid.json"
SQL = "select slug,title,subtitle from charts where isPublished order by id limit {limit} offset {offset}"
PAGE = 1000
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "owid-catalog.json"


def rens_chart(row):
    slug = (row.get("slug") or "").strip()
    title = (row.get("title") or "").strip()
    if not slug or not title:
        return None
    subtitle = row.get("subtitle")
    if isinstance(subtitle, str):
        subtitle = subtitle.strip()[:200] or None
    else:
        subtitle = None
    return {"slug": slug, "title": title, "subtitle": subtitle}


def fetch_page(offset):
    sql = SQL.format(limit=PAGE, offset=offset)
    url = BASE + "?" + urllib.parse.urlencode({"sql": sql})
    # Datasette avviser urllibs standard User-Agent med 403 — sett en egen.
    req = urllib.request.Request(url, headers={"User-Agent": "askstat-harvester/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    cols = d["columns"]
    return [dict(zip(cols, row)) for row in d["rows"]]


def fetch_all():
    offset, charts = 0, []
    while True:
        rows = fetch_page(offset)
        if not rows:
            break
        for row in rows:
            c = rens_chart(row)
            if c is not None:
                charts.append(c)
        offset += PAGE
    return charts


def main():
    charts = fetch_all()
    OUT.write_text(json.dumps({
        "charts": charts,
        "_provenance": {
            "source_url": BASE,
            "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"skrev {OUT} ({len(charts)} charts, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
