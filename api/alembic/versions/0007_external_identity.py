"""Map external identity subjects to accounts and support revocation.

Revision ID: 0007
Revises: 0006
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "DeveloperAccount" ADD COLUMN IF NOT EXISTS "externalSubject" VARCHAR(64)')
    op.execute(
        'ALTER TABLE "DeveloperAccount" ADD COLUMN IF NOT EXISTS '
        "\"authProvider\" VARCHAR(24) NOT NULL DEFAULT 'local'"
    )
    op.execute('ALTER TABLE "DeveloperAccount" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMPTZ')
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS ix_developer_account_external_subject '
        'ON "DeveloperAccount" ("externalSubject")'
    )
    op.execute('''CREATE TABLE IF NOT EXISTS "RevokedAuthSession" (
        "sessionId" VARCHAR(64) PRIMARY KEY,
        "revokedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMPTZ NOT NULL
    )''')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_revoked_auth_session_expires ON "RevokedAuthSession" ("expiresAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "RevokedAuthSession"')
    op.execute("DROP INDEX IF EXISTS ix_developer_account_external_subject")
    op.execute('ALTER TABLE "DeveloperAccount" DROP COLUMN IF EXISTS "disabledAt"')
    op.execute('ALTER TABLE "DeveloperAccount" DROP COLUMN IF EXISTS "authProvider"')
    op.execute('ALTER TABLE "DeveloperAccount" DROP COLUMN IF EXISTS "externalSubject"')
