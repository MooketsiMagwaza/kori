"""Add developer access and API usage.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "DeveloperAccount" (
            id SERIAL PRIMARY KEY,
            email VARCHAR(254) NOT NULL UNIQUE,
            "displayName" VARCHAR(120) NOT NULL,
            "passwordHash" VARCHAR(512) NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_developer_account_email ON "DeveloperAccount" (email)'
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "DeveloperSession" (
            id SERIAL PRIMARY KEY,
            "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
            "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ApiKey" (
            id SERIAL PRIMARY KEY,
            "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            prefix VARCHAR(20) NOT NULL,
            "secretHash" VARCHAR(64) NOT NULL UNIQUE,
            "monthlyQuota" INTEGER NOT NULL DEFAULT 10000,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "revokedAt" TIMESTAMPTZ
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS ix_api_key_prefix ON "ApiKey" (prefix)')
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ApiUsage" (
            id SERIAL PRIMARY KEY,
            "apiKeyId" INTEGER NOT NULL REFERENCES "ApiKey"(id) ON DELETE CASCADE,
            method VARCHAR(10) NOT NULL,
            path VARCHAR(300) NOT NULL,
            "statusCode" INTEGER NOT NULL DEFAULT 200,
            "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_api_usage_key_time ON "ApiUsage" ("apiKeyId", "occurredAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "ApiUsage"')
    op.execute('DROP TABLE IF EXISTS "ApiKey"')
    op.execute('DROP TABLE IF EXISTS "DeveloperSession"')
    op.execute('DROP TABLE IF EXISTS "DeveloperAccount"')
