#!/usr/bin/env bash
# Requires PostgreSQL 17 client and age. The connection URL is never written to the archive.
set -euo pipefail
umask 077
: "${HIVE_BACKUP_DATABASE_URL:?Set a PostgreSQL connection URL with a read-only backup account}"
: "${HIVE_BACKUP_RECIPIENT:?Set your age public recipient; keep the private key offline}"
: "${HIVE_BACKUP_DIRECTORY:?Choose a private backup folder outside the repository}"
for tool in pg_dump pg_restore age; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
[[ "$HIVE_BACKUP_DATABASE_URL" == *"sslmode=verify-full"* ]] || { echo 'Use sslmode=verify-full and the trusted database CA.' >&2; exit 1; }
mkdir -p "$HIVE_BACKUP_DIRECTORY"
backup_temp=$(mktemp -d)
trap 'rm -rf "$backup_temp"' EXIT
# A custom dump is transaction consistent and includes schema, records and policies.
# libpq reads credentials from the environment, never process arguments or logs.
export PGDATABASE="$HIVE_BACKUP_DATABASE_URL"
pg_dump --format=custom --no-owner --no-acl --file="$backup_temp/database.dump"
pg_restore --list "$backup_temp/database.dump" > "$backup_temp/catalog.txt"
test -s "$backup_temp/database.dump"
test -s "$backup_temp/catalog.txt"
backup_name="hive-database-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump.age"
age --recipient "$HIVE_BACKUP_RECIPIENT" --output "$backup_temp/$backup_name" "$backup_temp/database.dump"
# Moving only encrypted output prevents publishing plaintext dumps accidentally.
mv "$backup_temp/$backup_name" "$HIVE_BACKUP_DIRECTORY/$backup_name"
echo 'Encrypted database archive created. Storage files require a separate backup.'
