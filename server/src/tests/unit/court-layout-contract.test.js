const mongoose = require('mongoose');

const { createGame, insertManyGames } = require('../../modules/games/games.repository');
const {
  CURRENT_COURT_LAYOUT_ID,
  LEGACY_COURT_LAYOUT_ID,
  resolveCourtLayoutId,
} = require('../../modules/shared/courtLayouts');

const Game = mongoose.models.Game;

describe('resolveCourtLayoutId', () => {
  it('treats an absent value as the legacy layout, which is how pre-cutover games are known', () => {
    expect(resolveCourtLayoutId(undefined)).toBe(LEGACY_COURT_LAYOUT_ID);
    expect(resolveCourtLayoutId(null)).toBe(LEGACY_COURT_LAYOUT_ID);
    expect(resolveCourtLayoutId('')).toBe(LEGACY_COURT_LAYOUT_ID);
  });

  it('fails closed to legacy for an unknown id rather than guessing the new court', () => {
    expect(resolveCourtLayoutId('court-v9')).toBe(LEGACY_COURT_LAYOUT_ID);
    expect(resolveCourtLayoutId('legacy-v0')).toBe(LEGACY_COURT_LAYOUT_ID);
  });

  it('passes a known id through unchanged', () => {
    expect(resolveCourtLayoutId(LEGACY_COURT_LAYOUT_ID)).toBe(LEGACY_COURT_LAYOUT_ID);
    expect(resolveCourtLayoutId(CURRENT_COURT_LAYOUT_ID)).toBe(CURRENT_COURT_LAYOUT_ID);
  });
});

describe('createGame court layout stamping', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stamps every newly created game with the current layout', async () => {
    const create = jest.spyOn(Game, 'create').mockResolvedValue({});

    await createGame({ title: 'Game', ownerUserId: 'user-1' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ courtLayoutId: CURRENT_COURT_LAYOUT_ID })
    );
  });

  it('lets an explicit layout win so a rollback build can keep creating legacy games', async () => {
    const create = jest.spyOn(Game, 'create').mockResolvedValue({});

    await createGame({ title: 'Game', courtLayoutId: LEGACY_COURT_LAYOUT_ID });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ courtLayoutId: LEGACY_COURT_LAYOUT_ID })
    );
  });

  it('does not disturb the rest of the creation payload', async () => {
    const create = jest.spyOn(Game, 'create').mockResolvedValue({});

    await createGame({ title: 'Game', ownerUserId: 'user-1', status: 'scheduled' });

    const [written] = create.mock.calls[0];
    expect(written.title).toBe('Game');
    expect(written.ownerUserId).toBe('user-1');
    expect(written.status).toBe('scheduled');
  });

  it('keeps the schema free of a document default, so legacy docs stay distinguishable', () => {
    const path = Game.schema.path('courtLayoutId');

    expect(path).toBeDefined();
    expect(path.options.default).toBeUndefined();
    expect(path.options.enum).toEqual([LEGACY_COURT_LAYOUT_ID, CURRENT_COURT_LAYOUT_ID]);
  });

  it('stamps bulk-created schedule fixtures too', async () => {
    const insertMany = jest.spyOn(Game, 'insertMany').mockResolvedValue([]);

    await insertManyGames([{ title: 'A' }]);

    const [written] = insertMany.mock.calls[0];
    expect(written[0].courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);
  });
});
