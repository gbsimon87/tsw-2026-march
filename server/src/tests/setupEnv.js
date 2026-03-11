process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mern_template_test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-that-is-at-least-32-chars';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-at-least-32-chars';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:4001/api/v1/auth/google/callback';
