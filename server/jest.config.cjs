module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  setupFiles: ['<rootDir>/src/tests/setupEnv.js'],
};
