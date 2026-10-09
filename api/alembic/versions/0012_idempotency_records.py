"""Idempotency records so replayed writes return the original result.

Revision ID: 0012
Revises: 0011
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
            id SERIAL PRIMARY KEY,
            "accountId" INTEGER NOT NULL,
            scope VARCHAR(40) NOT NULL,
            key VARCHAR(64) NOT NULL,
            "resultId" INTEGER NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )"""
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_key '
        'ON "IdempotencyRecord" ("accountId", scope, key)'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_idempotency_created ON "IdempotencyRecord" ("createdAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "IdempotencyRecord"')
