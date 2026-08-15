"""Adapter-batteriet (spec 2026-08-15 §3): representative, spørsmålsformede
live-lesinger per styrt kilde — så adaptergap oppdages i CI/lokalt, ikke i
Hans' neste manuelle røyk. Kjøres KUN med ASKSTAT_LIVE=1 (default-suitene
er hermetiske):  ASKSTAT_LIVE=1 python3 -m pytest tests/test_adapter_battery.py -q
Basert på målte feilklasser: eurostat kommaform-stille-tomt (norden-runden),
ssb aggregat-via-utelatelse (Oslo-runde 9)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import openstat as ost  # noqa: E402

live = pytest.mark.skipif(not os.environ.get("ASKSTAT_LIVE"),
                          reason="live-API-batteri — sett ASKSTAT_LIVE=1")

SSB = "https://data.ssb.no/api/pxwebapi/v2/tables"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
OECD = "https://sdmx.oecd.org/public/rest/data"


@live
def test_ssb_kommune_aarserie():
    df = ost.connect(SSB, kind="pxweb").read(
        "07459", regions=["0301"], years="2015:2024", indicators=["Personer1"])
    assert len(df) > 0
    assert df["value"].notna().any()


@live
def test_ssb_aggregat_via_utelatte_eliminerbare_dims():
    # Oslo-runde 9: modellen gjettet Kjonn=0/Alder=000 — riktig form er å
    # UTELATE eliminerbare dimensjoner; da svarer PxWeb med aggregatet.
    df = ost.connect(SSB, kind="pxweb").read(
        "07459", regions=["0301"], years="2023:2024", indicators=["Personer1"])
    assert len(df) > 0


@live
def test_eurostat_flerland_maanedsserie():
    # Norden-runden: kommaformen geo=NO,SE svarer Eurostat STILLE TOMT på —
    # liste-verdier skal bli én param per verdi og gi data for alle fem.
    # Task 3b (2026-08-15): dette caset var xfail — _canonical_from_query()
    # str()-coercet listen til repr FØR _translate_canonical fikk se den,
    # så norden-runde-fiksen traff aldri via den offentlige .read()-
    # inngangen (kun via direkte _translate_canonical-kall). Fikset i
    # openstat.py; caset skal nå passere som alle de andre.
    df = ost.connect(EUROSTAT, kind="eurostat").read(
        "ei_lmhr_m", filters={"geo": ["DK", "FI", "IS", "NO", "SE"], "s_adj": "SA"},
        years="2024:2026")
    assert len(df) > 0
    assert set(df["geo"].unique()) >= {"DK", "FI", "IS", "NO", "SE"}


@live
def test_oecd_ledighet_norge():
    # spec §3: «én kjent dataflow m/ countries=["NOR"] + years» — flowRef
    # gjenbrukt fra data/sources/oecd.md sitt komplette eksempel (ledighet,
    # Norge og Sverige). Live-verifisert 2026-08-15 med countries=["NOR"]
    # alene (needs_key-probe + REF_AREA-posisjon i CSV-headeren stemte).
    # OECD sitt SDMX-endepunkt er kjent for å være tidvis trått/ustabilt —
    # merk denne som kjent-flaky i feilrapporter, ikke som adaptergap, med
    # mindre feilen er en annen enn nettverk/tidsavbrudd.
    df = ost.connect(OECD, kind="oecd").read(
        "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M", countries=["NOR"], years="2023:2024")
    assert len(df) > 0
    assert df["OBS_VALUE"].notna().any()


@live
def test_norgesbank_valutakurs():
    # data/sources/norgesbank.md: ressurssti = <flow>/<nøkkel>; nøkkelen
    # bygges av lasteren fra countries()/filters() + CSV-header-introspeksjon
    # (kind="sdmx", IKKE kind="norgesbank" — begge er aliaser til «sdmx» i
    # _KIND_ALIAS, men brief-formen brukes ordrett). Live-verifisert
    # 2026-08-15: EXR-dataflowens dimensjonsrekkefølge er
    # FREQ.BASE_CUR.QUOTE_CUR.TENOR — filters={"BASE_CUR","QUOTE_CUR","FREQ"}
    # treffer riktig posisjon uten TENOR (utelatt = alle tenorer/gjennom SP).
    df = ost.connect("https://data.norges-bank.no/api/data", kind="sdmx").read(
        "EXR", years="2024:2025", filters={"BASE_CUR": "USD", "QUOTE_CUR": "NOK", "FREQ": "M"})
    assert len(df) > 0
