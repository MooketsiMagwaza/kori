# Operations and recovery

How to run Kori's backend locally, what runs on a schedule, and how backups and restores are
meant to work. The tooling came from the owner's earlier platform (see `PROVENANCE.md`) and was
adapted for Kori's database and tables.

**State on 9 October 2026:** `docker compose config` accepts the stack. Nothing below has been run
for Kori yet: the Docker daemon was not running on the build machine. Treat every procedure here as
written, not proven, until a drill has produced evidence.

## The stack

`compose.yaml` at the repository root:

| Service | Port | Profile | Purpose |
| --- | --- | --- | --- |
| `db` | 5432 | default | PostgreSQL 16 with PostGIS (`database/`) |
| `api` | 8000 | default | The FastAPI service; runs migrations on start |
| `scheduler` | none | default | Runs the maintenance jobs on their intervals |
| `field`, `landing`, `review`, `api-docs` | 3100, 3000, 3300, 3400 | default | The four web apps, built from their Dockerfiles |
| `prometheus`, `grafana`, `tempo`, `postgres-exporter` | 9090, 3004 | default | See `docs/OBSERVABILITY.md` |
| `auth-db-init`, `auth`, `mailpit` | 9999, 8025 | `identity` | Self-hosted identity provider (GoTrue) with a local mail catcher |
| `objects`, `objects-init`, `recovery-init`, `db-standby`, `backup` | 9000, 9001 | `recovery` | Object storage, WAL archive, standby and backup runner |
| `restore-target`, `restore-drill`, `pitr-target` | none | `drill` | Scratch servers for restore and point-in-time drills |

```sh
docker compose up -d                       # database, API, scheduler, web apps, monitoring
docker compose --profile identity up -d    # add the identity provider
docker compose --profile recovery up -d    # add object storage, standby and backups
```

`deploy/` holds the release compose file, a Caddy reverse proxy and a Kubernetes base. They are
scaffolds with placeholder images (`ghcr.io/replace-me/...`) and have not been used.

## Scheduled jobs

`api/app/jobs/scheduler.py` runs each job once per window with a deterministic run ID, so a
restart never runs a job twice. Jobs live in `api/app/jobs/maintenance.py`:

| Job | Every | What it does |
| --- | --- | --- |
| `cleanup-auth` | hour | Expired sessions and used or expired password-reset tokens |
| `cleanup-uploads` | hour | Abandoned and rejected uploads, removed from object storage |
| `expire-trips` | hour | Shared GPS trips past their retention date (90 days proposed) |
| `prune-usage` | day | API usage rows past their retention |
| `key-rotation-audit` | day | Keys that are old or about to expire |
| `purge-deleted-accounts` | day | Anonymised accounts whose grace period has ended |
| `cleanup-consent` | week | Consent records past their retention |

## Backups and restores

- **Logical backups:** `ops/backups/backup.sh` (the `backup` service in the `recovery` profile)
  writes encrypted, checksummed dumps and copies them off the host. `logical-backup.sh` with
  `systemd/kori-logical-backup.timer` (daily at 04:00) is a host-level variant that checksums and
  can upload, but does not encrypt; use it only with an encrypted destination.
- **Physical backups and WAL:** `ops/backups/pgbackrest.conf.example` (encrypted, S3-compatible).
- **Point-in-time recovery:** `ops/recovery/pitr-restore.sh` replays archived WAL into a scratch
  server up to a chosen time.
- **Drills:** `ops/backups/run-drills.sh restore|pitr|all` rebuilds from the newest off-host
  backup into an empty server and checks it (PostGIS present, migration revision present, the
  species reference data present), writing JSON evidence to `ops/backups/evidence/`.

A backup that has never been restored is not a backup. The first drill is a KO-17 follow-up.

## Data that needs particular care

- **Exact sighting points** and **shared trips** are personal or sensitive data. Backups are
  encrypted, and restores go to scratch servers that are destroyed after the drill.
- **Trips** are deleted by `expire-trips`; a restore from an older backup can bring expired trips
  back, so run `expire-trips` immediately after any restore.
