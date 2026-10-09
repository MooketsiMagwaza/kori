#!/bin/bash
# Host-side runner for the recovery drills (needs docker compose and the "recovery" profile up).
#
#   ops/backups/run-drills.sh restore   # rebuild from the newest OFF-HOST logical backup
#   ops/backups/run-drills.sh pitr      # base backup + archived WAL replayed to a chosen instant
#   ops/backups/run-drills.sh all
#
# Each drill writes a JSON evidence file to ops/backups/evidence/. A drill that has not run
# recently is not evidence of recoverability; schedule it.
set -Eeuo pipefail

cd "$(dirname "$0")/../.."
DC="docker compose --profile recovery --profile drill"
PGUSER_="${POSTGRES_USER:-kori}"
PGDB_="${POSTGRES_DB:-kori}"
EVIDENCE=ops/backups/evidence
mkdir -p "$EVIDENCE"

say() { printf '\n== %s\n' "$*"; }
primary_sql() { $DC exec -T db psql -qAt -U "$PGUSER_" -d "$PGDB_" -c "$1"; }

restore_drill() {
  say "Logical restore drill (off-host backup -> clean server)"
  $DC up -d --wait restore-target 2>/dev/null || $DC up -d restore-target
  $DC run --rm restore-drill
  $DC rm -sfv restore-target >/dev/null
}

pitr_drill() {
  say "Point-in-time recovery drill (base backup + archived WAL)"
  local started; started=$(date +%s)

  $DC run --rm backup base
  primary_sql 'CREATE TABLE IF NOT EXISTS pitr_drill_marker (id serial PRIMARY KEY, label text NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp())'
  primary_sql "INSERT INTO pitr_drill_marker (label) VALUES ('before-target')"
  local target
  target=$(primary_sql "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")
  sleep 3
  primary_sql "INSERT INTO pitr_drill_marker (label) VALUES ('after-target')"

  # Force the segments holding both writes into the archive, then wait for the archiver.
  local before_wal; before_wal=$(primary_sql 'SELECT coalesce(last_archived_wal, '"''"') FROM pg_stat_archiver')
  primary_sql 'SELECT pg_switch_wal()' >/dev/null
  for _ in $(seq 1 45); do
    [[ "$(primary_sql 'SELECT coalesce(last_archived_wal, '"''"') FROM pg_stat_archiver')" != "$before_wal" ]] && break
    sleep 2
  done
  primary_sql 'SELECT pg_switch_wal()' >/dev/null
  sleep 6

  say "Recovering to $target on a clean server"
  local recovery_started; recovery_started=$(date +%s)
  RECOVERY_TARGET_TIME="$target" $DC up -d pitr-target
  local ready=false
  for _ in $(seq 1 90); do
    if [[ "$($DC exec -T pitr-target psql -qAt -U "$PGUSER_" -d "$PGDB_" -c 'SELECT NOT pg_is_in_recovery()' 2>/dev/null || true)" == "t" ]]; then ready=true; break; fi
    sleep 2
  done
  $ready || { $DC logs --tail 40 pitr-target; $DC rm -sfv pitr-target >/dev/null; echo "recovery did not complete" >&2; exit 1; }
  local recovery_seconds=$(( $(date +%s) - recovery_started ))

  local labels
  labels=$($DC exec -T pitr-target psql -qAt -U "$PGUSER_" -d "$PGDB_" -c "SELECT string_agg(label, ',' ORDER BY id) FROM pitr_drill_marker")
  $DC rm -sfv pitr-target >/dev/null

  local result=failed
  if [[ "$labels" == *"before-target"* && "$labels" != *"after-target"* ]]; then result=passed; fi
  local file="$EVIDENCE/pitr-$(date -u +%Y%m%dT%H%M%SZ).json"
  cat >"$file" <<JSON
{
  "drill": "point-in-time-recovery",
  "result": "$result",
  "completedAt": "$(date -u +%FT%TZ)",
  "recoveryTargetUtc": "$target",
  "markersPresentAfterRecovery": "$labels",
  "expected": "before-target present, after-target absent",
  "recoverySeconds": $recovery_seconds,
  "totalSeconds": $(( $(date +%s) - started )),
  "method": "base backup + archived WAL replayed on a scratch server with no shared volume"
}
JSON
  say "PITR drill $result; markers after recovery: $labels; evidence: $file"
  [[ "$result" == passed ]]
}

case "${1:-all}" in
  restore) restore_drill ;;
  pitr) pitr_drill ;;
  all) restore_drill; pitr_drill ;;
  *) echo "usage: run-drills.sh restore|pitr|all" >&2; exit 64 ;;
esac
