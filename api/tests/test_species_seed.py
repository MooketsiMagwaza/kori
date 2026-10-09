"""The database's species list must match the web apps' shared/species.ts, row for row."""

import re
from pathlib import Path

from app.species_seed import SPECIES

SHARED = Path(__file__).resolve().parents[2] / "shared" / "species.ts"
ROW = re.compile(
    r'\{ id: "(?P<id>[^"]+)", common: "(?P<common>[^"]+)",'
    r'(?: setswana: "(?P<setswana>[^"]+)",)? '
    r'scientific: "(?P<scientific>[^"]+)", group: "(?P<group>[^"]+)", '
    r'sensitivity: "(?P<sens>[^"]+)" \}'
)


def test_seed_matches_the_web_apps() -> None:
    rows = [
        (m["id"], m["common"], m["setswana"], m["scientific"], m["group"], m["sens"])
        for m in ROW.finditer(SHARED.read_text(encoding="utf-8"))
    ]
    assert rows, "could not read shared/species.ts"
    assert rows == SPECIES


def test_rhino_and_pangolin_are_sensitive() -> None:
    sensitive = {row[0] for row in SPECIES if row[5] == "sensitive"}
    assert {"white-rhino", "black-rhino", "pangolin"} <= sensitive
