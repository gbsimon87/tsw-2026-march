// OPT-020: atomic webhook idempotency.
//
// Stripe delivers each event at-least-once, so a handler can run concurrently
// for the same event id. The previous approach loaded the resource, checked an
// in-memory array, then saved — a read-check-write race where two concurrent
// deliveries could both pass the check and both apply the effect.
//
// `claimWebhookEvent` collapses the check-and-mark into a single atomic
// `findOneAndUpdate` gated on the id being absent from `processedWebhookEventIds`
// (`$ne`). The DB guarantees exactly one caller wins the claim:
//   - a document is returned  → this caller claimed it; apply the effect + save.
//   - `null` is returned      → the id was already present (a duplicate) OR the
//                               resource doesn't match the filter; skip.
// `$push` with `$each` + `$slice: -N` appends and bounds the list in the same
// atomic op, and `lastWebhookEventId` is kept for observability/back-compat.

const MAX_PROCESSED_WEBHOOK_EVENT_IDS = 25;

async function claimWebhookEvent(Model, filter, eventId) {
  if (!eventId) {
    // No id to dedupe on — fall back to a plain match so the handler can still
    // run (Stripe always sends an id in practice; this is defensive).
    return Model.findOne(filter);
  }

  return Model.findOneAndUpdate(
    { ...filter, processedWebhookEventIds: { $ne: eventId } },
    {
      $push: {
        processedWebhookEventIds: {
          $each: [eventId],
          $slice: -MAX_PROCESSED_WEBHOOK_EVENT_IDS,
        },
      },
      $set: { lastWebhookEventId: eventId },
    },
    { new: true }
  );
}

module.exports = {
  claimWebhookEvent,
  MAX_PROCESSED_WEBHOOK_EVENT_IDS,
};
