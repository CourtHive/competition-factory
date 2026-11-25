#!/usr/bin/env node
/**
 * verify:deprecations — the `@deprecated` tags a consumer's editor shows, counted in the PACKED declarations.
 *
 * `postbuild.mjs` injects the tags (scripts/lib/deprecations.mjs says why and where). This gate packs the built
 * package as `pnpm pack` would publish it, reads every declaration file in the tarball and fails when:
 *
 *   - a tag the plan expects is missing, or its text differs (the plan is derived from the transition manifest's
 *     `scheduled-for-removal` routes, the positional guard list and the alias list, applied to the packed file);
 *   - a tag appears that the plan does not expect (on another node, or attached to none);
 *   - the plan itself has a problem (a scheduled route no listed governor holds, an alias that moved, a tag that
 *     would leak into `tools`), or a replacement it names does not resolve in the packed root declarations;
 *   - the three per-format copies of a bundle differ, or a declaration file ships that the gate does not know.
 *
 * It then runs the editor probe (deprecationsProbe.mjs) on the same unpacked tarball, and a negative control on the
 * real packed text: one tag removed and one stray tag added must each fail the count.
 *
 *   node scripts/verify/deprecations.mjs --self-test     synthetic fixture: the checks and their controls
 *   node scripts/verify/deprecations.mjs                 pack dist (build first), count, probe
 *        [--tarball <file.tgz>]                          use this tarball instead of packing
 *        [--no-probe]                                    count only
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import ts from 'typescript';
import {
  ALIASES,
  findDeprecations,
  injectDeprecations,
  loadDeprecations,
  readDeprecations,
  readStructure,
  resolvesPublicPath,
  UTILITIES_MESSAGE,
} from '../lib/deprecations.mjs';
import { PACKAGE_ROOT, REPO_ROOT } from '../lib/repoRoot.mjs';
import { probe } from './deprecationsProbe.mjs';

const TAG = '[verify:deprecations]';
const log = (msg) => process.stdout.write(`${TAG} ${msg}\n`);
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

/** The bundle each shipped declaration file holds, by base name; `governors` files are re-export lists. */
const BUNDLE_OF = {
  'tods-competition-factory': 'root',
  constants: 'constants',
  'score-entry-state': 'score-entry-state',
  governors: 'governors',
};
// `dist/tools/<domain>.d.*`, the per-domain tools subpaths: aliases of the root's `tools.<domain>` members
const bundleOf = (file) =>
  /[\\/]dist[\\/]tools[\\/][^\\/]+\.d\.[cm]?ts$/.test(file)
    ? 'tools'
    : BUNDLE_OF[basename(file).replace(/\.d\.[cm]?ts$/, '')];

const count = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());

/**
 * Compare one declaration file's tags with its plan. Returns `{ problems, byCategory, total }`.
 * `resolve(path)` reports whether a replacement path (`tools.scoring.x`) exists; root bundle only.
 */
export function checkFile(text, deprecations, { bundle, fileName, resolve }) {
  const problems = [];
  if (bundle === 'governors') {
    // a re-export list of the root's governors: it carries no declarations, so no tags of its own
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    if (sf.statements.some((st) => !ts.isExportDeclaration(st) || !st.moduleSpecifier))
      problems.push(`${fileName}: not a pure re-export list`);
    if (/@deprecated\b/.test(text)) problems.push(`${fileName}: carries @deprecated tags`);
    return { problems, byCategory: {}, total: 0 };
  }
  if (bundle === 'tools') {
    // one import of the root's `tools` and a `typeof` alias per member: no declarations of its own, so no tags. A tools
    // member is never deprecated, so a tag here would also be wrong where the alias points.
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const alias = (st) =>
      ts.isVariableStatement(st) &&
      st.declarationList.declarations.every(
        (d) => d.type && ts.isTypeQueryNode(d.type) && /^tools\./.test(d.type.exprName.getText(sf)),
      );
    if (sf.statements.some((st) => !ts.isImportDeclaration(st) && !alias(st)))
      problems.push(`${fileName}: not a pure alias list of the root's tools`);
    if (/@deprecated\b/.test(text)) problems.push(`${fileName}: carries @deprecated tags`);
    return { problems, byCategory: {}, total: 0 };
  }
  const { found, plan } = findDeprecations(ts, text, deprecations, { bundle, fileName });
  problems.push(...plan.problems.map((p) => `${fileName}: ${p}`));
  const expected = count(plan.targets.map((t) => `${t.address}\u0000${t.message}`));
  const actual = count(found.map((f) => `${f.address}\u0000${f.message}`));
  for (const [key, n] of expected) {
    const m = actual.get(key) ?? 0;
    if (m < n) problems.push(`${fileName}: missing ${n - m} tag(s) at ${key.replace('\u0000', ' — ')}`);
  }
  for (const [key, n] of actual) {
    const m = expected.get(key) ?? 0;
    if (n > m) problems.push(`${fileName}: unexpected ${n - m} tag(s) at ${key.replace('\u0000', ' — ')}`);
  }
  if (resolve) {
    for (const [name, entry] of deprecations.names) {
      const named = [entry.destination, ...(entry.replacement?.match(/`[\w$.]+`/g) ?? [])];
      for (const bare of new Set(named.filter(Boolean).map((p) => p.replace(/`/g, '')))) {
        if (bare && /^(tools|availability)\./.test(bare) && !resolve(bare))
          problems.push(`${fileName}: ${name}'s replacement ${bare} is not in the packed declarations`);
      }
    }
  }
  const byCategory = {};
  for (const t of plan.targets) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  return { problems, byCategory, total: found.length };
}

/** A resolver for public paths (`tools.scoring.analyzeSequence`) through the root's namespaces. */
export function pathResolver(text) {
  const structure = readStructure(ts, ts.createSourceFile('root.d.ts', text, ts.ScriptTarget.Latest, true));
  return (path) => resolvesPublicPath(structure, path);
}

/** Check every declaration file under an unpacked package directory. */
export function checkPackage(packageDir, deprecations) {
  const dist = join(packageDir, 'dist');
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.d\.[cm]?ts$/.test(name)) files.push(path);
    }
  };
  walk(dist);
  const problems = [];
  const report = [];
  const totals = new Map(); // bundle -> Set(total)
  for (const file of files.sort()) {
    const rel = file.slice(packageDir.length + 1);
    const bundle = bundleOf(file);
    if (!bundle) {
      problems.push(`${rel}: a declaration file the gate does not know; add it to BUNDLE_OF`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const result = checkFile(text, deprecations, {
      bundle,
      fileName: rel,
      resolve: bundle === 'root' ? pathResolver(text) : undefined,
    });
    problems.push(...result.problems);
    report.push({ rel, bundle, ...result });
    (totals.get(bundle) ?? totals.set(bundle, new Set()).get(bundle)).add(result.total);
  }
  for (const [bundle, set] of totals)
    if (set.size > 1) problems.push(`the ${bundle} declaration copies carry different tag counts: ${[...set]}`);
  for (const bundle of ['root', 'constants', 'score-entry-state', 'governors', 'tools'])
    if (!totals.has(bundle)) problems.push(`no ${bundle} declaration file shipped`);
  return { problems, report, files };
}

// ---------------------------------------------------------------------------------------------------------------------
// The negative control on real packed text, and the synthetic self-test
// ---------------------------------------------------------------------------------------------------------------------

/** One tag removed and one stray tag added must each fail `checkFile`. */
function negativeControl(text, deprecations, options) {
  const first = text.indexOf('/** @deprecated ');
  if (first < 0) return { removed: false, stray: false }; // nothing injected: the count has already failed
  const end = text.indexOf('*/', first) + 2;
  const removed = text.slice(0, first) + text.slice(end);
  const anchor = text.indexOf('declare function ');
  const stray = `${text.slice(0, anchor)}/** @deprecated stray */\n${text.slice(anchor)}`;
  const outcomes = {
    removed: checkFile(removed, deprecations, options).problems.some((p) => p.includes('missing 1 tag')),
    stray: checkFile(stray, deprecations, options).problems.some((p) => p.includes('unexpected 1 tag')),
  };
  return outcomes;
}

const FIXTURE = `declare function a(x: string): string;
declare function b(p: { id: string }): void;
declare function c(p: { id: string }): void;
declare function d(p: { id: string }): void;
declare function parse(code: string): string;
declare const g1_a: typeof a;
declare const g1_b: typeof b;
declare const q1_c: typeof c;
declare namespace q1 {
  export { q1_c as c };
}
declare namespace g1 {
  export { g1_a as a, g1_b as b, q1 as query, parse as parseMatchUpFormat };
}
declare const g2_d: typeof d;
declare namespace g2 {
  export { g2_d as d };
}
declare namespace index$1 {
  export { g1 as alphaGovernor, g2 as betaGovernor };
}
declare const t_parse: typeof parse;
declare const t_a: typeof a;
declare namespace formats {
  export { t_parse as parse };
}
declare namespace scoring {
  export { t_a as a };
}
declare namespace index$2 {
  export { formats, scoring, t_a as a };
}
type CallListenerArgs = {
  payloads: any[];
  notices?: any[];
  topic: string;
};
declare namespace globalState {
  export { a as getNotices };
}
declare const matchUpActionConstants: {
  readonly SCORE_METHOD: 'x';
  readonly SCHEDULE_METHOD: 'x';
};
type PositionActionsArgs = {
  restrictAdHocRoundParticipants?: boolean;
};
type MatchUpActionsArgs = {
  restrictAdHocRoundParticipants?: boolean;
};
declare function getTournamentInfo(): {
  tournamentInfo?: string;
  eventInfo?: undefined;
};
type RegistrationEntryFee = { amount: number };
type EntryFee = RegistrationEntryFee;
interface MethodSignatures {
  a: typeof a;
  b: typeof b;
  c: typeof c;
  d: typeof d;
}
export { index$1 as governors, g1 as alphaGovernor, g2 as betaGovernor, index$2 as tools, index$2 as utilities, globalState, matchUpActionConstants, getTournamentInfo };
export type { EntryFee, CallListenerArgs, PositionActionsArgs, MatchUpActionsArgs };
`;

function selfTest() {
  const manifest = {
    methods: [
      { name: 'b', governors: ['alphaGovernor'], engineDisposition: 'scheduled-for-removal', replacement: null },
      { name: 'c', governors: ['alphaGovernor'], engineDisposition: 'scheduled-for-removal', replacement: 'tools.a' },
      { name: 'd', governors: ['betaGovernor'], engineDisposition: 'retained', replacement: null },
    ],
  };
  const guardText = `export const POSITIONAL_GOVERNOR_FUNCTIONS = {\n  formats: ['parseMatchUpFormat'],\n  scoring: [\n    'a',\n  ],\n};`;
  const deprecations = readDeprecations({ manifest, guardText });
  const failures = [];
  const expect = (label, condition) => {
    if (!condition) failures.push(label);
  };

  // a tools subpath file: clean passes; a tag, or a declaration of its own, fails
  const toolsFile = `import { tools } from '../tods-competition-factory';\n\nexport declare const a: typeof tools.scoring.a;\n`;
  const toolsCheck = (text) => checkFile(text, deprecations, { bundle: 'tools', fileName: 'dist/tools/scoring.d.ts' });
  expect('a tools subpath alias list passes', !toolsCheck(toolsFile).problems.length);
  expect(
    'a tag in a tools subpath fails',
    toolsCheck(toolsFile.replace('export', '/** @deprecated x */\nexport')).problems.length,
  );
  expect(
    'a declaration in a tools subpath fails',
    toolsCheck(`${toolsFile}export declare function b(): void;\n`).problems.length,
  );
  expect('a tools subpath file is the tools bundle', bundleOf('/p/dist/tools/scoring.d.mts') === 'tools');
  const injected = injectDeprecations(ts, FIXTURE, deprecations, { bundle: 'root' });
  const byAddress = Object.fromEntries(injected.targets.map((t) => [t.address, t]));
  // b on alphaGovernor, c on alphaGovernor.query, and the positional `a` and `parseMatchUpFormat` copies; never
  // `tools.formats.parse`, `tools.scoring.a`, the root `parse` or the retained `d`
  expect(
    'plan: governor targets',
    ['alphaGovernor.a', 'alphaGovernor.b', 'alphaGovernor.parseMatchUpFormat', 'alphaGovernor.query.c'].every(
      (p) => byAddress[`governor:${p}`],
    ),
  );
  expect('plan: nothing in tools', !injected.targets.some((x) => x.paths?.some((p) => p.startsWith('tools'))));
  expect('plan: retained d untagged', !Object.keys(byAddress).some((a) => a.endsWith('.d') || a === 'engine:d'));
  expect(
    'plan: engine targets',
    ['a', 'b', 'c'].every((n) => byAddress[`engine:${n}`]),
  );
  expect('plan: utilities', byAddress['export:utilities']?.message === UTILITIES_MESSAGE);
  expect(
    'plan: aliases',
    ALIASES.every((x) => byAddress[`alias:${x.container}.${x.member ?? x.alias}`]),
  );
  expect('plan: no problems', injected.problems.length === 0);
  expect('plan: replacement text', byAddress['governor:alphaGovernor.query.c'].message.includes('`tools.a`'));
  expect(
    'plan: positional replacement',
    byAddress['governor:alphaGovernor.parseMatchUpFormat'].message.includes('`tools.formats.parse`'),
  );
  expect(
    'plan: null replacement points at the guide',
    byAddress['governor:alphaGovernor.b'].message.includes('#governor-and-engine-route-removals'),
  );
  // the injected fixture passes, and the injected text never re-injects
  const resolve = pathResolver(injected.text);
  const clean = checkFile(injected.text, deprecations, { bundle: 'root', fileName: 'fixture', resolve });
  expect(`clean fixture passes (${clean.problems.join('; ')})`, clean.problems.length === 0);
  let reinjected = false;
  try {
    injectDeprecations(ts, injected.text, deprecations, { bundle: 'root' });
  } catch {
    reinjected = true;
  }
  expect('re-injection refused', reinjected);
  // the controls: a missing tag, a stray tag, a changed message, an unknown replacement, a stale manifest row
  const control = negativeControl(injected.text, deprecations, { bundle: 'root', fileName: 'fixture' });
  expect('control: removed tag fails', control.removed);
  expect('control: stray tag fails', control.stray);
  const reworded = injected.text.replace('use `tools.a`', 'use `tools.b`');
  expect(
    'control: changed message fails',
    checkFile(reworded, deprecations, { bundle: 'root', fileName: 'fixture' }).problems.length > 0,
  );
  const unattached = `${injected.text}\n// @deprecated in a line comment\n`;
  expect(
    'control: an unattached tag fails',
    checkFile(unattached, deprecations, { bundle: 'root', fileName: 'fixture' }).problems.length > 0,
  );
  const badReplacement = readDeprecations({
    manifest: { methods: [{ ...manifest.methods[1], replacement: 'tools.nowhere' }] },
    guardText,
  });
  const injectedBad = injectDeprecations(ts, FIXTURE, badReplacement, { bundle: 'root' }).text;
  expect(
    'control: unresolved replacement fails',
    checkFile(injectedBad, badReplacement, {
      bundle: 'root',
      fileName: 'fixture',
      resolve: pathResolver(injectedBad),
    }).problems.some((p) => p.includes('tools.nowhere')),
  );
  const stale = readDeprecations({
    manifest: { methods: [{ ...manifest.methods[0], governors: ['betaGovernor'] }] },
    guardText,
  });
  expect(
    'control: a route on an unlisted governor is a problem',
    injectDeprecations(ts, FIXTURE, stale, { bundle: 'root' }).problems.length > 0,
  );
  if (failures.length) {
    for (const f of failures) process.stderr.write(`${TAG} self-test FAIL: ${f}\n`);
    process.exit(1);
  }
  log('self-test OK: plan, injection, re-injection guard and six negative controls');
}

// ---------------------------------------------------------------------------------------------------------------------

function main() {
  const deprecations = loadDeprecations({ REPO_ROOT, PACKAGE_ROOT });
  const stage = mkdtempSync(join(tmpdir(), 'verify-deprecations-'));
  try {
    let tarball = option('--tarball');
    if (!tarball) {
      if (!existsSync(join(PACKAGE_ROOT, 'dist/tods-competition-factory.d.ts')))
        throw new Error('no dist: run `pnpm build` first');
      execFileSync('pnpm', ['pack', '--pack-destination', stage], {
        cwd: PACKAGE_ROOT,
        stdio: 'pipe',
        timeout: 600_000,
        killSignal: 'SIGKILL',
      });
      const tgz = readdirSync(stage).filter((f) => f.endsWith('.tgz'));
      if (tgz.length !== 1) throw new Error(`expected one tarball, got ${tgz.length}`);
      tarball = join(stage, tgz[0]);
    }
    execFileSync('tar', ['-xzf', tarball, '-C', stage], { stdio: 'pipe', timeout: 120_000 });
    const packageDir = join(stage, 'package');
    const { problems, report } = checkPackage(packageDir, deprecations);

    const routes = deprecations.routes.length;
    const positional = deprecations.positional.length;
    const overlap = deprecations.positional.filter((n) => deprecations.routes.includes(n)).length;
    log(
      `manifest: ${routes} scheduled-for-removal routes; guard list: ${positional} positional names ` +
        `(${overlap} also scheduled); ${deprecations.names.size} names; ${ALIASES.length} alias sites`,
    );
    for (const r of report)
      log(`${r.rel}: ${r.total} tags ${Object.keys(r.byCategory).length ? JSON.stringify(r.byCategory) : ''}`);

    const root = report.find((r) => r.rel === 'dist/tods-competition-factory.d.ts');
    if (root) {
      const text = readFileSync(join(packageDir, root.rel), 'utf8');
      const control = negativeControl(text, deprecations, { bundle: 'root', fileName: root.rel });
      log(
        `negative control on the packed root: removed tag ${control.removed ? 'caught' : 'MISSED'}, stray tag ${
          control.stray ? 'caught' : 'MISSED'
        }`,
      );
      if (!control.removed || !control.stray) problems.push('the negative control did not fail the count');
    }

    if (!args.includes('--no-probe')) {
      const result = probe(packageDir, deprecations);
      for (const line of result.lines) log(`probe: ${line}`);
      problems.push(...result.problems.map((p) => `probe: ${p}`));
    }

    if (problems.length) {
      for (const p of problems) process.stderr.write(`${TAG} FAIL: ${p}\n`);
      process.exitCode = 1;
      return;
    }
    log('OK — every expected @deprecated tag is in the packed declarations, and no other');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (args.includes('--self-test')) selfTest();
else main();
