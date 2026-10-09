#!/bin/bash
# Kori backup runner. Commands: logical | base | prune | verify | scheduler
#
# Every job records its outcome in "MaintenanceRun" so a missed or failed run raises an alert,
# encrypts before anything leaves the host, and copies to an off-host S3-compatible bucket.
set -Eeuo pipefail
umask 077

: "${PGHOST:=db}" "${PGPORT:=5432}" "${PGDATABASE:=kori}" "${PGUSER:=kori_backup}"
: "${BACKUP_DIR:=/backups}" "${BACKUPS_BUCKET:=kori-backups}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${LOGICAL_KEEP_DAYS:=30}" "${LOGICAL_KEEP_MONTHS:=12}" "${BASE_KEEP:=4}" "${WAL_KEEP_DAYS:=30}"
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD="${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD is required}"

# rclone reads its remote from the environment; nothing is written to disk.
export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER="${OFFSITE_PROVIDER:-Minio}"
export RCLONE_CONFIG_OFFSITE_ENDPOINT="${OFFSITE_ENDPOINT:-http://objects:9000}"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${OFFSITE_ACCESS_KEY:?OFFSITE_ACCESS_KEY is required}"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${OFFSITE_SECRET_KEY:?OFFSITE_SECRET_KEY is required}"
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true

STATE="$BACKUP_DIR/state"
mkdir -p "$BACKUP_DIR/logical" "$BACKUP_DIR/base" "$BACKUP_DIR/work" "$STATE"
stamp() { date -u +%Y%m%dT%H%M%SZ; }
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# record JOB STATUS [ROWS] [DETAIL_JSON]: append an audit row; never fail the job over it.
record() {
  local job="$1" status="$2" rows="${3:-0}" detail="${4:-}"
  [[ -n "$detail" ]] || detail='{}'
  local run_id="$job-$(stamp)-$RANDOM"
  psql -qAt -v ON_ERROR_STOP=1 -v job="$job" -v run="$run_id" -v status="$status" -v rows="$rows" -v detail="$detail" <<'SQL' >/dev/null || log "WARN: could not record $job outcome"
INSERT INTO "MaintenanceRun" ("jobName", "runId", status, "rowsAffected", detail, "finishedAt")
VALUES (:'job', :'run', :'status', :'rows'::int, :'detail'::jsonb, now());
SQL
}

encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$1" -out "$2"; }
decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$1" -out "$2"; }
upload() { rclone copyto "$1" "offsite:${BACKUPS_BUCKET}/$2"; }

logical() {
  local name="kori-$(stamp)" started=$SECONDS
  local plain="$BACKUP_DIR/work/$name.tar" enc="$BACKUP_DIR/logical/$name.tar.enc"
  rm -f "$BACKUP_DIR"/work/*.tar
  pg_dump --format=tar --no-password --file="$plain" "$PGDATABASE"
  pg_restore --list "$plain" >/dev/null
  encrypt "$plain" "$enc"
  rm -f "$plain"
  ( cd "$BACKUP_DIR/logical" && sha256sum "$name.tar.enc" >"$name.tar.enc.sha256" )
  upload "$enc" "logical/$name.tar.enc"
  upload "$enc.sha256" "logical/$name.tar.enc.sha256"
  local bytes; bytes=$(stat -c %s "$enc")
  log "logical backup verified and copied off-host: $name.tar.enc ($bytes bytes)"
  record logical-backup succeeded 1 "{\"file\":\"$name.tar.enc\",\"bytes\":$bytes,\"seconds\":$((SECONDS - started))}"
}

base() {
  local name="base-$(stamp)" started=$SECONDS
  local dir="$BACKUP_DIR/base/$name"
  mkdir -p "$dir"
  pg_basebackup --no-password -D "$dir" -Ft -z -X stream -c fast --label "$name"
  tar -C "$dir" -cf "$BACKUP_DIR/work/$name.tar" .
  encrypt "$BACKUP_DIR/work/$name.tar" "$BACKUP_DIR/base/$name.tar.enc"
  rm -f "$BACKUP_DIR/work/$name.tar"
  ( cd "$BACKUP_DIR/base" && sha256sum "$name.tar.enc" >"$name.tar.enc.sha256" )
  upload "$BACKUP_DIR/base/$name.tar.enc" "base/$name.tar.enc"
  upload "$BACKUP_DIR/base/$name.tar.enc.sha256" "base/$name.tar.enc.sha256"
  ln -sfn "$name" "$BACKUP_DIR/base/current"
  log "base backup completed: $name"
  record base-backup succeeded 1 "{\"name\":\"$name\",\"seconds\":$((SECONDS - started))}"
}

prune() {
  local removed=0 file day month keep old
  local cutoff_days cutoff_month
  cutoff_days=$(date -u -d "-${LOGICAL_KEEP_DAYS} days" +%Y%m%d)
  cutoff_month=$(date -u -d "-${LOGICAL_KEEP_MONTHS} months" +%Y%m)
  for file in $(rclone lsf "offsite:${BACKUPS_BUCKET}/logical/" --files-only | grep '\.tar\.enc$' || true); do
    day=${file#kori-}; day=${day:0:8}; month=${day:0:6}
    keep=false
    [[ "$day" -ge "$cutoff_days" ]] && keep=true
    [[ "${day:6:2}" == "01" && "$month" -ge "$cutoff_month" ]] && keep=true
    if ! $keep; then
      rclone deletefile "offsite:${BACKUPS_BUCKET}/logical/$file" || true
      rclone deletefile "offsite:${BACKUPS_BUCKET}/logical/$file.sha256" || true
      rm -f "$BACKUP_DIR/logical/$file" "$BACKUP_DIR/logical/$file.sha256"
      removed=$((removed + 1))
    fi
  done
  # Keep only the newest BASE_KEEP base backups; each one is a point-in-time starting point.
  local bases excess
  bases=$(ls -1 "$BACKUP_DIR/base" | grep -E '^base-[0-9TZ]+$' | sort || true)
  excess=$(( $(printf '%s\n' "$bases" | grep -c . || true) - BASE_KEEP ))
  if [[ $excess -gt 0 ]]; then
    for old in $(printf '%s\n' "$bases" | head -n "$excess"); do
      rm -rf "$BACKUP_DIR/base/$old" "$BACKUP_DIR/base/$old.tar.enc" "$BACKUP_DIR/base/$old.tar.enc.sha256"
      rclone deletefile "offsite:${BACKUPS_BUCKET}/base/$old.tar.enc" || true
      rclone deletefile "offsite:${BACKUPS_BUCKET}/base/$old.tar.enc.sha256" || true
      removed=$((removed + 1))
    done
  fi
  # Archived WAL is only useful back to the oldest retained base backup.
  removed=$((removed + $(find /wal_archive -type f -mtime "+${WAL_KEEP_DAYS}" -print -delete 2>/dev/null | wc -l)))
  log "retention pruned $removed object(s)"
  record backup-retention succeeded "$removed"
}

verify() {
  # Prove the newest off-host archive downloads, matches its checksum, decrypts, and lists.
  local newest work="$BACKUP_DIR/work/verify"
  newest=$(rclone lsf "offsite:${BACKUPS_BUCKET}/logical/" --files-only | grep '\.tar\.enc$' | sort | tail -n 1)
  if [[ -z "$newest" ]]; then
    record backup-verify failed 0 '{"reason":"no backup found"}'
    log "no backup to verify"
    return 1
  fi
  rm -rf "$work"; mkdir -p "$work"
  rclone copyto "offsite:${BACKUPS_BUCKET}/logical/$newest" "$work/$newest"
  rclone copyto "offsite:${BACKUPS_BUCKET}/logical/$newest.sha256" "$work/$newest.sha256"
  ( cd "$work" && sha256sum -c "$newest.sha256" >/dev/null )
  decrypt "$work/$newest" "$work/plain.tar"
  pg_restore --list "$work/plain.tar" >/dev/null
  rm -rf "$work"
  log "verified off-host backup $newest"
  record backup-verify succeeded 1 "{\"file\":\"$newest\"}"
}

# Run a job in a fresh shell so `set -e` stays active inside it (bash disables errexit for
# anything called from an `if`, which would let a failed dump be recorded as a success).
guarded() {
  local job="$1"
  if ! "$0" "$job"; then
    log "FAILED: $job"
    record "$job" failed 0 '{"error":"job failed; see container logs"}'
  fi
}

scheduler() {
  log "scheduler started (TZ=$TZ): logical 04:00 daily, base 04:30 Sundays, verify 05:00"
  if [[ "${BACKUP_RUN_ON_START:-false}" == "true" && -z "$(ls -A "$BACKUP_DIR/logical" 2>/dev/null)" ]]; then
    guarded logical
    guarded base
  fi
  while true; do
    local hm today dow
    hm=$(date +%H%M); today=$(date +%F); dow=$(date +%u)
    if [[ "$hm" == "0400" && "$(cat "$STATE/logical.day" 2>/dev/null || true)" != "$today" ]]; then
      echo "$today" >"$STATE/logical.day"; guarded logical; guarded prune
    fi
    if [[ "$dow" == "7" && "$hm" == "0430" && "$(cat "$STATE/base.day" 2>/dev/null || true)" != "$today" ]]; then
      echo "$today" >"$STATE/base.day"; guarded base
    fi
    if [[ "$hm" == "0500" && "$(cat "$STATE/verify.day" 2>/dev/null || true)" != "$today" ]]; then
      echo "$today" >"$STATE/verify.day"; guarded verify
    fi
    sleep 30
  done
}

case "${1:-scheduler}" in
  logical|base|prune|verify|scheduler) "$1" ;;
  *) echo "usage: backup.sh logical|base|prune|verify|scheduler" >&2; exit 64 ;;
esac
