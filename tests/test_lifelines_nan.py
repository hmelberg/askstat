"""NaN i varighet/hendelse/kovariat skal gi feil (som ekte lifelines), ikke
stille feil kurver: en NaN-varighet ble et eget tidspunkt, og et NaN-flagg
er sant i Python og ble talt som observert hendelse."""
import math
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "shared"))
import lifelines_core as L  # noqa: E402

NAN = float("nan")


def test_km_nan_varighet():
    with pytest.raises(TypeError, match="NaN"):
        L.KaplanMeierFitter().fit([NAN, 1, 2, NAN, 3])


def test_km_nan_hendelse():
    with pytest.raises(TypeError, match="NaN"):
        L.KaplanMeierFitter().fit([1, 2, 3], [1, NAN, 0])


def test_logrank_nan_varighet():
    with pytest.raises(TypeError, match="NaN"):
        L.multivariate_logrank_test([1, NAN, 3, 4], ["a", "a", "b", "b"])


def test_logrank_manglende_gruppe():
    # B11h: hver NaN-gruppe var sin egen gruppe (nan != nan) og blåste opp df
    with pytest.raises(ValueError, match="gruppe"):
        L.multivariate_logrank_test([1, 2, 3, 4, 5], ["a", NAN, "b", NAN, "b"])
    with pytest.raises(ValueError, match="gruppe"):
        L.multivariate_logrank_test([1, 2, 3, 4], ["a", None, "b", "b"])


def test_logrank_lengdeavvik():
    with pytest.raises(ValueError, match="lengde"):
        L.multivariate_logrank_test([1, 2, 3, 4], ["a", "a", "b"])
    with pytest.raises(ValueError, match="lengde"):
        L.multivariate_logrank_test([1, 2, 3, 4], ["a", "a", "b", "b"], [1, 0, 1])


def test_logrank_nan_gruppe_ga_ikke_ekstra_frihetsgrader():
    r = L.multivariate_logrank_test([1, 2, 3, 4], ["a", "a", "b", "b"])
    assert r.degrees_of_freedom == 1


def test_cox_tomt_datasett():
    with pytest.raises(ValueError, match="rader"):
        L.CoxPHFitter().fit({"T": [], "E": [], "x": []}, duration_col="T", event_col="E")


def test_km_uten_nan_virker_som_for():
    k = L.KaplanMeierFitter().fit([1, 2, 3, 4], [1, 0, 1, 1])
    assert k is not None
    assert not math.isnan(float(k.median_survival_time_))
