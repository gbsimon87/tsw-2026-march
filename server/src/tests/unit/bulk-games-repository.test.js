const mongoose = require('mongoose');

const {
  insertManyGames,
  deleteReplaceableLeagueGames,
} = require('../../modules/games/games.repository');

const Game = mongoose.models.Game;

describe('insertManyGames', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserts the batch as an ordered write so a schedule is never half-created', async () => {
    const docs = [{ title: 'A' }, { title: 'B' }];
    const insertMany = jest.spyOn(Game, 'insertMany').mockResolvedValue(docs);

    const result = await insertManyGames(docs);

    expect(insertMany).toHaveBeenCalledWith(docs, { ordered: true });
    expect(result).toBe(docs);
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
