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
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
};
