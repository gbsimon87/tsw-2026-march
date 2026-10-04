// Mux game video Task 3c (R1/R9): the narrow repository reads the video access
// policy runs per token. Real schemas, Model methods spied (E2) — the tests pin
// the exact filter/projection so a policy read never hydrates a whole roster,
// webhook-id history or an unrelated post.
const mongoose = require('mongoose');

const { Post, findLiveHighlightClipPost } = require('../../modules/feed/feed.repository');
const { League, findLeagueVideoPolicyById } = require('../../modules/leagues/leagues.repository');
const { Team, findTeamBillingStateById } = require('../../modules/teams/teams.repository');

const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const TEAM_ID = '64b7f0c2a1b2c3d4e5f6071a';
const EVENT_ID = '64b7f0c2a1b2c3d4e5f6071b';

function leanChain(result) {
  const chain = {
    select: jest.fn(() => chain),
    lean: jest.fn(() => Promise.resolve(result)),
  };
  return chain;
}

afterEach(() => jest.restoreAllMocks());

describe('findLiveHighlightClipPost', () => {
  test('matches a highlight_clip post by BOTH gameId and eventId, lean, minimal projection', async () => {
    const post = { _id: 'p1', highlightClip: { gameId: GAME_ID, eventId: EVENT_ID } };
    const chain = leanChain(post);
    const findOne = jest.spyOn(Post, 'findOne').mockReturnValue(chain);

    await expect(findLiveHighlightClipPost({ gameId: GAME_ID, eventId: EVENT_ID })).resolves.toBe(
      post
    );

    expect(findOne).toHaveBeenCalledTimes(1);
    const [filter, projection] = findOne.mock.calls[0];
    expect(filter).toEqual({
      type: 'highlight_clip',
      'highlightClip.gameId': GAME_ID,
      'highlightClip.eventId': EVENT_ID,
    });
    expect(projection).toEqual({
      _id: 1,
      creatorUserId: 1,
      'highlightClip.gameId': 1,
      'highlightClip.eventId': 1,
    });
    expect(chain.lean).toHaveBeenCalled();
  });

  test('stringifies an ObjectId eventId (highlightClip.eventId is stored as a string)', async () => {
    const findOne = jest.spyOn(Post, 'findOne').mockReturnValue(leanChain(null));
    await findLiveHighlightClipPost({
      gameId: GAME_ID,
      eventId: new mongoose.Types.ObjectId(EVENT_ID),
    });
    expect(findOne.mock.calls[0][0]['highlightClip.eventId']).toBe(EVENT_ID);
  });

  test.each([
    ['missing gameId', { eventId: EVENT_ID }],
    ['missing eventId', { gameId: GAME_ID }],
    ['malformed gameId', { gameId: 'not-an-id', eventId: EVENT_ID }],
    ['no input', undefined],
  ])('returns null without querying for %s', async (_label, input) => {
    const findOne = jest.spyOn(Post, 'findOne');
    await expect(findLiveHighlightClipPost(input)).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  test('an existing index supports the lookup: unique sparse highlightClip.eventId', () => {
    // eventId is globally unique among posts, so the equality on eventId picks
    // at most one document and gameId is a residual cross-check — no new index.
    const index = Post.schema.indexes().find(([fields]) => fields['highlightClip.eventId'] === 1);
    expect(index).toBeDefined();
    expect(index[1]).toMatchObject({ unique: true, sparse: true });
  });
});

describe('findLeagueVideoPolicyById', () => {
  test('lean read projecting only the policy, billing, visibility and consent fields', async () => {
    const league = { _id: LEAGUE_ID, isPublic: true };
    const chain = leanChain(league);
    const findById = jest.spyOn(League, 'findById').mockReturnValue(chain);

    await expect(findLeagueVideoPolicyById(LEAGUE_ID)).resolves.toBe(league);

    expect(findById).toHaveBeenCalledWith(LEAGUE_ID);
    expect(chain.select).toHaveBeenCalledWith(
      'ownerUserId name status isPublic plan subscriptionStatus billingSource social videoHosting'
    );
    expect(chain.lean).toHaveBeenCalled();
  });

  test.each([[null], [undefined], ['not-an-id']])(
    'returns null without querying for %p',
    async (id) => {
      const findById = jest.spyOn(League, 'findById');
      await expect(findLeagueVideoPolicyById(id)).resolves.toBeNull();
      expect(findById).not.toHaveBeenCalled();
    }
  );
});

describe('findTeamBillingStateById', () => {
  test('lean read projecting only the entitlement inputs', async () => {
    const team = { _id: TEAM_ID, plan: 'starter' };
    const chain = leanChain(team);
    const findById = jest.spyOn(Team, 'findById').mockReturnValue(chain);

    await expect(findTeamBillingStateById(TEAM_ID)).resolves.toBe(team);

    expect(findById).toHaveBeenCalledWith(TEAM_ID);
    expect(chain.select).toHaveBeenCalledWith('plan subscriptionStatus billingSource');
    expect(chain.lean).toHaveBeenCalled();
  });

  test.each([[null], ['nope']])('returns null without querying for %p', async (id) => {
    const findById = jest.spyOn(Team, 'findById');
    await expect(findTeamBillingStateById(id)).resolves.toBeNull();
    expect(findById).not.toHaveBeenCalled();
  });
});
