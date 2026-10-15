#!/usr/bin/env node
/**
 * Summarises a notice-coverage run (`NOTICE_COVERAGE=1 pnpm vitest run`; see
 * src/tests/testHarness/noticeCoverage.ts).
 *
 *   node scripts/noticeCoverageReport.mjs [tally.jsonl] [--json] [--unreached]
 *
 * One row per engine method that changed a record in at least one call. `silent` calls changed a
 * record and buffered no notice at all; `violating` calls changed an entity that no notice covered
 * (the notice-conformance rules). A method is listed by how often it violated, then by name.
 *
 * `--unreached` instead lists the engine methods (src/types/factoryEngineMethods.ts) that no test
 * dispatched through an engine at all, whatever the call's result.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const unreached = args.includes('--unreached');
const file = args.find((arg) => !arg.startsWith('--')) ?? '.notice-coverage/tally.jsonl';

if (!fs.existsSync(file)) {
  console.error(`[notice-coverage] no tally at ${file}: run NOTICE_COVERAGE=1 pnpm vitest run first`);
  process.exit(1);
}

const methods = new Map();
const invoked = new Map();
let files = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  files += 1;
  const { methods: tallies, invoked: dispatched = {} } = JSON.parse(line);
  for (const [name, count] of Object.entries(dispatched)) invoked.set(name, (invoked.get(name) ?? 0) + count);
  for (const [name, tally] of Object.entries(tallies)) {
    const total = methods.get(name) ?? { calls: 0, changed: 0, silent: 0, violating: 0, reasons: {}, examples: [] };
    for (const key of ['calls', 'changed', 'silent', 'violating']) total[key] += tally[key];
    for (const [reason, count] of Object.entries(tally.reasons))
      total.reasons[reason] = (total.reasons[reason] ?? 0) + count;
    for (const example of tally.examples)
      if (total.examples.length < 3 && !total.examples.includes(example)) total.examples.push(example);
    methods.set(name, total);
  }
}

if (unreached) {
  const registry = fs.readFileSync('src/types/factoryEngineMethods.ts', 'utf8');
  const names = [...registry.matchAll(/^\s*\| '([^']+)'/gm)].map(([, name]) => name);
  const never = names.filter((name) => !invoked.has(name)).sort((a, b) => a.localeCompare(b));
  const percent = ((never.length / names.length) * 100).toFixed(0);
  console.log(
    `[engine-reach] ${files} test files; ${names.length} engine methods; ${never.length} (${percent}%) never dispatched`,
  );
  for (const name of never) console.log(`  ${name}`);
  process.exit(0);
}

const rows = [...methods.entries()]
  .filter(([, total]) => total.changed > 0)
  .sort(([a, x], [b, y]) => y.violating - x.violating || a.localeCompare(b));

if (asJson) {
  console.log(JSON.stringify({ files, methods: Object.fromEntries(rows) }, null, 2));
  process.exit(0);
}

const violating = rows.filter(([, total]) => total.violating > 0);
const silent = rows.filter(([, total]) => total.silent > 0);
console.log(`[notice-coverage] ${files} test files; ${rows.length} methods changed a record;`);
console.log(`  ${violating.length} with an uncovered change, ${silent.length} with a change and no notice at all\n`);
for (const [name, total] of violating) {
  console.log(`${name}: ${total.violating}/${total.changed} changing calls uncovered (${total.silent} silent)`);
  for (const [reason, count] of Object.entries(total.reasons).sort(([, a], [, b]) => b - a))
    console.log(`    ${count} × ${reason}`);
  for (const example of total.examples) console.log(`    e.g. ${example}`);
}
