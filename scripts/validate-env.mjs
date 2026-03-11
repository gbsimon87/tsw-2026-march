import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const expected = {
  'env/client/.env.development': [
    'VITE_APP_NAME',
    'VITE_APP_ENV',
    'VITE_API_BASE_URL',
    'VITE_ENABLE_ANALYTICS',
    'VITE_POSTHOG_KEY',
    'VITE_POSTHOG_HOST',
  ],
  'env/client/.env.production': [
    'VITE_APP_NAME',
    'VITE_APP_ENV',
    'VITE_API_BASE_URL',
    'VITE_ENABLE_ANALYTICS',
    'VITE_POSTHOG_KEY',
    'VITE_POSTHOG_HOST',
  ],
  'env/server/.env.development': [
    'NODE_ENV',
    'PORT',
    'CLIENT_ORIGIN',
    'MONGO_URI',
    'MONGO_DB_NAME',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM_EMAIL',
    'SMTP_FROM_NAME',
    'EMAIL_VERIFY_TTL_MINUTES',
    'PASSWORD_RESET_TTL_MINUTES',
    'POSTHOG_KEY',
    'POSTHOG_HOST',
  ],
  'env/server/.env.production': [
    'NODE_ENV',
    'PORT',
    'CLIENT_ORIGIN',
    'MONGO_URI',
    'MONGO_DB_NAME',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM_EMAIL',
    'SMTP_FROM_NAME',
    'EMAIL_VERIFY_TTL_MINUTES',
    'PASSWORD_RESET_TTL_MINUTES',
    'POSTHOG_KEY',
    'POSTHOG_HOST',
  ],
};

function parseKeys(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return new Set(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0])
  );
}

const failures = [];

for (const [relativePath, requiredKeys] of Object.entries(expected)) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: file missing`);
    continue;
  }

  const existingKeys = parseKeys(absolutePath);
  for (const key of requiredKeys) {
    if (!existingKeys.has(key)) {
      failures.push(`${relativePath}: missing ${key}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Environment file validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Environment files are valid.');
