import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { ESLint } from 'eslint';

import type { Linter } from 'eslint';

it('no-floating-promises detects governor, unresolved and dispatch calls on all public async exports', async () => {
  const filePath = resolve('src/tests/engines/typedAsyncEngine.lint.fixture.ts');
  const code = readFileSync(filePath, 'utf8');
  const linter = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsparser,
          parserOptions: { project: './tsconfig.tests.json', tsconfigRootDir: process.cwd() },
        },
        // ESLint 10 and the plugin's legacy ESLint types differ; exercise the real rule at runtime.
        plugins: { '@typescript-eslint': tseslint as unknown as NonNullable<Linter.Config['plugins']>[string] },
        rules: { '@typescript-eslint/no-floating-promises': 'error' },
      },
    ],
  });
  const [result] = await linter.lintText(code, { filePath });
  const expectedLines = code.split('\n').flatMap((line, index) => (line.endsWith('// floating') ? [index + 1] : []));
  expect(result.messages.map(({ ruleId, line }) => ({ ruleId, line }))).toEqual(
    expectedLines.map((line) => ({ ruleId: '@typescript-eslint/no-floating-promises', line })),
  );
  expect(result.fatalErrorCount).toBe(0);
  // type-aware linting builds the test tsconfig's whole program: ~5 s on a dev machine, ~36 s on a 2-core CI runner
}, 180_000);
