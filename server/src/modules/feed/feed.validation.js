const { z } = require('zod');

const captionSchema = z.string().trim().max(280).optional().nullable();

const mongoIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id format');

// TSW-005: gameId alone identifies league games too (Game.leagueId is set on
// the same doc) — no separate league field needed for game_card.
const createGameCardPostSchema = z.object({
  gameId: z.string().min(1),
  caption: captionSchema,
});

// TSW-005: a player_card is either standalone (teamId+playerId) or
// league-sourced (leagueTeamId+leaguePlayerId) — exactly one pair, not both.
const createPlayerCardPostSchema = z
  .object({
    teamId: z.string().min(1).optional(),
    playerId: z.string().min(1).optional(),
    leagueTeamId: z.string().min(1).optional(),
    leaguePlayerId: z.string().min(1).optional(),
    caption: captionSchema,
  })
  .refine(
    (data) =>
      (Boolean(data.teamId) && Boolean(data.playerId)) !==
      (Boolean(data.leagueTeamId) && Boolean(data.leaguePlayerId)),
    { message: 'Provide either (teamId, playerId) or (leagueTeamId, leaguePlayerId), not both' }
  );

// Social backlog rank 2: a per-game player line. Same standalone-or-league
// XOR as createPlayerCardPostSchema, plus the game the line comes from.
const createPlayerGameCardPostSchema = z
  .object({
    gameId: mongoIdSchema,
    teamId: mongoIdSchema.optional(),
    playerId: mongoIdSchema.optional(),
    leagueTeamId: mongoIdSchema.optional(),
    leaguePlayerId: mongoIdSchema.optional(),
    caption: captionSchema,
  })
  .refine(
    (data) =>
      (Boolean(data.teamId) && Boolean(data.playerId)) !==
      (Boolean(data.leagueTeamId) && Boolean(data.leaguePlayerId)),
    { message: 'Provide either (teamId, playerId) or (leagueTeamId, leaguePlayerId), not both' }
  )
  // The XOR above only ever compares COMPLETE pairs, so a stray half slips
  // past it: {teamId, leagueTeamId, leaguePlayerId} reads as false !== true.
  // These two make each pair all-or-nothing.
  .refine((data) => Boolean(data.teamId) === Boolean(data.playerId), {
    message: 'teamId and playerId must be provided together',
  })
  .refine((data) => Boolean(data.leagueTeamId) === Boolean(data.leaguePlayerId), {
    message: 'leagueTeamId and leaguePlayerId must be provided together',
  });

const createTeamCardPostSchema = z
  .object({
    teamId: z.string().min(1).optional(),
    leagueTeamId: z.string().min(1).optional(),
    caption: captionSchema,
  })
  .refine((data) => Boolean(data.teamId) !== Boolean(data.leagueTeamId), {
    message: 'Provide either teamId or leagueTeamId, not both',
  });

const createHighlightClipPostSchema = z.object({
  gameId: mongoIdSchema,
  eventId: mongoIdSchema,
  caption: captionSchema,
});

const listFeedSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const shareableLookupSchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(20).default(10),
});

const discoverablePlayersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(100).default(48),
});

module.exports = {
  createGameCardPostSchema,
  createPlayerCardPostSchema,
  createPlayerGameCardPostSchema,
  createTeamCardPostSchema,
  createHighlightClipPostSchema,
  listFeedSchema,
  shareableLookupSchema,
  discoverablePlayersSchema,
};
