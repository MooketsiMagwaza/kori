#!/bin/sh
# Create the least-privilege roles and the replication slot used by the recovery profile.
# Idempotent: safe to run on every start.
set -eu

export PGPASSWORD="${POSTGRES_PASSWORD}"
until pg_isready -h db -U "${POSTGRES_USER}" >/dev/null 2>&1; do sleep 1; done

psql -h db -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
    CREATE ROLE replicator REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  ELSE
    ALTER ROLE replicator PASSWORD '${REPLICATION_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kori_backup') THEN
    CREATE ROLE kori_backup REPLICATION LOGIN PASSWORD '${BACKUP_DB_PASSWORD}';
  ELSE
    ALTER ROLE kori_backup PASSWORD '${BACKUP_DB_PASSWORD}';
  END IF;
END
\$\$;
GRANT pg_read_all_data TO kori_backup;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO kori_backup, replicator;
SELECT pg_create_physical_replication_slot('standby1')
 WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'standby1');
SQL

# The backup role records job outcomes so a missed run can alert (see WO-16).
psql -h db -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF to_regclass('public.\"MaintenanceRun\"') IS NOT NULL THEN
     GRANT INSERT, UPDATE ON \"MaintenanceRun\" TO kori_backup;
     GRANT USAGE ON SEQUENCE \"MaintenanceRun_id_seq\" TO kori_backup;
   END IF; END \$\$;" || true
echo "recovery roles ready"
