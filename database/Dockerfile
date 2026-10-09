FROM postgis/postgis:16-3.4

# Continuous WAL archive lives on its own volume so point-in-time recovery survives data-dir loss.
RUN mkdir -p /wal_archive && chown postgres:postgres /wal_archive && chmod 700 /wal_archive

USER postgres

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
