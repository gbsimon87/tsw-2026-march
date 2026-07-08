---
name: api-contract-changes
description: Use when changing the shape, behavior, or path of an existing API endpoint — request/response fields, status codes, validation rules, or route paths — in a MERN app with a client that consumes it. Trigger on "change the endpoint", "update the API", "add a field to the response", "rename this route", "breaking change", "API contract".
---

# API Contract Change Workflow

In a MERN app without a shared type layer between client and server, an API
contract change is invisible to the compiler — it only shows up at runtime,
often on a page nobody thought to check. Treat every endpoint change as a
consumer-search problem before an implementation problem.

## Step 1 — Find every consumer before writing the change

- Grep the client for every call site of the endpoint (via its wrapped API
  client function, not just the raw path string — e.g. search for the
  `*Api` method name, not `/api/v1/...`).
- Grep for any **duplicated validation schema** on the client side (Zod or
  otherwise) that mirrors the server's — if the two aren't shared, both need
  updating or they'll drift and produce confusing client-side-valid,
  server-side-rejected states (or vice versa).
- Check for non-obvious consumers: shareable card/snapshot builders, backfill
  scripts, other services, or webhook handlers that construct requests to
  this endpoint internally.
- Check tests (Supertest/RTL) that assert on the current response shape —
  they'll need updating, and until they are, they're your regression net for
  the parts of the shape you _didn't_ mean to change.

## Step 2 — Classify the change

| Change type                       | Risk   | Approach                                                                          |
| --------------------------------- | ------ | --------------------------------------------------------------------------------- |
| Add optional response field       | Low    | Safe — existing consumers ignore it                                               |
| Add required request field        | Medium | Every caller must send it — grep and update all, or give it a server-side default |
| Remove/rename a field             | High   | Breaks any consumer still reading the old name — see below                        |
| Change a field's type/shape       | High   | Silent breakage — old consumers may not error, just misbehave                     |
| Change status codes / error shape | Medium | Client error-handling branches keyed on status code will misfire                  |
| Change route path                 | High   | Old bookmarks/links, other services, tests all break                              |

## Step 3 — Handling removal/rename safely

Pick one, explicitly, don't default to "just change it":

- **Additive transition**: add the new field/shape alongside the old one,
  migrate all consumers, then remove the old one in a follow-up change once
  nothing reads it. Preferred when the endpoint has external or
  hard-to-enumerate consumers.
- **Atomic swap**: change client and server in the same PR/deploy when the
  consumer set is fully internal and enumerable (you found all of them in
  Step 1) and both sides deploy together.
- Never leave a field **half-migrated** — a response that sometimes has the
  old shape and sometimes the new one (e.g. gated by a feature flag with no
  removal date) is the hardest state to debug later.

## Step 4 — Validate the request boundary, not just the handler

- Update the boundary schema (Zod or equivalent) to match the new contract —
  a handler that "works" with a manually-crafted test payload but whose
  schema still rejects/accepts the old shape means real clients will hit
  validation errors your test didn't catch.
- Confirm error responses for the new validation rule are shaped the way the
  client's generic error handler expects (status code, `details` structure)
  — a new validation branch that throws a differently-shaped error can break
  generic error-toast/error-boundary logic even if the specific case is
  "handled."

## Step 5 — Verify end-to-end, not just unit-level

- Exercise the actual changed flow through the real client against the real
  (updated) server, not just an isolated unit/integration test of the
  endpoint — contract mismatches often only show up when the full
  request/response round-trip runs together.
- If the endpoint is consumed by more than one page/feature, check each one,
  not just the page that motivated the change.
