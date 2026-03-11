# Architecture

This template uses a domain-driven monorepo split:

- `client/`: React + Vite frontend with feature-based modules.
- `server/`: Express API with layered architecture (routes -> controller -> service -> repository).

## Backend Layering

- `routes`: HTTP boundary and route registration.
- `controllers`: request/response orchestration.
- `services`: business logic and token/session lifecycle.
- `repository`: Mongo persistence logic only.

This separation keeps database concerns decoupled from API and business logic.
