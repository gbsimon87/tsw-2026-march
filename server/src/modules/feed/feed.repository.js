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

const gameCardSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: false, default: null },
  },
  { _id: false }
);

const playerCardSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const teamCardSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
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

async function deletePostsByGameId(gameId) {
  return Post.deleteMany({ type: 'game_card', 'gameCard.gameId': gameId });
}

async function findPostByHighlightEventId(eventId) {
  return Post.findOne({ type: 'highlight_clip', 'highlightClip.eventId': eventId });
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
  findPostByHighlightEventId,
  findSharedEventIds,
};
