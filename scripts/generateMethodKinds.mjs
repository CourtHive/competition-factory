#!/usr/bin/env node
/**
 * Codegen: every engine method's KIND, for the query-purity check (src/tests/testHarness/queryPurity.ts).
 *
 *   mutation  may write engine state
 *   query     reads; must leave the loaded records, the notice buffer and the modified flag as they were
 *   generate  builds a structure the caller attaches by a later mutation; writes nothing, so checked like a query
 *   engine    the engine's own API (state, clock, facades), not a governor method; never dispatched as a method
 *
 * Most kinds come from the governors' own split, their `query`, `mutate` and `generate` namespaces. A name in two
 * namespaces takes the kind that may write (`cleanExpiredMutationLocks` keeps a deprecated `query` alias beside its
 * `mutate` home: tournamentGovernor/query.ts). The tables below cover the governors with no split and the methods a
 * split governor exports outside its namespaces. An engine method with no kind fails the run, so a new method is
 * classified when it is added.
 *
 * Committed as data rather than computed in the test harness: a setup file that imported the governors would load
 * the engine before a test file's `vi.mock` registered, and the mocks would not apply.
 *
 * Regenerate: pnpm gen:method-kinds        Drift guard: pnpm check:method-kinds (in verify:generated)
 */
import { writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/tests/testHarness/queryPurity/methodKinds.json');

const ENGINE_API = [
  'auditAuthorityServer',
  'devContext',
  'dryRun',
  'execute',
  'executionQueue',
  'explain',
  'getAuditAuthorityServer',
  'getDevContext',
  'getLoadedFootprint',
  'getOutcomePipeline',
  'getSaveDrawDeletions',
  'getSchemaWriteMode',
  'getStampScope',
  'getState',
  'getTournament',
  'getTournamentId',
  'importMethods',
  'inspect',
  'loadedFootprint',
  'newTournamentRecord',
  'off',
  'on',
  'once',
  'outcomePipeline',
  'removeTournamentRecord',
  'removeUnlinkedTournamentRecords',
  'reset',
  'saveDrawDeletions',
  'schemaWriteMode',
  'setClock',
  'setCompetitionClock',
  'setRandomSource',
  'setState',
  'setTournamentId',
  'setTournamentRecord',
  'stampScope',
  'version',
  'waitFor',
];

/** Governors without a query/mutate split: every function they export, by kind; `'*'` is the rest. */
const UNSPLIT = {
  // availability arithmetic over the blocks and rails it is handed; one method writes a record
  availabilityGovernor: { mutation: ['applyAvailabilityToTournamentRecord'], query: '*' },
  generationGovernor: { generate: '*' },
  matchUpFormatGovernor: { query: '*' },
  queryGovernor: { query: '*' },
  reportGovernor: { query: '*' },
};

/** Methods a split governor exports outside its namespaces. */
const UNNAMESPACED = {
  // drawsGovernor's generators
  generate: [
    'addFinishingRounds',
    'autoSeeding',
    'drawMatic',
    'generateAdHocMatchUps',
    'generateAdHocRounds',
    'generateAndPopulatePlayoffStructures',
    'generateConsolationStructure',
    'generateDrawDefinition',
    'generateDrawMaticRound',
    'generateDrawStructuresAndLinks',
    'generateDrawTypeAndModifyDrawDefinition',
    'generateQualifyingStructure',
    'generateSwissRound',
    'generateVoluntaryConsolation',
  ],
  // scoreGovernor's `helpers` namespace and its parsers: functions of their arguments
  query: [
    'analyzeSequence',
    'exportMatchUpJSON',
    'getSetScoreString',
    'groupByMatch',
    'keyValueScore',
    'mcpValidator',
    'parseCSV',
    'parseMCPPoint',
    'parseMatchUpFormat',
    'pbpValidator',
    'pointParser',
    'repairScore',
    'shotParser',
    'shotSplitter',
    'stringifyMatchUpFormat',
    'validateMCPMatch',
    'validateMatchUp',
    'validateSet',
  ],
};

const NAMESPACES = { mutate: 'mutation', query: 'query', generate: 'generate' };
const PRECEDENCE = ['mutation', 'generate', 'query', 'engine'];

async function loadEngine() {
  const outfile = join(mkdtempSync(join(tmpdir(), 'factory-method-kinds-')), 'engine.mjs');
  await esbuild.build({
    stdin: {
      contents:
        "export * as governors from './src/assemblies/governors';\n" +
        "export { tournamentEngine } from './src/assemblies/engines/sync/assembled';\n",
      resolveDir: ROOT,
      loader: 'ts',
    },
    tsconfig: join(ROOT, 'tsconfig.json'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const functionNames = (namespace) =>
  namespace && typeof namespace === 'object'
    ? Object.keys(namespace).filter((name) => typeof namespace[name] === 'function')
    : [];

export function classify(governors, methods) {
  const found = new Map();
  const add = (name, kind) => {
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(kind);
  };
  for (const [governorName, governor] of Object.entries(governors)) {
    for (const [namespace, kind] of Object.entries(NAMESPACES))
      for (const name of functionNames(governor[namespace])) add(name, kind);
    const unsplit = UNSPLIT[governorName];
    if (!unsplit) continue;
    const listed = new Set(Object.values(unsplit).flatMap((names) => (Array.isArray(names) ? names : [])));
    for (const [kind, names] of Object.entries(unsplit)) {
      const members = names === '*' ? functionNames(governor).filter((name) => !listed.has(name)) : names;
      for (const name of members) add(name, kind);
    }
  }
  for (const [kind, names] of Object.entries(UNNAMESPACED)) for (const name of names) add(name, kind);
  for (const name of ENGINE_API) add(name, 'engine');

  const kinds = {};
  const missing = [];
  for (const name of [...methods].sort((a, b) => a.localeCompare(b))) {
    const set = found.get(name);
    if (set) kinds[name] = PRECEDENCE.find((kind) => set.has(kind));
    else missing.push(name);
  }
  return { kinds, missing };
}

const { governors, tournamentEngine } = await loadEngine();
const methods = Object.keys(tournamentEngine).filter((name) => typeof tournamentEngine[name] === 'function');
const { kinds, missing } = classify(governors, methods);
const tag = '[method-kinds]';

if (!methods.length) {
  console.error(`${tag} the bundled engine exposed no methods; nothing was classified`);
  process.exit(1);
}
if (missing.length) {
  console.error(`${tag} ${missing.length} engine method(s) have no kind: ${missing.join(', ')}`);
  console.error(
    "Export each from its governor's query, mutate or generate module, or classify it in scripts/generateMethodKinds.mjs.",
  );
  process.exit(1);
}

const next = JSON.stringify(kinds, null, 2) + '\n';
const counts = Object.values(kinds).reduce((acc, kind) => ({ ...acc, [kind]: (acc[kind] ?? 0) + 1 }), {});
const summary = Object.entries(counts)
  .map(([kind, n]) => `${n} ${kind}`)
  .join(', ');

if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== next) {
    console.error(`${tag} ${OUT} is stale; run \`pnpm gen:method-kinds\`.`);
    process.exit(1);
  }
  console.log(`${tag} OK (${methods.length} methods: ${summary})`);
  process.exit(0);
}
writeFileSync(OUT, next);
console.log(`${tag} wrote ${OUT} (${methods.length} methods: ${summary})`);
