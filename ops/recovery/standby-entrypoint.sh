#!/bin/bash
# Streaming hot standby: clone the primary once, then follow it through the replication slot.
set -euo pipefail

export PGDATA=/var/lib/postgresql/data/pgdata
export PGPASSWORD="${REPLICATION_PASSWORD}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h db -U replicator >/dev/null 2>&1; do sleep 2; done
  mkdir -p "$PGDATA"
  chown -R postgres:postgres /var/lib/postgresql/data
  chmod 700 "$PGDATA"
  gosu postgres pg_basebackup -h db -U replicator -D "$PGDATA" -R -X stream -S standby1 -P
fi
chown -R postgres:postgres /var/lib/postgresql/data
exec gosu postgres postgres -D "$PGDATA" -c hot_standby=on -c listen_addresses='*'
