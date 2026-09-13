const { z } = require('zod');

const id = z.string().min(1).max(128);

// Shared by game_tracking_started and game_completed: both describe the same
// game at a different point in its life, so an analysis can compare them only
// while their context properties stay identical.
const gameContextShape = {
  game_id: id,
  game_context: z.enum(['standalone', 'league']),
  tracking_mode: z.enum(['one_sided', 'dual_team']),
  actor_role: z.enum(['league_owner', 'league_manager', 'team_manager']),
  team_id: id.optional(),
  league_id: id.optional(),
  season_id: id.optional(),
};

const eventSchemas = {
  user_registered: z.object({ auth_provider: z.enum(['local', 'google']) }).strict(),
  user_logged_in: z
    .object({ auth_provider: z.enum(['local', 'google']), is_first_login: z.boolean() })
    .strict(),
  registration_failed: z
    .object({ reason: z.enum(['email_in_use', 'invalid_input', 'provider_failure']) })
    .strict(),
  onboarding_step_completed: z
    .object({
      step: z.string().min(1).max(64),
      selected_role_count: z.number().int().nonnegative(),
    })
    .strict(),
  onboarding_completed: z
    .object({
      selected_roles: z.array(
        z.enum(['league_manager', 'league_team_manager', 'team_manager', 'player', 'fan'])
      ),
    })
    .strict(),
  onboarding_skipped: z.object({ step: z.string().min(1).max(64) }).strict(),
  resource_created: z
    .object({
      resource_type: z.enum(['team', 'league']),
      resource_id: z.string().min(1).max(128),
      actor_role: z.enum(['league_owner', 'team_manager']),
    })
    .strict(),
  league_team_created: z
    .object({
      league_id: id,
      league_team_id: id,
      actor_role: z.enum(['league_owner', 'league_manager']),
    })
    .strict(),
  roster_populated: z
    .object({
      resource_type: z.enum(['team', 'league_team']),
      resource_id: z.string().min(1).max(128),
      league_id: z.string().min(1).max(128).optional(),
      actor_role: z.enum(['league_owner', 'league_manager', 'team_manager']),
      method: z.enum(['manual', 'join_request', 'claim', 'import']),
    })
    .strict(),
  game_scheduled: z
    .object({
      game_id: z.string().min(1).max(128),
      game_context: z.enum(['standalone', 'league']),
      tracking_mode: z.enum(['one_sided', 'dual_team']),
      actor_role: z.enum(['league_owner', 'league_manager', 'team_manager']),
      creation_method: z.enum(['single', 'bulk']),
      team_id: z.string().min(1).max(128).optional(),
      league_id: z.string().min(1).max(128).optional(),
      season_id: z.string().min(1).max(128).optional(),
    })
    .strict(),
  game_tracking_started: z.object(gameContextShape).strict(),
  game_completed: z.object(gameContextShape).strict(),
};

function parseServerEvent(event, properties = {}) {
  const schema = eventSchemas[event];
  if (!schema) return null;
  const result = schema.safeParse(properties);
  return result.success ? result.data : null;
}

module.exports = { parseServerEvent, SERVER_EVENT_NAMES: Object.freeze(Object.keys(eventSchemas)) };
