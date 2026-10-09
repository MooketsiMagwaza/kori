"""Enable PostGIS.

Kori's history starts here. The platform tables that follow (0002 to 0012) come from the base
code's migrations with its transit tables removed; Kori's own tables are added in 0013.

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    # Dropping the extension would drop every geometry column with it; leave it in place.
    pass
