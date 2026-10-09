"""Add API-key scopes and final request accounting (status, latency, correlation ID).

Revision ID: 0006
Revises: 0005
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS '
        "scopes VARCHAR(200) NOT NULL DEFAULT 'routes:read'"
    )
    op.execute('ALTER TABLE "ApiUsage" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER')
    op.execute('ALTER TABLE "ApiUsage" ADD COLUMN IF NOT EXISTS "requestId" VARCHAR(64)')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_api_usage_occurred_at ON "ApiUsage" ("occurredAt")'
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_api_usage_occurred_at")
    op.execute('ALTER TABLE "ApiUsage" DROP COLUMN IF EXISTS "requestId"')
    op.execute('ALTER TABLE "ApiUsage" DROP COLUMN IF EXISTS "latencyMs"')
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS scopes')
