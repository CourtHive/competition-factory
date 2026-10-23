#!/usr/bin/env node
/**
 * Fail if outcome pipeline v2 names something its spec does not (executor plan § 6.0, G5).
 *
 * ## What this guards
 *
 * v2 is written from `documentation/docs/concepts/outcome-pipeline.md`, and the spec is what a Go or
 * Rust port follows. A name v2 decides by that the spec never states is a rule only the TypeScript
 * knows. Two vocabularies are checked today:
 *
 * - every member of each union in `UNIONS` (`types.ts`) is named, in backticks, in its spec section:
 *   `Route` in § 3. S1 adds the op kinds and the abstention reasons here.
 * - every refusal row `refusals.ts` raises (`refuse(row, …)`) is a row of § 2's table.
 *
 * A union that cannot be found, or a refusal file with no rows, is a failure, not a clean result: a
 * rename would otherwise turn the check into one that looks at nothing.
 *
 * Self-test:  node scripts/verify/outcomeSpec.mjs --self-test   (fires on each gap, quiet when complete)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPEC = 'documentation/docs/concepts/outcome-pipeline.md';
const TYPES = 'src/mutate/matchUps/outcome/types.ts';
const REFUSALS = 'src/mutate/matchUps/outcome/refusals.ts';

/** each union, and the spec section (by its heading's number) that must name every member */
const UNIONS = [{ name: 'Route', section: '3' }];

/** a `## N.` section of the spec, up to the next `## ` heading */
function sectionOf(spec, number) {
  const start = spec.search(new RegExp(`^## ${number}\\. `, 'm'));
  if (start < 0) return undefined;
  const next = spec.slice(start + 1).search(/^## /m);
  return next < 0 ? spec.slice(start) : spec.slice(start, start + 1 + next);
}

/** the string members of `export type <name> = 'a' | 'b' …;`, comments stripped */
function unionMembers(source, name) {
  const start = source.search(new RegExp(`^export type ${name} =`, 'm'));
  if (start < 0) return undefined;
  const body = source.slice(start, source.indexOf(';', start)).replace(/\/\/.*$/gm, '');
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const refusalRows = (source) =>
  [...new Set([...source.matchAll(/\brefuse\(\s*(\d+)\s*,/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);

const tableRows = (section) => new Set([...section.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((match) => Number(match[1])));

function check({ spec, types, refusals }) {
  const problems = [];
  const named = {};
  for (const { name, section } of UNIONS) {
    const members = unionMembers(types, name);
    const text = sectionOf(spec, section);
    if (!members?.length) problems.push(`${name}: no members found in ${TYPES}`);
    if (!text) problems.push(`${name}: no § ${section} in ${SPEC}`);
    if (!members?.length || !text) continue;
    named[name] = members.length;
    for (const member of members)
      if (!text.includes(`\`${member}\``)) problems.push(`${name} '${member}' is not named in ${SPEC} § ${section}`);
  }
  const rows = refusalRows(refusals);
  const refusalTable = sectionOf(spec, '2');
  if (!rows.length) problems.push(`no refuse(row, …) calls found in ${REFUSALS}`);
  if (!refusalTable) problems.push(`no § 2 in ${SPEC}`);
  const documented = refusalTable ? tableRows(refusalTable) : new Set();
  for (const row of rows) if (!documented.has(row)) problems.push(`refusal row ${row} is not a row of ${SPEC} § 2`);
  return { problems, named, rows: rows.length };
}

function selfTest() {
  const spec =
    '## 2. Refusals\n\n| 1 | a |\n| 2 | b |\n\n## 3. Routes\n\n`winner` and `clear`\n\n## 4. Writes\n\n`swap`\n';
  const types = "export type Route =\n  | 'winner' // directs\n  | 'clear'; // clears\n";
  const refusals = 'refuse(1, X); refuse( 2 , Y);';
  const quiet = check({ spec, types, refusals });
  const assert = (ok, what) => {
    if (!ok) {
      console.error(`[verify:outcome-spec] self-test FAILED — ${what}`);
      process.exit(1);
    }
  };
  assert(quiet.problems.length === 0 && quiet.named.Route === 2 && quiet.rows === 2, 'quiet on a complete spec');
  // a member named only outside its section does not count
  const outside = check({ spec, types: types.replace("'clear'", "'swap'"), refusals });
  assert(
    outside.problems.some((p) => p.includes("'swap'")),
    'fires on a member named only in another section',
  );
  assert(
    check({ spec, types, refusals: refusals + ' refuse(3, Z);' }).problems.some((p) => p.includes('row 3')),
    'fires on an undocumented row',
  );
  assert(
    check({ spec, types: 'export type Other = 1;', refusals }).problems.some((p) => p.includes('no members')),
    'fires on a missing union',
  );
  assert(
    check({ spec, types, refusals: '' }).problems.some((p) => p.includes('no refuse')),
    'fires on no rows',
  );
  console.log(
    '[verify:outcome-spec] self-test OK — fires on an unnamed member, a member named outside its section, an undocumented row, a missing union and no rows; quiet when complete',
  );
}

function run() {
  const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
  const { problems, named, rows } = check({ spec: read(SPEC), types: read(TYPES), refusals: read(REFUSALS) });
  if (problems.length) {
    console.error(`[verify:outcome-spec] FAIL — ${problems.length} name(s) v2 uses that the spec does not state:`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`Name each in ${SPEC}, in the section it belongs to.`);
    process.exit(1);
  }
  const unions = Object.entries(named).map(([name, count]) => `${count} ${name} ids`);
  console.log(`[verify:outcome-spec] OK — ${[...unions, `${rows} refusal rows`].join(', ')} named in the spec`);
}

if (process.argv.includes('--self-test')) selfTest();
else run();
