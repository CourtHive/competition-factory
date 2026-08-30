import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '**/scratch/**', 'server/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      sonarjs: sonarjs,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-useless-escape': 'off',
      'array-callback-return': 'warn',
      'no-console': 'off',
      'no-debugger': 'error',
      'no-duplicate-imports': 0,
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'warn',
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'no-unassigned-vars': 'warn',
      'no-useless-assignment': 'warn',
      // Ban `JSON.parse(JSON.stringify(x))` as a deep-copy idiom. It silently drops `undefined`,
      // functions, `Date`/`Map`/`Set` and throws on cycles — and it was the idiom in use where a
      // shared privacy-policy fixture needed copying, next to three call sites that copied nothing at
      // all and mutated it in place. Machine-enforced because prose could not hold it.
      // Genuinely testing JSON serialization (a `toJSON` round-trip) is a different thing: disable the
      // rule on that line with a reason.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='JSON'][callee.property.name='parse'] > CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message:
            'Use structuredClone() to deep-copy — JSON.parse(JSON.stringify(x)) drops undefined/functions/Date/Map/Set and throws on cycles. For tournamentRecords use tools.makeDeepCopy, which carries factory extension semantics.',
        },
      ],
      'sonarjs/cognitive-complexity': ['warn', 30],
      'sonarjs/no-all-duplicated-branches': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-collection-size-mischeck': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-duplicated-branches': 'warn',
      'sonarjs/no-empty-collection': 'warn',
      'sonarjs/no-extra-arguments': 'warn',
      'sonarjs/no-gratuitous-expressions': 'warn',
      'sonarjs/no-identical-expressions': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-ignored-return': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/no-redundant-boolean': 'warn',
      'sonarjs/no-redundant-jump': 'warn',
      'sonarjs/no-small-switch': 'warn',
      'sonarjs/no-unused-collection': 'warn',
      'sonarjs/prefer-object-literal': 'warn',
      'sonarjs/prefer-single-boolean-return': 'warn',
      'sonarjs/todo-tag': 'off',
      complexity: ['off', 25],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // Node ESM build/audit scripts (*.mjs) — the main block only matches .ts/.js,
    // so without this these get js.recommended's no-undef but no Node globals,
    // flagging console/process/URL. Give them Node globals; skip the TS/sonar rules.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
