"""Add account recovery and hourly API limits.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "hourlyLimit" INTEGER NOT NULL DEFAULT 100'
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
            id SERIAL PRIMARY KEY,
            "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
            "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "usedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """CREATE INDEX IF NOT EXISTS ix_password_reset_account_time
        ON "PasswordResetToken" ("accountId", "expiresAt")"""
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "PasswordResetToken"')
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "hourlyLimit"')
