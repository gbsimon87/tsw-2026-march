# Feature Flags

> Part of the [Application Audit](./README.md) · July 2026

**Not present.** There is no feature-flag system in the codebase — no PostHog
flags, no LaunchDarkly/Unleash, no homegrown flag table.

What exists instead:

- **Env-based gating**: integrations self-disable when their env vars are
  absent (`isCloudinaryConfigured()`, PostHog keys, Stripe keys, Resend) —
  effectively deploy-time on/off switches per environment.
- **Plan-based gating**: entitlement flags (canTrackStats, canViewReplay,
  canViewShotMaps, canViewHighlightClips, canManageLeague) derived from
  subscription state — see [08-subscription-logic](./08-subscription-logic.md).
- `VITE_ENABLE_ANALYTICS` — the closest thing to a real flag.

## If flags are needed later

PostHog is already integrated on both client and server, so **PostHog feature
flags are the zero-new-vendor option**: `posthog.isFeatureEnabled()` client-side
and `posthog-node`'s `getAllFlags` server-side. Useful first candidates:
gradual rollout of the standings-materialisation change
([28-computation-optimisation](./28-computation-optimisation.md)) and any
tracker UX experiments.
