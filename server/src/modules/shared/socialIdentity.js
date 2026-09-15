// Social backlog rank 9 — social identity and consent fields.
//
// Pure module: no Mongoose, no Express, no I/O. Leagues, league teams, league
// players, standalone teams and standalone team players all store the same
// `social` sub-document, and every one of them resolves marketing permission
// through `resolveMarketingPermission` here, so there is exactly one place
// where "may TSW publish this person's name" is decided.
//
// The rule it encodes is the one in docs/ideas.md > Constraints: marketing
// content comes from the demo account UNLESS the organisation (a league, or a
// standalone team's owner) has recorded permission, and featuring a minor
// additionally requires a recorded parent/guardian consent.

const SOCIAL_NETWORKS = Object.freeze(['instagram', 'tiktok']);

// Instagram allows 30 characters, TikTok 24. Both accept letters, digits,
// periods and underscores and nothing else, so one charset covers both and only
// the length differs.
const HANDLE_MAX_LENGTH = Object.freeze({ instagram: 30, tiktok: 24 });
const HANDLE_PATTERN = /^[A-Za-z0-9._]+$/;

const MARKETING_STATUSES = Object.freeze(['unrecorded', 'granted', 'declined']);
const AGE_CATEGORIES = Object.freeze(['unspecified', 'adult', 'minor']);

const MARKETING_REASONS = Object.freeze({
  GRANTED: 'granted',
  NOT_RECORDED: 'permission_not_recorded',
  ORG_DECLINED: 'permission_declined',
  SUBJECT_DECLINED: 'subject_declined',
  GUARDIAN_CONSENT_MISSING: 'guardian_consent_missing',
});

/**
 * Normalises one handle as typed into what we store: no leading '@', no
 * surrounding whitespace, original capitalisation preserved (both platforms are
 * case-insensitive, but people care how their own name is spelled).
 *
 * Returns null for an empty value — "cleared" and "never recorded" are the same
 * state — and null for anything unusable. The Zod boundary rejects a malformed
 * handle first (`isValidHandle`), so this returning null is the belt to that
 * braces: a handle that cannot be stored is stored as nothing rather than as
 * something that would tag a stranger.
 */
function normalizeHandle(value, network) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().replace(/^@+/, '');
  if (!trimmed) return null;

  const max = HANDLE_MAX_LENGTH[network] ?? HANDLE_MAX_LENGTH.instagram;
  if (trimmed.length > max || !HANDLE_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/** True for an empty value too: clearing a handle is always allowed. */
function isValidHandle(value, network) {
  if (value === null || value === undefined) return true;
  const trimmed = String(value).trim().replace(/^@+/, '');
  return trimmed === '' || normalizeHandle(trimmed, network) !== null;
}

/** Display form. Storage never carries the '@'; every surface that shows one does. */
function formatHandle(value) {
  return value ? `@${value}` : null;
}

function emptySocial({ withAge = false } = {}) {
  return {
    instagramHandle: null,
    tiktokHandle: null,
    marketing: { status: 'unrecorded', recordedAt: null, recordedByUserId: null, note: null },
    ...(withAge ? { ageCategory: 'unspecified', guardianConsentAt: null } : {}),
  };
}

function readSocial(entity) {
  const social = entity?.social;
  // Mongoose sub-documents answer toObject(); plain fixtures in tests do not.
  return social?.toObject?.() || social || {};
}

/**
 * Why this individual may not be named, or null when nothing blocks them.
 *
 * `ageCategory: 'unspecified'` is treated as covered by the organisation's
 * permission rather than blocked. The organisation attests that it holds
 * permission from its players and, where they are under 18, their guardians;
 * requiring an age on every roster row before anything could be published would
 * make the attestation unusable and teach operators to click through it.
 * Recording 'minor' is how a league says "this one needs the extra record".
 */
function subjectRestriction(subject) {
  const social = readSocial(subject);
  if (social.marketing?.status === 'declined') return MARKETING_REASONS.SUBJECT_DECLINED;
  if (social.ageCategory === 'minor' && !social.guardianConsentAt) {
    return MARKETING_REASONS.GUARDIAN_CONSENT_MISSING;
  }
  return null;
}

function orgRestriction(org) {
  const status = readSocial(org).marketing?.status || 'unrecorded';
  if (status === 'granted') return null;
  return status === 'declined' ? MARKETING_REASONS.ORG_DECLINED : MARKETING_REASONS.NOT_RECORDED;
}

function subjectId(subject) {
  return String(subject?._id ?? subject?.id ?? '');
}

/**
 * The single answer every export surface asks for.
 *
 * `org` is the League (for league content) or the standalone Team (for its
 * own). `teams` are the clubs a card could name, `subjects` the individuals.
 *
 * An individual can only ever REMOVE permission, never grant it past an
 * organisation that has not recorded any: the agreement TSW relies on is the
 * one with the league, and a roster row cannot speak for it.
 *
 * `handles` is one flat map keyed by entity id — league, team or player — so a
 * caption surface looks up whatever ids its card happens to carry without
 * knowing which kind of payload produced the block. A player who is restricted
 * contributes no handle: tagging is the act the permission is for.
 */
function resolveMarketingPermission({ org, teams = [], subjects = [], scope = 'league' } = {}) {
  const blocked = orgRestriction(org);
  const base = {
    scope,
    orgId: subjectId(org) || null,
    orgName: org?.name ?? null,
  };

  if (blocked) {
    return { ...base, canFeature: false, reason: blocked, restrictedPlayerIds: [], handles: {} };
  }

  const restrictedPlayerIds = [];
  const handles = {};
  const addHandles = (entity) => {
    const id = subjectId(entity);
    const recorded = id ? publicHandles(entity) : null;
    if (recorded) handles[id] = recorded;
  };

  addHandles(org);
  for (const team of teams) addHandles(team);

  for (const subject of subjects) {
    const id = subjectId(subject);
    if (!id) continue;

    if (subjectRestriction(subject)) {
      restrictedPlayerIds.push(id);
      continue;
    }
    addHandles(subject);
  }

  return {
    ...base,
    canFeature: true,
    reason: MARKETING_REASONS.GRANTED,
    restrictedPlayerIds,
    handles,
  };
}

/**
 * Combines the blocks of several organisations into the one a single asset must
 * satisfy — a standalone dual-team game names two clubs owned by two different
 * people, and publishing it needs both to have said yes.
 *
 * Deliberately strict: one missing record blocks the whole asset, because an
 * image cannot be published half-way.
 */
function mergeMarketingPermissions(blocks = []) {
  const present = blocks.filter(Boolean);
  if (!present.length) {
    return {
      canFeature: false,
      reason: MARKETING_REASONS.NOT_RECORDED,
      scope: 'league',
      orgId: null,
      orgName: null,
      restrictedPlayerIds: [],
      handles: {},
    };
  }
  if (present.length === 1) return present[0];

  const blocking = present.find((block) => !block.canFeature);
  const restrictedPlayerIds = [
    ...new Set(present.flatMap((block) => block.restrictedPlayerIds || [])),
  ];
  const handles = Object.assign({}, ...present.map((block) => block.handles || {}));
  const orgName = present
    .map((block) => block.orgName)
    .filter(Boolean)
    .join(' and ');

  return {
    canFeature: !blocking,
    reason: blocking ? blocking.reason : MARKETING_REASONS.GRANTED,
    scope: present[0].scope,
    // No single org owns a merged block, so naming one would misattribute the
    // record the operator is being sent to fix.
    orgId: blocking?.orgId ?? null,
    orgName: blocking ? blocking.orgName : orgName || null,
    restrictedPlayerIds: blocking ? [] : restrictedPlayerIds,
    handles: blocking ? {} : handles,
  };
}

/**
 * Handles for a cleared entity, or null when it recorded none. Callers must
 * have established clearance first: a handle is an instruction to tag a real
 * account, and tagging is the act permission is for.
 */
function publicHandles(entity) {
  const social = readSocial(entity);
  const instagram = formatHandle(social.instagramHandle);
  const tiktok = formatHandle(social.tiktokHandle);
  return instagram || tiktok ? { instagram, tiktok } : null;
}

/**
 * The owner-facing view: the raw record, including why it is what it is.
 *
 * Never send this to a public endpoint. `ageCategory: 'minor'` on a public
 * payload would publish a child's age band beside their name, which is a worse
 * disclosure than the one the permission exists to prevent.
 */
function sanitizeSocialForAdmin(entity, { withAge = false } = {}) {
  const social = readSocial(entity);
  const marketing = social.marketing?.toObject?.() || social.marketing || {};

  return {
    instagramHandle: social.instagramHandle ?? null,
    tiktokHandle: social.tiktokHandle ?? null,
    marketing: {
      status: marketing.status || 'unrecorded',
      recordedAt: marketing.recordedAt ?? null,
      recordedByUserId: marketing.recordedByUserId ? String(marketing.recordedByUserId) : null,
      note: marketing.note ?? null,
    },
    ...(withAge
      ? {
          ageCategory: social.ageCategory || 'unspecified',
          guardianConsentAt: social.guardianConsentAt ?? null,
          restriction: subjectRestriction(entity),
        }
      : {}),
  };
}

/**
 * Applies a validated update to an entity's `social` sub-document.
 *
 * `recordedByUserId`/`recordedAt` are stamped by the server, never accepted
 * from the client — a consent record whose author the client chose is not a
 * record. Returns nothing; mutates `entity` for the caller to save.
 */
function applySocialUpdate(entity, payload = {}, { actorUserId, withAge = false } = {}) {
  const current = readSocial(entity);
  const next = {
    ...emptySocial({ withAge }),
    ...current,
    marketing: { ...emptySocial().marketing, ...(current.marketing || {}) },
  };

  for (const network of SOCIAL_NETWORKS) {
    const key = `${network}Handle`;
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      next[key] = normalizeHandle(payload[key], network);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'marketingStatus')) {
    const status = payload.marketingStatus;
    const changed = status !== next.marketing.status;
    next.marketing = {
      status,
      // A re-affirmation of the same answer keeps its original date — the date
      // is when the league said it, not when someone last opened the form.
      recordedAt: changed ? new Date() : (next.marketing.recordedAt ?? new Date()),
      recordedByUserId: changed ? (actorUserId ?? null) : next.marketing.recordedByUserId,
      note: next.marketing.note ?? null,
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'marketingNote')) {
    next.marketing.note = payload.marketingNote?.trim() || null;
  }

  if (withAge && Object.prototype.hasOwnProperty.call(payload, 'ageCategory')) {
    next.ageCategory = payload.ageCategory;
    // Leaving a stale guardian record on someone re-marked as an adult would
    // leave the DB asserting a consent nobody gave.
    if (next.ageCategory !== 'minor') next.guardianConsentAt = null;
  }

  if (withAge && Object.prototype.hasOwnProperty.call(payload, 'guardianConsent')) {
    next.guardianConsentAt = payload.guardianConsent
      ? (next.guardianConsentAt ?? new Date())
      : null;
  }

  entity.social = next;
}

module.exports = {
  AGE_CATEGORIES,
  HANDLE_MAX_LENGTH,
  MARKETING_REASONS,
  MARKETING_STATUSES,
  SOCIAL_NETWORKS,
  applySocialUpdate,
  emptySocial,
  formatHandle,
  isValidHandle,
  mergeMarketingPermissions,
  normalizeHandle,
  publicHandles,
  resolveMarketingPermission,
  sanitizeSocialForAdmin,
  subjectRestriction,
};
