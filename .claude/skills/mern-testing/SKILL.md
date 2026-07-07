---
name: mern-testing
description: Use when writing or reviewing tests in this project — server Jest+Supertest tests, or client Vitest + React Testing Library tests. Trigger on "test", "Jest", "Vitest", "React Testing Library", "Supertest", "mock", "snapshot", or "coverage".
---

# TSW Testing Patterns

**The runner differs per side — do not mix them up:**

|            | Runner                              | Command                     | Location                               |
| ---------- | ----------------------------------- | --------------------------- | -------------------------------------- |
| **Server** | **Jest + Supertest**, `--runInBand` | `pnpm --filter server test` | `server/src/tests/{unit,integration}/` |
| **Client** | **Vitest + RTL** (jsdom)            | `pnpm --filter client test` | colocated `*.test.jsx` / `*.test.js`   |

Never use Vitest on the server or Jest on the client.

## Server (Jest + Supertest)

- Config `server/jest.config.js`: `testEnvironment: 'node'`, `roots: ['<rootDir>/src']`,
  `setupFiles: ['src/tests/setupEnv.js']` (stubs env), runs serially (`--runInBand`).
- There is **no `mongodb-memory-server`** — the DB layer is mocked at the
  repository/service boundary. Follow existing suites (e.g.
  `billing.service.test.js`, `billing.routes.test.js`) rather than opening a real
  connection.
- Integration suites in `src/tests/integration/` drive real Express through
  Supertest (`feed`, `teams.auth`, `games.public`, `health`, `contact`,
  `billing.routes`, `gates`, `public-teams`).
- **Flush post-response schedulers**: any test that calls `finishGameForUser`, the
  event mutators, or `deleteGameForUser` must flush pending `setImmediate`
  callbacks or they fire into a torn-down module registry:

  ```js
  afterEach(() => new Promise((r) => setImmediate(r)));
  ```

- Assert the real response envelope: `{ error: { message, details, requestId } }`
  for failures; success shapes as the controller returns them.

```js
const request = require('supertest');
const { createApp } = require('../../app');

test('rejects invalid registration', async () => {
  const res = await request(createApp()).post('/api/v1/auth/register').send({ email: 'nope' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBeDefined();
});
```

## Client (Vitest + React Testing Library)

- Config lives in `client/vite.config.js` (`test.environment: 'jsdom'`,
  `setupFiles: './src/utils/testSetup.js'` — stubs env, polyfills `matchMedia` +
  `IntersectionObserver`).
- Use `vi.*` (not `jest.*`). Query by role/text/label, not CSS class.
- **Anything using TanStack Query needs a `QueryClientProvider` test wrapper** with
  a **fresh `QueryClient` per render** (no cache bleed) — auth context, feed, game
  detail, and league pages all require it.
- **Snapshot tests** exist for share-card image generation
  (`features/games/__snapshots__`, `features/feed/components/posts/__snapshots__`) —
  review snapshot diffs deliberately, don't blindly `-u`.

```jsx
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

function renderWithQuery(ui) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}
```

Mock the API boundary (the `*Api` object or `apiClient`), not component internals.

## Mocking

- Never hit real third parties (Stripe, Cloudinary, Resend, PostHog, OpenAI) — they
  are mocked. Emails are fire-and-forget in prod code, so assert they were
  scheduled, not awaited.
- Don't mock the unit under test; mock its dependencies.

## Prioritize when coverage is limited

1. Auth, session rotation, and league permission gates (`assert*`/`can*`)
2. Billing: entitlement derivation, webhook idempotency (`claim*WebhookEvent`)
3. Stat/box-score derivation (`shared/statSummary.js`) and materialization parity
4. Zod validation boundaries
5. A regression test for every fixed bug (the repo's convention — confirm it fails
   without the fix)
