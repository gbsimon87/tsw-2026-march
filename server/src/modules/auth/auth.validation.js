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

module.exports = {
  registerSchema,
  loginSchema,
  requestVerificationSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
