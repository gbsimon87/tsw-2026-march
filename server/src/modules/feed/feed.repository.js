const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    mimeType: { type: String, default: null },
  },
  { _id: false }
);

// OPT-017: `cardSnapshot` denormalises the card's display data (names, logos,
// stats) at creation time, so hydrating a feed page doesn't need to re-run the
// full public game/player/team pipeline per card. Mixed because the shape
// mirrors whatever feed.service.js's resolve*CardPayload functions return
// (minus fields the client never renders, e.g. gameCard.recap/participants) —
// those functions stay the single source of truth. Null for pre-existing posts
// and anything created before this snapshot existed; feed.service.js falls
// back to the live resolve in that case (self-healing, reversible).
// TSW-005: gameId already covers league games too (Game.gameContext:'league'
// games are still Game docs, just with a leagueId set) — no new field needed
// there. teamId is the one-off/standalone team; leagueTeamId is the sibling
// field for a league game's tracked team, mutually exclusive with teamId.
const gameCardSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: false, default: null },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: false,
      default: null,
    },
    cardSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    // Auto Feed Generation: true only for game-cards created by the system
    // user when a public-league game is finalised (see
    // docs/auto-feed-generation/000-TRACKER.md). Distinguishes auto cards from
    // user-shared ones so a manual share and an auto card can coexist while
    // still guaranteeing at most one auto card per game (see the partial
    // unique index below).
    auto: { type: Boolean, default: false },
  },
  { _id: false }
);

// TSW-005: leagueTeamId/leaguePlayerId are the league-sourced sibling of
// teamId/playerId — mutually exclusive (a card is either standalone or
// league-sourced), enforced in feed.validation.js / feed.service.js, not here.
const playerCardSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: false, default: null },
    playerId: { type: mongoose.Schema.Types.ObjectId, required: false, default: null },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: false,
      default: null,
    },
    leaguePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaguePlayer',
      required: false,
      default: null,
    },
    cardSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const teamCardSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: false, default: null },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: false,
      default: null,
    },
    cardSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const highlightClipSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    eventId: { type: String, required: true },
    videoUrl: { type: String, required: true },
    videoTimestamp: { type: Number, required: true },
    statType: { type: String, required: true },
    playerId: { type: String, default: null },
    playerName: { type: String, default: null },
    gameTitle: { type: String, default: null },
  },
  { _id: false }
);

const videoSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    duration: { type: Number, default: null },
    thumbnailUrl: { type: String, default: null },
    mimeType: { type: String, default: null },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    creatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['image', 'video', 'game_card', 'player_card', 'team_card', 'highlight_clip'],
      required: true,
      index: true,
    },
    caption: { type: String, trim: true, default: null },
    image: { type: imageSchema, default: null },
    video: { type: videoSchema, default: null },
    gameCard: { type: gameCardSchema, default: null },
    playerCard: { type: playerCardSchema, default: null },
    teamCard: { type: teamCardSchema, default: null },
    highlightClip: { type: highlightClipSchema, default: null },
  },
  { timestamps: true }
);

// Prevent the same game event from being shared more than once, even under concurrent requests.
postSchema.index({ 'highlightClip.eventId': 1 }, { unique: true, sparse: true });

// Auto Feed Generation: at most one auto-generated game_card per game, even
// under concurrent/retried finalise requests. Manual game_card posts (auto:
// false/unset) are unaffected — the partial filter only applies to auto ones.
postSchema.index(
  { 'gameCard.gameId': 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'game_card', 'gameCard.auto': true },
  }
);

const Post = mongoose.models.Post || mongoose.model('Post', postSchema);

async function createPost(input) {
  return Post.create(input);
}

async function insertPosts(input) {
  return Post.insertMany(input, { ordered: true });
}

async function listPosts({ limit, cursor } = {}) {
  const query = {};

  if (cursor) {
    query._id = { $lt: cursor };
  }

  return Post.find(query)
    .sort({ _id: -1 })
    .limit(limit || 20);
}

async function findPostById(postId) {
  return Post.findById(postId);
}

async function deletePostById(postId) {
  return Post.deleteOne({ _id: postId });
}

// OPT-017: find game_card posts referencing a game, so callers can refresh
// their stale cardSnapshot after that game's score changes post-share.
async function listGameCardPostsByGameId(gameId) {
  return Post.find({ type: 'game_card', 'gameCard.gameId': gameId });
}

async function deletePostsByGameId(gameId) {
  return Post.deleteMany({
    $or: [
      { type: 'game_card', 'gameCard.gameId': gameId },
      { type: 'highlight_clip', 'highlightClip.gameId': gameId },
    ],
  });
}

// Auto Feed Generation: reverse auto-generated posts for a set of games (used
// when a league flips from public to private — B2 in
// docs/auto-feed-generation/000-TRACKER.md). Manually-shared posts (auto:
// false/unset, or any highlight_clip a user shared directly) are left alone —
// only content the system itself authored is removed. highlight_clip has no
// `auto` flag (every one currently in the schema could in principle be
// user-shared), so scope that half of the deletion to the reserved system
// user id, passed in by the caller.
async function deleteAutoPostsForGameIds(gameIds, systemUserId) {
  if (!gameIds || gameIds.length === 0) return { deletedCount: 0 };
  return Post.deleteMany({
    $or: [
      { type: 'game_card', 'gameCard.gameId': { $in: gameIds }, 'gameCard.auto': true },
      {
        type: 'highlight_clip',
        'highlightClip.gameId': { $in: gameIds },
        creatorUserId: systemUserId,
      },
    ],
  });
}

async function findAutoGameCardPost(gameId) {
  return Post.findOne({ type: 'game_card', 'gameCard.gameId': gameId, 'gameCard.auto': true });
}

async function findPostByHighlightEventId(eventId) {
  return Post.findOne({ type: 'highlight_clip', 'highlightClip.eventId': eventId });
}

// OPT-017: persist a resolved card snapshot back onto its post (self-backfill
// or explicit refresh). cardField is one of 'gameCard'/'playerCard'/'teamCard'.
async function updatePostCardSnapshot(postId, cardField, snapshot) {
  return Post.updateOne({ _id: postId }, { $set: { [`${cardField}.cardSnapshot`]: snapshot } });
}

async function findSharedEventIds(eventIds) {
  if (!eventIds || eventIds.length === 0) return [];
  const posts = await Post.find(
    { type: 'highlight_clip', 'highlightClip.eventId': { $in: eventIds } },
    { 'highlightClip.eventId': 1 }
  ).lean();
  return posts.map((p) => p.highlightClip.eventId);
}

module.exports = {
  Post,
  createPost,
  insertPosts,
  listPosts,
  findPostById,
  deletePostById,
  deletePostsByGameId,
  deleteAutoPostsForGameIds,
  findAutoGameCardPost,
  findPostByHighlightEventId,
  findSharedEventIds,
  updatePostCardSnapshot,
  listGameCardPostsByGameId,
};
