---
name: mern-debugging-workflow
description: Use when debugging a bug report or unexpected behavior that could span the client/server boundary in a MERN stack — "it's broken", "getting an error", "500", "not saving", "stale data", "wrong value". Trigger on "debug", "bug", "error", "not working", "unexpected", "why is this failing".
---

# MERN Debugging Workflow

A stack-shaped process for isolating a bug to one layer before touching code.
Guessing at the wrong layer (assuming "logic bug" when it's actually a CSRF
rejection, or "backend bug" when it's a stale client cache) wastes the most
time in a MERN app. Work outside-in: reproduce at the boundary closest to the
symptom, then step inward one layer at a time.

## Step 1 — Reproduce below the UI

Before touching React, hit the API directly (curl / Supertest / an existing
integration test) with the same payload the UI would send. This immediately
splits the bug space in half:

- **Same bug reproduces via curl/Supertest** → it's a server bug. Skip to
  Step 3.
- **Bug does NOT reproduce outside the browser** → it's a client bug (stale
  cache, wrong payload shape, race condition, auth/cookie issue specific to
  the browser). Go to Step 2.

Don't skip this step because "it's obviously a frontend/backend thing" —
that assumption is exactly what wastes time when it's wrong.

## Step 2 — Client-side isolation

Common MERN-client failure modes, roughly in order of likelihood:

1. **Stale cache / no invalidation** — check if the relevant query key was
   ever invalidated/refetched after the mutation. A project with no
   `invalidateQueries` (common in hand-rolled TanStack Query setups) relies on
   manual `setQueryData` — check that path was actually updated, not just
   that the mutation succeeded.
2. **Payload shape mismatch** — log/inspect the actual request body. A schema
   drift between client-side and server-side Zod schemas (if duplicated) is a
   frequent silent-failure source.
3. **Auth/CSRF rejected silently** — check network tab / response status
   before assuming app logic is wrong. A 401 that triggers a silent refresh
   retry can mask itself as "intermittent" bugs.
4. **Race condition on mount/unmount** — check for missing cleanup in
   `useEffect`, or a mutation firing before a dependent value is loaded.

## Step 3 — Server-side isolation

1. **Read the actual error, not the generic 500 message.** Error middleware
   in most Express setups masks 500 bodies — check server logs
   (`requestId`-correlated if structured logging is set up) for the real
   stack trace, don't debug from the client-visible message.
2. **Validation vs business logic vs data layer** — in a
   routes→controller→service→repository layering, figure out which layer
   actually threw:
   - Controller-level Zod `parse` failure → bad input shape, fix the caller
     or the schema, not the business logic.
   - Service-level `ApiError` (403/404/409) → an authorization or state
     invariant is being violated — check the `assert*` helper's actual
     condition, not just that it fired.
   - Repository/Mongoose-level (`CastError`, `ValidationError`,
     `VersionError`) → data shape or concurrency issue, not application logic.
3. **Check if the field/value even reached the schema.** Mongoose silently
   drops undeclared fields on `.save()` — if a value "isn't saving," confirm
   it's declared in the schema before debugging the save call itself.
4. **`.lean()` gotcha** — if a "the data won't save" bug involves a doc that
   was fetched with `.lean()`, that's the bug: lean docs are plain objects,
   `.save()` doesn't exist on them (or was monkey-patched incorrectly).

## Step 4 — Data-state bugs (derived/materialized values)

If the app derives read views from a canonical write-time source (event logs,
embedded arrays, computed aggregates) rather than storing everything
independently:

- Check whether the read path is querying a **frozen/materialized** field vs
  computing live — a stale frozen value that never got its recompute trigger
  fired is a common silent-drift bug in these architectures.
- Check whether the recompute is fire-and-forget (e.g. scheduled after the
  response) — a test or manual check performed immediately after a write may
  observe pre-recompute state and look like a bug when it's a timing artifact.

## Step 5 — Before proposing a fix

- State which layer you isolated the bug to and the evidence (the actual
  error, the actual response body, the actual query result) — not a guess.
- Check if the same pattern exists elsewhere in the codebase (grep for the
  same helper/pattern) — a bug caused by a missed edge case in a shared
  helper is usually not unique to the one call site that got reported.
