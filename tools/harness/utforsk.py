#!/usr/bin/env python3
"""Kildeutforskeren (spec docs/superpowers/specs/2026-08-15-kildeharness-design.md
§1) — kjører søk, metadata og verifiserte lesinger DIREKTE mot en kildes API
(CPython, urllib, openstat.py sitt read()-grensesnitt) og skriver et RÅTT
utkast til tools/harness/utkast/<kilde>.md. Alt i utkastet er MÅLT i denne
kjøringen, ingenting er antatt — Hans/en senere runde fletter det som er
verdt å beholde inn i data/sources/<kilde>.md.

Gratis: ingen Claude-API-kall. Høflig: maks 15 HTTP-kall per kilde,
time.sleep(0.5) mellom hvert kall, 10 s timeout.

Kjøring:  python3 tools/harness/utforsk.py ssb eurostat norgesbank
"""
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
import openstat as ost  # noqa: E402  (gir oss samme json-stat2-parser + sdmx-hjelpere som appen bruker)

REGISTER = REPO_ROOT / "data" / "data-sources.json"
SPORSMAL = REPO_ROOT / "tools" / "harness" / "sporsmal.json"
UTKAST_DIR = REPO_ROOT / "tools" / "harness" / "utkast"

MAKS_KALL = 15
PAUSE_S = 0.5
TIMEOUT_S = 10

# Foretrekkes UBETINGET for kilder listet her (kuraterte, verifiserte
# tabeller slår fritekstsøkets topp-3 — målt: 07459/14706 dukker aldri opp
# i søketreffene); søketreff brukes kun for kilder UTEN oppføring. Kun
# tabeller som faktisk er verifisert mot kilden hører hjemme her
# (sluttreview 2026-08-15: en scb-plassholder med SSBs tabellnummer ville
# garantert 404 — slettet).
FALLBACK_TABELLER = {
    "ssb": ["07459", "14706"],
    "eurostat": ["ei_lmhr_m", "prc_hicp_manr"],
    "norgesbank": ["EXR", "IR"],
}

STORBYER = ["Oslo", "Bergen", "Trondheim", "Stavanger", "Stockholm", "Göteborg", "København"]
NORDEN = ["NO", "SE", "DK", "FI", "IS"]


class BudsjettStopp(Exception):
    """Egen unntakstype for kall-tak-stopp (review-funn 1, fikserunde 1,
    2026-08-15) — SKILT fra vanlige feil nettopp for å kunne fanges presist
    inne i utforsk_en_kilde og avslutte fasene der, i stedet for å krasje
    hele flerkildekjøringen og miste kildens eget (delvis samlede) utkast."""


class Budsjett:
    """Global kall-teller + høflighetspause per kilde. Kaster BudsjettStopp
    hvis en kilde skulle finne på å be om et 16. HTTP-kall — det skal aldri
    skje ved normal bruk (mønstrene under er tallfestet til godt under
    taket), men er en hard stopp fremfor en stille overskridelse
    (spec §0-ånden). utforsk_en_kilde fanger BudsjettStopp og skriver
    utkastet med det som er samlet så langt, med en ærlig note."""

    def __init__(self, kilde_id):
        self.kilde_id = kilde_id
        self.n = 0

    def bruk(self):
        self.n += 1
        if self.n > MAKS_KALL:
            raise BudsjettStopp("%s: HTTP-kall %d overskrider taket (%d)"
                                % (self.kilde_id, self.n, MAKS_KALL))
        time.sleep(PAUSE_S)


# ── HTTP-hjelpere (rå urllib — søke-/metadatafasen er IKKE del av openstat.py
#    sitt Source.read()-kontraktflate, så vi henter selv) ────────────────────

def _http(url, budsjett, headers=None, som_json=True):
    """Ett HTTP GET — parset som JSON (som_json=True) eller rå tekst (CSV o.l.).
    (resultat, None) ved suksess, (None, feilmelding) ved feil — kaster aldri
    (spec §0: en feil her skal bli et FUNN i utkastet, ikke en krasjet kjøring).
    budsjett.bruk() kjøres i finally uansett utfall (høflighetspausen skal
    gjelde selv om kallet feilet)."""
    hdrs = {"User-Agent": "askstat-utforsk"}
    hdrs.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=TIMEOUT_S) as r:
            data = r.read()
        return (json.loads(data.decode("utf-8")) if som_json else data.decode("utf-8", "replace")), None
    except urllib.error.HTTPError as e:
        kropp = e.read(300).decode("utf-8", "replace").strip()
        return None, "HTTP %d: %s" % (e.code, kropp)
    except Exception as e:
        return None, str(e)
    finally:
        budsjett.bruk()


def _http_json(url, budsjett, headers=None):
    return _http(url, budsjett, headers=headers, som_json=True)


def _http_text(url, budsjett, headers=None):
    return _http(url, budsjett, headers=headers, som_json=False)


# ── Oppstart: register + spørsmålssett ───────────────────────────────────────

def last_register():
    return {s["id"]: s for s in json.loads(REGISTER.read_text(encoding="utf-8"))}


def last_sporsmal():
    return json.loads(SPORSMAL.read_text(encoding="utf-8"))["sporsmal"]


def tema_fraser(kilde_id, sporsmal, maks=5):
    """Flater ut tema-ordene fra alle spørsmål der kilden står i kilder,
    dedupliserer og kutter ved maks (spec: «maks 5 fraser»)."""
    ut = []
    for q in sporsmal:
        if kilde_id in q.get("kilder", []):
            for t in q.get("tema", []):
                if t not in ut:
                    ut.append(t)
    return ut[:maks]


# ── Søkefasen (kun kilder med sok_endepunkt) ─────────────────────────────────

def _sok_treff(doc):
    """PxWebApi v2-familien (ssb, scb, datanorge) svarer {"tables": [{id,label,...}]}.
    Ukjent form -> tom liste (utkastet skal aldri gjette et format)."""
    if isinstance(doc, dict) and isinstance(doc.get("tables"), list):
        return [(str(t.get("id")), str(t.get("label", ""))) for t in doc["tables"]]
    return []


def sok_fase(kilde, fraser, budsjett):
    rader, alle_id = [], []
    for frase in fraser:
        url = kilde["sok_endepunkt"].replace("{q}", urllib.parse.quote(frase))
        doc, feil = _http_json(url, budsjett)
        if feil:
            rader.append({"frase": frase, "n": None, "topp3": [], "feil": feil})
            continue
        treff = _sok_treff(doc)
        for tid, _ in treff:
            if tid not in alle_id:
                alle_id.append(tid)
        rader.append({"frase": frase, "n": len(treff), "topp3": treff[:3], "feil": None})
    return rader, alle_id


# ── Metadatafasen ────────────────────────────────────────────────────────────

def _dimensjoner_fra_jsonstat(doc):
    """Gjenbruker ost.typemeta_from_jsonstat (delt kontrakt med appens
    pxweb/eurostat-lesere — samme parser som selve appen kjører) og legger på
    elimination-status + rolle (geo/time/metric), som typemeta ikke fanger."""
    tm = ost.typemeta_from_jsonstat(doc)
    rolle = doc.get("role") or {}
    ut = []
    for navn, dim in tm["dims"].items():
        raw = ((doc.get("dimension") or {}).get(navn)) or {}
        elim = (raw.get("extension") or {}).get("elimination")
        koder = dim["categories"]
        r = ("geo" if navn in rolle.get("geo", []) else
             "time" if navn in rolle.get("time", []) else
             "metric" if navn in rolle.get("metric", []) else
             ("geo" if navn == "geo" else None))  # eurostat har ikke role{} i det hele tatt
        ut.append({
            "navn": navn, "label": raw.get("label", navn), "n_koder": len(koder),
            "mandatory": (elim is False) if elim is not None else None,
            "rolle": r, "koder": koder, "etiketter": dim["labels"],
        })
    return ut


def pxweb_base(kilde):
    """Registerets base_url er API-ROTEN (uten /tables) — Source.read() sin
    pxweb-gren (openstat.py) normaliserer IKKE dette selv (i motsetning til
    js/data-directives.js, som prepender tables/ når base ikke alt ender slik
    — se kommentaren der: «base_url mistet tables/-segmentet; målt 404 uten,
    200 med»). Målt her på nytt (2026-08-15, utforsk.py): rå base_url mot
    metadata-endepunktet gir HTTP 404 — /tables må inn manuelt i CPython-veien."""
    b = kilde["base_url"].rstrip("/")
    return b if b.endswith("/tables") else b + "/tables"


def _parse_dims_guardet(doc, tabell_id):
    """Review-funn 2 (fikserunde 1, 2026-08-15): et HTTP-vellykket, men
    avvikende json-stat2-svar (uventet form, manglende felter) skal bli et
    FUNN i utkastet, ikke en krasjet kjøring — samme aldri-crash-kontrakt som
    HTTP-laget (_http). (dims, feil) — nøyaktig ett av dem er ikke-None."""
    try:
        return _dimensjoner_fra_jsonstat(doc), None
    except Exception as e:
        return None, "metadata lot seg ikke parse: %s: %s" % (type(e).__name__, e)


def metadata_pxweb(kilde, tabell_id, budsjett):
    url = pxweb_base(kilde) + "/" + tabell_id + "/metadata?lang=no"
    doc, feil = _http_json(url, budsjett)
    if feil:
        return {"tabell": tabell_id, "feil": feil}
    dims, feil = _parse_dims_guardet(doc, tabell_id)
    if feil:
        return {"tabell": tabell_id, "feil": feil}
    return {"tabell": tabell_id, "tittel": doc.get("label", tabell_id), "dims": dims, "feil": None}


def metadata_eurostat(kilde, tabell_id, budsjett):
    url = kilde["base_url"].rstrip("/") + "/" + tabell_id + "?format=JSON&lang=en&lastTimePeriod=1"
    doc, feil = _http_json(url, budsjett)
    if feil:
        return {"tabell": tabell_id, "feil": feil}
    dims, feil = _parse_dims_guardet(doc, tabell_id)
    if feil:
        return {"tabell": tabell_id, "feil": feil}
    return {"tabell": tabell_id, "tittel": doc.get("label", tabell_id), "dims": dims, "feil": None,
            "notat": "kun siste periode probet (lastTimePeriod=1, budsjetthensyn) — "
                     "full tidsspenn IKKE hentet i denne utforskningen."}


def metadata_sdmx(kilde, flow_id, budsjett):
    """Praktisk probe (samme triks som Source.read() sin egen needs_key-vei):
    <base>/<flow>/all?lastNObservations=1 med SDMX-CSV — gir dimensjonsNAVN fra
    headeren + noen ekte eksempelkoder fra dataradene. Fulle kodelister/
    etiketter krever et strukturendepunkt vi ikke har en pålitelig sti til her
    — noteres ærlig i stedet for å gjettes (spec §1)."""
    url = kilde["base_url"].rstrip("/") + "/" + flow_id + "/all?lastNObservations=1"
    text, feil = _http_text(url, budsjett, headers={"Accept": ost.SDMX_ACCEPT})
    if feil:
        return {"tabell": flow_id, "feil": feil}
    linjer = [l for l in text.splitlines() if l.strip()]
    if not linjer:
        return {"tabell": flow_id, "feil": "tomt svar"}
    header = linjer[0].rstrip("\r").split(",")
    dims = ost.sdmx_key_dims(linjer[0])
    eksempler = {d: [] for d in dims}
    for rad in linjer[1:21]:  # 20 rader er nok til noen få distinkte koder per dim
        felt = rad.rstrip("\r").split(",")
        for d in dims:
            i = header.index(d)
            if i < len(felt) and felt[i] and felt[i] not in eksempler[d]:
                eksempler[d].append(felt[i])
    return {"tabell": flow_id, "tittel": flow_id, "feil": None,
            "dims": [{"navn": d, "n_koder": None, "mandatory": None, "rolle": None,
                      "koder": eksempler[d][:5], "etiketter": {}} for d in dims],
            "notat": "dimensjonsnavn fra CSV-header + inntil 5 EKTE eksempelkoder sett i en "
                     "lastNObservations=1-probe (ikke fulle kodelister/etiketter — "
                     "structure-endepunktet er ikke utforsket her)."}


def velg_metadata_tabeller(kilde_id, sok_id):
    if kilde_id in FALLBACK_TABELLER:
        return FALLBACK_TABELLER[kilde_id]
    return sok_id[:3] if sok_id else []


# ── Hentefasen (via ost.connect(...).read(...) — den ekte appen-veien) ───────

def _kwarg_repr(v):
    if isinstance(v, dict):
        return "{" + ", ".join('"%s": %s' % (k, _kwarg_repr(x)) for k, x in v.items()) + "}"
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_kwarg_repr(x) for x in v) + "]"
    if isinstance(v, str):
        return '"%s"' % v
    return str(v)


def read_linje(alias, tabell, kwargs):
    args = (['"%s"' % tabell] if tabell else []) + ["%s=%s" % (k, _kwarg_repr(v)) for k, v in kwargs.items()]
    return "%s.read(%s)" % (alias, ", ".join(args))


def kjor_lesing(kilde_id, src, alias, tabell, kwargs, navn, budsjett, kall_vekt=1):
    linje = read_linje(alias, tabell, kwargs)
    try:
        df = src.read(tabell, **kwargs)
        resultat = {"navn": navn, "linje": linje, "ok": True,
                    "rader": len(df), "kolonner": list(df.columns), "feil": None}
    except Exception as e:
        resultat = {"navn": navn, "linje": linje, "ok": False,
                    "rader": None, "kolonner": None, "feil": str(e)}
    for _ in range(kall_vekt):
        budsjett.bruk()
    return resultat


_KWARG_ORDER = ["regions", "countries", "indicators", "years", "filters"]


def _sorter_kwargs(kw):
    """Stabil rekkefølge på read()-kwargs — matcher stilen i data/sources/*.md
    (regions/countries, indicators, years, filters) fremfor tilfeldig
    innsettingsrekkefølge."""
    return {k: kw[k] for k in _KWARG_ORDER if k in kw}


def _finn_kode(dim, *etikett_substr, unntatt=None):
    """Kode der etiketten inneholder ett av substrengene (case-insensitiv) —
    brukt til å velge meningsfulle eksempelkoder (Oslo, Bergen) uten å
    hardkode kodeverk per kilde. Blant treff: foretrekk den LENGSTE koden —
    målt 2026-08-15: «Oslo» matcher BÅDE fylkeskoden «03» og kommunekoden
    «0301» (samme etikett «Oslo - Oslove»); kommunenivået er alltid den mer
    spesifikke (lengre) koden. Review-funn 3 (fikserunde 1, 2026-08-15):
    en tidligere versjon hardkodet «foretrukket 4-tegns kode», en SSB-
    spesifikk magisk konstant som ville gitt stille feil kode for enhver
    annen pxweb-kildes kodelengde-konvensjon (f.eks. scb). «Lengst vinner»
    er kildeagnostisk og løser det samme Oslo-tilfellet: max() med
    likhet returnerer FØRSTE treff i indeksrekkefølge, så «0301» (indeks
    før «0399», som også inneholder «Oslo») vinner uendret."""
    kandidater = [k for k in dim["koder"] if k != unntatt and
                  any(s.lower() in str(dim["etiketter"].get(k, "")).lower() for s in etikett_substr)]
    if not kandidater:
        return None
    return max(kandidater, key=len)


def _dim(dims, rolle):
    return next((d for d in dims if d["rolle"] == rolle), None)


def _finn_storby(dim, byer=STORBYER, unntatt_kode=None):
    """Prøver storbynavnene i PRIORITERT rekkefølge (Oslo før Bergen før...),
    ETT navn av gangen — ikke som ett samlet substrengsøk. Et samlet søk
    ville latt en tilfeldig kodeindeks (f.eks. «0399 Uoppgitt komm. Oslo»,
    som også inneholder «Oslo») kapre region2-plassen foran en ekte
    Bergen-kode, bare fordi den ligger tidligere i tabellens kodeliste
    (målt 2026-08-15). Returnerer (kode, bynavn) slik at kalleren kan
    utelukke SAMME bynavn (ikke bare samme kode) fra neste søk."""
    for by in byer:
        k = _finn_kode(dim, by, unntatt=unntatt_kode)
        if k:
            return k, by
    return None, None


def lesemonstre_pxweb(kilde_id, kilde, src, alias, metadata_tabeller, budsjett):
    ut, ekstra_notater = [], []
    gjort_flervalg = False
    for m in metadata_tabeller:
        if m.get("feil") or not m.get("dims"):
            continue
        tabell, dims = m["tabell"], m["dims"]
        geo, metric, tid = _dim(dims, "geo"), _dim(dims, "metric"), _dim(dims, "time")
        kwargs_felles = {}
        if metric:
            kwargs_felles["indicators"] = [metric["koder"][0]]
        arlig = bool(tid) and all(re.match(r"^\d{4}$", k) for k in tid["koder"][-5:])

        region1, by1 = None, None
        if geo:
            region1, by1 = _finn_storby(geo)
            if not region1:
                region1 = next((k for k in geo["koder"] if k != "0"), geo["koder"][0])

        def med_tid(kw, siste_n=1):
            kw = dict(kw)
            if arlig and tid:
                if siste_n > 1:
                    siste = int(tid["koder"][-1])
                    kw["years"] = "%d:%d" % (siste - siste_n + 1, siste)
                else:
                    kw["years"] = tid["koder"][-1]
            elif tid:
                kw["filters"] = {tid["navn"]: tid["koder"][-siste_n:]}
            return kw

        # Enkeltvalg — alltid, for hver tabell.
        kw1 = dict(kwargs_felles)
        if region1:
            kw1["regions"] = [region1]
        kw1 = _sorter_kwargs(med_tid(kw1))
        r1 = kjor_lesing(kilde_id, src, alias, tabell, kw1, "Enkeltvalg (%s)" % tabell, budsjett)
        ut.append(r1)

        # Flervalg + tidsvindu — kun på FØRSTE tabell m/geo-dimensjon (budsjett).
        if geo and not gjort_flervalg:
            gjort_flervalg = True
            region2, _ = _finn_storby(geo, byer=[b for b in STORBYER if b != by1], unntatt_kode=region1)
            if not region2:
                region2 = next((k for k in geo["koder"] if k not in ("0", region1)), None)
            if region2:
                kw2 = dict(kwargs_felles, regions=[region1, region2])
                kw2 = _sorter_kwargs(med_tid(kw2))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw2,
                                      "Flervalg (2 regioner, %s)" % tabell, budsjett))
            if arlig and tid and len(tid["koder"]) >= 10:
                kw3 = _sorter_kwargs(med_tid(dict(kwargs_felles, regions=[region1]), siste_n=10))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw3,
                                      "Tidsvindu (10 år, %s)" % tabell, budsjett))

        # Målt felle: years="a:b" enumererer PLAIN årskoder uansett
        # periodisitet hos PxWeb-adapteren — 400 for en månedlig/kvartalsvis
        # tabell (koden «2024» finnes ikke i en Tid-kodeliste av «2024M01»-
        # form). Reparasjon (maks ett forsøk): filters={Tid: [fulle koder]}.
        if tid and not arlig:
            kw_feil = _sorter_kwargs(dict(kwargs_felles, years="2024:2025",
                                          **({"regions": [region1]} if region1 else {})))
            feilforsok = kjor_lesing(kilde_id, src, alias, tabell, kw_feil,
                                     "Feilforsøk: years= mot en ikke-årlig tabell (%s) — FORVENTET FEIL"
                                     % tabell, budsjett)
            ut.append(feilforsok)
            if not feilforsok["ok"]:
                kw_rep = _sorter_kwargs(dict(kwargs_felles, filters={tid["navn"]: tid["koder"][-2:]},
                                             **({"regions": [region1]} if region1 else {})))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw_rep,
                                      "Reparasjon: filters={\"%s\": [...]} i stedet for years= (%s)"
                                      % (tid["navn"], tabell), budsjett))

        # Aggregat-via-utelatelse: gjenbruk siste OK-kjøring for denne
        # tabellen — koster ikke et ekstra HTTP-kall, kun en observasjon om
        # at eliminerbare dimensjoner utelates bevisst.
        ekstra_elim = [d["navn"] for d in dims if d["rolle"] is None and d["mandatory"] is False]
        if ekstra_elim:
            siste_ok = next((r for r in reversed(ut) if r["ok"] and ("(%s)" % tabell) in r["navn"]), None)
            if siste_ok:
                ekstra_notater.append(
                    "**Aggregat-via-utelatelse (%s):** kjøringen «%s» over UTELOT %s "
                    "(elimination:true i metadata) — %s rad(er) kom likevel tilbake, altså "
                    "et aggregat over disse dimensjonene, ikke en feil." %
                    (tabell, siste_ok["navn"], " og ".join(ekstra_elim), siste_ok["rader"]))
    return ut, ekstra_notater


def lesemonstre_eurostat(kilde_id, kilde, src, alias, metadata_tabeller, budsjett):
    ut = []
    for i, m in enumerate(metadata_tabeller):
        if m.get("feil") or not m.get("dims"):
            continue
        tabell, dims = m["tabell"], m["dims"]
        geo = next((d for d in dims if d["navn"] == "geo"), None)
        geo_koder = geo["koder"] if geo else []
        land1 = "NO" if "NO" in geo_koder else (geo_koder[0] if geo_koder else None)
        ekstra = [d for d in dims if d["navn"] not in ("geo", "time") and d["n_koder"] > 1]
        ekstra_kw = {}
        if ekstra:
            ekstra.sort(key=lambda d: d["n_koder"])
            valgt = ekstra[0]
            ekstra_kw = {"filters": {valgt["navn"]: valgt["koder"][0]}}

        if i == 0:
            if land1:
                kw1 = _sorter_kwargs(dict(ekstra_kw, countries=[land1], years="2024:2026"))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw1,
                                      "Enkeltvalg (ett land, %s)" % tabell, budsjett))

            norden = [c for c in NORDEN if c in geo_koder]
            if len(norden) >= 2:
                kw2 = _sorter_kwargs(dict(ekstra_kw, countries=norden, years="2024:2026"))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw2,
                                      "Flervalg (Norden, %s)" % tabell, budsjett))

            if land1:
                kw3 = _sorter_kwargs(dict(ekstra_kw, countries=[land1], years="2015:2026"))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw3,
                                      "Tidsvindu (11 år, %s)" % tabell, budsjett))

                # Målt felle: kommaform i ÉN geo=-parameter (scalar streng med
                # komma, IKKE en Python-liste) — Eurostat svarer 200 med
                # value:{} (stille tomt); adapteren fanger 0-rader og gir et
                # hint. Reparasjon: bruk countries=[...]-listen (kw2/kw3 over).
                kw_feil = _sorter_kwargs(dict(ekstra_kw, filters=dict(ekstra_kw.get("filters", {}), geo="NO,SE"),
                                              years="2024:2025"))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw_feil,
                                      "Feilforsøk: kommaform i geo= (%s) — FORVENTET FEIL" % tabell,
                                      budsjett))
        else:
            if land1:
                kw = _sorter_kwargs(dict(ekstra_kw, countries=[land1], years="2024:2026"))
                ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw,
                                      "Enkeltvalg, andre tabell (%s)" % tabell, budsjett))
    return ut, []


def lesemonstre_sdmx(kilde_id, kilde, src, alias, metadata_tabeller, budsjett):
    ut = []
    for i, m in enumerate(metadata_tabeller):
        if m.get("feil") or not m.get("dims"):
            continue
        tabell, dims = m["tabell"], m["dims"]
        # Første ekte verdi sett i probe-raden PER dimensjon — samme prinsipp
        # som Source.read() sin egen needs_key-probe, bare gjort manuelt her.
        filters = {d["navn"]: d["koder"][0] for d in dims if d["koder"]}
        if not filters:
            continue
        if i == 0:
            kw1 = _sorter_kwargs(dict(filters=filters, years="2024:2025"))
            r1 = kjor_lesing(kilde_id, src, alias, tabell, kw1,
                             "Enkeltvalg (%s)" % tabell, budsjett, kall_vekt=2)
            ut.append(r1)

            kw2 = _sorter_kwargs(dict(filters=filters, years="2015:2025"))
            ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw2,
                                  "Tidsvindu (10 år, %s)" % tabell, budsjett, kall_vekt=2))

            # Målt felle: liste-verdi i filters støttes IKKE for sdmx ennå —
            # ValueError FØR nettverk (ingen HTTP-kall, ingen budsjett-bruk).
            # Foretrekk en dimensjon med ≥2 EKTE eksempelkoder fra proben
            # fremfor å duplisere den samme koden — mer realistisk visning
            # av hva et (forsøkt) flervalg ville sett ut som.
            dim_flere = next((d for d in dims if len(d["koder"]) >= 2), None)
            if dim_flere:
                navn, verdier = dim_flere["navn"], dim_flere["koder"][:2]
            else:
                navn = next(iter(filters))
                verdier = [filters[navn], filters[navn]]
            kw3 = _sorter_kwargs(dict(filters=dict(filters, **{navn: verdier}), years="2024:2025"))
            ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw3,
                                  "Feilforsøk: liste-verdi i filters (%s) — FORVENTET FEIL, 0 nettverkskall"
                                  % tabell, budsjett, kall_vekt=0))
        else:
            kw = _sorter_kwargs(dict(filters=filters, years="2020:2025"))
            ut.append(kjor_lesing(kilde_id, src, alias, tabell, kw,
                                  "Enkeltvalg, andre dataflow (%s)" % tabell, budsjett, kall_vekt=2))
    return ut, []


# ── Rendring ──────────────────────────────────────────────────────────────

def render_kort(kilde_id, kilde, metadata_tabeller, sok_treff_id, tema):
    """Kvalitetsfunn (Task 4-review, 2026-08-15): for kilder UTEN
    sok_endepunkt (eurostat, norgesbank her) ble tema fra sporsmal.json
    likevel vist under den samme «Tema utforsket» ledeteksten som
    kilder der frasene FAKTISK ble kjørt mot et søkeendepunkt — men
    ordene ble aldri søkt (sok_fase kjører ikke) og styrer heller ikke
    tabellvalget (velg_metadata_tabeller returnerer FALLBACK_TABELLER
    uansett tema/sok_id). Det er en overklaiming av «utforsket»
    («målt, ikke ment»-prinsippet, spec §0/§1) — rettet ved å skille
    de to tilfellene i teksten i stedet for å fjerne linjen (ordene er
    fortsatt nyttig kontekst: de viser hvilke spørsmål kilden dekker
    ifølge sporsmal.json)."""
    linjer = []
    if tema and kilde.get("sok_endepunkt"):
        linjer.append("**Tema utforsket (søkt):** " + ", ".join(tema))
    elif tema:
        linjer.append(
            "**Tema fra spørsmålssettet** (kilden mangler `sok_endepunkt` — disse ordene "
            "ble IKKE søkt; tabellvalget under kom fra FALLBACK_TABELLER, ikke fra tema): "
            + ", ".join(tema))
    for m in metadata_tabeller:
        if m.get("feil"):
            linjer.append("- Tabell/dataflow `%s`: metadata IKKE hentet — %s" % (m["tabell"], m["feil"]))
            continue
        linjer.append("- **%s** — %s" % (m["tabell"], m.get("tittel", "")))
        tiddim = next((d for d in m["dims"] if d["rolle"] == "time" and d["koder"]), None)
        if tiddim:
            linjer.append("  - tidsspenn (fra Tid-dimensjonens kodeliste): %s – %s" %
                          (tiddim["koder"][0], tiddim["koder"][-1]))
        for d in m["dims"]:
            biter = ["`%s`" % d["navn"]]
            if d["rolle"]:
                biter.append("(rolle: %s)" % d["rolle"])
            if d["n_koder"] is not None:
                biter.append("— %d kode(r)" % d["n_koder"])
            if d["mandatory"] is True:
                biter.append("[OBLIGATORISK]")
            elif d["mandatory"] is False:
                biter.append("[eliminerbar]")
            eks = d["koder"][:5]
            if eks:
                etiketter = [d["etiketter"].get(k, k) for k in eks]
                biter.append("— eksempler: " + ", ".join(
                    "%s=%s" % (k, e) if e and e != k else k for k, e in zip(eks, etiketter)))
            linjer.append("  - " + " ".join(biter))
        if m.get("notat"):
            linjer.append("  - _%s_" % m["notat"])
    return "\n".join(linjer) if linjer else "(ingen metadata hentet)"


def render_guide(alias, lesninger):
    if not lesninger:
        return "(ingen lesinger kjørt)"
    linjer = []
    for r in lesninger:
        if r["ok"]:
            linjer.append("### %s\n```python\n%s\n```\n%d %s, kolonner: %s\n" %
                          (r["navn"], r["linje"], r["rader"], "rad" if r["rader"] == 1 else "rader",
                           ", ".join(r["kolonner"])))
        else:
            linjer.append("### %s (FEILET)\n```python\n%s\n```\nFeil: %s\n" %
                          (r["navn"], r["linje"], r["feil"]))
    return "\n".join(linjer)


def render_feller(lesninger, ekstra_notater):
    punkter = list(ekstra_notater)
    for r in lesninger:
        if not r["ok"] and "FORVENTET FEIL" in r["navn"]:
            punkter.append("**%s**\n`%s`\n→ %s" % (r["navn"], r["linje"], r["feil"]))
    return "\n\n".join(punkter) if punkter else "(ingen feil målt i denne kjøringen)"


def render_sok(sok_rader, kilde):
    if not kilde.get("sok_endepunkt"):
        return "Kilden mangler `sok_endepunkt` i registeret — søkefasen ble hoppet over."
    linjer = []
    for r in sok_rader:
        if r["feil"]:
            linjer.append("- «%s»: søk feilet: %s" % (r["frase"], r["feil"]))
        else:
            topp = "; ".join("%s (%s)" % (tid, lbl[:60]) for tid, lbl in r["topp3"])
            linjer.append("- «%s»: %d treff — topp 3: %s" % (r["frase"], r["n"], topp or "(ingen)"))
    return "\n".join(linjer) if linjer else "(ingen søkefraser for denne kilden i sporsmal.json)"


def skriv_utkast(kilde_id, kilde, dato, tema, sok_rader, metadata_tabeller, lesninger, ekstra_notater):
    innhold = """# UTKAST: %s (generert av tools/harness/utforsk.py %s)
> Råmateriale for data/sources/%s.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert %s, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
%s

## Guide (hentelaget — eksempel først)
%s

## Kjente feller (målt i denne utforskningen)
%s

## Søkenotater
%s
""" % (kilde_id, dato, kilde_id, dato,
       render_kort(kilde_id, kilde, metadata_tabeller, sok_rader, tema),
       render_guide(kilde_id, lesninger),
       render_feller(lesninger, ekstra_notater),
       render_sok(sok_rader, kilde))
    UTKAST_DIR.mkdir(parents=True, exist_ok=True)
    ut_path = UTKAST_DIR / (kilde_id + ".md")
    ut_path.write_text(innhold, encoding="utf-8")
    return ut_path


# ── Hovedløp ──────────────────────────────────────────────────────────────

def utforsk_en_kilde(kilde_id, register, sporsmal, dato):
    """Review-funn 1a (fikserunde 1, 2026-08-15): hver fase fanger
    BudsjettStopp for seg — treffer kall-taket midt i en fase, avsluttes
    RESTEN av fasene (de ville uansett feilet umiddelbart på samme tak), og
    skriv_utkast kjøres til slutt med det som faktisk ble samlet, pluss en
    ærlig note om hvor stoppen skjedde. Kilden mister dermed ALDRI utkastet
    sitt bare fordi budsjettet ble strammere enn ventet for akkurat den."""
    kilde = register[kilde_id]
    budsjett = Budsjett(kilde_id)
    kind = kilde.get("kind")
    print("== %s ==" % kilde_id)

    stoppet_ved = None

    tema = tema_fraser(kilde_id, sporsmal)
    sok_rader, sok_id = [], []
    if kilde.get("sok_endepunkt"):
        try:
            sok_rader, sok_id = sok_fase(kilde, tema, budsjett)
        except BudsjettStopp as e:
            stoppet_ved = "søkefasen (%s)" % e
    print("  søk: %d fraser, %d kall brukt" % (len(sok_rader), budsjett.n))

    metadata_tabeller = []
    if stoppet_ved is None:
        tabell_ider = velg_metadata_tabeller(kilde_id, sok_id)
        try:
            for tid in tabell_ider:
                if kind == "pxweb":
                    metadata_tabeller.append(metadata_pxweb(kilde, tid, budsjett))
                elif kind == "eurostat":
                    metadata_tabeller.append(metadata_eurostat(kilde, tid, budsjett))
                elif kind == "sdmx":
                    metadata_tabeller.append(metadata_sdmx(kilde, tid, budsjett))
                else:
                    metadata_tabeller.append({"tabell": tid,
                                              "feil": "kind '%s' har ingen metadata-henter i utforsk.py ennå" % kind})
        except BudsjettStopp as e:
            stoppet_ved = "metadatafasen (%s)" % e
    print("  metadata: %d tabeller, %d kall brukt" % (len(metadata_tabeller), budsjett.n))

    lesninger, ekstra_notater = [], []
    if stoppet_ved is None:
        connect_base = pxweb_base(kilde) if kind == "pxweb" else kilde["base_url"]
        src = ost.connect(connect_base, kind=kind)
        try:
            if kind == "pxweb":
                lesninger, ekstra_notater = lesemonstre_pxweb(kilde_id, kilde, src, kilde_id, metadata_tabeller, budsjett)
            elif kind == "eurostat":
                lesninger, ekstra_notater = lesemonstre_eurostat(kilde_id, kilde, src, kilde_id, metadata_tabeller, budsjett)
            elif kind == "sdmx":
                lesninger, ekstra_notater = lesemonstre_sdmx(kilde_id, kilde, src, kilde_id, metadata_tabeller, budsjett)
            else:
                print("  kind '%s' har ingen lese-mønster-generator i utforsk.py ennå — hopper over hentefasen" % kind)
        except BudsjettStopp as e:
            stoppet_ved = "hentefasen (%s)" % e
    print("  lesinger: %d kjørt, %d kall brukt (av tak %d)" % (len(lesninger), budsjett.n, MAKS_KALL))

    if stoppet_ved:
        print("  BUDSJETT-STOPP i %s — skriver utkast med det som ble samlet før stoppen." % stoppet_ved)
        ekstra_notater = list(ekstra_notater) + [
            "**Budsjett-stopp:** utforskningen ble avbrutt i %s — HTTP-kall-taket (%d per kilde) "
            "ble nådd. Alt annet i dette utkastet er likevel EKTE, målte funn fra det som rakk å "
            "kjøre før stoppen; senere faser (om noen) ble aldri startet." % (stoppet_ved, MAKS_KALL)]

    path = skriv_utkast(kilde_id, kilde, dato, tema, sok_rader, metadata_tabeller, lesninger, ekstra_notater)
    print("  skrev %s" % path)


def main():
    register = last_register()
    sporsmal = last_sporsmal()
    ider = sys.argv[1:]
    if not ider:
        print("Bruk: python3 tools/harness/utforsk.py <kilde-id> [<kilde-id> ...]")
        print("Gyldige id-er: " + ", ".join(sorted(register)))
        sys.exit(1)
    ukjente = [i for i in ider if i not in register]
    if ukjente:
        print("Ukjent(e) kilde-id(er): " + ", ".join(ukjente))
        print("Gyldige id-er: " + ", ".join(sorted(register)))
        sys.exit(1)

    dato = datetime.date.today().isoformat()
    noen_feilet = False
    for kilde_id in ider:
        # Review-funn 1b (fikserunde 1, 2026-08-15): én kildes uventede krasj
        # (alt annet enn BudsjettStopp, som allerede fanges INNE i
        # utforsk_en_kilde) skal ikke ta ned resten av en flerkildekjøring —
        # noter feilen og fortsett til neste kilde; exit 1 hvis noen feilet.
        try:
            utforsk_en_kilde(kilde_id, register, sporsmal, dato)
        except Exception as e:
            noen_feilet = True
            print("  FEIL: %s stoppet med en uventet feil (%s) — %s" % (kilde_id, type(e).__name__, e))
    if noen_feilet:
        sys.exit(1)


if __name__ == "__main__":
    main()
