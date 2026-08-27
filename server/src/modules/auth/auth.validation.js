const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const requestVerificationSchema = z.object({
  email: z.string().email(),
});

const verifyEmailSchema = z.object({
  token: z.string().min(16),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8),
});

const onboardingRoleSchema = z.enum([
  'league_manager',
  'league_team_manager',
  'team_manager',
  'player',
  // A casual user who only browses and follows.
  'fan',
]);

const updateOnboardingSchema = z
  .object({
    status: z.enum(['in_progress', 'completed', 'skipped']).optional(),
    roles: z.array(onboardingRoleSchema).max(5).optional(),
    completedSteps: z
      .array(z.enum(['roles', 'profiles']))
      .max(2)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No onboarding changes provided' });

module.exports = {
  registerSchema,
  loginSchema,
  requestVerificationSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateOnboardingSchema,
};
