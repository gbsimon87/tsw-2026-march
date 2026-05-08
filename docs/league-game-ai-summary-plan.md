# League Game AI Summary Plan

## Summary

Add persisted summaries for league games only. When a user finishes a league game from `GameTrackPage.jsx`, the server creates and saves a recap if the game does not already have one. It tries OpenAI first; if OpenAI fails or is unavailable, it saves a deterministic one- or two-sentence backup recap from score and top performers. `GameDetailPage.jsx` shows the saved summary under the game video, or in that same area when no video exists.

## Key Changes

- Extend the `Game` Mongoose schema with a persisted summary object containing `text`, `source`, `provider`, `model`, and `generatedAt`.
- Add a server summary service that only runs for league games, skips games with existing summaries, builds compact input from score, teams, top performers, totals, and key events, and requests one professional sports beat-style paragraph from OpenAI.
- Save a fallback recap when OpenAI is missing or fails.
- Update `finishGameForUser` to complete the game, generate/save the summary for league games only, and return the updated detail payload.
- Update game detail API responses and `GameDetailPage.jsx` to render the saved summary before the tabs, directly below the video when one exists.

## Environment Variables

### Local Server

Add these keys to `env/server/.env.development`:

```env
OPENAI_API_KEY=your_local_openai_api_key
OPENAI_GAME_SUMMARY_MODEL=gpt-5.4-mini
OPENAI_GAME_SUMMARY_TIMEOUT_MS=8000
```

No client environment variables are required.

### Render Deployed Dev

Add these keys to `tsw-2026-march-api-dev` in Render:

```env
OPENAI_API_KEY=<dev OpenAI API key>
OPENAI_GAME_SUMMARY_MODEL=gpt-5.4-mini
OPENAI_GAME_SUMMARY_TIMEOUT_MS=8000
```

Do not add these variables to `tsw-2026-march-client-dev`.

### Render Deployed Production

Add these keys to `tsw-2026-march-api-prod` in Render:

```env
OPENAI_API_KEY=<production OpenAI API key>
OPENAI_GAME_SUMMARY_MODEL=gpt-5.4-mini
OPENAI_GAME_SUMMARY_TIMEOUT_MS=8000
```

Do not add these variables to `tsw-2026-march-client-prod`.

## Test Plan

- Server tests cover AI success, existing summary skip, standalone skip, OpenAI failure fallback, and missing API key fallback.
- Client tests cover summary placement below video, summary placement without video, and no panel when no summary exists.
- Run `pnpm --filter server test` and `pnpm --filter client test -- GameDetailPage`.

## Assumptions

- A fallback recap counts as a saved summary.
- Editing completed stats does not regenerate summaries in this version.
- All AI calls stay server-side.
- Production credentials currently present in local env files should be rotated before relying on this deployment setup.
