"""Password and opaque-token primitives; raw credentials are never persisted."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from app.config import get_settings

PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def issue_session_token() -> str:
    return f"kori_session_{secrets.token_urlsafe(32)}"


def issue_password_reset_token() -> str:
    return f"kori_reset_{secrets.token_urlsafe(32)}"


def issue_api_key() -> str:
    return f"kori_live_{secrets.token_urlsafe(32)}"


def hash_token(token: str) -> str:
    secret = get_settings().token_hash_secret
    return hmac.new(
        secret.encode(), token.encode(), hashlib.sha256
    ).hexdigest()


def key_prefix(key: str) -> str:
    return key[:16]
