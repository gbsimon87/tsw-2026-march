---
name: react-component-patterns
description: Use when building or reviewing React components, hooks, data fetching (TanStack Query), forms, or state in this project's client. Trigger on "React component", "hook", "useQuery", "TanStack Query", "useEffect", "context", "form", "apiClient", or "state management".
---

# TSW React / Client Patterns

The client (`client/src/`) is **feature-based**:
`features/<domain>/{api,components,hooks,pages,schemas}`. Composition root is
`app/` (`providers/`, `router/`, `store/`). Do **not** create a
`components/pages/hooks/api/context` top-level layout — put feature code under its
feature folder.

## Component structure

- Functional components + hooks only. **Named exports** (the router unwraps
  `lazy(() => import(...).then(m => ({ default: m.X })))`) — don't use default exports.
- One component per file; file name matches the component.
- Tailwind utility classes inline (slate/emerald/amber/violet palette). No CSS
  modules. `components/ui` is **bespoke** — there is no shadcn / Radix / `cn()`.
- **No path aliases** — imports are relative (`../../../lib/apiClient`).
- Keep accessibility (`aria-label`, `inert`, focus management, `useId`) intact.

## Data fetching — prefer TanStack Query for new code

The app is **mid-migration**: TanStack Query is configured
(`app/providers/queryClient.js`, global `staleTime: 30_000`, `retry: 1`) but only
~6 call sites use it; ~22 pages still fetch imperatively with
`useEffect + useState + Promise.all`. **New data pages should use `useQuery`**, not
add to the imperative pile.

- All HTTP goes through `lib/apiClient.js` (cookies + CSRF + silent refresh already
  handled). Wrap it in a feature `*Api` object (e.g. `authApi`, `billingApi`) — never
  call `fetch` directly.
- **Query keys** are inline camelCase array literals: `['game', gameId]`,
  `['publicLeague', slug]`, `FEED_QUERY_KEY = ['feed']`. There is no key factory;
  match the existing style and keep the resource name + params.
- Factor a shared hook when >1 page needs the same query — the pattern to copy is
  `features/leagues/hooks/usePublicLeague.js`
  (`useQuery` + `enabled: Boolean(slug)` + `select: r => r.league`).
- **Mutations**: the repo currently uses plain async `*Api` calls + manual
  `queryClient.setQueryData` (feed optimistic insert, auth writes) and has **no
  `useMutation`/`invalidateQueries`**. For new mutations, prefer `useMutation` with
  `invalidateQueries` unless you are matching an adjacent optimistic pattern — call
  it out in review either way.

If you must hand-roll a fetch, guard against races/unmount with a `cancelled` flag.

## State management

- Global auth = React Context (`app/store/AuthContext.jsx`) backed by a
  `['auth','me']` query. `useAuth()` throws outside the provider. On auth
  transitions it calls `purgePrivateCache()` to evict the prior user's cache — keep
  that when touching login/logout.
- Everything else is local `useState`/`useRef`. No Redux/Zustand.
- Don't put high-frequency state in Context (re-renders all consumers).

## Forms

- **Hand-rolled**, not react-hook-form. The pattern is `features/auth/hooks/useAuthForm.js`:
  controlled `values`, `onChange` by `event.target.name`, submit runs
  `schema.parse(values)` (Zod) then `onSubmit`, surfaces `err.issues[0].message`.
- Zod schemas live in a feature `schemas/` folder (only `auth` has one today; add
  one when a feature grows form validation).
- Disable submit while in flight; client validation is UX only — the server re-validates.

## Performance

- Don't reach for `useMemo`/`useCallback`/`memo` by default — add them against a
  measured re-render problem (the OPT-016 `onCourtPlayers`/`benchPlayers` memoization
  is the documented example: arrays recreated every render, including unrelated ones).
- Stable list `key`s (ids, not array index).

## Review flags

- Adding another imperative `useEffect` fetch where `useQuery` fits.
- Calling `fetch` directly instead of through `apiClient`/`*Api`.
- Default export on a lazy-loaded page (breaks the router's named-unwrap).
- Storing derived data in state instead of computing during render.
- Mutating state in place; missing/incorrect `useEffect` deps.
- Adding a new route without updating `PostHogRouteTracker`'s route-pattern list.

See `references/component-checklist.md` for the pre-PR checklist.
