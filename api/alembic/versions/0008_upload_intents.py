"""Track private upload intents and their verification.

Revision ID: 0008
Revises: 0007
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('''CREATE TABLE IF NOT EXISTS "UploadIntent" (
        id SERIAL PRIMARY KEY,
        "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
        purpose VARCHAR(30) NOT NULL,
        "objectKey" VARCHAR(200) NOT NULL UNIQUE,
        "contentType" VARCHAR(60) NOT NULL,
        "sizeBytes" INTEGER NOT NULL,
        sha256 VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "verifiedAt" TIMESTAMPTZ,
        "deletedAt" TIMESTAMPTZ
    )''')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_upload_intent_account_time '
        'ON "UploadIntent" ("accountId", "createdAt")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_upload_intent_status_expiry '
        'ON "UploadIntent" (status, "expiresAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "UploadIntent"')
