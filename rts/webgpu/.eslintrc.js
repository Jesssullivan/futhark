module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  env: {
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'off', // TypeScript handles this
    'prefer-const': 'warn',
  },
  globals: {
    Module: 'readonly',
    primInfos: 'readonly',
    futhark_assert: 'readonly',
    FutharkArray: 'readonly',
    FutharkReader: 'readonly',
    FutharkWriter: 'readonly',
    FutharkModule: 'readonly',
  },
};
