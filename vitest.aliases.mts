/**
 * Path aliases for test files, shared by both Vitest projects — the main suite
 * (vitest.config.mts) and the server specs (vitest.server.config.mts).
 *
 * Source files get their aliases from tsconfig.base.json via Vite's native
 * `resolve.tsconfigPaths`; test files do not, so they are mirrored here. When
 * you add an alias, add it in tsconfig.base.json AND here.
 */
export const testFileAliases = {
  '@Generators': new URL('./src/assemblies/generators', import.meta.url).pathname,
  '@Assemblies': new URL('./src/assemblies', import.meta.url).pathname,
  '@Engines': new URL('./src/tests/engines', import.meta.url).pathname, // test engines
  '@Validators': new URL('./src/validators', import.meta.url).pathname,
  '@Constants': new URL('./src/constants', import.meta.url).pathname,
  '@Functions': new URL('./src/functions', import.meta.url).pathname,
  '@Fixtures': new URL('./src/fixtures', import.meta.url).pathname,
  '@Forge': new URL('./src/forge', import.meta.url).pathname,
  '@Acquire': new URL('./src/acquire', import.meta.url).pathname,
  '@Helpers': new URL('./src/helpers', import.meta.url).pathname,
  '@Global': new URL('./src/global', import.meta.url).pathname,
  '@Mutate': new URL('./src/mutate', import.meta.url).pathname,
  '@Server': new URL('./src/server', import.meta.url).pathname,
  '@Query': new URL('./src/query', import.meta.url).pathname,
  '@Tests': new URL('./src/tests', import.meta.url).pathname,
  '@Tools': new URL('./src/tools', import.meta.url).pathname,
  '@Types': new URL('./src/types', import.meta.url).pathname,
};
