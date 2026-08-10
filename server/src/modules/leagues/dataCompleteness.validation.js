const { z } = require('zod');

// Issue keys are always `<checkType>:<targetId>`. Requiring the colon keeps
// malformed keys — which would silently never match a real issue — out of the
// dismissal collection.
const issueKeySchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[a-z_]+:[a-f0-9]{24}$/, 'issueKey must look like "<checkType>:<objectId>"');

const dismissIssueSchema = z.object({
  issueKey: issueKeySchema,
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value ?? null),
});

module.exports = { dismissIssueSchema, issueKeySchema };
