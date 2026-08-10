const { addRosterPlayerSchema } = require('../../modules/games/games.validation');

describe('addRosterPlayerSchema', () => {
  it('accepts a name only', () => {
    expect(addRosterPlayerSchema.parse({ displayName: 'Jordan Blake' })).toEqual({
      displayName: 'Jordan Blake',
    });
  });

  it('accepts a name with jersey number and side', () => {
    expect(
      addRosterPlayerSchema.parse({ displayName: 'Sam Reed', jerseyNumber: 23, side: 'home' })
    ).toEqual({ displayName: 'Sam Reed', jerseyNumber: 23, side: 'home' });
  });

  it('trims the display name', () => {
    expect(addRosterPlayerSchema.parse({ displayName: '  Ada  ' }).displayName).toBe('Ada');
  });

  it('accepts a null jersey number', () => {
    expect(
      addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: null }).jerseyNumber
    ).toBeNull();
  });

  it('rejects an empty display name', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: '   ' })).toThrow();
  });

  it('rejects a jersey number above 999', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: 1000 })).toThrow();
  });

  it('rejects a non-integer jersey number', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: 1.5 })).toThrow();
  });

  it('rejects an invalid side', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', side: 'middle' })).toThrow();
  });
});
