# Production Database Backup Guide

This guide explains how to create a backup of the production MongoDB Atlas database before any high-risk operation (e.g. merging branches, schema changes, deployments).

The production database is hosted on MongoDB Atlas. The connection string lives in `env/server/.env.production` (`MONGO_URI`) and in the Render service's environment variables for `tsw-2026-march-api-prod`.

---

## Atlas Tier Note

**Atlas M0 (free/shared tier) does not support cloud snapshots.** The "Take Snapshot Now" button is gated behind a paid M2+ or dedicated cluster upgrade. The two methods below work on M0 for free.

---

## Method 1 — `mongodump` to a Local File (Recommended)

Works on any Atlas tier including M0. Requires the MongoDB Database Tools installed locally.

```bash
# macOS
brew install mongodb-database-tools
```

### Step 1 — Get the connection string

Find `MONGO_URI` in `env/server/.env.production`. It looks like:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
```

### Step 2 — Run the dump

```bash
mongodump \
  --uri="<your-MONGO_URI>" \
  --out="./backups/prod-$(date +%Y-%m-%d)"
```

This creates `./backups/prod-YYYY-MM-DD/` with one `.bson` + `.metadata.json` per collection.

### Step 3 — Verify the dump

```bash
ls -lh ./backups/prod-$(date +%Y-%m-%d)/tsw_2026_prod/
```

The database name in the URI above has no explicit `<dbname>` path segment (the URI ends at `.net/`), so `mongodump` uses the value from `MONGO_DB_NAME` — which is `tsw_2026_prod`. That is the subfolder name to check.

You should see a pair of files per collection, for example:

```
users.bson              users.metadata.json
games.bson              games.metadata.json
subscriptions.bson      subscriptions.metadata.json
...
```

If the `tsw_2026_prod/` folder is missing or empty, the dump silently failed. The most common causes are:

- Wrong password in the URI (double-check `MONGO_DB_PASSWORD` in `.env.production`).
- Your current IP is not on the Atlas allowlist (see the note at the bottom).
- The database name in `--uri` doesn't match — in that case pass `--db tsw_2026_prod` explicitly:

```bash
mongodump \
  --uri="<your-MONGO_URI>" \
  --db=tsw_2026_prod \
  --out="./backups/prod-$(date +%Y-%m-%d)"
```

### Step 4 — Archive it

```bash
tar -czf ./backups/prod-$(date +%Y-%m-%d).tar.gz \
  -C ./backups \
  prod-$(date +%Y-%m-%d)/
```

The `-C ./backups` flag tells `tar` to change into the `backups` directory first, so the archive contains a relative path (`prod-YYYY-MM-DD/`) rather than the full absolute path. This makes it easier to extract anywhere.

Verify the archive was created and is non-zero:

```bash
ls -lh ./backups/prod-$(date +%Y-%m-%d).tar.gz
```

Then move it off this machine. The easiest options:

- **Google Drive / iCloud** — drag the `.tar.gz` into a folder called `tsw-db-backups`.
- **GitHub Gist / private repo** — not recommended for a full dump; the file can be large.
- **AWS S3** (if you have it): `aws s3 cp ./backups/prod-$(date +%Y-%m-%d).tar.gz s3://your-bucket/tsw-db-backups/`

Once it's safely off the machine, you can delete the uncompressed `./backups/prod-YYYY-MM-DD/` folder to free up space:

```bash
rm -rf ./backups/prod-$(date +%Y-%m-%d)/
```

---

## Method 2 — Restoring from Your Google Drive Backup

Use this when you need to recover lost data from the `.bson` files you uploaded to Google Drive.

### Step 1 — Download the backup from Google Drive

1. Open Google Drive and navigate to your `tsw-db-backups` folder.
2. Download the `.tar.gz` file for the backup date you want to restore from.
3. Move it into your local `./backups/` folder inside this project.

### Step 2 — Extract the archive

```bash
tar -xzf ./backups/prod-YYYY-MM-DD.tar.gz -C ./backups/
```

This recreates the `./backups/prod-YYYY-MM-DD/tsw_2026_prod/` folder with all the `.bson` and `.metadata.json` files.

Confirm it extracted correctly:

```bash
ls -lh ./backups/prod-YYYY-MM-DD/tsw_2026_prod/
```

You should see your collection files (e.g. `users.bson`, `games.bson`, etc.).

### Step 3 — Restore to Atlas

```bash
mongorestore \
  --uri="<your-MONGO_URI>" \
  --db=tsw_2026_prod \
  --drop \
  ./backups/prod-YYYY-MM-DD/tsw_2026_prod/
```

The `--drop` flag deletes each collection in Atlas before writing the backup version, giving you a clean restore. **This will overwrite any data currently in the database**, so only use it when you are sure you want to replace the live data with the backup.

If you only want to restore a single collection (e.g. `users`) rather than the whole database:

```bash
mongorestore \
  --uri="<your-MONGO_URI>" \
  --db=tsw_2026_prod \
  --collection=users \
  --drop \
  ./backups/prod-YYYY-MM-DD/tsw_2026_prod/users.bson
```

### Step 4 — Verify the restore

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com) → **Browse Collections** on the production cluster.
2. Spot-check a few collections — confirm the document counts look right and recent records are present.
3. Do a quick smoke test of the live app (log in, load a game, check a subscription) to confirm everything is working.

### Step 5 — Clean up

Once you've confirmed the restore is good, delete the local extracted folder to avoid confusion with future backups:

```bash
rm -rf ./backups/prod-YYYY-MM-DD/
```

Keep the `.tar.gz` on Google Drive — don't delete it.

---

## Before a Merge: Quick Checklist

- [ ] Run `mongodump` and confirm the output directory is non-empty (Method 1).
- [ ] Archive the dump: `tar -czf ...` and move it off this machine.
- [ ] Record the current `main` HEAD: `git rev-parse main`.
- [ ] Proceed with the merge.

---

## Atlas IP Allowlist Note

If `mongodump` fails with a connection timeout, your current IP is not on the Atlas allowlist.

1. Atlas UI → **Network Access** → **Add IP Address**.
2. Add your current IP (or `0.0.0.0/0` for a one-off — **remove it immediately afterwards**).
