// Grant or revoke the platform_operator role used by the company Instagram
// connection surface. This does not grant league or team permissions.
//
// Usage:
//   pnpm --filter server instagram:operator -- user@example.com
//   pnpm --filter server instagram:operator -- user@example.com --revoke

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { findUserByEmail } = require('../modules/auth/auth.repository');

async function main() {
  const email = process.argv
    .find((argument) => argument.includes('@'))
    ?.trim()
    .toLowerCase();
  const revoke = process.argv.includes('--revoke');
  if (!email) throw new Error('Provide the account email address');

  await connectDb();
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`No user found for ${email}`);

  const roles = new Set(user.roles || []);
  if (revoke) roles.delete('platform_operator');
  else roles.add('platform_operator');
  user.roles = [...roles];
  await user.save();

  console.log(`${revoke ? 'Revoked' : 'Granted'} platform_operator for ${email}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Instagram operator update failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
