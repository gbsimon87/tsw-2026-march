const { z } = require('zod');

const mongoIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id format');

const confirmedCheckboxSchema = z.preprocess(
  (value) => value === true || value === 'true',
  z.literal(true, {
    errorMap: () => ({ message: 'You must confirm the content declaration' }),
  })
);

const optionalHttpsUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith('https://'), {
      message: 'Attribution URL must use HTTPS',
    })
    .nullable()
    .optional()
);

const createInstagramSocialPostSchema = z.object({
  sourcePostId: mongoIdSchema,
  caption: z.string().trim().min(1, 'Caption is required').max(2200),
  attributionUrl: optionalHttpsUrlSchema,
  contentDeclaration: z.literal('demo'),
  rightsConfirmed: confirmedCheckboxSchema,
});

const socialPostIdSchema = z.object({ postId: mongoIdSchema });

module.exports = {
  createInstagramSocialPostSchema,
  socialPostIdSchema,
};
