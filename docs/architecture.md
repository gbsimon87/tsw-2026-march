# Architecture

A pnpm workspace monorepo with two applications:

- `client/`: React + Vite frontend with feature-based modules.
- `server/`: Express API with layered architecture (routes → controller → service → repository).

## Backend Layering

Each domain (auth, games, teams, leagues, feed, billing, analytics, contact, health) is a self-contained module under `server/src/modules/<domain>/`, bundling its own routes, controller, service, repository, and validation files.

- `routes`: HTTP boundary and route registration.
- `controllers`: request/response orchestration.
- `services`: business logic. Module-level services live inside `modules/<domain>/`. Cross-cutting services (token, session, email) live in the top-level `server/src/services/` directory.
- `repository`: Mongoose schemas and persistence logic.
- `middleware/`: Cross-cutting request pipeline concerns — CSRF protection (`csrf.middleware.js`), rate limiting (`rateLimit.middleware.js`), request-ID stamping (`requestId.middleware.js`), authentication (`auth.middleware.js`), and error/not-found handlers (`error.middleware.js`, `notFound.middleware.js`).

This separation keeps database concerns decoupled from API and business logic.

## API Structure

All routes are mounted under `/api/v1/` (e.g., `/api/v1/auth`, `/api/v1/games`).

The billing webhook endpoint (`/api/v1/billing/webhooks`) is registered before `express.json()` so Stripe can deliver the raw request body needed for signature verification.
