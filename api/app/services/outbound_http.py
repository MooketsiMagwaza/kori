"""Deny-by-default URL validation for server-side outbound HTTP requests."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeOutboundUrl(ValueError):
    pass


def validate_outbound_url(url: str, allowed_hosts: tuple[str, ...]) -> str:
    """Require HTTPS, an exact allowlisted host, and only globally routable DNS answers."""

    parsed = urlparse(url)
    host = (parsed.hostname or "").rstrip(".").lower()
    if parsed.scheme != "https":
        raise UnsafeOutboundUrl("Outbound URL must use HTTPS")
    if parsed.username or parsed.password:
        raise UnsafeOutboundUrl("Outbound URL credentials are not allowed")
    if parsed.port not in (None, 443):
        raise UnsafeOutboundUrl("Outbound URL port is not allowed")
    if not host or host not in {item.rstrip(".").lower() for item in allowed_hosts}:
        raise UnsafeOutboundUrl("Outbound URL host is not allowlisted")

    try:
        addresses = {
            result[4][0] for result in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as error:
        raise UnsafeOutboundUrl("Outbound URL host could not be resolved") from error
    if not addresses:
        raise UnsafeOutboundUrl("Outbound URL host has no address")
    for value in addresses:
        address = ipaddress.ip_address(value)
        if not address.is_global:
            raise UnsafeOutboundUrl("Outbound URL resolves to a private or reserved network")
    return url
