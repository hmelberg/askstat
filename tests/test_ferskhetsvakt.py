"""Ferskhetsvakta (runde 10-funn R10-C, Hans' ok 2026-08-16): «nå»-spørsmål
ble besvart med et frosset speils des 2023-tall — speiladvarselen i guiden
ble LEST og rasjonalisert bort. Tekst er probabilistisk; dette er
miljøvernet: adapterlaget måler selv siste periode i uttrekket mot dagens
dato og PRINTER en varsellinje ved henting (uansett hvordan modellen viser
dataene etterpå). Varsler, blokkerer aldri.

Terskler: måneds-/kvartals-/dagsdata > 12 mnd gamle varsles; årsdata først
når nyeste år ligger > 3 år bak (WHO/GHED-klassen har legitimt ~2 års lag —
helse-BNP 2023 i 2026 skal IKKE varsles; lav falsk-positiv-rate er vaktas
levevilkår)."""
import datetime

import pandas as pd

import openstat as ost

IDAG = datetime.date(2026, 8, 16)


def test_manedsdata_gammel_varsles():
    df = pd.DataFrame({"geo": ["SE"], "time": ["2023-12"], "value": [8.2]})
    adv = ost.ferskhetsvakt(df, idag=IDAG)
    assert adv is not None and "2023-12" in adv and "32" in adv


def test_manedsdata_fersk_varsles_ikke():
    df = pd.DataFrame({"geo": ["NO"], "time": ["2026-07"], "value": [3.0]})
    assert ost.ferskhetsvakt(df, idag=IDAG) is None


def test_ssb_manedsform_og_kvartal():
    df = pd.DataFrame({"Tid": ["2023M12"], "value": [1.0]})
    assert ost.ferskhetsvakt(df, idag=IDAG) is not None
    dfq = pd.DataFrame({"TIME_PERIOD": ["2023-Q4"], "OBS_VALUE": [1.0]})
    assert ost.ferskhetsvakt(dfq, idag=IDAG) is not None


def test_aarsdata_moderat_lag_varsles_ikke():
    # WHO/GHED-klassen: 2023-tall i 2026 er kildens ferskeste — ikke støy
    df = pd.DataFrame({"country": ["NO"], "date": ["2023"], "value": [9.4]})
    assert ost.ferskhetsvakt(df, idag=IDAG) is None


def test_aarsdata_gammel_varsles_ogsaa_som_int():
    df = pd.DataFrame({"Tid": [2020, 2021, 2022], "value": [1, 2, 3]})
    adv = ost.ferskhetsvakt(df, idag=IDAG)
    assert adv is not None and "2022" in adv


def test_datetimekolonne_gammel():
    df = pd.DataFrame({"dato": pd.to_datetime(["2023-11-01", "2023-12-01"]),
                       "value": [1.0, 2.0]})
    assert ost.ferskhetsvakt(df, idag=IDAG) is not None


def test_uten_tidskolonne_eller_tom_gir_none():
    assert ost.ferskhetsvakt(pd.DataFrame({"a": [1]}), idag=IDAG) is None
    assert ost.ferskhetsvakt(pd.DataFrame(), idag=IDAG) is None
    assert ost.ferskhetsvakt("ikke en frame", idag=IDAG) is None


def test_source_read_printer_varselet(monkeypatch, capsys):
    stale = pd.DataFrame({"geo": ["SE"], "period": ["2023-12"], "value": [8.2]})
    monkeypatch.setattr(ost.Source, "_read_impl", lambda self, *a, **k: stale)
    df = ost.connect("https://x", kind="csv").read()
    assert df is stale
    ut = capsys.readouterr().out
    assert "Ferskhetsvakta" in ut and "2023-12" in ut


def test_source_read_stille_ved_fersk(monkeypatch, capsys):
    fersk = pd.DataFrame({"time": ["2026-07"], "value": [3.0]})
    monkeypatch.setattr(ost.Source, "_read_impl", lambda self, *a, **k: fersk)
    ost.connect("https://x", kind="csv").read()
    assert "Ferskhetsvakta" not in capsys.readouterr().out
