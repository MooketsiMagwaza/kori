"""Consent records for the public site privacy choice.

Revision ID: 0011
Revises: 0010
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """CREATE TABLE IF NOT EXISTS "ConsentRecord" (
            id SERIAL PRIMARY KEY,
            "visitorId" VARCHAR(64) NOT NULL,
            choice VARCHAR(12) NOT NULL,
            "policyVersion" VARCHAR(20) NOT NULL,
            source VARCHAR(24) NOT NULL DEFAULT 'marketing',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )"""
    )
    op.execute('CREATE INDEX IF NOT EXISTS ix_consent_record_visitor ON "ConsentRecord" ("visitorId")')
    op.execute('CREATE INDEX IF NOT EXISTS ix_consent_record_created ON "ConsentRecord" ("createdAt")')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "ConsentRecord"')
