const {
  claimWebhookEvent,
  releaseWebhookEvent,
  MAX_PROCESSED_WEBHOOK_EVENT_IDS,
} = require('../../utils/webhookIdempotency');

describe('claimWebhookEvent (OPT-020)', () => {
  test('atomically gates on the event id being absent and appends+bounds it', async () => {
    const doc = { _id: 'team-1' };
    const Model = { findOneAndUpdate: jest.fn().mockResolvedValue(doc) };

    const result = await claimWebhookEvent(Model, { _id: 'team-1' }, 'evt_1');

    expect(result).toBe(doc);
    expect(Model.findOneAndUpdate).toHaveBeenCalledTimes(1);

    const [filter, update, options] = Model.findOneAndUpdate.mock.calls[0];
    // Gated on the id NOT already being present — this is what makes concurrent
    // duplicate deliveries safe.
    expect(filter).toEqual({ _id: 'team-1', processedWebhookEventIds: { $ne: 'evt_1' } });
    // Appends the id and bounds the array in the same atomic op.
    expect(update.$push.processedWebhookEventIds).toEqual({
      $each: ['evt_1'],
      $slice: -MAX_PROCESSED_WEBHOOK_EVENT_IDS,
    });
    expect(update.$set).toEqual({ lastWebhookEventId: 'evt_1' });
    expect(options).toEqual({ new: true });
  });

  test('returns null when the event was already processed (duplicate delivery)', async () => {
    // The gated filter matches nothing → Mongo returns null → caller skips.
    const Model = { findOneAndUpdate: jest.fn().mockResolvedValue(null) };

    const result = await claimWebhookEvent(Model, { _id: 'team-1' }, 'evt_dup');

    expect(result).toBeNull();
  });

  test('falls back to a plain findOne when no event id is supplied', async () => {
    const doc = { _id: 'team-1' };
    const Model = {
      findOne: jest.fn().mockResolvedValue(doc),
      findOneAndUpdate: jest.fn(),
    };

    const result = await claimWebhookEvent(Model, { _id: 'team-1' }, undefined);

    expect(result).toBe(doc);
    expect(Model.findOne).toHaveBeenCalledWith({ _id: 'team-1' });
    expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('releaseWebhookEvent (audit H3 — un-claim on mid-apply failure)', () => {
  test('pulls the event id so a Stripe retry can re-claim and re-apply', async () => {
    const Model = { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };

    await releaseWebhookEvent(Model, { _id: 'team-1' }, 'evt_1');

    expect(Model.updateOne).toHaveBeenCalledWith(
      { _id: 'team-1' },
      { $pull: { processedWebhookEventIds: 'evt_1' } }
    );
  });

  test('is a no-op when no event id is supplied', async () => {
    const Model = { updateOne: jest.fn() };

    await releaseWebhookEvent(Model, { _id: 'team-1' }, undefined);

    expect(Model.updateOne).not.toHaveBeenCalled();
  });
});
