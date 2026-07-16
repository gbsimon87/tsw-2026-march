// Central entitlement resolver. Replaces the scattered isTeamActive/isLeagueActive
// checks and the dead auth.service league path.
// See docs/pricing-overhaul/05-architecture.md §2, 08-entitlements-and-gating.md.

jest.mock('../../config/env', () => ({ env: {} }));

jest.mock('../../modules/teams/teams.repository', () => ({
  listTeamsByOwner: jest.fn(),
  findTeamById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueById: jest.fn(),
  findLeagueTeamById: jest.fn(),
  findLeaguesByOwner: jest.fn(),
}));

const { listTeamsByOwner } = require('../../modules/teams/teams.repository');
const { findLeagueById, findLeaguesByOwner } = require('../../modules/leagues/leagues.repository');

const {
  resolveEntitlements,
  resolveForTeam,
  resolveForLeague,
  resolveForLeagueTeam,
  resolveForUser,
  createRequestCache,
} = require('../../modules/billing/entitlements.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveEntitlements (pure core)', () => {
  it('active Stripe team_pro grants team premium features', () => {
    const r = resolveEntitlements({
      scope: 'team',
      plan: 'team_pro',
      subscriptionStatus: 'active',
      billingSource: 'stripe',
    });
    expect(r.active).toBe(true);
    expect(r.planId).toBe('team_pro');
    expect(r.entitlements.canViewReplay).toBe(true);
    expect(r.entitlements.canExportCsv).toBe(true);
  });

  it('trialing counts as active', () => {
    const r = resolveEntitlements({
      scope: 'team',
      plan: 'team_pro',
      subscriptionStatus: 'trialing',
      billingSource: 'stripe',
    });
    expect(r.active).toBe(true);
    expect(r.entitlements.canViewReplay).toBe(true);
  });

  it('past_due team_pro falls back to starter entitlements (free core stays)', () => {
    const r = resolveEntitlements({
      scope: 'team',
      plan: 'team_pro',
      subscriptionStatus: 'past_due',
      billingSource: 'stripe',
    });
    expect(r.active).toBe(false);
    expect(r.entitlements.canViewReplay).toBe(false);
    expect(r.entitlements.canTrackStats).toBe(true); // free core
  });

  it('active league grants management AND bundled team_pro features', () => {
    const r = resolveEntitlements({
      scope: 'league',
      plan: 'league',
      subscriptionStatus: 'active',
      billingSource: 'stripe',
    });
    expect(r.entitlements.canManageLeague).toBe(true);
    expect(r.entitlements.canViewReplay).toBe(true);
  });

  it('canceled league loses management', () => {
    const r = resolveEntitlements({
      scope: 'league',
      plan: 'league',
      subscriptionStatus: 'canceled',
      billingSource: 'stripe',
    });
    expect(r.active).toBe(false);
    expect(r.entitlements.canManageLeague).toBe(false);
  });

  it('comp billingSource is active regardless of Stripe status', () => {
    const r = resolveEntitlements({
      scope: 'league',
      plan: 'league',
      subscriptionStatus: 'inactive',
      billingSource: 'comp',
    });
    expect(r.active).toBe(true);
    expect(r.entitlements.canManageLeague).toBe(true);
  });

  it('manual billingSource is active regardless of Stripe status', () => {
    const r = resolveEntitlements({
      scope: 'team',
      plan: 'team_pro',
      subscriptionStatus: 'inactive',
      billingSource: 'manual',
    });
    expect(r.active).toBe(true);
    expect(r.entitlements.canViewReplay).toBe(true);
  });

  it('tolerates legacy plan values via the catalog shim', () => {
    const team = resolveEntitlements({
      scope: 'team',
      plan: 'pro', // legacy
      subscriptionStatus: 'active',
      billingSource: 'stripe',
    });
    expect(team.planId).toBe('team_pro');
    expect(team.entitlements.canViewReplay).toBe(true);

    const league = resolveEntitlements({
      scope: 'league',
      plan: 'pro', // legacy We-ball Saturday value
      subscriptionStatus: 'active',
      billingSource: 'stripe',
    });
    expect(league.planId).toBe('league');
    expect(league.entitlements.canManageLeague).toBe(true);
  });

  it('missing billingSource defaults to stripe semantics', () => {
    const r = resolveEntitlements({
      scope: 'team',
      plan: 'team_pro',
      subscriptionStatus: 'active',
    });
    expect(r.active).toBe(true);
  });
});

describe('resolveForTeam / resolveForLeague (from loaded docs, no queries)', () => {
  it('resolves a team doc without hitting the DB', () => {
    const r = resolveForTeam({ plan: 'team_pro', subscriptionStatus: 'active' });
    expect(r.entitlements.canViewReplay).toBe(true);
    expect(listTeamsByOwner).not.toHaveBeenCalled();
  });

  it('resolves a league doc without hitting the DB', () => {
    const r = resolveForLeague({ plan: 'league', subscriptionStatus: 'active' });
    expect(r.entitlements.canManageLeague).toBe(true);
    expect(findLeagueById).not.toHaveBeenCalled();
  });
});

describe('resolveForLeagueTeam (cascade via parent league)', () => {
  it('grants the parent league entitlements to a league team', async () => {
    findLeagueById.mockResolvedValue({ plan: 'league', subscriptionStatus: 'active' });
    const r = await resolveForLeagueTeam({ leagueId: 'L1' });
    expect(r.entitlements.canRichPlayerProfiles).toBe(true);
    expect(r.entitlements.canViewReplay).toBe(true);
  });

  it('is starter/inactive when the parent league is missing', async () => {
    findLeagueById.mockResolvedValue(null);
    const r = await resolveForLeagueTeam({ leagueId: 'missing' });
    expect(r.active).toBe(false);
    expect(r.entitlements.canManageLeague).toBe(false);
  });

  it('memoizes the parent-league lookup through the request cache', async () => {
    findLeagueById.mockResolvedValue({ plan: 'league', subscriptionStatus: 'active' });
    const cache = createRequestCache();
    await resolveForLeagueTeam({ leagueId: 'L1' }, { cache });
    await resolveForLeagueTeam({ leagueId: 'L1' }, { cache });
    expect(findLeagueById).toHaveBeenCalledTimes(1);
  });
});

describe('resolveForUser (aggregate, from owned resources)', () => {
  it('is team_pro when the user owns any active team', async () => {
    listTeamsByOwner.mockResolvedValue([
      { plan: 'starter', subscriptionStatus: 'inactive' },
      { plan: 'team_pro', subscriptionStatus: 'active' },
    ]);
    findLeaguesByOwner.mockResolvedValue([]);
    const r = await resolveForUser('u1');
    expect(r.plan).toBe('team_pro');
    expect(r.hasActiveTeam).toBe(true);
  });

  it('is starter when the user owns no active team', async () => {
    listTeamsByOwner.mockResolvedValue([{ plan: 'starter', subscriptionStatus: 'inactive' }]);
    findLeaguesByOwner.mockResolvedValue([]);
    const r = await resolveForUser('u1');
    expect(r.plan).toBe('starter');
    expect(r.hasActiveTeam).toBe(false);
  });

  it('reports an active owned league', async () => {
    listTeamsByOwner.mockResolvedValue([]);
    findLeaguesByOwner.mockResolvedValue([{ plan: 'league', subscriptionStatus: 'active' }]);
    const r = await resolveForUser('u1');
    expect(r.hasActiveLeague).toBe(true);
  });
});
