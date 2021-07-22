module.exports = {
  env: {
    browser: true,
    es2021: true,
    jquery: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    'import/no-cycle': 0,
    'no-use-before-define': 0,
    'object-curly-newline': 0,
    'arrow-parens': 0,
    'max-len': 120,
  },
  globals: {
    chrome: 'readonly',
    M: 'readonly',
    Wazo: 'readonly',
    location: 'readonly',
  },
};
