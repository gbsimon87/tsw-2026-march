// Safely creates the Instagram connection and OAuth-state indexes. Production
// disables Mongoose autoIndex, so run this once in each deployed database after
// the connection slice is released. createIndexes is additive and does not drop
// unrelated indexes.

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const {
  InstagramConnection,
  InstagramOAuthState,
} = require('../modules/social/instagram/instagram.repository');
const {
  InstagramSocialPost,
} = require('../modules/social/instagram/instagram.social-post.repository');

async function main() {
  await connectDb();
  await InstagramConnection.createIndexes();
  await InstagramOAuthState.createIndexes();
  await InstagramSocialPost.createIndexes();
  console.log('Instagram connection and social-post indexes are present.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Instagram index setup failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
