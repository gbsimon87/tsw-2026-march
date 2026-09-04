// Single home for the "is this redirect target same-origin?" rule.
//
// `redirectTo=…` is read from the URL in several places (auth pages, team
// creation, the onboarding hand-off) and from sessionStorage for a preserved
// follow intent, so an unguarded value turns each of those into an
// open-redirect vector. A bare startsWith('/') is NOT enough: `//evil.com` is a
// protocol-relative URL that resolves to another origin, and `/\evil.com` is
// normalised to the same thing by some browsers.
export function isSafeInternalPath(value) {
  if (typeof value !== 'string' || value === '') return false;
  if (!value.startsWith('/')) return false;
  // Reject protocol-relative ("//host") and backslash-smuggled ("/\host") forms.
  return !/^\/[\\/]/.test(value);
}

// Returns the path when it is a safe same-origin target, otherwise `fallback`
// (defaults to undefined so callers can `||` their own destination in).
export function safeInternalPath(value, fallback = undefined) {
  return isSafeInternalPath(value) ? value : fallback;
}
