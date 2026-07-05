# Deployment Notes

> Part of the [Application Audit](./README.md) · July 2026

Primary references: `render.yaml`, `server/Dockerfile`, `docker-compose.yml`,
`docs/deployment-render.md`, `docs/render-env-matrix.md`, `docs/go-live.md`,
`docs/mongodb-production-backup.md`.

## Topology

- **Render**: server as a web service (Dockerfile), client as a static site
  (Vite build). MongoDB on **Atlas**.
- `docker-compose.yml` for local parity.
- CI: `.github/workflows` (lint/test), husky + commitlint locally.

## Single-instance assumptions baked into the code

These matter the moment the server scales beyond one instance:

1. **In-memory rate limiters** (`server/src/middleware/rateLimit.middleware.js`)
   — per-instance counters, reset on deploy; global 300/15m becomes 300×N.
2. **AI-summary DB lock** is instance-safe (atomic findOneAndUpdate) ✅ but has
   no expiry.
3. **Webhook idempotency** ring is read-modify-save (small race window).
4. **No graceful shutdown**: `server/src/server.js` ignores SIGTERM — Render
   deploys can kill in-flight requests (including full-document game saves).
   Add `server.close()` + mongoose disconnect handling.
5. **Health check** (`GET /api/v1/health`) does not ping Mongo — Render will
   consider a DB-less instance healthy.

## Build & bundle

- Client: stock Vite config, no `manualChunks`, no route splitting — one large
  bundle including recharts and the 3k-line tracker
  ([29-frontend-optimisation](./29-frontend-optimisation.md)).
- Server: plain Node, no clustering (fine — scale via Render instances once
  the single-instance assumptions above are fixed).

## Checklist before scaling horizontally

- [ ] Move rate limiting to a shared store (Redis) or edge
- [ ] Graceful shutdown (SIGTERM → stop accepting, drain, disconnect)
- [ ] Health check with DB ping
- [ ] Pin Stripe `apiVersion`
- [ ] Disable Mongoose `autoIndex` in prod; run index changes as migrations
- [ ] Atlas backup policy confirmed (`docs/mongodb-production-backup.md`)
