# CLAUDE.md — TSW ("The Sporty Way")

Basketball stat-tracking + league-management platform. pnpm monorepo:
`client/` (React 18 + Vite) and `server/` (Express + Mongoose).

**Read [`docs/PROJECT-KNOWLEDGE.md`](docs/PROJECT-KNOWLEDGE.md) first** — it's the
definitive reference (architecture, auth, billing, DB, conventions, tech debt).
The code is the ultimate source of truth; if a doc disagrees, trust the code and
fix the doc.

## Layout — where code lives

- **Server is module-based**, not layered folders. Each domain lives in
  `server/src/modules/<domain>/` with files named `<domain>.<layer>.js`:
  `routes → controller → service → repository (+ validation.js)`.
  **There is no `models/` directory** — Mongoose schemas are defined **inline in
  `*.repository.js`**. Business logic AND authorization live in `*.service.js`.
- **Client is feature-based**: `client/src/features/<domain>/{api,components,hooks,pages,schemas}`.
  Composition root is `client/src/app/` (`providers/`, `router/`, `store/`).
  Shared API client: `client/src/lib/apiClient.js`.

Domains (both sides): `auth`, `games`, `teams`, `leagues`, `feed`, `billing`,
`analytics`, `contact` (+ server `health`, `shared`).

## Testing — the runner differs per side

- **Server: Jest + Supertest.** `pnpm --filter server test` (runs `jest --runInBand`).
  Tests in `server/src/tests/{unit,integration}/`.
- **Client: Vitest + React Testing Library.** `pnpm --filter client test`
  (runs `vitest run`). Tests colocated as `*.test.jsx`, snapshots in `__snapshots__/`.
- Do **not** use Jest on the client or Vitest on the server.

## Commands

```bash
pnpm dev          # client :5173 + server :4000 (parallel)
pnpm test         # all workspaces
pnpm lint         # all workspaces
pnpm build        # all workspaces
pnpm check-env    # validate env templates
pnpm seed         # seed dev DB (users user1..10@userN.com / password)
```

Backfill scripts: `ENV_FILE=../env/server/.env.development node src/scripts/<name>.js`
(all idempotent, support `--dry-run`).

## Conventions that matter

- **Env** lives outside each app in `env/{client,server}/.env.{development,production}`
  (server via `ENV_FILE`, client via Vite `envDir`). Env is Zod-validated at boot
  on both sides.
- **Backend errors**: `throw new ApiError(status, message, details?)` from services;
  `error.middleware.js` normalizes them. Wrap handlers in `asyncHandler`. Validate
  request input with Zod at the controller (`schema.parse`).
- **Auth is cookie-based JWT** with rotating refresh sessions + CSRF double-submit.
  Authorization is **resource + league-role** based (`assert*` helpers in
  `leagues.service.js`), **not** middleware RBAC — `User.roles` is unused. Roles:
  league `owner` / league `manager` / team `manager` / `helper` / `player`.
  See [`docs/permissions.md`](docs/permissions.md).
- **Billing is resource-scoped** (per Team / per League), Stripe **hosted**
  Checkout (no client Stripe.js), webhook mounted before `express.json()`, Stripe
  is the source of truth. See [`docs/PROJECT-KNOWLEDGE.md`](docs/PROJECT-KNOWLEDGE.md)
  §6 for today's code, and [`docs/pricing-overhaul/`](docs/pricing-overhaul/) for the
  planned pricing/billing redesign.
- **Routing**: feed is `/pulse`; admin is `/admin`; `/pricing` is dev-only.
- **`OPT-###` comments** are an inline changelog of perf/correctness decisions —
  don't delete them. The active tracker is
  `docs/application-audit/000-OPTIMISATION-TRACKER.md`.
- **Frontend data fetching is mid-migration**: prefer TanStack Query (`useQuery`)
  for new pages; ~22 pages still fetch imperatively with `useEffect`. Named
  exports everywhere; Zod for validation; Tailwind inline; no path aliases.
- **Commits**: conventional commits (commitlint + Husky). Branch flow: feature →
  `dev` → `main`. Run `pnpm check-env && pnpm lint && pnpm test && pnpm build`
  before a PR.

## Domain-specific skills

Project skills live in `.claude/skills/` and cover this repo's real conventions:
backend module patterns (`express-api-patterns`), MongoDB/Mongoose in repositories
(`mongodb-schema-design`), React feature patterns + TanStack Query
(`react-component-patterns`), auth/permissions (`node-auth-security`), testing
(`mern-testing`), and monorepo structure (`mern-project-structure`).
