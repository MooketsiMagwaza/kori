"""Add expiring API-key lineage and scheduled maintenance audit records.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "DeveloperAccount" ADD COLUMN IF NOT EXISTS '
        "role VARCHAR(24) NOT NULL DEFAULT 'developer'"
    )
    op.execute('CREATE INDEX IF NOT EXISTS ix_developer_account_role ON "DeveloperAccount" (role)')
    op.execute('ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ')
    op.execute(
        'UPDATE "ApiKey" SET "expiresAt" = "createdAt" + INTERVAL \'90 days\' '
        'WHERE "expiresAt" IS NULL'
    )
    op.execute('ALTER TABLE "ApiKey" ALTER COLUMN "expiresAt" SET NOT NULL')
    op.execute('ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMPTZ')
    op.execute(
        'ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "rotatedFromId" '
        'INTEGER REFERENCES "ApiKey"(id) ON DELETE SET NULL'
    )
    op.execute('CREATE INDEX IF NOT EXISTS ix_api_key_expires_at ON "ApiKey" ("expiresAt")')
    op.execute('CREATE INDEX IF NOT EXISTS ix_api_key_rotated_from ON "ApiKey" ("rotatedFromId")')
    op.execute('''CREATE TABLE IF NOT EXISTS "MaintenanceRun" (
        id SERIAL PRIMARY KEY,
        "jobName" VARCHAR(80) NOT NULL,
        "runId" VARCHAR(120) NOT NULL UNIQUE,
        status VARCHAR(24) NOT NULL DEFAULT 'running',
        "rowsAffected" INTEGER NOT NULL DEFAULT 0,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finishedAt" TIMESTAMPTZ
    )''')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_maintenance_job_time '
        'ON "MaintenanceRun" ("jobName", "startedAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "MaintenanceRun"')
    op.execute('DROP INDEX IF EXISTS ix_api_key_rotated_from')
    op.execute('DROP INDEX IF EXISTS ix_api_key_expires_at')
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "rotatedFromId"')
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "lastUsedAt"')
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "expiresAt"')
    op.execute('DROP INDEX IF EXISTS ix_developer_account_role')
    op.execute('ALTER TABLE "DeveloperAccount" DROP COLUMN IF EXISTS role')
