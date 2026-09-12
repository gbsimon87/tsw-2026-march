import { z } from 'zod';

const id = z.string().min(1).max(128);
const empty = z.object({}).strict();

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
};

export function parseBrowserEvent(event, properties = {}) {
  const schema = schemas[event];
  if (!schema) return null;

  const result = schema.safeParse(properties);
  return result.success ? result.data : null;
}

export const BROWSER_EVENT_NAMES = Object.freeze(Object.keys(schemas));
