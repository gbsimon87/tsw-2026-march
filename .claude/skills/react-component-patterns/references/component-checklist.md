# Pre-PR Component Review Checklist (TSW)

- [ ] Functional component, **named export** (lazy-loaded pages must be named exports)
- [ ] Lives under the right `features/<domain>/` subfolder (or `components/` if shared)
- [ ] Hooks called at top level; `useEffect`/`useMemo`/`useCallback` deps complete
- [ ] Data fetched via `useQuery` through a feature `*Api` object (not raw `fetch`, not a new imperative `useEffect` unless matching adjacent code)
- [ ] Loading, error, and empty states handled (SportsLoader for page-level loading)
- [ ] Lists use stable unique keys (ids, not array index)
- [ ] No direct state mutation; no derived data stored in state
- [ ] Forms: Zod schema in `schemas/`, `useAuthForm`-style handling, submit disabled while in-flight, inline errors
- [ ] Images use `<CloudinaryImage>` (`features/media`) where a Cloudinary asset is shown — not a raw `<img>`
- [ ] Accessibility: real `button`/`a` (not `div onClick`), `alt` text, labeled inputs, focus/`aria` preserved
- [ ] No secrets/API keys in client code; env read via `lib/env.js`
- [ ] New route added? Update `AppRouter.jsx` **and** `PostHogRouteTracker`'s route-pattern list
- [ ] `useMemo`/`memo` only against a measured re-render problem, not by default
- [ ] Tests: colocated `*.test.jsx` (Vitest + RTL) added/updated; snapshots reviewed if changed
