import { hasAccepted } from '../../lib/consent';

// Social backlog rank 5 — first-touch attribution for the social campaign.
//
// The link builder and the parser live in ONE module on purpose: they are two
// halves of a single contract, and a campaign link that writes `utm_source=ig`
// while the parser expects `instagram` fails silently, months later, as a
// funnel that reads zero. Changing a value here changes both sides at once.
//
// docs/posthog.md §5.1 sets the rule this module follows: "If campaign
// attribution is introduced later, allow-list individual campaign fields and
// validate them; do not preserve the whole query string." Nothing here ever
// reads or stores a raw URL, a full referrer, or an unrecognised parameter.

// The platforms the campaign in docs/marketing-social.md actually posts to,
// plus the referrer-derived values worth telling apart. Keep these stable: a
// renamed value after it has history breaks every funnel built on it
// (docs/posthog.md §7.3).
export const ATTRIBUTION_SOURCES = Object.freeze([
  'instagram',
  'tiktok',
  'facebook',
  'youtube',
  'whatsapp',
  'linkedin',
  'x',
  'reddit',
  'search',
  'email',
  'referral',
  'direct',
]);

// The subset an operator can build a campaign link for. `referral`, `search`
// and `direct` are conclusions the parser reaches, never things to tag.
export const SHAREABLE_SOURCES = Object.freeze(['instagram', 'tiktok', 'facebook', 'whatsapp']);

export const ATTRIBUTION_MEDIUMS = Object.freeze([
  'organic_social',
  'paid_social',
  'email',
  'referral',
  'organic_search',
  'none',
]);

const SOURCE_SET = new Set(ATTRIBUTION_SOURCES);
const MEDIUM_SET = new Set(ATTRIBUTION_MEDIUMS);

// The default campaign for organic social posts, matching the example in
// docs/marketing-social.md ("One-Time Setup In Week 1"). One line to change per
// campaign; an unrecognised value is dropped rather than stored, so a typo
// loses the campaign tag and never the source.
export const DEFAULT_CAMPAIGN = 'launch_2026q3';

// Campaigns have to be allow-listed for the same reason sources are: an open
// string field is an open channel for whatever an operator pastes into a link.
export const KNOWN_CAMPAIGNS = Object.freeze([DEFAULT_CAMPAIGN, 'season_2026', 'evergreen']);
const CAMPAIGN_SET = new Set(KNOWN_CAMPAIGNS);

// Referring hosts worth naming. Matched on the registrable-ish suffix so
// `m.facebook.com`, `l.instagram.com` and `www.tiktok.com` all resolve.
const REFERRER_HOSTS = [
  ['instagram.com', 'instagram'],
  ['tiktok.com', 'tiktok'],
  ['facebook.com', 'facebook'],
  ['fb.com', 'facebook'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['whatsapp.com', 'whatsapp'],
  ['linkedin.com', 'linkedin'],
  ['twitter.com', 'x'],
  ['x.com', 'x'],
  ['reddit.com', 'reddit'],
  ['google.com', 'search'],
  ['bing.com', 'search'],
  ['duckduckgo.com', 'search'],
];

function hostSource(hostname) {
  const host = String(hostname || '').toLowerCase();
  const match = REFERRER_HOSTS.find((entry) => host === entry[0] || host.endsWith(`.${entry[0]}`));
  return match ? match[1] : null;
}

function mediumForSource(source) {
  if (source === 'search') return 'organic_search';
  if (source === 'email') return 'email';
  if (source === 'direct') return 'none';
  if (source === 'referral') return 'referral';
  return 'organic_social';
}

/**
 * Adds this project's campaign parameters to a TSW URL, so a link posted to
 * Instagram is distinguishable from the same link posted to TikTok.
 *
 * Returns the URL unchanged when the source is not one an operator may tag, or
 * when the input is not a URL — a caption is better off with a plain link than
 * with a broken one.
 */
export function buildTaggedUrl(url, { source, campaign = DEFAULT_CAMPAIGN } = {}) {
  if (!url || !SHAREABLE_SOURCES.includes(source)) return url || '';

  try {
    const tagged = new URL(url);
    tagged.searchParams.set('utm_source', source);
    tagged.searchParams.set('utm_medium', mediumForSource(source));
    if (CAMPAIGN_SET.has(campaign)) tagged.searchParams.set('utm_campaign', campaign);
    return tagged.toString();
  } catch {
    return url;
  }
}

/**
 * Reads attribution from a landing, using only allow-listed values.
 *
 * An explicit `utm_source` wins, because it is what the operator deliberately
 * tagged. Otherwise the referring HOST decides — never the referrer URL, which
 * carries the other site's own query string and is on the never-send list
 * (docs/posthog.md §8). An unrecognised `utm_source` is treated as no tag at
 * all rather than passed through: the whole point is a closed vocabulary.
 */
export function readAttribution({ search = '', referrer = '', origin = '' } = {}) {
  const params = new URLSearchParams(search);
  const taggedSource = String(params.get('utm_source') || '')
    .trim()
    .toLowerCase();

  if (SOURCE_SET.has(taggedSource)) {
    const medium = String(params.get('utm_medium') || '')
      .trim()
      .toLowerCase();
    const campaign = String(params.get('utm_campaign') || '').trim();
    return {
      source: taggedSource,
      medium: MEDIUM_SET.has(medium) ? medium : mediumForSource(taggedSource),
      campaign: CAMPAIGN_SET.has(campaign) ? campaign : null,
      is_tagged: true,
    };
  }

  if (!referrer) {
    return { source: 'direct', medium: 'none', campaign: null, is_tagged: false };
  }

  let hostname = '';
  try {
    const parsed = new URL(referrer);
    // A same-origin referrer is in-app navigation, not an arrival.
    if (origin && parsed.origin === origin) return null;
    hostname = parsed.hostname;
  } catch {
    return { source: 'direct', medium: 'none', campaign: null, is_tagged: false };
  }

  const source = hostSource(hostname) || 'referral';
  return { source, medium: mediumForSource(source), campaign: null, is_tagged: false };
}

// ---------------------------------------------------------------------------
// First-touch store
//
// "First touch" means the FIRST arrival is kept forever, never overwritten by a
// later visit — that is what makes it answerable to "which channel found this
// user", as opposed to "which channel they came back through today".
//
// Storage is consent-gated, and deliberately so. Reading the current URL costs
// no storage and needs no consent, so first touch is always held in memory for
// this tab. Writing it to localStorage is non-essential storage under UK PUECR,
// so it happens only once the visitor accepts — the same memory-until-accepted
// shape lib/posthog.js already uses for PostHog's own identifier. A visitor who
// declines is still attributed within their session and forgotten when the tab
// closes, which is the honest trade rather than a quiet exception claim
// (docs/posthog.md §5.2).
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'tsw_first_touch';

let memoryFirstTouch = null;

function readStored() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    // Re-validate on read: a value that was legal when written may have been
    // retired since, and a hand-edited localStorage entry is untrusted input.
    return SOURCE_SET.has(record?.source)
      ? {
          source: record.source,
          medium: MEDIUM_SET.has(record.medium) ? record.medium : mediumForSource(record.source),
          campaign: CAMPAIGN_SET.has(record.campaign) ? record.campaign : null,
          is_tagged: Boolean(record.is_tagged),
        }
      : null;
  } catch {
    return null;
  }
}

function writeStored(attribution) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage unavailable (private mode, storage disabled). The in-memory value
    // still attributes this session; the next visit starts over.
  }
}

/**
 * Records this arrival if nothing has been recorded before, and returns the
 * first touch that now stands.
 *
 * Safe to call on every render: an existing first touch is never replaced.
 */
export function captureFirstTouch({ search, referrer, origin } = {}) {
  const stored = memoryFirstTouch || readStored();
  if (stored) {
    memoryFirstTouch = stored;
    return stored;
  }

  const arrival = readAttribution({
    search: search ?? window.location.search,
    referrer: referrer ?? document.referrer,
    origin: origin ?? window.location.origin,
  });
  if (!arrival) return null;

  memoryFirstTouch = arrival;
  if (hasAccepted()) writeStored(arrival);
  return arrival;
}

export function getFirstTouch() {
  return memoryFirstTouch || readStored();
}

/**
 * Called when the visitor accepts analytics: the first touch already held in
 * memory becomes durable, so a return visit is still credited to the post that
 * originally found them.
 */
export function persistFirstTouchOnConsent() {
  if (!hasAccepted() || !memoryFirstTouch || readStored()) return false;
  writeStored(memoryFirstTouch);
  return true;
}

export function clearFirstTouch() {
  memoryFirstTouch = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — see writeStored.
  }
}

// A visitor who arrived from a social post has no TSW account yet far more
// often than not. That is a routing signal, not an analytics one, so it is
// answered from the in-memory value and works before any consent decision.
export function arrivedFromSocial(touch = getFirstTouch()) {
  return Boolean(touch && SHAREABLE_SOURCES.includes(touch.source));
}

/**
 * Whether this arrival is one a campaign can take credit for: a link TSW
 * deliberately tagged, or a click through from a social platform.
 *
 * `direct` and `search` arrivals are deliberately excluded. They still travel
 * as super properties so a funnel can segment by them, but counting them as
 * campaign landings would make the metric a visitor count wearing a campaign's
 * name.
 */
export function isCampaignLanding(touch = getFirstTouch()) {
  return Boolean(touch && (touch.is_tagged || arrivedFromSocial(touch)));
}

// The property bag every attributed event and person carries. Flat, allow-
// listed, and free of anything resembling a URL.
export function attributionProperties(touch = getFirstTouch()) {
  if (!touch) return null;
  return {
    first_touch_source: touch.source,
    first_touch_medium: touch.medium,
    first_touch_campaign: touch.campaign || 'none',
  };
}
