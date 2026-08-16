"""Lenkeråte-probe for data/apd-catalog.json — kjøres ETTER
tools/harvest_apd_catalog.py (oppstrøms apd-core vedlikeholdes løst, og
stikkprøven 2026-08-16 fant ~30 % unåelige poster i et 40-utvalg).

Fjerner KUN bekreftet døde poster (to uavhengige forsøk):
  - HTTP 404/410 på begge forsøk (andre forsøk uten Range-header)
  - DNS-oppslag feiler på begge forsøk (domenet er borte)
Alt annet BEHOLDES: 401/403 er gating/WAF (ikke råte — målt: cdc.gov/
bls.gov 403-er mot skript-IP-er men lever), 5xx/timeout er transient.

Kjøring fra repo-roten:
    python3 tools/probe_apd_catalog.py            # probe + skriv filtrert katalog
    python3 tools/probe_apd_catalog.py --torrkjor  # probe + rapport, ikke skriv

Prober distributionUrl om satt, ellers url. 8 tråder er høflig her fordi
posterne er 868 ULIKE verter — ingen enkeltvert får mer enn ~2 kall.
"""
import concurrent.futures
import json
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

KATALOG = os.path.join(os.path.dirname(__file__), '..', 'data', 'apd-catalog.json')
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
TIMEOUT_S = 10


def _hent_kode(url, med_range=True):
    """HTTP-kode for én GET; 'DNS' når verten ikke løser, 'NETT' ellers-feil."""
    try:
        vert = urllib.parse.urlsplit(url).hostname or ""
        socket.getaddrinfo(vert, None)
    except socket.gaierror:
        return "DNS"
    except Exception:
        return "NETT"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    if med_range:
        req.add_header("Range", "bytes=0-2047")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return str(r.status)
    except urllib.error.HTTPError as e:
        return str(e.code)
    except Exception:
        return "NETT"


def _url_felt(v):
    # oppstrøms YAML gir ikke bare strenger: stikkprøven fant prosatekst i
    # distributionUrl, og fullproben fant bool (YAML-fella «url: yes») —
    # alt som ikke er en http(s)-streng behandles som fraværende
    return v if isinstance(v, str) and v.startswith(("http://", "https://")) else ""


def prob_en(post):
    url = _url_felt(post.get("distributionUrl")) or _url_felt(post.get("url"))
    if not url:
        return post["identifier"], str(post.get("url"))[:80], "TOM"
    kode = _hent_kode(url)
    if kode in ("404", "410", "DNS"):
        # dødsdom krever to uavhengige forsøk — andre forsøk (uten Range,
        # noen servere 404-er på Range) avgjør
        kode = _hent_kode(url, med_range=False)
    if kode in ("404", "410", "DNS") and url.startswith("http://"):
        # målt falsk-død-klasse (ucdp.uu.se): gamle http://-URL-er kan
        # 404-e mens https-siden lever — oppgrader før dødsdom
        kode = _hent_kode("https://" + url[len("http://"):], med_range=False)
    return post["identifier"], url, kode


def main():
    torrkjor = "--torrkjor" in sys.argv
    katalog = json.load(open(KATALOG))
    resultater = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for ident, url, kode in ex.map(prob_en, katalog):
            resultater[ident] = (url, kode)
            if len(resultater) % 100 == 0:
                print(f"  {len(resultater)}/{len(katalog)} probet …", flush=True)
    dode = {i for i, (_, k) in resultater.items() if k in ("404", "410", "DNS")}
    klasser = {}
    for _, (_, k) in resultater.items():
        klasser[k] = klasser.get(k, 0) + 1
    print("Klassefordeling:", dict(sorted(klasser.items())))
    print(f"Bekreftet døde (fjernes): {len(dode)} av {len(katalog)}")
    for i in sorted(dode):
        print("  DØD:", i, "->", resultater[i][0][:90])
    if torrkjor:
        print("(tørrkjøring — katalogen er ikke endret)")
        return
    filtrert = [p for p in katalog if p["identifier"] not in dode]
    with open(KATALOG, "w") as f:
        json.dump(filtrert, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Skrev {len(filtrert)} poster til {os.path.relpath(KATALOG)}")


if __name__ == "__main__":
    main()
