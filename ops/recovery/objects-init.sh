#!/bin/sh
# Create private buckets with separate credentials for uploads and backups. Idempotent.
set -eu

until mc alias set local "http://objects:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do sleep 1; done

for bucket in "${UPLOADS_BUCKET}" "${BACKUPS_BUCKET}"; do
  mc mb --ignore-existing "local/${bucket}"
  mc anonymous set none "local/${bucket}"
done
mc version enable "local/${BACKUPS_BUCKET}" || true
mc version enable "local/${UPLOADS_BUCKET}" || true

policy() { # name bucket
  cat >"/tmp/$1.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::$2","arn:aws:s3:::$2/*"]}]}
JSON
  mc admin policy create local "$1" "/tmp/$1.json" 2>/dev/null || mc admin policy create local "$1" "/tmp/$1.json"
}
policy uploads-rw "${UPLOADS_BUCKET}"
policy backups-rw "${BACKUPS_BUCKET}"

mc admin user add local "${UPLOADS_ACCESS_KEY}" "${UPLOADS_SECRET_KEY}" 2>/dev/null || true
mc admin policy attach local uploads-rw --user "${UPLOADS_ACCESS_KEY}" 2>/dev/null || true
mc admin user add local "${BACKUPS_ACCESS_KEY}" "${BACKUPS_SECRET_KEY}" 2>/dev/null || true
mc admin policy attach local backups-rw --user "${BACKUPS_ACCESS_KEY}" 2>/dev/null || true
echo "object storage ready"
