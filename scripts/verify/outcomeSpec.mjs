#!/usr/bin/env node
/**
 * Fail if outcome pipeline v2 names something its spec does not (executor plan § 6.0, G5).
 *
 * ## What this guards
 *
 * v2 is written from `documentation/docs/concepts/outcome-pipeline.md`, and the spec is what any second
 * implementation follows. A name v2 decides by that the spec never states is a rule only the TypeScript
 * knows. Two vocabularies are checked today:
 *
 * - every member of each union in `UNIONS` (`types.ts`) is named, in backticks, in its spec section:
 *   `Route` in § 3. S1 adds the op kinds and the abstention reasons here.
 * - every refusal row `refusals.ts` raises (`refuse(row, …)`) is a row of § 2's table.
 *
 * A union that cannot be found, or a refusal file with no rows, is a failure, not a clean result: a
 * rename would otherwise turn the check into one that looks at nothing. So is a `refuse(` call whose
 * row the parser cannot read (an expression rather than a literal): it is named, not skipped (review of
 * #5741, finding 2: one such call existed and the check reported every row read).
 *
 * Self-test:  node scripts/verify/outcomeSpec.mjs --self-test   (fires on each gap, quiet when complete)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPEC = 'documentation/docs/concepts/outcome-pipeline.md';
const TYPES = 'src/mutate/matchUps/outcome/types.ts';
const REFUSALS = 'src/mutate/matchUps/outcome/refusals.ts';

/** each union, the file that declares it, and the spec section (by its heading's number) that must name every member */
const UNIONS = [
  { name: 'Route', file: TYPES, section: '3' },
  { name: 'OutcomeOpName', file: 'src/mutate/matchUps/outcome/ops.ts', section: '7.2' },
  { name: 'AbstainReason', file: 'src/mutate/matchUps/outcome/plan.ts', section: '7.2' },
];

/** a `## N.` (or `## N.M `) section of the spec, up to the next `## ` heading */
function sectionOf(spec, number) {
  const start = spec.search(new RegExp(`^## ${number.replaceAll('.', '\\.')}\\.? `, 'm'));
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

/** every `refuse(` call site (not the definition), and the rows read from those whose row is a literal */
function refusalRows(source) {
  const calls = [...source.matchAll(/(?<![\w.])refuse\((?!row)/g)].length;
  const literal = [...source.matchAll(/(?<![\w.])refuse\(\s*(\d+)\s*,/g)];
  const rows = [...new Set(literal.map((match) => Number(match[1])))].sort((a, b) => a - b);
  return { calls, parsed: literal.length, rows };
}

const tableRows = (section) => new Set([...section.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((match) => Number(match[1])));

function check({ spec, types, refusals, sources = {}, unions = UNIONS }) {
  const problems = [];
  const named = {};
  for (const { name, file, section } of unions) {
    const members = unionMembers(sources[file] ?? types, name);
    const text = sectionOf(spec, section);
    if (!members?.length) problems.push(`${name}: no members found in ${file}`);
    if (!text) problems.push(`${name}: no § ${section} in ${SPEC}`);
    if (!members?.length || !text) continue;
    named[name] = members.length;
    for (const member of members)
      if (!text.includes(`\`${member}\``)) problems.push(`${name} '${member}' is not named in ${SPEC} § ${section}`);
  }
  const { calls, parsed, rows } = refusalRows(refusals);
  const refusalTable = sectionOf(spec, '2');
  if (!rows.length) problems.push(`no refuse(row, …) calls found in ${REFUSALS}`);
  if (parsed !== calls)
    problems.push(
      `${calls - parsed} refuse(…) call(s) in ${REFUSALS} give their row as an expression; write each row as a literal`,
    );
  if (!refusalTable) problems.push(`no § 2 in ${SPEC}`);
  const documented = refusalTable ? tableRows(refusalTable) : new Set();
  for (const row of rows) if (!documented.has(row)) problems.push(`refusal row ${row} is not a row of ${SPEC} § 2`);
  return { problems, named, rows: rows.length, calls };
}

const ROUTE_ONLY = [{ name: 'Route', file: TYPES, section: '3' }];

function selfTest() {
  const spec =
    '## 2. Refusals\n\n| 1 | a |\n| 2 | b |\n\n## 3. Routes\n\n`winner` and `clear`\n\n## 4. Writes\n\n`swap`\n';
  const types = "export type Route =\n  | 'winner' // directs\n  | 'clear'; // clears\n";
  const refusals = 'refuse(1, X); refuse( 2 , Y);';
  const quiet = check({ spec, types, refusals, unions: ROUTE_ONLY });
  const assert = (ok, what) => {
    if (!ok) {
      console.error(`[verify:outcome-spec] self-test FAILED — ${what}`);
      process.exit(1);
    }
  };
  assert(quiet.problems.length === 0 && quiet.named.Route === 2 && quiet.rows === 2, 'quiet on a complete spec');
  // a member named only outside its section does not count
  const outside = check({ spec, types: types.replace("'clear'", "'swap'"), refusals, unions: ROUTE_ONLY });
  assert(
    outside.problems.some((p) => p.includes("'swap'")),
    'fires on a member named only in another section',
  );
  assert(
    check({ spec, types, refusals: refusals + ' refuse(3, Z);', unions: ROUTE_ONLY }).problems.some((p) =>
      p.includes('row 3'),
    ),
    'fires on an undocumented row',
  );
  assert(
    check({ spec, types: 'export type Other = 1;', refusals, unions: ROUTE_ONLY }).problems.some((p) =>
      p.includes('no members'),
    ),
    'fires on a missing union',
  );
  assert(
    check({ spec, types, refusals: '', unions: ROUTE_ONLY }).problems.some((p) => p.includes('no refuse')),
    'fires on no rows',
  );
  const expression = refusals + ' refuse(cond ? 1 : 2, W);';
  assert(
    check({ spec, types, refusals: expression, unions: ROUTE_ONLY }).problems.some((p) =>
      p.includes('as an expression'),
    ),
    'fires on an unparsed row',
  );
  const definition = 'const refuse = (row, error) => ({ row, error });\n' + refusals;
  assert(
    check({ spec, types, refusals: definition, unions: ROUTE_ONLY }).problems.length === 0,
    'the definition is not a call',
  );
  console.log(
    '[verify:outcome-spec] self-test OK — fires on an unnamed member, a member named outside its section, an undocumented row, a missing union, no rows and an unparsed row; quiet when complete',
  );
}

function run() {
  const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
  const sources = Object.fromEntries(UNIONS.map(({ file }) => [file, read(file)]));
  const { problems, named, rows } = check({
    spec: read(SPEC),
    types: read(TYPES),
    refusals: read(REFUSALS),
    sources,
  });
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
