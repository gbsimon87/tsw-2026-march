---
name: mern-project-structure
description: Use when scaffolding a new MERN project, deciding on folder structure, setting up environment configs, or organizing a monorepo vs separate client/server repos. Trigger on mentions of "project structure", "new MERN app", "monorepo", "folder structure", "scaffold", or "boilerplate".
---

# MERN Project Structure & Setup

## Repo layout: monorepo vs separate repos

- **Separate repos** (client + server) when the frontend and backend are deployed independently, on different release cadences, or maintained by different teams. Simplest CI/CD setup.
- **Monorepo** (single repo, `client/` and `server/` folders) when one team owns both, they deploy together, and you want shared types/utilities (e.g., shared TypeScript interfaces for API request/response shapes) without publishing a package.

Default recommendation for a small team or solo project: monorepo with clear top-level separation — easier to keep frontend/backend types in sync and easier for Claude Code (or any agent) to reason about the whole app in one session.

```
project-root/
  client/                 # React app (Vite or CRA)
    src/
      components/
      pages/
      hooks/
      api/               # fetch wrappers / API client
      context/
    package.json
  server/                 # Express app
    src/
      routes/
      controllers/
      services/
      models/
      middleware/
      config/
    package.json
  .env.example            # documents required env vars, never the real .env
  README.md
```

## Environment configuration

- One `.env` per environment, never committed. Commit a `.env.example` listing every required variable name with a placeholder value.
- Centralize env var access through a single config module (`server/src/config/index.js`) that validates required vars are present at startup and fails fast with a clear error rather than crashing later mid-request:

```js
const required = ['MONGO_URI', 'JWT_SECRET', 'PORT'];
required.forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});
```

- Never import `process.env.X` scattered across files — always go through the config module so there's one place to see everything the app depends on.

## Package.json scripts convention

Standardize these script names across every MERN project so switching between projects (or letting an agent run them) doesn't require rediscovery:

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src",
    "build": "vite build"
  }
}
```

## Database connection pattern

Connect once at startup, not per-request. Handle connection errors and disconnects gracefully:

```js
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1); // fail fast — don't let the app run without a DB
  });

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
```

## What to set up before writing feature code

1. Linting + formatting (ESLint + Prettier) with a shared config for client and server
2. `.env.example` and config validation module
3. Error-handling middleware (see express-api-patterns skill)
4. A health-check route (`GET /api/health`) for deployment monitoring
5. Basic CI (lint + test on every push) even for a solo project — catches regressions early
