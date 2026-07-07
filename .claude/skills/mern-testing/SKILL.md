---
name: mern-testing
description: Use when writing or reviewing tests for a MERN app — Jest unit tests, React Testing Library component tests, Supertest API/integration tests, or setting up a test database. Trigger on mentions of "test", "Jest", "React Testing Library", "Supertest", "mock", or "test coverage".
---

# MERN Testing Patterns

## Test pyramid for a MERN app

- **Unit tests** (most numerous) — pure functions, utility helpers, individual service methods with dependencies mocked.
- **Integration tests** — API routes tested end-to-end through Supertest against a real (test) database; React components tested with Testing Library including their hooks and child components.
- **E2E tests** (fewest) — Playwright/Cypress covering critical user flows only (signup, checkout, login) — expensive to run and maintain, so keep this layer small.

## Backend: API testing with Supertest + Jest

Use a separate test database (or `mongodb-memory-server` for a fully in-memory instance) — never run tests against a shared dev/production database.

```js
const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_DB_URI);
});
afterEach(async () => {
  await mongoose.connection.db.dropDatabase(); // clean slate between tests
});
afterAll(async () => {
  await mongoose.connection.close();
});

test('POST /api/users creates a user', async () => {
  const res = await request(app)
    .post('/api/users')
    .send({ email: 'a@b.com', password: 'longenough123' });
  expect(res.status).toBe(201);
  expect(res.body.data).toHaveProperty('_id');
  expect(res.body.data).not.toHaveProperty('passwordHash'); // never leak the hash
});

test('POST /api/users rejects invalid email', async () => {
  const res = await request(app).post('/api/users').send({ email: 'not-an-email' });
  expect(res.status).toBe(400);
});
```

Test the unhappy paths explicitly: missing fields, invalid types, unauthorized access, not-found resources — these are usually undertested compared to the happy path.

## Frontend: React Testing Library

Test behavior from the user's perspective, not implementation details. Query by role/text/label, not by CSS class or component internals.

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from './LoginForm';

test('shows validation error on empty submit', async () => {
  render(<LoginForm onSubmit={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
  expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
});

test('calls onSubmit with form values', async () => {
  const handleSubmit = jest.fn();
  render(<LoginForm onSubmit={handleSubmit} />);
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
  await waitFor(() =>
    expect(handleSubmit).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' })
  );
});
```

Mock network calls at the boundary (`fetch`/axios via `msw` — Mock Service Worker) rather than mocking the component's internal functions, so the test exercises real component logic.

## Mocking guidelines

- Mock external services (email sending, payment gateways, third-party APIs) — never hit real third parties in tests.
- Don't mock the thing you're actually testing — if testing a service function, mock its DB calls or dependencies, not the function itself.
- Prefer `msw` for frontend API mocking over manually mocking `fetch`/`axios` module-by-module — it intercepts at the network level so components behave exactly as in production.

## What to prioritize when coverage is limited

1. Auth and permission logic (highest risk if broken)
2. Payment/money-related calculations
3. Data validation and sanitization boundaries
4. Any function with branching logic or edge cases (empty arrays, null, boundary numbers)
5. Regression tests for any previously-shipped bug

Coverage percentage is a weak signal on its own — 100% coverage with no assertions on error cases is worse than 70% coverage that tests the risky paths above.
