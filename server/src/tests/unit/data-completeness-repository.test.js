const LEAGUE_ID = '507f1f77bcf86cd799439011';
const SEASON_ID = '507f1f77bcf86cd799439021';
const USER_ID = '507f1f77bcf86cd799439041';

describe('dataCompleteness.repository', () => {
  let repository;

  beforeAll(() => {
    repository = require('../../modules/leagues/dataCompleteness.repository');
  });

  it('defines a unique index on league + season + issueKey', () => {
    const indexes = repository.LeagueDataIssueDismissal.schema.indexes();
    const unique = indexes.find(([, options]) => options.unique);
    expect(unique).toBeDefined();
    expect(unique[0]).toEqual({ leagueId: 1, seasonId: 1, issueKey: 1 });
  });

  it('requires the fields that make a dismissal meaningful', () => {
    const { paths } = repository.LeagueDataIssueDismissal.schema;
    expect(paths.leagueId.isRequired).toBe(true);
    expect(paths.seasonId.isRequired).toBe(true);
    expect(paths.issueKey.isRequired).toBe(true);
    expect(paths.dismissedByUserId.isRequired).toBe(true);
  });

  it('defaults the note to null', () => {
    const doc = new repository.LeagueDataIssueDismissal({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
      dismissedByUserId: USER_ID,
    });
    expect(doc.note).toBeNull();
  });

  it('queries dismissals scoped to one league and season', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const find = jest.spyOn(repository.LeagueDataIssueDismissal, 'find').mockReturnValue({ lean });

    await repository.listDismissals(LEAGUE_ID, SEASON_ID);

    expect(find).toHaveBeenCalledWith({ leagueId: LEAGUE_ID, seasonId: SEASON_ID });
    find.mockRestore();
  });

  it('upserts so dismissing the same issue twice keeps one record', async () => {
    const findOneAndUpdate = jest
      .spyOn(repository.LeagueDataIssueDismissal, 'findOneAndUpdate')
      .mockResolvedValue({});

    await repository.upsertDismissal({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
      dismissedByUserId: USER_ID,
      note: 'known',
    });

    const [filter, , options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
    });
    expect(options.upsert).toBe(true);
    findOneAndUpdate.mockRestore();
  });

  it('reports how many dismissals were removed', async () => {
    const deleteOne = jest
      .spyOn(repository.LeagueDataIssueDismissal, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 });

    const removed = await repository.deleteDismissal(LEAGUE_ID, SEASON_ID, 'overdue_game:1');

    expect(removed).toBe(1);
    deleteOne.mockRestore();
  });
});
