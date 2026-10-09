import socket
from unittest.mock import patch

import pytest

from app.services.outbound_http import UnsafeOutboundUrl, validate_outbound_url


def test_outbound_url_requires_https_and_allowlist() -> None:
    with pytest.raises(UnsafeOutboundUrl):
        validate_outbound_url("http://router.example.test/route", ("router.example.test",))
    with pytest.raises(UnsafeOutboundUrl):
        validate_outbound_url("https://attacker.example/route", ("router.example.test",))


@patch("app.services.outbound_http.socket.getaddrinfo")
def test_outbound_url_rejects_private_dns_answers(getaddrinfo) -> None:
    getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
    with pytest.raises(UnsafeOutboundUrl):
        validate_outbound_url("https://router.example.test/route", ("router.example.test",))


@patch("app.services.outbound_http.socket.getaddrinfo")
def test_outbound_url_accepts_global_allowlisted_destination(getaddrinfo) -> None:
    getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]
    assert validate_outbound_url(
        "https://router.example.test/route", ("router.example.test",)
    ).startswith("https://")
