"""The server's publication rules must agree with the web apps' shared/rules.ts."""

from datetime import UTC, datetime, timedelta

import pytest

from app.services.publication import (
    RULES,
    cell_for,
    is_public,
    round_down,
    rule_for,
    sensitivity_of,
    visible_from,
)

# Computed with shared/rules.ts (cellFor) on 8 October 2026.
TYPESCRIPT_CELLS = [
    ((22.41234, -21.30123), 1000, "c1000:2313:-2356", (22.41457, -21.30248)),
    ((22.41234, -21.30123), 10000, "c10000:231:-236", (22.4291, -21.29795)),
    ((25.9231, -24.6533), 1000, "c1000:2675:-2727", (25.92184, -24.6577)),
    ((23.4167, -19.9833), 10000, "c10000:241:-221", (23.39796, -19.9414)),
]


@pytest.mark.parametrize(("point", "size", "cell_id", "centre"), TYPESCRIPT_CELLS)
def test_grid_matches_the_web_apps(point, size, cell_id, centre) -> None:
    cell = cell_for(point[0], point[1], size)
    assert cell.id == cell_id
    assert (cell.lon, cell.lat) == pytest.approx(centre, abs=1e-5)


def test_sensitive_species_dens_and_unknowns_are_coarse_and_late() -> None:
    assert sensitivity_of("sensitive") == "sensitive"
    assert sensitivity_of("standard", den_or_nest=True) == "sensitive"
    assert sensitivity_of(None) == "sensitive"
    assert rule_for("sensitive").cell_meters == 10_000
    assert rule_for("sensitive").delay == timedelta(days=7)
    assert not rule_for("sensitive").guidance and not rule_for("sensitive").qr_share
    assert RULES["standard"].cell_meters == 1_000


def test_no_live_locations() -> None:
    seen = datetime(2026, 10, 7, 12, 0, tzinfo=UTC)
    shown = visible_from(seen, "standard", den_or_nest=False)
    assert shown == seen + timedelta(hours=1)
    assert not is_public("approved", shown, seen + timedelta(minutes=59))
    assert is_public("approved", shown, shown)
    assert not is_public("pending", shown, shown + timedelta(days=30))


def test_times_are_published_to_the_quarter_hour() -> None:
    moment = datetime(2026, 10, 7, 12, 44, 59, tzinfo=UTC)
    assert round_down(moment, 15) == datetime(2026, 10, 7, 12, 30, tzinfo=UTC)
