"""Moderation reports, append-only audit trail, and auth throttling.

Revision ID: 0010
Revises: 0009
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """CREATE TABLE IF NOT EXISTS "ContentReport" (
            id SERIAL PRIMARY KEY,
            "reporterId" INTEGER NOT NULL,
            "targetType" VARCHAR(20) NOT NULL,
            "targetId" INTEGER NOT NULL,
            reason VARCHAR(20) NOT NULL,
            note VARCHAR(500),
            status VARCHAR(16) NOT NULL DEFAULT 'open',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "resolvedAt" TIMESTAMPTZ,
            "resolvedById" INTEGER
        )"""
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_content_report_status_time '
        'ON "ContentReport" (status, "createdAt")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_content_report_target '
        'ON "ContentReport" ("targetType", "targetId")'
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_content_report_once '
        'ON "ContentReport" ("reporterId", "targetType", "targetId")'
    )

    op.execute(
        """CREATE TABLE IF NOT EXISTS "AuditEvent" (
            id SERIAL PRIMARY KEY,
            "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "actorId" INTEGER,
            "actorRole" VARCHAR(24),
            action VARCHAR(60) NOT NULL,
            "targetType" VARCHAR(30) NOT NULL,
            "targetId" INTEGER,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            "requestId" VARCHAR(64)
        )"""
    )
    op.execute('CREATE INDEX IF NOT EXISTS ix_audit_event_time ON "AuditEvent" ("occurredAt")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_audit_event_target ON "AuditEvent" ("targetType", "targetId")'
    )
    # Immutability is enforced by the database, not by application discipline.
    op.execute(
        """CREATE OR REPLACE FUNCTION kori_audit_append_only() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'AuditEvent rows are append-only';
        END;
        $$ LANGUAGE plpgsql"""
    )
    op.execute('DROP TRIGGER IF EXISTS trg_audit_append_only ON "AuditEvent"')
    op.execute(
        'CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent" '
        "FOR EACH ROW EXECUTE FUNCTION kori_audit_append_only()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_audit_no_truncate ON "AuditEvent"')
    op.execute(
        'CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON "AuditEvent" '
        "FOR EACH STATEMENT EXECUTE FUNCTION kori_audit_append_only()"
    )

    op.execute(
        """CREATE TABLE IF NOT EXISTS "AuthAttempt" (
            id SERIAL PRIMARY KEY,
            scope VARCHAR(24) NOT NULL,
            "identityHash" VARCHAR(64) NOT NULL,
            "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )"""
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_auth_attempt_lookup '
        'ON "AuthAttempt" (scope, "identityHash", "occurredAt")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "AuthAttempt"')
    op.execute('DROP TRIGGER IF EXISTS trg_audit_no_truncate ON "AuditEvent"')
    op.execute('DROP TRIGGER IF EXISTS trg_audit_append_only ON "AuditEvent"')
    op.execute('DROP TABLE IF EXISTS "AuditEvent"')
    op.execute("DROP FUNCTION IF EXISTS kori_audit_append_only()")
    op.execute('DROP TABLE IF EXISTS "ContentReport"')
