/**
 * Vitest project for the `src/server` Nest specs.
 *
 * These ran under Jest + ts-jest until @nestjs/common v12, which is ESM-only
 * ("type": "module", a single ESM entry, no `require` condition in its exports
 * map). A CommonJS Jest cannot load it at all — `SyntaxError: Cannot use import
 * statement outside a module` — so the specs moved to the runner the other ~3600
 * tests in this repo already use.
 *
 * Kept as a separate project rather than folded into vitest.config.mts because
 * the two suites differ in every dimension that matters: file pattern (.spec vs
 * .test), transform (swc vs esbuild), isolation, and coverage participation
 * (`**\/server\/**` is excluded from the coverage gates).
 */
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

import { testFileAliases } from './vitest.aliases.mjs';

export default defineConfig({
  test: {
    testTimeout: 30000,
    environment: 'node',
    include: ['src/server/**/*.spec.ts'],
    // The fileSystem-storage specs read and write src/server/data/fileSystem/storage.
    // They avoid collisions by using a distinct tournamentId per file, but the e2e
    // specs boot a whole Nest app against that same directory, so the nine files run
    // one after another. The suite takes about three seconds; there is nothing to win
    // by racing them.
    fileParallelism: false,
  },
  resolve: {
    tsconfigPaths: true,
    alias: testFileAliases,
  },
  plugins: [
    // esbuild — Vite's default TS transform — cannot emit `design:paramtypes`,
    // and Nest resolves constructor injection from exactly that metadata. swc
    // can, so the server project transforms with swc instead. Mirrors
    // tsconfig.base.json's experimentalDecorators + emitDecoratorMetadata.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
