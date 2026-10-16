# Hive data protection — 16 October 2026

No paid service has been added. Existing Supabase sessions, RLS, workspace allowlist and disabled preview mail sending remain in force.

## Available now: owner workspace export

In Business, the workspace owner can download a password-encrypted `.hivebackup` file. Choose a unique passphrase of at least 16 characters and keep it in a password manager. The passphrase never reaches the API or local storage. AES-256-GCM authenticates the archive, with a random 16-byte salt, 12-byte nonce and PBKDF2-SHA256 (600,000 iterations). The browser verifies decryption before starting the download. Store copies on two separate devices or an existing private cloud drive.

The API uses the current user's session and RLS, explicitly checks owner membership and preview scope, pages each of 26 tables below the default API limit, and fails the whole export if a table cannot be read. It preserves record IDs, workspace IDs, document snapshots, line items, counters and relationships. It excludes auth users, pending invite tokens and binary Storage files. It reads tables sequentially; avoid edits during export. It is a portable data export, not a transaction-consistent full backup. A successful download does not mean an automatic backup schedule is active.

Recover offline with Node 22 or later, from a trusted local checkout:

```
node scripts/decrypt-hive-backup.mjs saved.hivebackup recovered.json < private-password-file
```

The password file must have owner-only permissions; remove it when finished. The output is created with owner-only permissions and never overwrites an existing file. An incorrect password or tampered archive fails authentication. Import only into a separate development database after checking the manifest, row counts, references and document totals. There is intentionally no one-click production overwrite.

## Full database backup tooling

`scripts/backup-database.sh` creates a transaction-consistent custom PostgreSQL archive and validates its catalog before encrypting it with age. It reads the database URL and age public recipient from the environment. It requires PostgreSQL 17 client tools, age, the Supabase CA and a least-privilege backup connection. Set `HIVE_BACKUP_DATABASE_URL` (including `sslmode=verify-full`), `HIVE_BACKUP_RECIPIENT` and `HIVE_BACKUP_DIRECTORY` to a private location outside the repository. Keep the age private key offline. The output contains no database connection credentials. Plaintext temporary files are restricted to the current OS user and cleaned up on exit.

These credentials and an offline recovery key have not been provisioned in this checkout; therefore a full database backup and restore drill have NOT been executed or claimed. Do not put a new private recovery key into GitHub or generate the only copy on an ephemeral runner.

A free baseline is one encrypted full dump daily, retain 7 daily and 4 weekly copies, plus the owner export before major changes. Use an existing local scheduler or existing encrypted backup volume once credentials and the recovery key are provisioned. No scheduler is silently enabled. Monitor failures and verify restoration monthly into an isolated database. `pg_restore --list` validates the archive catalog, not actual recoverability; a restore drill is still required.

Database dumps do not contain Storage binaries. Copy all referenced customer files and workspace branding objects separately, including path, size and hash manifest, into encrypted off-site storage before treating the backup as complete. Supabase documents this limitation: https://supabase.com/docs/guides/platform/backups . Never mark a backup complete based only on database export success.

## Database integrity observed

Read-only inspection on 16 October: main `michias-tegegne` has 15 customers and 14 projects; the isolated `hive-dev-michias` copy also has 15 and 14. No customers or projects lack a workspace, and no project points to a customer in another workspace. No reassignment or production migration was necessary. The app prioritizes the primary workspace by stable slug and preserves an explicitly selected, still-authorized business.
