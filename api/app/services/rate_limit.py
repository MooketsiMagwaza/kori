"""Small in-process invalid-credential gate; production deployments should use Redis."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from threading import Lock


class InvalidCredentialGate:
    """Bound repeated bad API-key attempts before another database lookup is made."""

    def __init__(self) -> None:
        self._attempts: dict[str, deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    def blocked(self, identity: str, limit: int) -> bool:
        with self._lock:
            attempts = self._fresh(identity)
            return len(attempts) >= limit

    def record(self, identity: str) -> None:
        with self._lock:
            self._fresh(identity).append(datetime.now(UTC))

    def _fresh(self, identity: str) -> deque[datetime]:
        cutoff = datetime.now(UTC) - timedelta(hours=1)
        attempts = self._attempts[identity]
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        return attempts


invalid_credential_gate = InvalidCredentialGate()
