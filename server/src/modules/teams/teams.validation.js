const { z } = require('zod');

const playerSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  players: z.array(playerSchema).max(30).optional(),
});

const addPlayerSchema = playerSchema;

const updatePlayerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

module.exports = {
  createTeamSchema,
  addPlayerSchema,
  updatePlayerSchema,
};
