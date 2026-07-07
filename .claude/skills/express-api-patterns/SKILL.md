---
name: express-api-patterns
description: Use when building or reviewing Express.js REST APIs — route structure, middleware, error handling, input validation, controllers, or response shaping. Trigger on mentions of "Express route", "controller", "middleware", "API endpoint", "REST API", or "error handling" in a Node backend.
---

# Express API Design Patterns

## Project structure (route -> controller -> service -> model)

Keep route files thin. They should only wire HTTP verbs to controller functions and middleware — no business logic.

```
src/
  routes/
    users.routes.js       # app.get('/api/users', auth, userController.list)
  controllers/
    users.controller.js   # parses req, calls service, shapes res
  services/
    users.service.js      # business logic, talks to models
  models/
    User.js
  middleware/
    auth.js
    errorHandler.js
    validate.js
```

Controllers should not contain raw Mongoose/DB calls — that belongs in the service layer. This keeps controllers testable without a database and lets you reuse business logic outside HTTP (e.g., in a script or cron job).

## Centralized error handling

Never repeat `try/catch` boilerplate with duplicated `res.status(500).json(...)` in every controller. Use one async wrapper and one error-handling middleware:

```js
// middleware/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// controllers/users.controller.js
exports.getUser = asyncHandler(async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  res.json(user);
});

// middleware/errorHandler.js — mount LAST, after all routes
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
});
```

Never leak stack traces or internal error details to clients in production.

## Input validation

- Validate at the route boundary, before the controller runs — with a schema library (Zod, Joi, or express-validator), not scattered `if` checks.
- Validation middleware should return `400` with a structured list of field errors, not a generic message.
- Never trust `req.body`, `req.query`, or `req.params` shape — always parse through a schema, including type coercion for query strings (e.g., `page` arrives as a string and must be coerced to a number).

## Response shape consistency

Pick one envelope convention and apply it everywhere in the API:

```js
// Success
{ "data": { ... } }
// or for lists
{ "data": [...], "meta": { "page": 1, "total": 42 } }

// Error
{ "error": { "message": "...", "code": "USER_NOT_FOUND" } }
```

## Middleware ordering (order matters in Express)

1. Security headers (helmet)
2. CORS
3. Body parser (`express.json()`)
4. Request logging
5. Rate limiting (on auth/write-heavy routes at minimum)
6. Route-specific auth middleware
7. Routes
8. 404 handler (catch-all after routes)
9. Error-handling middleware (must be last, must have 4 args: `(err, req, res, next)`)

## Async/await pitfalls to catch in review

- Unhandled promise rejections from route handlers that aren't wrapped (crashes the process on an uncaught error without a global handler).
- Forgetting to `return` after calling `res.send()`/`res.json()` inside an `if` block, causing "headers already sent" errors when code continues to a second response call.
- Using `Promise.all` for independent async calls instead of sequential `await` — sequential awaits for unrelated operations needlessly slow down response time.
