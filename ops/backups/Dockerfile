# Backup runner for the Compose "recovery" profile: logical dumps, base backups, encryption,
# off-host copy, retention, and verification. PostgreSQL 16 tools match the PostGIS 16 primary.
FROM postgres:16-alpine

RUN apk add --no-cache bash rclone openssl tzdata coreutils

COPY backup.sh restore-drill.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore-drill.sh

# Run unprivileged. UID 999 matches the postgres user in the PostGIS database image, which owns
# /wal_archive (mode 0700) and is who this runner must read and prune it as. The group ID does
# not matter for that (GID 999 is already taken by "ping" in this base image).
RUN addgroup -S backup && adduser -D -u 999 -G backup backup \
    && mkdir -p /backups && chown backup:backup /backups

ENV TZ=Africa/Gaborone
USER 999
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["scheduler"]
