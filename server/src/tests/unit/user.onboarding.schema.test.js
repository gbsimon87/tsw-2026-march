const mongoose = require('mongoose');

require('../../modules/auth/auth.repository');

const User = mongoose.models.User;

function buildUser(overrides = {}) {
  return new User({ email: 'player@example.com', name: 'Player One', ...overrides });
}

describe('User.onboarding', () => {
  it('defaults an existing account to completed so it keeps its landing page', () => {
    const user = buildUser();

    expect(user.validateSync()?.errors).toBeUndefined();
    expect(user.onboarding.status).toBe('completed');
    expect(user.onboarding.roles).toEqual([]);
    expect(user.onboarding.completedSteps).toEqual([]);
  });

  it('accepts every onboarding status', () => {
    ['not_started', 'in_progress', 'completed', 'skipped'].forEach((status) => {
      const user = buildUser({ onboarding: { status } });

      expect(user.validateSync()?.errors?.['onboarding.status']).toBeUndefined();
    });
  });

  it('rejects an unknown onboarding status', () => {
    const user = buildUser({ onboarding: { status: 'halfway' } });

    expect(user.validateSync()?.errors?.['onboarding.status']).toBeDefined();
  });

  it('stores the browse-only fan role', () => {
    const user = buildUser({
      onboarding: { status: 'completed', roles: ['fan'], completedSteps: ['roles', 'profiles'] },
    });

    expect(user.validateSync()?.errors).toBeUndefined();
    expect(user.onboarding.roles).toEqual(['fan']);
  });

  it('accepts every supported role together', () => {
    const roles = ['league_manager', 'league_team_manager', 'team_manager', 'player', 'fan'];
    const user = buildUser({ onboarding: { roles } });

    expect(user.validateSync()?.errors).toBeUndefined();
    expect(user.onboarding.roles).toEqual(roles);
  });

  it('rejects a role outside the enum', () => {
    const user = buildUser({ onboarding: { roles: ['referee'] } });

    expect(user.validateSync()?.errors?.['onboarding.roles.0']).toBeDefined();
  });
});
