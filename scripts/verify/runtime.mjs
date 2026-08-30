#!/usr/bin/env node
/**
 * verify:runtime — Node CJS + ESM smoke against the locally built dist.
 *
 * Spawns two short-lived subprocesses (one CJS, one ESM) that import the
 * dist directly, instantiate an engine, call a few methods, and assert
 * shaped returns. Catches "compiles but doesn't run" regressions.
 *
 * The CJS path imports the dist via require('./tods-competition-factory.development.cjs.js').
 * The ESM path imports via import statements against dist/esm/index.mjs.
 *
 * A third, BUNDLED pass then re-runs an ESM consumer through esbuild with tree
 * shaking on. That is not redundant with the ESM pass: Node evaluates every
 * module in the graph, so an engine whose methods are attached by a module
 * side effect always looks complete there. A bundler is allowed to drop a
 * module whose exports nobody uses — and with `"sideEffects": false` in
 * package.json, it will — so the bundled pass is the only one that sees what
 * a consumer's production build actually ships. See `bundledChecks` below.
 *
 * No npm install required — we point Node directly at the dist files.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');

function log(msg) {
  process.stdout.write(`[verify:runtime] ${msg}\n`);
}

function fail(msg, err) {
  process.stderr.write(`[verify:runtime] FAIL: ${msg}\n`);
  if (err?.stderr) process.stderr.write(String(err.stderr));
  if (err?.stdout) process.stderr.write(String(err.stdout));
  process.exit(1);
}

if (!existsSync(`${FACTORY_ROOT}/dist`)) {
  fail('dist/ not present — run `pnpm build` first');
}

// --- CJS smoke ---
log('CJS: require + engine smoke…');
const cjsScript = `
const path = require('path');
const fac = require(path.join(${JSON.stringify(FACTORY_ROOT)}, 'dist/tods-competition-factory.development.cjs.js'));
const required = ['tournamentEngine', 'syncEngine', 'mocksEngine', 'globalState', 'forge', 'factoryConstants', 'topicConstants', 'version'];
for (const k of required) {
  if (fac[k] === undefined) { console.error('missing export:', k); process.exit(1); }
}
const v = fac.version();
if (typeof v !== 'string' || v.length === 0) { console.error('version() not a string'); process.exit(1); }

// engine.q.events() returns [] for no state
fac.tournamentEngine.reset();
const events = fac.tournamentEngine.q.events();
if (!Array.isArray(events) || events.length !== 0) { console.error('q.events() not []'); process.exit(1); }

// engine.inspect() returns a shaped snapshot
const snap = fac.tournamentEngine.inspect();
if (typeof snap !== 'object' || typeof snap.version !== 'string' || typeof snap.loaded !== 'object') {
  console.error('inspect() shape unexpected'); process.exit(1);
}

// mocksEngine.generateTournamentRecord runs end-to-end
const result = fac.mocksEngine.generateTournamentRecord({
  setState: true,
  drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
});
if (!result?.tournamentRecord?.tournamentId) { console.error('mocksEngine failed'); process.exit(1); }

// engine.q.events() now returns the seeded event
const events2 = fac.tournamentEngine.q.events();
if (events2.length !== 1) { console.error('expected 1 event, got ' + events2.length); process.exit(1); }

console.log('CJS OK');
`;

try {
  execSync(`node -e "${cjsScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8', cwd: FACTORY_ROOT });
} catch (err) {
  fail('CJS smoke failed', err);
}

// --- ESM smoke ---
log('ESM: dynamic import + engine smoke…');
const esmScript = `
const fac = await import('file://' + ${JSON.stringify(FACTORY_ROOT)} + '/dist/esm/index.mjs');
const required = ['tournamentEngine', 'syncEngine', 'mocksEngine', 'globalState', 'forge', 'factoryConstants', 'topicConstants', 'version'];
for (const k of required) {
  if (fac[k] === undefined) { console.error('missing export:', k); process.exit(1); }
}
fac.tournamentEngine.reset();
const events = fac.tournamentEngine.q.events();
if (!Array.isArray(events) || events.length !== 0) { console.error('q.events() not []'); process.exit(1); }

const snap = fac.tournamentEngine.inspect();
if (typeof snap.version !== 'string') { console.error('inspect() shape unexpected'); process.exit(1); }

const result = fac.mocksEngine.generateTournamentRecord({
  setState: true,
  drawProfiles: [{ participantsCount: 4, drawSize: 4 }],
});
if (!result?.tournamentRecord?.tournamentId) { console.error('mocksEngine failed'); process.exit(1); }

console.log('ESM OK');
`;

try {
  execSync(`node --input-type=module -e "${esmScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    encoding: 'utf8',
    cwd: FACTORY_ROOT,
  });
} catch (err) {
  fail('ESM smoke failed', err);
}

// --- Bundled (tree-shaken) ESM smoke ---
//
// Every engine below is assembled by MUTATING a shared singleton — `importMethods`
// bolts governor methods onto the one `syncEngine` object — so an engine's method
// surface depends on its module having been EVALUATED, not merely resolved. Any
// module that reaches a consumer as a bare `import './x.mjs'` is fair game for
// elimination under `"sideEffects": false`, and the loss is silent: the engine still
// arrives, still has `setState`, and only fails at the call site with
// `<method> is not a function` — in production builds only, since dev servers do not
// shake. That is exactly how `scaleEngine.generateDynamicRatings` reached production.
//
// Add a row here whenever a new engine is assembled by side effect.
const bundledChecks = [
  // The regression this exists for: `scaleEngine` is the shared `syncEngine` with the
  // ranking + ratings governors attached, and a pure re-export let the bundler drop the
  // module that attaches them.
  {
    engine: 'scaleEngine',
    methods: ['setState', 'generateDynamicRatings', 'calculateNewRatings', 'generateRankingList'],
  },
  { engine: 'tournamentEngine', methods: ['setState', 'getTournament', 'addEvent'] },
  { engine: 'competitionEngine', methods: ['setState', 'getCompetitionMatchUps'] },
  { engine: 'tournamentEngineAsync', methods: ['setState', 'getTournament', 'addEvent'] },
  { engine: 'askEngine', methods: ['setState', 'getTournament'] },
  { engine: 'matchUpEngine', methods: ['setState', 'analyzeScore', 'isValidMatchUpFormat'] },
  { engine: 'mocksEngine', methods: ['generateTournamentRecord'] },
];

log('BUNDLED: esbuild tree-shaken consumer smoke…');
const bundleDir = mkdtempSync(join(tmpdir(), 'factory-runtime-bundled-'));
try {
  for (const { engine, methods } of bundledChecks) {
    const entry = join(bundleDir, `${engine}.mjs`);
    writeFileSync(
      entry,
      `import { ${engine} } from ${JSON.stringify(join(FACTORY_ROOT, 'dist/esm/index.mjs'))};\n` +
        `const missing = ${JSON.stringify(methods)}.filter((m) => typeof ${engine}[m] !== 'function');\n` +
        `if (missing.length) { console.error('${engine} is missing after tree-shaking: ' + missing.join(', ')); process.exit(1); }\n` +
        `console.log('${engine} OK');\n`,
    );

    // minify:true so terser-style dead-code elimination gets its pass too, matching
    // what a consumer's production build does.
    const built = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      minify: true,
      treeShaking: true,
      write: false,
      logLevel: 'silent',
    });

    const bundled = join(bundleDir, `${engine}.bundled.mjs`);
    writeFileSync(bundled, built.outputFiles[0].text);

    try {
      execSync(`node ${JSON.stringify(bundled)}`, { encoding: 'utf8', cwd: FACTORY_ROOT });
    } catch (err) {
      fail(
        `bundled smoke failed for \`${engine}\` — its methods did not survive tree shaking.\n` +
          `        A pure re-export (\`export { x as engineName }\`) lets the bundler flatten the alias and drop\n` +
          `        the module that attaches the methods. Declare the binding in the module that mutates the\n` +
          `        engine, with the \`importMethods\` call inside the initializer.`,
        err,
      );
    }
  }
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}

log('OK — CJS + ESM dists load, and every side-effect-assembled engine survives tree shaking');
