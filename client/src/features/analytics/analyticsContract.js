import { z } from 'zod';

import { ATTRIBUTION_MEDIUMS, ATTRIBUTION_SOURCES } from './attribution';

const id = z.string().min(1).max(128);
const empty = z.object({}).strict();

// Social backlog rank 5. The enums come from attribution.js rather than being
// restated, so a source added there cannot be rejected here.
const attributionSource = z.enum(ATTRIBUTION_SOURCES);
const attributionMedium = z.enum(ATTRIBUTION_MEDIUMS);

// docs/posthog.md §11.7 already owns sharing. `share_initiated` /
// `share_completed` are those generic events, not new social-specific ones, so
// one dashboard still compares every share surface.
const shareShape = {
  target_type: z.enum([
    'game_card',
    'player_card',
    'player_game_card',
    'team_card',
    'milestone',
    'highlight_clip',
    'highlight_reel',
    'feed_post',
    // Social backlog rank 6: the whole completed-game kit as one ZIP. It is its
    // own target rather than one event per image, so a kit download counts once
    // and never inflates the per-card numbers next to it.
    'game_kit',
    // Social backlog rank 7: one slide of the box-score carousel. Kept distinct
    // from `game_card` so "which slide gets downloaded on its own" is an
    // answerable question.
    'carousel_slide',
    // Social backlog rank 8: a league leaders or league table card.
    'leaderboard_card',
  ]),
  method: z.enum(['native', 'clipboard', 'download']),
  source: z.enum([
    'pulse',
    'game_detail',
    'player_profile',
    'team_profile',
    'admin_social',
    'league_page',
  ]),
  format: z.enum(['post', 'story', 'link']).optional(),
};

const schemas = {
  analytics_consent_accepted: z.object({ consent_policy_version: z.number().int().positive() }),
  signup_cta_clicked: z.object({
    source: z.enum(['nav', 'home', 'pulse', 'feed_composer', 'follow_button', 'pricing']),
  }),
  auth_page_viewed: z.object({ mode: z.enum(['login', 'register']), has_redirect: z.boolean() }),
  oauth_started: z.object({ provider: z.literal('google'), mode: z.enum(['login', 'register']) }),
  feed_load_more: empty,
  feed_composer_opened: empty,
  game_tracking_overlay_opened: z.object({ game_id: id }),
  game_tracking_overlay_closed: z.object({ game_id: id }),
  game_detail_feed_composer_opened: z.object({ game_id: id }),
  game_highlight_clip_shared: z.object({ game_id: id }),
  game_highlight_reel_opened: z.object({ game_id: id }),
  game_highlight_reel_shared: z.object({ game_id: id, method: z.enum(['native', 'clipboard']) }),
  game_detail_tab_changed: z.object({ game_id: id, tab: z.string().min(1).max(64) }),
  court_layout_unknown: z.object({ court_layout_id: id }),

  // Social backlog rank 5.
  social_landing_viewed: z.object({
    first_touch_source: attributionSource,
    first_touch_medium: attributionMedium,
    first_touch_campaign: z.string().min(1).max(64),
    // Separates a link TSW deliberately tagged from one attributed by referrer
    // alone — the second is a guess and should not be read as campaign proof.
    is_tagged: z.boolean(),
    route_pattern: z.string().min(1).max(128),
  }),
  share_initiated: z.object(shareShape).strict(),
  share_completed: z.object({ ...shareShape, result: z.literal('succeeded') }).strict(),
  league_enquiry_submitted: z
    .object({
      // Contact-form free text, names, emails, and the club name are on the
      // never-send list (docs/posthog.md §8). Only the two closed enums travel.
      interest: z.enum(['league-setup', 'team-tracking', 'general', 'other']),
      role: z.enum(['coach', 'manager', 'stat-keeper', 'club-director', 'other']),
    })
    .strict(),
};

export function parseBrowserEvent(event, properties = {}) {
  const schema = schemas[event];
  if (!schema) return null;

  const result = schema.safeParse(properties);
  return result.success ? result.data : null;
}

export const BROWSER_EVENT_NAMES = Object.freeze(Object.keys(schemas));
