const {
  applySocialUpdate,
  mergeMarketingPermissions,
  resolveMarketingPermission,
  sanitizeSocialForAdmin,
} = require('../../modules/shared/socialIdentity');
const {
  playerSocialIdentityUpdateSchema,
  socialHandlesUpdateSchema,
  socialIdentityUpdateSchema,
} = require('../../modules/shared/socialIdentity.validation');

function entity(id, social = {}) {
  return { _id: id, name: id, social };
}

describe('social identity and permission', () => {
  test('exports default to blocked and publish no handles without organisation permission', () => {
    const result = resolveMarketingPermission({
      org: entity('league', { instagramHandle: 'League' }),
      teams: [entity('team', { tiktokHandle: 'Team' })],
    });
    expect(result).toMatchObject({
      canFeature: false,
      reason: 'permission_not_recorded',
      handles: {},
    });
  });

  test('a granted league still excludes declined players and minors without guardian consent', () => {
    const org = entity('league', { marketing: { status: 'granted' }, instagramHandle: 'League' });
    const result = resolveMarketingPermission({
      org,
      subjects: [
        entity('adult', { instagramHandle: 'Adult', ageCategory: 'adult' }),
        entity('declined', { instagramHandle: 'Declined', marketing: { status: 'declined' } }),
        entity('minor', { instagramHandle: 'Minor', ageCategory: 'minor' }),
        entity('consented', {
          instagramHandle: 'Consented',
          ageCategory: 'minor',
          guardianConsentAt: new Date(),
        }),
      ],
    });
    expect(result.canFeature).toBe(true);
    expect(result.restrictedPlayerIds).toEqual(['declined', 'minor']);
    expect(result.handles).toEqual({
      league: { instagram: '@League', tiktok: null },
      adult: { instagram: '@Adult', tiktok: null },
      consented: { instagram: '@Consented', tiktok: null },
    });
  });

  test('one unrecorded organisation blocks a two-team asset', () => {
    const granted = resolveMarketingPermission({
      org: entity('a', { marketing: { status: 'granted' } }),
    });
    const blocked = resolveMarketingPermission({ org: entity('b') });
    expect(mergeMarketingPermissions([granted, blocked])).toMatchObject({
      canFeature: false,
      orgId: 'b',
      handles: {},
    });
  });

  test('server stamps permission and guardian dates, and preserves dates on repeated saves', () => {
    const player = entity('p');
    applySocialUpdate(
      player,
      {
        instagramHandle: ' @Player ',
        marketingStatus: 'declined',
        ageCategory: 'minor',
        guardianConsent: true,
      },
      { actorUserId: 'owner', withAge: true }
    );
    const first = sanitizeSocialForAdmin(player, { withAge: true });
    expect(first.instagramHandle).toBe('Player');
    expect(first.marketing.recordedByUserId).toBe('owner');
    expect(first.marketing.recordedAt).toBeInstanceOf(Date);
    expect(first.guardianConsentAt).toBeInstanceOf(Date);
    applySocialUpdate(
      player,
      { marketingStatus: 'declined', guardianConsent: true },
      { actorUserId: 'other', withAge: true }
    );
    const again = sanitizeSocialForAdmin(player, { withAge: true });
    expect(again.marketing.recordedAt).toEqual(first.marketing.recordedAt);
    expect(again.marketing.recordedByUserId).toBe('owner');
    expect(again.guardianConsentAt).toEqual(first.guardianConsentAt);
    applySocialUpdate(player, { ageCategory: 'adult' }, { actorUserId: 'owner', withAge: true });
    expect(sanitizeSocialForAdmin(player, { withAge: true }).guardianConsentAt).toBeNull();
  });

  test('validation accepts clearable handles and rejects forged dates or team permission', () => {
    expect(socialIdentityUpdateSchema.parse({ instagramHandle: ' @league ' }).instagramHandle).toBe(
      '@league'
    );
    expect(playerSocialIdentityUpdateSchema.parse({ guardianConsent: false })).toEqual({
      guardianConsent: false,
    });
    expect(() => socialHandlesUpdateSchema.parse({ marketingStatus: 'granted' })).toThrow();
    expect(() =>
      socialIdentityUpdateSchema.parse({ marketingStatus: 'granted', recordedAt: '2026-01-01' })
    ).toThrow();
    expect(() => socialIdentityUpdateSchema.parse({ instagramHandle: 'bad handle' })).toThrow();
  });
});
