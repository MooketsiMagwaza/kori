# Database image

PostgreSQL 16 with PostGIS 3.4. Alembic in the API service (`api/alembic`) owns every table, index
and trigger; do not keep a second hand-written schema here.

Spatial data uses WGS 84 (SRID 4326), longitude then latitude, as in GeoJSON. Kori's tables keep
positions as plain `lon` and `lat` columns and add PostGIS geometry as generated, GIST-indexed
columns (migration `0013`), so the application never has to keep two copies in step.

The base image no longer installs pgRouting: Kori routes on the phone over the park's track graph,
so the server does not need a routing extension.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) and [../docs/OPERATIONS.md](../docs/OPERATIONS.md).
