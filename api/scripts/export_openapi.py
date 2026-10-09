"""Write the public part of the API's OpenAPI document for the API docs site.

    python scripts/export_openapi.py    # run in api/; writes apps/api-docs/content/openapi.json

Only the keyed public API (paths under /v1) is exported; internal and admin routes stay out of the
public documentation. tests/test_openapi_export.py fails when the committed file is out of date.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

TARGET = Path(__file__).resolve().parents[2] / "apps" / "api-docs" / "content" / "openapi.json"


def public_document() -> dict:
    full = app.openapi()
    paths = {path: item for path, item in full["paths"].items() if path.startswith("/v1/")}
    used = json.dumps(paths)
    schemas = {
        name: schema
        for name, schema in full.get("components", {}).get("schemas", {}).items()
        if f'"#/components/schemas/{name}"' in used
    }
    return {
        "openapi": full["openapi"],
        "info": {**full["info"], "description": "Kori's keyed public API (draft; not deployed)."},
        "paths": paths,
        "components": {"schemas": schemas},
    }


def render() -> str:
    return json.dumps(public_document(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {TARGET}")
