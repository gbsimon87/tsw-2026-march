const { z } = require('zod');
const { playerPositionSchema } = require('../teams/teams.validation');

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color');

const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  seasonLabel: z.string().trim().max(80).optional(),
});

const updateLeagueSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    seasonLabel: z.string().trim().max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const createLeagueTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  colors: z.array(hexColorSchema).max(3).optional(),
});

const updateLeagueTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(120).optional(),
    colors: z.array(hexColorSchema).max(3).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const leaguePlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
  position: playerPositionSchema.optional(),
});

const updateLeaguePlayerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
    position: playerPositionSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const addManagerSchema = z.object({
  email: z.string().email(),
});

const updateMemberSchema = z.object({
  status: z.enum(['active', 'removed']).optional(),
});

const createJoinRequestSchema = z
  .object({
    requestedRole: z.enum(['player', 'helper']),
    requestedLeaguePlayerId: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.requestedRole === 'player' && !value.requestedLeaguePlayerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'requestedLeaguePlayerId is required for player join requests',
        path: ['requestedLeaguePlayerId'],
      });
    }

    if (value.requestedRole === 'helper' && value.requestedLeaguePlayerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'requestedLeaguePlayerId is not allowed for helper join requests',
        path: ['requestedLeaguePlayerId'],
      });
    }
  });

module.exports = {
  createLeagueSchema,
  updateLeagueSchema,
  createLeagueTeamSchema,
  updateLeagueTeamSchema,
  leaguePlayerSchema,
  updateLeaguePlayerSchema,
  addManagerSchema,
  updateMemberSchema,
  createJoinRequestSchema,
};
