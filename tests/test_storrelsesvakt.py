"""Størrelsesvakta (strategirunden 2026-08-16): inflasjons-klassens rotårsak
var at ufiltrerte uttrekk (prc_hicp_manr: millioner av celler) OOM-et
pyodide — og ALLE mottiltak var tekst (guide-linjer, EVAL-regel 11), altså
probabilistiske. Dette er miljøkuren: _fetch_bytes nekter deterministisk å
levere kropper over MAKS_UTTREKK_BYTES, med et instruktivt reparasjonshint
(filtrer FØR henting). Proxyen hadde allerede 50 MB-avkortingsvakt
(x-hent-truncated) — vakta her dekker DIREKTE-hentingene (CPython-urllib og
den nakne XHR-fallbacken; ReadBridge-veien får JS-sidens vakt via r.error).

Taket monkeypatches lavt i testene så vi slipper å allokere 25 MB.
"""
import io

import pytest

import openstat as ost


class _FalskRespons:
    def __init__(self, kropp, content_length=None):
        self._buf = io.BytesIO(kropp)
        self.headers = {}
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def read(self, n=-1):
        return self._buf.read(n)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _sett_urlopen(monkeypatch, kropp, content_length=None):
    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen",
                        lambda req: _FalskRespons(kropp, content_length))


def test_liten_kropp_passerer(monkeypatch):
    monkeypatch.setattr(ost, "MAKS_UTTREKK_BYTES", 100)
    ost._MEMO.clear()
    _sett_urlopen(monkeypatch, b"a,b\n1,2\n")
    assert ost._fetch_bytes("https://x/liten.csv") == b"a,b\n1,2\n"


def test_stor_kropp_nektes_med_reparasjonshint(monkeypatch):
    monkeypatch.setattr(ost, "MAKS_UTTREKK_BYTES", 100)
    ost._MEMO.clear()
    _sett_urlopen(monkeypatch, b"x" * 250)
    with pytest.raises(ValueError) as e:
        ost._fetch_bytes("https://x/enorm.csv")
    s = str(e.value)
    assert "Filtrer" in s and "table_metadata" in s and "enorm.csv" in s


def test_content_length_gir_rask_nekt_uten_nedlasting(monkeypatch):
    # Content-Length over taket skal feile FØR kroppen leses — vi gir en
    # kropp som ville krasjet ved lesing (read kaster) for å bevise det.
    monkeypatch.setattr(ost, "MAKS_UTTREKK_BYTES", 100)
    ost._MEMO.clear()

    class _EksploderendeRespons(_FalskRespons):
        def read(self, n=-1):
            raise AssertionError("kroppen skulle aldri leses")

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen",
                        lambda req: _EksploderendeRespons(b"", content_length=5000))
    with pytest.raises(ValueError) as e:
        ost._fetch_bytes("https://x/annonsert-enorm.csv")
    assert "Filtrer" in str(e.value)


def test_stor_kropp_memoiseres_ikke(monkeypatch):
    # En nektet henting skal ikke etterlate noe i _MEMO — neste (filtrerte)
    # forsøk mot samme URL må gå til nettet igjen.
    monkeypatch.setattr(ost, "MAKS_UTTREKK_BYTES", 100)
    ost._MEMO.clear()
    _sett_urlopen(monkeypatch, b"x" * 250)
    with pytest.raises(ValueError):
        ost._fetch_bytes("https://x/enorm2.csv")
    assert not any("enorm2" in str(k) for k in ost._MEMO)
