const { z } = require('zod');

const captionSchema = z.string().trim().max(280).optional().nullable();

const createGameCardPostSchema = z.object({
  gameId: z.string().min(1),
  caption: captionSchema,
});

const createPlayerCardPostSchema = z.object({
  teamId: z.string().min(1),
  playerId: z.string().min(1),
  caption: captionSchema,
});

const createTeamCardPostSchema = z.object({
  teamId: z.string().min(1),
  caption: captionSchema,
});

const mongoIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id format');

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

module.exports = {
  createGameCardPostSchema,
  createPlayerCardPostSchema,
  createTeamCardPostSchema,
  createHighlightClipPostSchema,
  listFeedSchema,
  shareableLookupSchema,
};
