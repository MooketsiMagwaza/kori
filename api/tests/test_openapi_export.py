"""The API docs site reads the public OpenAPI document; it must match the code."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_openapi.py"


def _exporter():
    spec = importlib.util.spec_from_file_location("export_openapi", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_committed_document_matches_the_api() -> None:
    exporter = _exporter()
    committed = exporter.TARGET.read_text(encoding="utf-8") if exporter.TARGET.is_file() else ""
    assert committed == exporter.render(), "run: python scripts/export_openapi.py"


def test_only_the_public_api_is_exported() -> None:
    document = _exporter().public_document()
    assert document["paths"], "no public paths exported"
    assert all(path.startswith("/v1/") for path in document["paths"])
