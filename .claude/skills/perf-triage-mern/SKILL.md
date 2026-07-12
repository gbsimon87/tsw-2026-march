---
name: perf-triage-mern
description: Use when something in a MERN app is reported as slow — a page load, an API response, a list view, a query — before proposing an optimization. Trigger on "slow", "performance", "optimize", "why is this taking so long", "timeout", "N+1", "laggy".
---

# MERN Performance Triage

"It's slow" is a symptom, not a diagnosis. A MERN app's slowness lands in one
of a small number of places — find which one before optimizing, since the fix
for a DB problem (an index) does nothing for a render problem (memoization),
and vice versa.

## Step 1 — Localize: server, network, or client?

- Time the raw API call (curl/Postman/network tab "Time" column) independent
  of the UI. If the API itself is slow, go to Step 2. If the API is fast but
  the page still feels slow, it's a client-side rendering/waterfall problem —
  go to Step 4.
- Check for a **request waterfall**: does the page fire several sequential
  fetches that could be parallelized, or a fetch that depends on a previous
  fetch's result unnecessarily?

## Step 2 — Server-side: query vs compute vs I/O

Ordered by how often each is actually the cause in a Mongoose-backed API:

1. **Missing index** — a `find`/`sort`/`$match` filtering or sorting on an
   unindexed field is the single most common MERN slowdown. Use `.explain()`
   (or the driver's equivalent) to check for `COLLSCAN` vs `IXSCAN` before
   guessing. Compound indexes must match the actual query+sort pattern, not
   just contain the right fields in any order.
2. **N+1 queries** — a loop that does a `find`/`findById` per item instead of
   one batched query (`$in`) or a `populate`. Look for any `.map`/`for` loop
   containing an `await Model.find*`.
3. **Unbounded reads** — `find()` with no `.limit()`/pagination on a
   collection that grows, or fetching full documents where a `.select()`
   projection would do (especially before `JSON.stringify`-ing a large
   response).
4. **Read-time computation on every request** — recomputing an aggregate
   (totals, standings, box scores) from a large embedded/related dataset on
   every read instead of caching or materializing it. If the same expensive
   computation runs on every request for data that only changes on write,
   that's a materialization candidate, not a query-tuning one.
5. **`.lean()` opportunity** — a read-only path that hydrates full Mongoose
   documents (with getters/virtuals/change-tracking overhead) when it only
   ever serializes the result and never `.save()`s it.
6. **External I/O in the hot path** — an unbatched call to a third-party API
   or storage service (image/email/webhook) blocking the response instead of
   being deferred to a background/post-response task.

## Step 3 — Confirm before fixing

Don't add an index or a cache layer on a guess — get evidence:

- `.explain('executionStats')` for query-shape suspicion (docs examined vs
  returned; scanned vs indexed).
- Server-side timing logs (or APM if present) to see which layer of a request
  actually consumes the time — validation, DB round-trip, compute, or
  serialization.
- For "is this actually slow at realistic scale," check against realistic
  data volume, not a near-empty dev database — a full collection scan is
  invisible at 50 documents and crippling at 500,000.

## Step 4 — Client-side rendering

1. **Unnecessary re-renders** — a component re-rendering on every parent
   render/state change unrelated to its own props; check for missing
   memoization only where a profiler shows it actually matters, not
   speculatively everywhere.
2. **Large lists without windowing** — rendering hundreds/thousands of DOM
   nodes for a list that's mostly off-screen.
3. **Bundle size / code-splitting** — a slow _initial_ load (not interaction)
   often means an unsplit bundle pulling in heavy dependencies (charting
   libs, rich-text editors, SDKs) on routes that don't need them yet.
4. **Redundant fetches** — a data-fetching layer with no cache/dedup
   (`staleTime: 0` everywhere, or hand-rolled fetches with no shared cache)
   refetching the same data on every mount instead of reusing a cached
   result.

## Step 5 — Match the fix to the actual bottleneck, and say so

State which step above localized the problem and the evidence, before
proposing indexes, caching, materialization, memoization, or code-splitting —
each of those fixes a different bottleneck, and applying the wrong one adds
complexity with no measured benefit.
