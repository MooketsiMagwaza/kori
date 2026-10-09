#!/usr/bin/env bash
# Creates and validates a portable PostgreSQL tar archive, then optionally copies it to S3.

set -Eeuo pipefail
umask 077

required=(PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE BACKUP_DIR)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable is missing: %s\n' "$name" >&2
    exit 64
  fi
done

if [[ ! -f "$PGPASSFILE" ]]; then
  printf 'PGPASSFILE does not exist: %s\n' "$PGPASSFILE" >&2
  exit 66
fi

install -d -m 0700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$BACKUP_DIR/kori-$stamp.tar"
partial="$archive.partial"
checksum="$archive.sha256"

cleanup() {
  rm -f -- "$partial"
}
trap cleanup EXIT

pg_dump \
  --format=tar \
  --no-password \
  --file="$partial" \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  "$PGDATABASE"

pg_restore --list "$partial" >/dev/null
mv -- "$partial" "$archive"
sha256sum "$archive" >"$checksum"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  aws_args=(s3 cp --only-show-errors)
  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
    aws_args+=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  fi
  aws "${aws_args[@]}" "$archive" "$BACKUP_S3_URI/$(basename "$archive")"
  aws "${aws_args[@]}" "$checksum" "$BACKUP_S3_URI/$(basename "$checksum")"
fi

printf 'Verified logical backup: %s\n' "$archive"
