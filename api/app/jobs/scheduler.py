"""Idempotent scheduler for lifecycle jobs.

Each job has one owner (this process), a fixed interval, and a deterministic run ID derived from
the time slot. Because ``MaintenanceRun.run_id`` is unique, two replicas (or a restart in the
same slot) cannot run a job twice: the second attempt reports ``duplicate_skipped``.
Failures are recorded and retried on the next tick; a missed run raises an alert through the
``kori_maintenance_*`` metrics.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import UTC, datetime
from pathlib import Path

from app.jobs.maintenance import JOBS, run

LOGGER = logging.getLogger("kori.scheduler")
HOUR, DAY, WEEK = 3600, 86_400, 604_800

# job name -> interval in seconds. Every entry must exist in maintenance.JOBS.
SCHEDULE: dict[str, int] = {
    "cleanup-auth": HOUR,
    "cleanup-uploads": HOUR,
    "prune-usage": DAY,
    "key-rotation-audit": DAY,
    "expire-trips": HOUR,
    "purge-deleted-accounts": DAY,
    "cleanup-consent": WEEK,
}
TICK_SECONDS = 30
# Touched after every tick. The container health check reads its age, because the scheduler
# serves no HTTP and the API image's own health check would always fail against it.
HEARTBEAT_PATH = Path(os.environ.get("SCHEDULER_HEARTBEAT_PATH", "/tmp/scheduler-heartbeat"))


def slot_for(now: datetime, interval: int) -> int:
    """Index of the fixed-length window ``now`` falls in (windows align to the Unix epoch)."""

    return int(now.timestamp() // interval)


def run_id_for(job: str, now: datetime, interval: int) -> str:
    return f"{job}@{slot_for(now, interval)}"


def due_jobs(now: datetime, finished_slots: dict[str, int]) -> list[tuple[str, str]]:
    """Jobs whose current window has not been attempted yet, as ``(job, run_id)`` pairs."""

    due = []
    for job, interval in SCHEDULE.items():
        if finished_slots.get(job) != slot_for(now, interval):
            due.append((job, run_id_for(job, now, interval)))
    return due


def tick(finished_slots: dict[str, int], now: datetime | None = None) -> None:
    moment = now or datetime.now(UTC)
    for job, run_id in due_jobs(moment, finished_slots):
        try:
            run(job, run_id)
        except Exception as error:  # noqa: BLE001 - one bad job must not stop the others
            LOGGER.error(json.dumps({"job": job, "runId": run_id, "error": type(error).__name__}))
            # The failed row keeps its run ID, so the job is retried in the next window and the
            # failure alert fires in the meantime.
        finished_slots[job] = slot_for(moment, SCHEDULE[job])


def main() -> None:
    missing = set(SCHEDULE) - set(JOBS)
    if missing:
        raise SystemExit(f"Scheduled jobs without an implementation: {sorted(missing)}")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    LOGGER.info(json.dumps({"event": "scheduler_started", "jobs": SCHEDULE}))
    finished: dict[str, int] = {}
    while True:
        tick(finished)
        HEARTBEAT_PATH.touch()
        time.sleep(TICK_SECONDS)


if __name__ == "__main__":
    main()
