const { dismissIssueSchema } = require('../../modules/leagues/dataCompleteness.validation');
const { CHECK_META } = require('../../modules/leagues/dataCompleteness.checks');

describe('dismissIssueSchema', () => {
  it('accepts a well-formed issue key', () => {
    const parsed = dismissIssueSchema.parse({ issueKey: 'overdue_game:507f1f77bcf86cd799439051' });
    expect(parsed.issueKey).toBe('overdue_game:507f1f77bcf86cd799439051');
    expect(parsed.note).toBeNull();
  });

  it('trims and keeps a note', () => {
    const parsed = dismissIssueSchema.parse({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      note: '  logo coming later  ',
    });
    expect(parsed.note).toBe('logo coming later');
  });

  it('rejects an empty issue key', () => {
    expect(() => dismissIssueSchema.parse({ issueKey: '' })).toThrow();
  });

  it('rejects an issue key with no check type prefix', () => {
    expect(() => dismissIssueSchema.parse({ issueKey: 'justsomething' })).toThrow();
  });

  it('rejects an unreasonably long note', () => {
    expect(() =>
      dismissIssueSchema.parse({
        issueKey: 'no_logo:507f1f77bcf86cd799439031',
        note: 'x'.repeat(501),
      })
    ).toThrow();
  });

  it('rejects an issue key whose target is not an object id', () => {
    expect(() => dismissIssueSchema.parse({ issueKey: 'overdue_game:1' })).toThrow();
  });

  it('accepts a 24 character hex object id target', () => {
    const parsed = dismissIssueSchema.parse({
      issueKey: 'roster_too_small:507f1f77bcf86cd799439031',
    });
    expect(parsed.issueKey).toBe('roster_too_small:507f1f77bcf86cd799439031');
  });

  it('accepts an engine-generated key for every check type the engine can emit', () => {
    const objectId = '507f1f77bcf86cd799439031';
    for (const checkType of Object.keys(CHECK_META)) {
      const issueKey = `${checkType}:${objectId}`;
      expect(() => dismissIssueSchema.parse({ issueKey })).not.toThrow();
      expect(dismissIssueSchema.parse({ issueKey }).issueKey).toBe(issueKey);
    }
  });
});
