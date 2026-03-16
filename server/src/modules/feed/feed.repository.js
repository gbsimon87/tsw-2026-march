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
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
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
      enum: ['image', 'game_card', 'player_card', 'team_card'],
      required: true,
      index: true,
    },
    caption: { type: String, trim: true, default: null },
    image: { type: imageSchema, default: null },
    gameCard: { type: gameCardSchema, default: null },
    playerCard: { type: playerCardSchema, default: null },
    teamCard: { type: teamCardSchema, default: null },
  },
  { timestamps: true }
);

postSchema.index({ _id: -1 });

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

module.exports = {
  Post,
  createPost,
  insertPosts,
  listPosts,
  findPostById,
  deletePostById,
};
