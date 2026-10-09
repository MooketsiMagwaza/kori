#!/bin/bash
# Point-in-time recovery target: unpack a base backup into an empty data directory and replay the
# archived WAL up to RECOVERY_TARGET_TIME, then promote. Nothing here touches the primary.
set -Eeuo pipefail

: "${RECOVERY_TARGET_TIME:?RECOVERY_TARGET_TIME is required (UTC, e.g. 2026-09-21 10:30:00+00)}"
: "${BASE_BACKUP_DIR:?BASE_BACKUP_DIR is required}"

export PGDATA=/var/lib/postgresql/data/pgdata
mkdir -p "$PGDATA"
chown -R postgres:postgres /var/lib/postgresql/data
chmod 700 "$PGDATA"

gosu postgres tar -xzf "$BASE_BACKUP_DIR/base.tar.gz" -C "$PGDATA"
if [ -f "$BASE_BACKUP_DIR/pg_wal.tar.gz" ]; then
  gosu postgres tar -xzf "$BASE_BACKUP_DIR/pg_wal.tar.gz" -C "$PGDATA/pg_wal"
fi

gosu postgres touch "$PGDATA/recovery.signal"
gosu postgres tee -a "$PGDATA/postgresql.auto.conf" >/dev/null <<CONF
restore_command = 'cp /wal_archive/%f "%p"'
recovery_target_time = '${RECOVERY_TARGET_TIME}'
recovery_target_action = 'promote'
recovery_target_inclusive = true
archive_mode = off
CONF

exec gosu postgres postgres -D "$PGDATA" -c listen_addresses='*' -c hot_standby=on
