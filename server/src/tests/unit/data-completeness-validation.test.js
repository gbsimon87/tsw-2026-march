const { dismissIssueSchema } = require('../../modules/leagues/dataCompleteness.validation');

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
      dismissIssueSchema.parse({ issueKey: 'no_logo:1', note: 'x'.repeat(501) })
    ).toThrow();
  });
});
