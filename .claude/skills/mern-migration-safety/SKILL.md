---
name: mern-migration-safety
description: Use when changing a Mongoose schema in a way that affects existing documents, writing a backfill/migration script, or altering a materialized/derived field's shape. Trigger on "migration", "backfill", "schema change", "add a field", "rename a field", "data migration", "materialize".
---

# MERN Schema & Data Migration Safety

MongoDB has no schema enforcement at the database level — Mongoose enforces
shape only for documents written _after_ the schema changes. Every schema
change is implicitly a data migration question, even when it doesn't feel
like one.

## Before changing a schema

Ask, explicitly:

1. **Do existing documents need this field backfilled**, or is a missing
   field an acceptable/handled state (e.g. `undefined` treated as a default
   at read time)? If reads assume the field always exists, it needs a
   backfill — don't rely on "new writes will have it" for old data.
2. **Is this field derived from other data** (a materialized/frozen value)?
   If so, the backfill is really "run the same compute function the write
   path uses" — write the backfill to call that shared function, don't
   reimplement the computation in the migration script. Two implementations
   of the same derivation will drift.
3. **Does removing/renaming a field break silent reads?** Mongoose silently
   drops undeclared fields on save — if you rename a field in the schema
   without a migration, existing documents' old-named data isn't deleted,
   it's just orphaned and invisible. Decide explicitly: migrate-then-remove,
   or dual-read-both-names during a transition window.

## Writing the backfill script

- **Idempotent** — running it twice must not double-apply or corrupt data.
  Prefer a query filter that only targets un-migrated documents
  (`{ newField: { $exists: false } }`) over a blanket update.
- **Support a dry-run flag** — log what _would_ change (counts, sample
  diffs) without writing, so it can be validated against production-shaped
  data before the real run.
- **Batch, don't load the whole collection into memory** — cursor/paginate
  through documents for any collection that isn't tiny.
- **Log progress and a final summary** (documents scanned, migrated,
  skipped, errored) — a silent script that "probably worked" is not
  verifiable after the fact.
- **Point at the real environment file explicitly** — don't rely on
  ambient/default env resolution for a script that writes to production
  data; require the caller to pass the env file/connection string.

## Running it safely

- Run the dry-run against a copy of production-shaped data (or staging) first,
  never invent behavior from reading the schema alone — inspect actual
  documents, since real data often has legacy shapes the schema doesn't
  capture (fields from a since-removed feature, inconsistent enum casing,
  etc.).
- Run for real against staging/dev before production.
- Keep the script around after running it once (don't delete) unless the
  team's convention is to prune old migrations — a rerun capability matters
  if new documents were written between dry-run and real-run, or if a second
  environment needs the same backfill later.

## Deploy ordering

- **Backfill-then-deploy** if the new code assumes the field always exists.
- **Deploy-then-backfill** if the new code handles the field's absence
  gracefully (safer default) — this is usually preferable since it doesn't
  require a maintenance window, but it means the read path must genuinely
  handle both states, not just assume the migration already ran.
- If a materialized field's compute-on-miss pattern is used (compute lazily
  if missing, persist the result), a dedicated backfill script may not even
  be necessary — verify whether the self-healing read path already covers
  the old-document case before writing one.

## Reviewing someone else's migration

- Does the query filter actually scope to unmigrated documents, or will it
  reprocess everything on a rerun?
- Does it reuse the canonical compute function, or duplicate logic that can
  drift from the live code path?
- Is there a rollback story, or is this a one-way door (e.g. a destructive
  field removal)? One-way-door migrations deserve explicit sign-off before
  running against production.
