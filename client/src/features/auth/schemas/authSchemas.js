import { z } from 'zod';

// Every message here reaches a user verbatim, so none of them may fall back to
// Zod's developer-facing defaults ("String must contain at least 8 character(s)").
// Each one names the problem and the recovery.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters.`;

const email = z
  .string()
  .min(1, { message: 'Enter your email address.' })
  .email({ message: 'That email address is missing an @ or a domain.' });

const password = z
  .string()
  .min(1, { message: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, {
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters — that one is too short.`,
  });

export const registerSchema = z.object({
  email,
  password,
  name: z
    .string()
    .min(1, { message: 'Enter the name you want on your profile.' })
    .max(100, { message: 'Keep your name to 100 characters or fewer.' }),
});

export const loginSchema = z.object({ email, password });
