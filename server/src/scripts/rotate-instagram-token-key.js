const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const {
  rotateStoredTokenEncryption,
} = require('../modules/social/instagram/instagram.oauth.service');

async function main() {
  await connectDb();
  const result = await rotateStoredTokenEncryption();
  console.log(
    result.rotated
      ? `Instagram credential rotated to key version ${result.keyVersion}.`
      : `Instagram credential already uses key version ${result.keyVersion}.`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Instagram credential rotation failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
