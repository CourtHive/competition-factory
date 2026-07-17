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
 * No npm install required — we point Node directly at the dist files.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

log('OK — CJS + ESM dists both load and behave as expected');
