"""The server trims shared trips again, whatever the phone sent."""

from datetime import UTC, datetime, timedelta

from app.services.traces import TRIM_METERS, TracePoint, distance_m, length_m, trim


def straight_trip(km: float, step_m: float = 50) -> list[TracePoint]:
    """A synthetic trip heading north from a point in Botswana, one fix every ``step_m`` metres."""

    start = datetime(2026, 10, 7, 6, 0, 17, tzinfo=UTC)
    degrees_per_meter = 1 / 110_574
    count = int(km * 1000 / step_m) + 1
    return [
        TracePoint(
            t=start + timedelta(seconds=7 * i), lon=22.4, lat=-21.3 + i * step_m * degrees_per_meter
        )
        for i in range(count)
    ]


def test_first_and_last_kilometre_are_removed() -> None:
    points = straight_trip(5)
    kept = trim(points)
    assert kept
    assert distance_m(points[0], kept[0]) >= TRIM_METERS - 1
    assert distance_m(kept[-1], points[-1]) >= TRIM_METERS - 1
    assert length_m(kept) < length_m(points) - 2 * TRIM_METERS + 100


def test_times_are_rounded_to_the_minute() -> None:
    kept = trim(straight_trip(5))
    assert all(point.t.second == 0 and point.t.microsecond == 0 for point in kept)


def test_short_trips_share_nothing() -> None:
    assert trim(straight_trip(1.9)) == []
