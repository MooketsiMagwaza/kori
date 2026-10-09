"""Scheduler windows, run IDs, and the guarantee that every scheduled job exists."""

from datetime import UTC, datetime, timedelta

from app.jobs import scheduler
from app.jobs.maintenance import JOBS

NOON = datetime(2026, 9, 28, 12, 0, 5, tzinfo=UTC)


def test_every_scheduled_job_has_an_implementation_and_an_interval() -> None:
    assert set(scheduler.SCHEDULE) <= set(JOBS)
    assert all(interval >= 3600 for interval in scheduler.SCHEDULE.values())


def test_run_ids_are_stable_within_a_window_and_change_between_windows() -> None:
    hourly = scheduler.HOUR
    first = scheduler.run_id_for("cleanup-auth", NOON, hourly)

    assert scheduler.run_id_for("cleanup-auth", NOON + timedelta(minutes=30), hourly) == first
    assert scheduler.run_id_for("cleanup-auth", NOON + timedelta(hours=1), hourly) != first
    assert scheduler.run_id_for("prune-usage", NOON, hourly) != first


def test_a_job_becomes_due_once_per_window() -> None:
    finished: dict[str, int] = {}
    assert {job for job, _ in scheduler.due_jobs(NOON, finished)} == set(scheduler.SCHEDULE)

    for job, interval in scheduler.SCHEDULE.items():
        finished[job] = scheduler.slot_for(NOON, interval)
    assert scheduler.due_jobs(NOON + timedelta(minutes=10), finished) == []

    later = NOON + timedelta(hours=2)
    due = {job for job, _ in scheduler.due_jobs(later, finished)}
    assert {"cleanup-auth", "cleanup-uploads"} <= due
    assert "prune-usage" not in due


def test_tick_runs_each_due_job_and_survives_a_failing_one(monkeypatch) -> None:
    calls: list[str] = []

    def fake_run(job: str, run_id: str) -> None:
        calls.append(job)
        if job == "cleanup-auth":
            raise RuntimeError("boom")

    monkeypatch.setattr(scheduler, "run", fake_run)
    finished: dict[str, int] = {}

    scheduler.tick(finished, NOON)
    scheduler.tick(finished, NOON + timedelta(minutes=1))

    assert sorted(calls) == sorted(scheduler.SCHEDULE), "each job runs once per window"
