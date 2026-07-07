---
name: express-api-patterns
description: Use when building or reviewing this project's Express API — adding an endpoint, a controller/service/repository, middleware, validation, or error handling in server/src/modules. Trigger on "Express route", "controller", "service", "repository", "middleware", "API endpoint", "validation", or "error handling".
---

# TSW Express API Patterns

The server (`server/src/`) is **module-based**, CommonJS, Zod-validated, Pino-logged.
Do not introduce a layered `routes/controllers/services/models/` structure — that is
not how this repo is organized.

## Adding an endpoint = touch 4 (or 5) files in one module

Each domain lives in `server/src/modules/<domain>/` with strict naming
`<domain>.<layer>.js`:

```
modules/games/
  games.routes.js        # HTTP verbs → controller, attach middleware, asyncHandler
  games.controller.js    # parse/validate req, call service, shape JSON. THIN.
  games.service.js       # business logic + authorization (assert* helpers)
  games.repository.js     # Mongoose schema (inline!) + all data access
  games.validation.js    # Zod schemas
```

Register the router in `server/src/routes/index.js` under `/api/v1`.

### Route file

```js
// asyncHandler wraps EVERY handler so rejections reach the error middleware
gamesRouter.post('/:gameId/events', authMiddleware, asyncHandler(controller.appendEvent));
```

### Controller — thin, validates, shapes

```js
const { appendEventSchema } = require('./games.validation');

exports.appendEvent = async (req, res) => {
  const userId = requireAuthUserId(req); // local helper, throws 401
  const body = appendEventSchema.parse(req.body); // Zod at the boundary
  const result = await gamesService.appendEventForUser(userId, req.params.gameId, body);
  res.json(result);
};
```

Controllers must **not** contain Mongoose calls — those live in the repository,
invoked via the service.

### Service — logic + authorization

Authorization lives here, not in middleware. Throw `ApiError` from
`utils/apiError.js`; never `res.status(...).json(...)` in a service.

```js
const ApiError = require('../../utils/apiError');

async function appendEventForUser(userId, gameId, event) {
  const game = await findGameById(gameId);
  if (!game) throw new ApiError(404, 'Game not found');
  if (!(await canManageLeagueGame(userId, game))) throw new ApiError(403, 'Forbidden');
  // ...
}
```

### Repository — schema inline + data access

The Mongoose model is defined **in the repository file** (no `models/` dir),
guarded against re-registration:

```js
const gameSchema = new mongoose.Schema(
  {
    /* ... */
  },
  { timestamps: true, optimisticConcurrency: true }
);
const Game = mongoose.models.Game || mongoose.model('Game', gameSchema);
```

## Error handling (already centralized — reuse it)

- Throw `new ApiError(statusCode, message, details?)` from services.
- `error.middleware.js` maps ZodError / Multer `LIMIT_FILE_SIZE` / CastError → 400,
  else `err.statusCode || 500`, and **masks 500 bodies** to "Internal server error".
- Response envelope: `{ error: { message, details, requestId } }`. Match it.
- Never add per-controller `try/catch` + `res.status(500)` — `asyncHandler` + the
  error middleware already own that path.

## Validation

- Parse `req.body` / `req.query` / `req.params` through a Zod schema in
  `<domain>.validation.js` at the controller. Never trust raw request shape.
- Query strings are strings — coerce with Zod (`z.coerce.number()`). List endpoints
  reuse `modules/shared/pagination.validation.js` (`paginationQuerySchema`).

## Middleware order (defined in `app.js` — don't reorder blindly)

1. `trust proxy 1`
2. `requestIdMiddleware` → `pino-http`
3. `helmet()` → `cors(corsOptions)`
4. **Stripe webhook mounted with `express.raw()` BEFORE `express.json()`** — the
   webhook needs the raw body for signature verification. Any new raw-body route
   goes here too.
5. `express.json({ limit: '1mb' })` → `cookieParser` → Passport (Google OAuth)
6. `attachCsrfToken` → `csrfProtection`
7. `/api` rate limiter → `/api/v1` router
8. `notFoundMiddleware` → `errorMiddleware` (last, 4-arg)

## Review checklist

- New handler wrapped in `asyncHandler`? Router registered in `routes/index.js`?
- Input parsed through a Zod schema (including query coercion)?
- Errors thrown as `ApiError`, not ad-hoc `res.status`?
- Auth/permission checked in the **service** via an `assert*`/`can*` helper?
- Mongoose calls only in the repository?
- List endpoint returns `nextCursor` and paginates via `utils/pagination.js` when a `limit` is passed?
- No stack traces or internal detail leaked (500s are masked already — don't undo that).
- Missing `return` after `res.json()` inside an `if` (headers-already-sent)?
