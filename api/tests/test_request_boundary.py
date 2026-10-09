from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_request_id_is_generated_and_echoed() -> None:
    response = client.get("/", follow_redirects=False)
    assert len(response.headers["x-request-id"]) == 32


def test_valid_request_id_is_preserved() -> None:
    response = client.get("/", headers={"X-Request-ID": "request-12345678"}, follow_redirects=False)
    assert response.headers["x-request-id"] == "request-12345678"


def test_xml_body_is_rejected_before_endpoint_parsing() -> None:
    response = client.post(
        "/api/developer/login", content="<login/>", headers={"Content-Type": "application/xml"}
    )
    assert response.status_code == 415
    assert response.json()["detail"].startswith("Only application/json")
