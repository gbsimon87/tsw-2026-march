module.exports = {
  '*.{js,jsx,cjs,mjs,json,md,yml,yaml}': ['prettier --write'],
  'client/**/*.{js,jsx}': ['eslint --fix'],
  'server/**/*.js': ['eslint --fix'],
};
