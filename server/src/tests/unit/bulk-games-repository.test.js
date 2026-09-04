const mongoose = require('mongoose');

const {
  insertManyGames,
  deleteReplaceableLeagueGames,
} = require('../../modules/games/games.repository');
const { CURRENT_COURT_LAYOUT_ID } = require('../../modules/shared/courtLayouts');

const Game = mongoose.models.Game;

describe('insertManyGames', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserts the batch as an ordered write so a schedule is never half-created', async () => {
    const docs = [{ title: 'A' }, { title: 'B' }];
    const insertMany = jest.spyOn(Game, 'insertMany').mockResolvedValue(docs);

    const result = await insertManyGames(docs);

    const [written, options] = insertMany.mock.calls[0];
    expect(written.map((doc) => doc.title)).toEqual(['A', 'B']);
    expect(options).toEqual({ ordered: true });
    expect(result).toBe(docs);
  });

  it('stamps the current court layout on schedule fixtures, which bypass createGame', async () => {
    const insertMany = jest.spyOn(Game, 'insertMany').mockResolvedValue([]);

    await insertManyGames([{ title: 'A' }, { title: 'B' }]);

    const [written] = insertMany.mock.calls[0];
    for (const doc of written) {
      expect(doc.courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);
    }
  });

  it('lets an explicit layout stand so a rollback build can create legacy fixtures', async () => {
    const insertMany = jest.spyOn(Game, 'insertMany').mockResolvedValue([]);

    await insertManyGames([{ title: 'A', courtLayoutId: 'legacy-v1' }]);

    const [written] = insertMany.mock.calls[0];
    expect(written[0].courtLayoutId).toBe('legacy-v1');
  });
});

describe('deleteReplaceableLeagueGames', () => {
  const leagueId = 'league-1';
  const seasonId = 'season-1';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scopes the delete to eventless scheduled games in the given league and season', async () => {
    const deleteMany = jest.spyOn(Game, 'deleteMany').mockResolvedValue({ deletedCount: 4 });

    const deleted = await deleteReplaceableLeagueGames(leagueId, seasonId);

    expect(deleted).toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({
      leagueId,
      seasonId,
      status: 'scheduled',
      $or: [{ events: { $size: 0 } }, { events: { $exists: false } }],
    });
  });

  it('never targets in-progress or completed games', async () => {
    const deleteMany = jest.spyOn(Game, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

    await deleteReplaceableLeagueGames(leagueId, seasonId);

    const [filter] = deleteMany.mock.calls[0];
    expect(filter.status).toBe('scheduled');
    expect(filter.status).not.toBe('in_progress');
    expect(filter.status).not.toBe('completed');
  });

  it('reports zero when the driver returns no deletedCount', async () => {
    jest.spyOn(Game, 'deleteMany').mockResolvedValue({});

    await expect(deleteReplaceableLeagueGames(leagueId, seasonId)).resolves.toBe(0);
  });
});
