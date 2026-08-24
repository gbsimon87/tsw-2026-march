# The Sporty Way

Basketball stat tracking and league management for teams, players, and league
organizers.

TSW supports live event tracking, lineups, box scores, recaps, replay, shot
maps, public profiles, and shareable highlights. League tools cover seasons,
teams, rosters, roles, join requests, schedules, standings, exports, and data
health. The Pulse provides a public feed, player discovery, and follows for
players, leagues, and league teams.

Standalone games usually track one team's roster against an opponent label.
League games can track both teams.

For technical orientation, start with
[`docs/PROJECT-KNOWLEDGE.md`](docs/PROJECT-KNOWLEDGE.md).

## Stack

| Area         | Technology                                                |
| ------------ | --------------------------------------------------------- |
| Client       | React 18, Vite, Tailwind CSS, TanStack Query, Zod         |
| Server       | Node.js 20+, Express, Mongoose, Zod, Pino                 |
| Data         | MongoDB Atlas                                             |
| Integrations | Stripe, Cloudinary, Resend, PostHog, OpenAI, Google OAuth |
| Tests        | Vitest, React Testing Library, Jest, Supertest            |
| Tooling      | pnpm workspaces, ESLint, Prettier, Husky                  |

## Quick Start

```bash
pnpm install
pnpm check-env
pnpm check-secrets
pnpm dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000/api/v1`

Node 20.10 or newer and pnpm 10 are required. `pnpm bootstrap` is available as
an install-only shortcut.

## Environment

Configure these files:

```text
env/client/.env.development
env/client/.env.production
env/server/.env.development
env/server/.env.production
```

Local development uses the `.development` files; production builds and server
startup use `.production`.

Minimum local configuration:

```text
VITE_API_BASE_URL
CLIENT_ORIGIN
MONGO_URI
MONGO_DB_NAME
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

JWT secrets must contain at least 32 characters. Production also requires
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, and `CONTACT_EMAIL`.

Google OAuth, Cloudinary, Stripe, PostHog, OpenAI summaries, and automatic feed
publishing are optional. Their complete contracts and defaults live in
`server/src/config/env.js`, `client/src/lib/env.js`, and `render.yaml`. Stripe
configuration is all-or-nothing once `STRIPE_SECRET_KEY` is set.

Keep development and production URLs, database names, credentials, Stripe
modes, and Cloudinary folders separate. Never commit secrets.

## Commands

```bash
pnpm dev          # client and API
pnpm seed         # destructive development database reset
pnpm test         # client and server tests
pnpm lint
pnpm build
pnpm check-env
pnpm check-secrets
pnpm format
```

Create or refresh the additive demo account with:

```bash
pnpm --filter server exec node src/scripts/seed-demo-account.js --dry-run
pnpm --filter server seed:demo
```

See [`docs/demo-data-generation.md`](docs/demo-data-generation.md) before using
the demo seed in a shared environment.

## Documentation

| Topic                                     | Reference                                                |
| ----------------------------------------- | -------------------------------------------------------- |
| Current architecture and product behavior | [`docs/PROJECT-KNOWLEDGE.md`](docs/PROJECT-KNOWLEDGE.md) |
| API endpoints                             | [`docs/api.md`](docs/api.md)                             |
| League and team permissions               | [`docs/permissions.md`](docs/permissions.md)             |
| Stripe, pricing, and entitlements         | [`docs/stripe.md`](docs/stripe.md)                       |
| Render deployment                         | [`docs/deployment-render.md`](docs/deployment-render.md) |
| Security controls                         | [`docs/security.md`](docs/security.md)                   |
| Product backlog                           | [`docs/ideas.md`](docs/ideas.md)                         |

Contribution workflow and required checks are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
