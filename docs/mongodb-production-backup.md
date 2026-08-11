# Production MongoDB Backup

Create a backup before production migrations or destructive data changes. Atlas
shared tiers may not provide snapshots, so this runbook uses MongoDB Database
Tools.

## Backup

Load production `MONGO_URI` and `MONGO_DB_NAME` into your shell without printing
them, then run:

```bash
mkdir -p backups
mongodump \
  --uri="$MONGO_URI" \
  --db="$MONGO_DB_NAME" \
  --archive="backups/prod-$(date +%Y-%m-%d-%H%M%S).archive.gz" \
  --gzip
```

Verify the command succeeded, the archive is non-empty, and a test restore can
read it. Move the archive to encrypted off-machine storage; never commit it.

```bash
ls -lh backups/*.archive.gz
git rev-parse main
```

If the connection times out, add only the current IP to the Atlas allowlist and
remove it afterward. Do not use `0.0.0.0/0` for routine access.

## Restore

Restore into a disposable database first and inspect document counts and sample
records. A production replacement is destructive:

```bash
mongorestore \
  --uri="$MONGO_URI" \
  --archive="backups/<backup>.archive.gz" \
  --gzip \
  --nsFrom="<source-db>.*" \
  --nsTo="<restore-db>.*" \
  --drop
```

Before restoring production, stop writes, confirm the archive and target
database, and obtain explicit approval. Afterward, verify login, recent games,
league standings, and billing records before reopening writes.
