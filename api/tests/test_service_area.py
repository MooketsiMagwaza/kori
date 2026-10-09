"""Unit checks for the Botswana envelope and its boundary semantics."""

from dataclasses import dataclass

import pytest
from fastapi import HTTPException

from app.services.service_area import (
    all_inside_botswana,
    is_inside_botswana,
    require_inside_botswana,
)


@dataclass
class Point:
    lat: float
    lon: float


def test_points_in_botswana_are_inside() -> None:
    assert all_inside_botswana([Point(-24.6533, 25.9231), Point(-19.9833, 23.4167)])


def test_johannesburg_is_outside() -> None:
    assert not is_inside_botswana(Point(-26.2041, 28.0473 + 1.5))


def test_boundary_is_inclusive() -> None:
    assert is_inside_botswana(Point(-26.95, 19.9))


def test_guard_rejects_before_any_database_work() -> None:
    with pytest.raises(HTTPException, match="inside Botswana") as error:
        require_inside_botswana([Point(-19.98, 23.42), Point(-33.92, 18.42)])
    assert error.value.status_code == 422
