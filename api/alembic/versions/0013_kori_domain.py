"""Kori's domain: workspaces, species, sightings, review decisions, trips, tracks and park packs.

Positions are plain longitude and latitude columns (so the models also run on SQLite in tests);
PostGIS geometry is added here as generated, GIST-indexed columns computed from them.

Revision ID: 0013
Revises: 0012
"""

from alembic import op

from app.species_seed import SPECIES

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

UPDATED_AT_TABLES = ("Workspace", "Sighting", "TrackEdge")


def upgrade() -> None:
    op.execute(
        """CREATE TABLE "Workspace" (
            id SERIAL PRIMARY KEY,
            "publicId" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            name VARCHAR(120) NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    op.execute(
        """CREATE TABLE "WorkspaceMember" (
            id SERIAL PRIMARY KEY,
            "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
            "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
            role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
            CONSTRAINT uq_workspace_member UNIQUE ("workspaceId", "accountId")
        )"""
    )
    op.execute(
        'ALTER TABLE "ApiKey" ADD COLUMN "workspaceId" INTEGER '
        'REFERENCES "Workspace"(id) ON DELETE CASCADE'
    )
    op.execute('CREATE INDEX ix_api_key_workspace ON "ApiKey" ("workspaceId")')
    op.execute("""ALTER TABLE "ApiKey" ALTER COLUMN scopes SET DEFAULT 'sightings:read'""")

    op.execute(
        """CREATE TABLE "Species" (
            id VARCHAR(40) PRIMARY KEY,
            "commonName" VARCHAR(80) NOT NULL,
            "setswanaName" VARCHAR(80),
            "scientificName" VARCHAR(120) NOT NULL,
            "speciesGroup" VARCHAR(12) NOT NULL,
            sensitivity VARCHAR(12) NOT NULL DEFAULT 'standard'
                CHECK (sensitivity IN ('standard', 'sensitive'))
        )"""
    )
    op.execute(
        """CREATE TABLE "Sighting" (
            id SERIAL PRIMARY KEY,
            "publicId" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            "speciesId" VARCHAR(40) NOT NULL REFERENCES "Species"(id) ON DELETE RESTRICT,
            count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 500),
            "seenAt" TIMESTAMPTZ NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            "accuracyM" DOUBLE PRECISION,
            "cellId" VARCHAR(48) NOT NULL,
            "cellSizeM" INTEGER NOT NULL CHECK ("cellSizeM" IN (1000, 10000)),
            "cellLon" DOUBLE PRECISION NOT NULL,
            "cellLat" DOUBLE PRECISION NOT NULL,
            "denOrNest" BOOLEAN NOT NULL DEFAULT FALSE,
            notes VARCHAR(600),
            status VARCHAR(12) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
            "visibleFrom" TIMESTAMPTZ NOT NULL,
            "observerId" INTEGER REFERENCES "DeveloperAccount"(id) ON DELETE SET NULL,
            "areaId" VARCHAR(60),
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "deletedAt" TIMESTAMPTZ,
            -- The exact point (private) and the published cell centre, for spatial queries.
            point geometry(Point, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
            "cellCentre" geometry(Point, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("cellLon", "cellLat"), 4326)) STORED
        )"""
    )
    op.execute('CREATE INDEX ix_sighting_status_visible ON "Sighting" (status, "visibleFrom")')
    op.execute('CREATE INDEX ix_sighting_cell ON "Sighting" ("cellId")')
    op.execute('CREATE INDEX ix_sighting_observer ON "Sighting" ("observerId")')
    op.execute('CREATE INDEX ix_sighting_area ON "Sighting" ("areaId")')
    op.execute('CREATE INDEX ix_sighting_cell_centre ON "Sighting" USING GIST ("cellCentre")')
    op.execute('CREATE INDEX ix_sighting_live ON "Sighting" (id) WHERE "deletedAt" IS NULL')

    op.execute(
        """CREATE TABLE "SightingPhoto" (
            id SERIAL PRIMARY KEY,
            "sightingId" INTEGER NOT NULL REFERENCES "Sighting"(id) ON DELETE CASCADE,
            "uploadId" INTEGER NOT NULL REFERENCES "UploadIntent"(id) ON DELETE CASCADE,
            licence VARCHAR(40) NOT NULL DEFAULT 'all-rights-reserved'
        )"""
    )
    op.execute('CREATE INDEX ix_sighting_photo_sighting ON "SightingPhoto" ("sightingId")')
    op.execute(
        """CREATE TABLE "ReviewDecision" (
            id SERIAL PRIMARY KEY,
            "sightingId" INTEGER NOT NULL REFERENCES "Sighting"(id) ON DELETE CASCADE,
            "reviewerId" INTEGER REFERENCES "DeveloperAccount"(id) ON DELETE SET NULL,
            decision VARCHAR(12) NOT NULL CHECK (decision IN ('approved', 'rejected')),
            reason VARCHAR(300),
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (decision = 'approved' OR reason IS NOT NULL)
        )"""
    )
    op.execute('CREATE INDEX ix_review_decision_sighting ON "ReviewDecision" ("sightingId")')
    # Decisions are history: a decision, its reason and its time can never be edited. Rows go only
    # with their sighting, and account deletion only clears the reviewer.
    op.execute(
        """CREATE OR REPLACE FUNCTION kori_review_no_edit() RETURNS trigger AS $$
        BEGIN
            IF NEW.decision IS DISTINCT FROM OLD.decision
               OR NEW.reason IS DISTINCT FROM OLD.reason
               OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
               OR NEW."sightingId" IS DISTINCT FROM OLD."sightingId" THEN
                RAISE EXCEPTION 'ReviewDecision rows cannot be edited';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql"""
    )
    op.execute(
        'CREATE TRIGGER trg_review_no_edit BEFORE UPDATE ON "ReviewDecision" '
        "FOR EACH ROW EXECUTE FUNCTION kori_review_no_edit()"
    )
    _trips_tracks_packs()
    _updated_at_triggers()
    _seed_species()


def _trips_tracks_packs() -> None:
    op.execute(
        """CREATE TABLE "Trip" (
            id SERIAL PRIMARY KEY,
            "publicId" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            "accountId" INTEGER NOT NULL REFERENCES "DeveloperAccount"(id) ON DELETE CASCADE,
            "areaId" VARCHAR(60),
            "startedAt" TIMESTAMPTZ NOT NULL,
            "endedAt" TIMESTAMPTZ NOT NULL,
            "consentAt" TIMESTAMPTZ NOT NULL,
            trace JSONB NOT NULL,
            "pointCount" INTEGER NOT NULL,
            "lengthM" DOUBLE PRECISION NOT NULL,
            "usableFrom" TIMESTAMPTZ NOT NULL,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            geom geometry(LineString, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(trace::text), 4326)) STORED
        )"""
    )
    op.execute('CREATE INDEX ix_trip_account ON "Trip" ("accountId")')
    op.execute('CREATE INDEX ix_trip_expires ON "Trip" ("expiresAt")')
    op.execute('CREATE INDEX ix_trip_geom ON "Trip" USING GIST (geom)')
    op.execute(
        """CREATE TABLE "TrackEdge" (
            id SERIAL PRIMARY KEY,
            "publicId" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            "areaId" VARCHAR(60) NOT NULL,
            line JSONB NOT NULL,
            status VARCHAR(12) NOT NULL
                CHECK (status IN ('verified', 'gps', 'predicted', 'closed')),
            confidence VARCHAR(8) CHECK (confidence IN ('high', 'medium', 'low')),
            trips INTEGER NOT NULL DEFAULT 0,
            source VARCHAR(24) NOT NULL DEFAULT 'review',
            "imageryMonth" VARCHAR(7),
            "lengthM" DOUBLE PRECISION NOT NULL,
            "lastConfirmedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            geom geometry(LineString, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(line::text), 4326)) STORED,
            CHECK (status <> 'predicted' OR confidence IS NOT NULL)
        )"""
    )
    op.execute('CREATE INDEX ix_track_edge_area_status ON "TrackEdge" ("areaId", status)')
    op.execute('CREATE INDEX ix_track_edge_geom ON "TrackEdge" USING GIST (geom)')
    op.execute(
        """CREATE TABLE "ParkPack" (
            id VARCHAR(60) PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            version VARCHAR(20) NOT NULL,
            kind VARCHAR(12) NOT NULL CHECK (kind IN ('pmtiles', 'mbtiles', 'geojson')),
            bytes BIGINT NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
            url VARCHAR(500) NOT NULL,
            published BOOLEAN NOT NULL DEFAULT FALSE,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )


def _updated_at_triggers() -> None:
    # kori_set_updated_at() is created in 0009.
    for table in UPDATED_AT_TABLES:
        op.execute(
            f'CREATE TRIGGER trg_{table.lower()}_updated_at BEFORE UPDATE ON "{table}" '
            "FOR EACH ROW EXECUTE FUNCTION kori_set_updated_at()"
        )


def _seed_species() -> None:
    """The species list is reference data the API cannot work without, so it ships with the schema."""

    for item in SPECIES:
        op.execute(
            'INSERT INTO "Species" (id, "commonName", "setswanaName", "scientificName", '
            '"speciesGroup", sensitivity) VALUES ('
            + ", ".join(_quote(value) for value in item)
            + ") ON CONFLICT (id) DO NOTHING"
        )


def _quote(value: str | None) -> str:
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


def downgrade() -> None:
    for table in ("ParkPack", "TrackEdge", "Trip", "ReviewDecision", "SightingPhoto", "Sighting"):
        op.execute(f'DROP TABLE IF EXISTS "{table}"')
    op.execute("DROP FUNCTION IF EXISTS kori_review_no_edit()")
    op.execute('DROP TABLE IF EXISTS "Species"')
    op.execute("DROP INDEX IF EXISTS ix_api_key_workspace")
    op.execute('ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "workspaceId"')
    op.execute('DROP TABLE IF EXISTS "WorkspaceMember"')
    op.execute('DROP TABLE IF EXISTS "Workspace"')
