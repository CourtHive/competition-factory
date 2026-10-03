import fs from 'fs';

/**
 * The core method set the corpus harvests (plan § 6, draft pending CA's decision § 9.3): the
 * mutation and generation exports of the scoring, matchUp, draws and entries governors, plus the
 * generation and matchUpFormat governors. Queries are excluded by construction: only `mutate` and
 * `generate` barrels are read, and the two governors read whole export nothing but mutations and
 * a pure grammar.
 *
 * Derived from the governor SOURCE TEXT, not by importing the modules. Importing them from a
 * setup file populates the module registry before a test file's `vi.mock` is hoisted, so a test
 * that mocks a module the engine calls would see the real one instead (measured: 13 tests in 4
 * files), and importing a governor registers its methods on the engine, which a test asserting
 * METHOD_NOT_FOUND does not expect. Reading text has neither side effect, and a method added to one
 * of these barrels is still harvested without anyone remembering to list it here.
 */
const SOURCES = [
  'src/assemblies/governors/scoreGovernor/mutate.ts',
  'src/assemblies/governors/matchUpGovernor/mutate.ts',
  'src/assemblies/governors/drawsGovernor/mutate.ts',
  'src/assemblies/governors/drawsGovernor/generate.ts',
  'src/assemblies/governors/entriesGovernor/mutate.ts',
  'src/assemblies/governors/generationGovernor/index.ts',
  'src/assemblies/governors/matchUpFormatGovernor/index.ts',
];

/** `export { a, b as c } from '…'` → the names as the engine exposes them (`a`, `c`). `export type` is skipped. */
function exportedNames(source: string): string[] {
  const names: string[] = [];
  const re = /^export\s+\{([^}]*)\}\s+from\s+/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    for (const spec of match[1].split(',')) {
      const trimmed = spec.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const alias = trimmed.split(/\s+as\s+/);
      names.push((alias[1] ?? alias[0]).trim());
    }
  }
  return names;
}

export const CORE_METHOD_SOURCES: Readonly<Record<string, string[]>> = Object.fromEntries(
  SOURCES.map((file) => [
    file.replace('src/assemblies/governors/', '').replace(/\.ts$/, ''),
    exportedNames(fs.readFileSync(file, 'utf8')).sort((a, b) => a.localeCompare(b)),
  ]),
);

export const CORE_METHODS: ReadonlySet<string> = new Set(Object.values(CORE_METHOD_SOURCES).flat());

export function isCoreMethod(methodName: string): boolean {
  return CORE_METHODS.has(methodName);
}
