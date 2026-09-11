#!/usr/bin/env node
/**
 * `verify:governors` — every governor directory must be registered in the governors index.
 *
 * WHY THIS EXISTS
 *
 * Twice now a governor has been written, tested, and left out of
 * `src/assemblies/governors/index.ts`:
 *
 *   - LADDER (#4787): the whole ladder lifecycle shipped reachable by nothing. Fixed in #4793.
 *   - sanctioningGovernor: 35 methods, unreachable for as long as it had existed. Fixed in #4809.
 *
 * Neither was caught by a test, because every suite for both imported what it tested by MODULE PATH.
 * That proves the logic and not the reach: the functions work, and no consumer can call them. The
 * governors index is what puts a governor's methods on an engine, so an unregistered governor is
 * invisible to `factoryEngineMethods`, to `verify:surface` (nothing was removed), and to the docs
 * gate (a doc naming the governor was simply "wrong").
 *
 * This is a registry check rather than a behavioural one: compare the directories that exist against
 * the names the index exports, in both directions. It is the cheapest gate that would have caught
 * both, and it runs without a build.
 */
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const GOVERNORS = path.join(ROOT, 'src', 'assemblies', 'governors');
const INDEX = path.join(GOVERNORS, 'index.ts');

const directories = fs
  .readdirSync(GOVERNORS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(GOVERNORS, name, 'index.ts')))
  .sort((a, b) => a.localeCompare(b));

const source = fs.readFileSync(INDEX, 'utf8');
const exported = new Set();
const re = /export \* as (\w+) from '\.\/(\w+)'/g;
let match;
while ((match = re.exec(source)) !== null) {
  const [, alias, directory] = match;
  exported.add(directory);
  if (alias !== directory) {
    console.error(`[governors] '${directory}' is exported as '${alias}' — the alias should match the directory`);
    process.exit(1);
  }
}

const unregistered = directories.filter((name) => !exported.has(name));
const orphaned = [...exported].filter((name) => !directories.includes(name));

if (unregistered.length || orphaned.length) {
  if (unregistered.length) {
    console.error(`[governors] ${unregistered.length} governor(s) exist but are NOT registered:\n`);
    for (const name of unregistered) console.error(`  ${name}  —  add \`export * as ${name} from './${name}';\``);
    console.error(
      '\nAn unregistered governor puts none of its methods on any engine. Tests that import by module\n' +
        'path will pass regardless; nothing else in the verify chain looks at this.',
    );
  }
  if (orphaned.length) {
    console.error(`\n[governors] ${orphaned.length} export(s) name a directory that does not exist:`);
    for (const name of orphaned) console.error(`  ${name}`);
  }
  process.exit(1);
}

console.log(`[governors] OK — ${directories.length} governors, all registered`);
