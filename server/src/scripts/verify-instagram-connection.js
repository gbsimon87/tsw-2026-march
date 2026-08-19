const {
  createInstagramClientFromEnv,
  InstagramPublishingError,
} = require('../modules/social/instagram/instagram.client');

async function main() {
  try {
    const client = createInstagramClientFromEnv();
    const account = await client.verifyConnection();
    console.log(
      JSON.stringify(
        {
          connected: true,
          account,
        },
        null,
        2
      )
    );
  } catch (error) {
    const code = error instanceof InstagramPublishingError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`Instagram connection check failed (${code}): ${error.message}`);
    process.exitCode = 1;
  }
}

main();
