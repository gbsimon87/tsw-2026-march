const { z } = require('zod');

// Route ids are validated before any repository call: Mongoose throws a
// CastError on a malformed ObjectId (e.g. findUploadAttemptById).
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// R2: the API never receives the file. Size and type are checked for
// usability only and are untrusted; verified duration/resolution are enforced
// after ingest (T5).
const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 ** 3; // 20 GiB

const gameVideoParamsSchema = z.object({
  gameId: objectIdSchema,
});

const videoUploadAttemptParamsSchema = z.object({
  gameId: objectIdSchema,
  attemptId: objectIdSchema,
});

const createVideoUploadSchema = z.object({
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_UPLOAD_BYTES),
  mimeType: z
    .string()
    .max(100)
    .regex(/^video\/[A-Za-z0-9.+-]+$/, 'Choose a video file'),
  // P6: "same recording as the current video" (keeps old highlights playable).
  sameRecording: z.boolean().optional().default(false),
});

const videoPlaybackQuerySchema = z.object({ eventId: objectIdSchema.optional() });

module.exports = {
  videoPlaybackQuerySchema,
  MAX_VIDEO_UPLOAD_BYTES,
  gameVideoParamsSchema,
  videoUploadAttemptParamsSchema,
  createVideoUploadSchema,
};
