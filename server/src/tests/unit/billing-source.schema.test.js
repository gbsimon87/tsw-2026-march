// T-10: billingSource makes comp/manual grants first-class on Team and League, so a
// stray Stripe webhook can be skipped for a non-Stripe doc. Additive field, default
// 'stripe' so existing docs and behavior are unchanged. Schema-only (no DB).
const mongoose = require('mongoose');

require('../../modules/teams/teams.repository');
require('../../modules/leagues/leagues.repository');

const Team = mongoose.model('Team');
const League = mongoose.model('League');

describe.each([
  ['Team', () => Team],
  ['League', () => League],
])('%s.billingSource', (_name, getModel) => {
  test('is a String defaulting to "stripe" with enum stripe/manual/comp', () => {
    const path = getModel().schema.path('billingSource');
    expect(path).toBeDefined();
    expect(path.instance).toBe('String');
    expect(path.defaultValue).toBe('stripe');
    expect(path.enumValues).toEqual(['stripe', 'manual', 'comp']);
  });

  test('defaults to "stripe" on a new doc and accepts comp/manual', () => {
    const Model = getModel();
    const doc = new Model({ name: 'x', ownerUserId: new mongoose.Types.ObjectId() });
    expect(doc.billingSource).toBe('stripe');

    doc.billingSource = 'comp';
    expect(doc.validateSync()?.errors?.billingSource).toBeUndefined();
    doc.billingSource = 'manual';
    expect(doc.validateSync()?.errors?.billingSource).toBeUndefined();
  });

  test('rejects an unknown billingSource', () => {
    const Model = getModel();
    const doc = new Model({ name: 'x', ownerUserId: new mongoose.Types.ObjectId() });
    doc.billingSource = 'bitcoin';
    expect(doc.validateSync()?.errors?.billingSource).toBeDefined();
  });
});
