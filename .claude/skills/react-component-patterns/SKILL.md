---
name: react-component-patterns
description: Use when building or reviewing React components, hooks, state management, data fetching, or forms in a MERN frontend. Trigger on mentions of "React component", "hook", "useState", "useEffect", "context", "form", or "state management".
---

# React Component Patterns

## Component structure defaults

- Functional components with hooks only — no class components in new code.
- One component per file; file name matches component name (`UserCard.jsx` exports `UserCard`).
- Co-locate a component's styles, tests, and sub-components that only it uses in the same folder.
- Keep components under ~150 lines; if it grows past that, extract a sub-component or a custom hook.

## Data fetching pattern

Prefer a dedicated data-fetching library (React Query / TanStack Query, or SWR) over hand-rolled `useEffect` + `useState` fetching once the app has more than a couple of API calls. Hand-rolled fetching re-implements caching, race-condition handling, and loading/error state every time.

If hand-rolling for a small app, always guard against race conditions and unmounted-component updates:

```jsx
useEffect(() => {
  let cancelled = false;
  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${id}`);
      const data = await res.json();
      if (!cancelled) setUser(data);
    } catch (err) {
      if (!cancelled) setError(err);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }
  load();
  return () => {
    cancelled = true;
  };
}, [id]);
```

## Custom hooks

Extract a custom hook when: the same stateful logic is duplicated across 2+ components, or a component's state logic is complex enough to obscure the render output. Name hooks `useX` and keep them focused on one concern (`useDebounce`, `useLocalStorage`, `useAuth`) rather than one giant `useApp` hook.

## State management decision guide

- **Local component state** (`useState`) — state only one component and its direct children need.
- **Lifted state / prop drilling** — fine for 1-2 levels down.
- **Context** — for state read by many components across the tree that changes infrequently (auth user, theme, feature flags). Don't put frequently-changing, high-frequency state in Context — it re-renders every consumer on every change.
- **External store (Redux Toolkit / Zustand)** — for complex shared state with frequent updates, cross-cutting concerns, or when you need time-travel debugging / middleware.

## Forms

- Use a form library (React Hook Form) for anything beyond 2-3 fields — avoids re-rendering the whole form on every keystroke that manual `useState`-per-field causes.
- Validate on the client for UX (immediate feedback) AND always re-validate on the server — client validation is not a security boundary.
- Disable the submit button while a submission is in flight to prevent duplicate submissions.

## Performance

- Don't reach for `useMemo`/`useCallback`/`React.memo` by default — they add complexity and have their own overhead. Add them when you've identified an actual re-render problem (via React DevTools Profiler), typically: expensive computations, or components that re-render often with the same props inside large lists.
- Use a stable `key` (an id, not the array index) when rendering lists that can reorder, filter, or have items inserted/removed — index keys cause state to attach to the wrong item.

## Common review flags

- `useEffect` with a missing or incorrect dependency array causing stale closures or infinite loops.
- Directly mutating state (`state.items.push(x)`) instead of creating a new array/object — breaks React's change detection.
- Fetching data in a component that's also responsible for heavy rendering logic — split into a container (data) and presentational (view) component if the file is doing both.
- Storing derived data in state instead of computing it during render (e.g., storing a `filteredList` in `useState` when it should just be `list.filter(...)` computed each render).

See `references/component-checklist.md` for a pre-PR review checklist.
