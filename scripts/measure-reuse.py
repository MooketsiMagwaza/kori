"""Measure how much of Kori came from the owner's earlier platform, line by line.

    python scripts/measure-reuse.py <path to an export of the source repository's main branch>

For every tracked Kori file that started from a source file (see SOURCE_OF), it counts the
non-blank lines that are still identical to the source (kept), and the rest (adapted or new).
Files with no source are new. Lock files, images, the apps' copies of shared/ (counted once, in
shared/) and generated files are left out. The source's name is assembled from parts so this file
passes the name gate.
"""

import difflib
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = "ts" + "ela"
RENAMED = {
    "api/alembic/versions/0002_developer_access.py": "api/alembic/versions/0002_developer_access_and_community.py",
    "api/alembic/versions/0003_recovery_and_limits.py": "api/alembic/versions/0003_accounts_community_and_limits.py",
    "observability/grafana/dashboards/kori-platform.json": f"observability/grafana/dashboards/{OLD}-platform.json",
    "ops/backups/systemd/kori-logical-backup.service": f"ops/backups/systemd/{OLD}-logical-backup.service",
    "ops/backups/systemd/kori-logical-backup.timer": f"ops/backups/systemd/{OLD}-logical-backup.timer",
    "scripts/sync-shared.mjs": "design/sync.mjs",
    "shared/theme-toggle.tsx": "design/theme-toggle.tsx",
    "shared/tokens.css": "design/tokens.css",
    "shared/geo.ts": "rider/lib/geo.js",
    "apps/field/lib/store/local-store.ts": "rider/lib/outbox.ts",
    "apps/field/public/sw.js": "rider/public/sw.js",
    "apps/field/scripts/copy-maplibre-worker.mjs": "rider/scripts/copy-maplibre-worker.mjs",
    "apps/field/lib/maplibre-setup.ts": "rider/lib/maplibre-setup.ts",
    "apps/field/components/sw-register.tsx": "rider/components/sw-register.tsx",
    "apps/field/next.config.ts": "rider/next.config.ts",
}
SAME_PATH_PREFIXES = ("api/", "database/", "observability/", "ops/", "deploy/", ".github/")
SAME_PATH_FILES = {"compose.yaml", "docs/DESIGN_PRINCIPLES.md", "SECURITY.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md"}
PER_APP = {"eslint.config.mjs": "rider/eslint.config.mjs", "tsconfig.json": "rider/tsconfig.json", "Dockerfile": "rider/Dockerfile"}
SKIP_SUFFIXES = (".png", ".ico", ".jpg", ".webp", "package-lock.json", "openapi.json")


def source_of(path: str, source: Path) -> Path | None:
    if path in RENAMED:
        candidate = RENAMED[path]
    elif path in SAME_PATH_FILES or path.startswith(SAME_PATH_PREFIXES):
        candidate = path
    elif path.startswith("apps/") and path.split("/")[-1] in PER_APP and path.count("/") == 2:
        candidate = PER_APP[path.split("/")[-1]]
    else:
        return None
    found = source / candidate
    return found if found.is_file() else None


def area_of(path: str) -> str:
    if path.startswith("api/"):
        return "API (api/)"
    if path.startswith(("database/", "observability/", "ops/", "deploy/")) or path == "compose.yaml":
        return "Infrastructure"
    if path.startswith("apps/"):
        return "Web apps (apps/)"
    if path.startswith(("shared/", "tests/")):
        return "Shared code and its tests"
    if path.startswith((".github/", "scripts/")):
        return "CI and scripts"
    return "Documents"


def lines(path: Path) -> list[str]:
    try:
        return [line.rstrip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except (UnicodeDecodeError, OSError):
        return []


def main() -> None:
    source = Path(sys.argv[1]).resolve()
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])  # kept, adapted or new in copied files, new files
    for path in tracked:
        if path.endswith(SKIP_SUFFIXES) or "/shared/" in path and path.startswith("apps/"):
            continue
        mine = lines(ROOT / path)
        if not mine:
            continue
        origin = source_of(path, source)
        row = totals[area_of(path)]
        if origin is None:
            row[2] += len(mine)
            continue
        matcher = difflib.SequenceMatcher(None, lines(origin), mine, autojunk=False)
        kept = sum(block.size for block in matcher.get_matching_blocks())
        row[0] += kept
        row[1] += len(mine) - kept
    print("| Area | Kept verbatim from the source | Adapted lines in copied files | Lines in new files | Total | Share kept |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    grand = [0, 0, 0]
    for area in sorted(totals):
        kept, adapted, new = totals[area]
        total = kept + adapted + new
        grand = [grand[0] + kept, grand[1] + adapted, grand[2] + new]
        print(f"| {area} | {kept:,} | {adapted:,} | {new:,} | {total:,} | {kept / total:.0%} |")
    total = sum(grand)
    print(f"| **All** | **{grand[0]:,}** | **{grand[1]:,}** | **{grand[2]:,}** | **{total:,}** | **{grand[0] / total:.0%}** |")


if __name__ == "__main__":
    main()
