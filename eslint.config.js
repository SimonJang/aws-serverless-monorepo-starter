import js from '@eslint/js';
import { flatConfigs as importConfigs } from 'eslint-plugin-import-x';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  { ignores: ['node_modules'] },
  js.configs.recommended,
  importConfigs.recommended,
  prettierPlugin,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
];
