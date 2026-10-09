"""Persist alert notifications delivered by Grafana.

Revision ID: 0004
Revises: 0003
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        '''
        CREATE TABLE IF NOT EXISTS "GrafanaNotification" (
            id SERIAL PRIMARY KEY,
            fingerprint VARCHAR(160),
            state VARCHAR(30) NOT NULL DEFAULT 'firing',
            severity VARCHAR(30) NOT NULL DEFAULT 'warning',
            title VARCHAR(180) NOT NULL,
            message TEXT,
            "dashboardUrl" VARCHAR(500),
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_grafana_notification_fingerprint '
        'ON "GrafanaNotification" (fingerprint)'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_grafana_notification_state_time '
        'ON "GrafanaNotification" (state, "createdAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "GrafanaNotification"')
