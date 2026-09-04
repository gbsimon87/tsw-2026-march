const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { processNextDelivery } = require('../modules/social/instagram/instagram.delivery.service');

const MAX_POSTS_PER_RUN = 10;

async function main() {
  await connectDb();
  const results = [];
  for (let count = 0; count < MAX_POSTS_PER_RUN; count += 1) {
    const post = await processNextDelivery();
    if (!post) break;
    results.push({ id: post.id, status: post.status, mediaId: post.mediaId || null });
  }
  console.log(JSON.stringify({ processed: results.length, posts: results }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Instagram delivery worker failed (${error.code || 'UNEXPECTED_ERROR'})`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
