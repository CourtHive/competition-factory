const { pathsToModuleNameMapper } = require('ts-jest');
// IMPORTANT: tsconfig.base.json is read here via Node `require()`, which does
// NOT follow `extends`. So `compilerOptions.paths` must live literally in
// tsconfig.base.json — `tsconfig.json` extends this file, not the other way
// around. When you add a path alias, edit tsconfig.base.json; both tsc and
// jest pick it up automatically.
const { compilerOptions } = require('./tsconfig.base.json');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { types: ['jest', 'node'] } }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testRegex: '.*\\.spec\\.ts$',
  // `rootDir` is the repo root, so a git worktree checked out under `.claude/worktrees/`
  // would otherwise be globbed as a second copy of every spec. Those copies resolve
  // incoherently — aliases map back to `<rootDir>/src` while relative imports hit the
  // worktree's own (unbuilt) tree — so exclude them from test discovery and from the
  // haste map (the latter also silences duplicate-package-name collision warnings).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
};
